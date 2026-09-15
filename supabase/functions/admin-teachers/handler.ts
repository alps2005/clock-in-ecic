import type { SupabaseClient, User } from '@supabase/supabase-js'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' }
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const check = <T extends { data: unknown; error: { message: string; code?: string } | null }>(result: T): T['data'] => {
  if (result.error) throw new Error(result.error.code === '23505' ? 'ACCOUNT_EXISTS' : result.error.message)
  return result.data
}

export async function handleTeacherAdmin(request: Request, caller: SupabaseClient, service: SupabaseClient): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)
  let lockKey: string | undefined, lockToken: string | undefined
  try {
    const authorization = request.headers.get('Authorization') ?? ''
    if (!/^Bearer \S+$/i.test(authorization)) return reply({ error: 'ACCESS_DENIED' }, 401)
    const auth = await caller.auth.getUser(authorization.slice(7))
    if (auth.error || !auth.data.user) return reply({ error: 'ACCESS_DENIED' }, 401)
    // The RPC validates the JWT's session version against the current active profile.
    const context = await caller.rpc('app_context')
    if (context.error || context.data?.profile?.role !== 'admin' || context.data.profile.auth_user_id !== auth.data.user.id) return reply({ error: 'ACCESS_DENIED' }, 403)
    if (Number(request.headers.get('content-length') ?? 0) > 16000) return reply({ error: 'INVALID_REQUEST' }, 400)
    const text = await request.text()
    if (text.length > 16000) return reply({ error: 'INVALID_REQUEST' }, 400)
    let input: Record<string, unknown>
    try { input = JSON.parse(text) } catch { return reply({ error: 'INVALID_REQUEST' }, 400) }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({ error: 'INVALID_REQUEST' }, 400)
    const action = input.action
    if (!['create', 'update', 'reset-password', 'disable', 'delete'].includes(String(action))) return reply({ error: 'INVALID_REQUEST' }, 400)
    if (input.role !== undefined) return reply({ error: 'INVALID_REQUEST' }, 400)
    if (action !== 'create' && (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id))) return reply({ error: 'INVALID_REQUEST' }, 400)
    if (action === 'create' || action === 'update') {
      if (typeof input.cedula !== 'string' || !/^\d{10}$/.test(input.cedula) || typeof input.full_name !== 'string' || input.full_name.trim().length < 2 || input.full_name.trim().length > 120 || !validDate(input.employed_from)) return reply({ error: 'INVALID_REQUEST' }, 400)
      if (input.employed_until != null && (!validDate(input.employed_until) || input.employed_until < input.employed_from)) return reply({ error: 'INVALID_REQUEST' }, 400)
      if (action === 'update' && typeof input.active !== 'boolean') return reply({ error: 'INVALID_REQUEST' }, 400)
    }
    if ((action === 'create' || action === 'reset-password') && (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256)) return reply({ error: 'PASSWORD_TOO_SHORT' }, 400)
    lockKey = action === 'create' ? `cedula:${input.cedula}` : `profile:${input.id}`
    lockToken = check(await service.rpc('lock_teacher_admin', { p_key: lockKey })) as string
    let profile = check(await service.from('profiles').select('*').eq(action === 'create' ? 'cedula' : 'id', action === 'create' ? input.cedula : input.id).maybeSingle())
    if (action === 'create') {
      if (profile && (profile.active || profile.role !== 'teacher' || profile.auth_user_id || profile.full_name !== String(input.full_name).trim())) throw new Error('ACCOUNT_EXISTS')
      if (!profile) profile = check(await service.from('profiles').insert({ cedula: input.cedula, full_name: String(input.full_name).trim(), role: 'teacher', active: false }).select().single())
    }
    if (!profile || profile.role !== 'teacher') throw new Error('TEACHER_NOT_FOUND')
    // Also serialize a resumed creation against edits to its now-visible pending profile.
    if (action !== 'create' && action !== 'delete' && !profile.auth_user_id) throw new Error('ACCOUNT_PENDING')
    if (action === 'delete') {
      // Revoke existing sessions before deleting Auth; retries can finish after Auth is gone.
      if (profile.auth_user_id) {
        const user = check(await service.auth.admin.getUserById(profile.auth_user_id)).user
        if (!user || user.app_metadata.ecic_profile_id !== profile.id) throw new Error('IDENTITY_MISMATCH')
      }
      const version = profile.session_version + 1
      const prepared = check(await service.from('profiles').update({ active: false, session_version: version }).eq('id', profile.id).eq('session_version', profile.session_version).select('id').maybeSingle())
      if (!prepared) throw new Error('ACCOUNT_CHANGED')
      if (profile.auth_user_id) check(await service.auth.admin.deleteUser(profile.auth_user_id))
      check(await service.rpc('finish_teacher_delete', { p_key: lockKey, p_token: lockToken, p_id: profile.id, p_version: version }))
      return reply({ ok: true, id: profile.id })
    }
    const teacher = check(await service.from('teachers').select('*').eq('id', profile.id).maybeSingle())
    const from = action === 'create' || action === 'update' ? input.employed_from : teacher?.employed_from
    const until = action === 'update' ? input.employed_until ?? null : teacher?.employed_until ?? null
    if (!validDate(from) || (until !== null && (!validDate(until) || until < from))) throw new Error('EMPLOYMENT_REQUIRED')
    if (action === 'update') {
      const first = check(await service.from('attendance_events').select('school_date').eq('teacher_id', profile.id).order('school_date').limit(1))
      const last = check(await service.from('attendance_events').select('school_date').eq('teacher_id', profile.id).order('school_date', { ascending: false }).limit(1))
      if ((first?.[0] && first[0].school_date < from) || (until && last?.[0] && last[0].school_date > until)) throw new Error('EMPLOYMENT_HAS_HISTORY')
    }
    const cedula = action === 'create' || action === 'update' ? String(input.cedula) : profile.cedula
    if (cedula !== profile.cedula) {
      const duplicate = check(await service.from('profiles').select('id').eq('cedula', cedula).maybeSingle())
      if (duplicate) throw new Error('ACCOUNT_EXISTS')
    }
    const fullName = action === 'create' || action === 'update' ? String(input.full_name).trim() : profile.full_name
    const active = action === 'disable' ? false : action === 'create' ? true : action === 'update' ? Boolean(input.active) : profile.active
    const version = profile.session_version + 1
    const prepared = check(await service.from('profiles').update({ active: false, session_version: version }).eq('id', profile.id).eq('session_version', profile.session_version).select('id').maybeSingle())
    if (!prepared) throw new Error('ACCOUNT_CHANGED')
    let user: User | null = null
    if (profile.auth_user_id) user = check(await service.auth.admin.getUserById(profile.auth_user_id)).user
    else {
      for (let page = 1; page <= 100; page++) {
        const users = check(await service.auth.admin.listUsers({ page, perPage: 1000 })).users
        user = users.find(u => u.email === `${cedula}@login.clock-in.invalid`) ?? null
        if (user || users.length < 1000) break
        if (page === 100) throw new Error('ACCOUNT_PENDING')
      }
    }
    if (user && user.app_metadata.ecic_profile_id !== profile.id) throw new Error('IDENTITY_MISMATCH')
    if (!user) user = check(await service.auth.admin.createUser({ email: `${cedula}@login.clock-in.invalid`, password: String(input.password), email_confirm: true, ban_duration: '876000h', app_metadata: { ecic_profile_id: profile.id, ecic_session_version: version } })).user
    if (!user) throw new Error('ACCOUNT_PENDING')
    check(await service.auth.admin.updateUserById(user.id, {
      email: `${cedula}@login.clock-in.invalid`, email_confirm: true,
      ...(action === 'create' || action === 'reset-password' ? { password: String(input.password) } : {}),
      ban_duration: active ? 'none' : '876000h',
      app_metadata: { ...user.app_metadata, ecic_profile_id: profile.id, ecic_session_version: version },
    }))
    check(await service.rpc('finish_teacher_admin', { p_key: lockKey, p_token: lockToken, p_id: profile.id, p_version: version, p_auth_id: user.id, p_full_name: fullName, p_cedula: cedula, p_from: from, p_until: until, p_active: active }))
    return reply({ ok: true, id: profile.id })
  } catch (error) {
    // Never return API bodies, identities, tokens, or passwords to the client/logs.
    const allowed = ['ACCOUNT_BUSY', 'ACCOUNT_EXISTS', 'ACCOUNT_CHANGED', 'ACCOUNT_PENDING', 'TEACHER_NOT_FOUND', 'EMPLOYMENT_REQUIRED', 'EMPLOYMENT_HAS_HISTORY', 'IDENTITY_MISMATCH']
    const code = error instanceof Error && allowed.includes(error.message) ? error.message : 'ADMIN_OPERATION_FAILED'
    return reply({ error: code }, code === 'ACCOUNT_BUSY' || code === 'ACCOUNT_EXISTS' ? 409 : 400)
  } finally {
    if (lockKey && lockToken) await service.rpc('unlock_teacher_admin', { p_key: lockKey, p_token: lockToken }).then(() => {}, () => {})
  }
}
