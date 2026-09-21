import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { handleTeacherAdmin } from '../supabase/functions/admin-teachers/handler.ts'

// Auth is mocked below; these claims are not signed credentials for a live service.
const bearer = (claims: object) => `Bearer e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test-signature`
const adminAuthorization = bearer({ aal: 'aal2' })

test('management endpoint rejects missing, invalid, teacher, and revoked administrator credentials before privileged calls', async () => {
  for (const scenario of ['missing', 'invalid', 'teacher', 'revoked']) {
    let privileged = 0
    const caller = createClient('https://fixture.invalid', 'public-key', { auth: { persistSession: false }, global: { fetch: async input => {
      const path = new URL(String(input)).pathname
      if (path === '/auth/v1/user') return Response.json(scenario === 'invalid' ? { msg: 'invalid' } : { id: 'user-id' }, { status: scenario === 'invalid' ? 401 : 200 })
      return Response.json(scenario === 'revoked' ? { message: 'ACCESS_DENIED' } : { profile: { role: 'teacher', auth_user_id: 'user-id' } }, { status: scenario === 'revoked' ? 400 : 200 })
    } } })
    const service = createClient('https://fixture.invalid', 'service-key', { auth: { persistSession: false }, global: { fetch: async () => { privileged++; throw new Error('Unexpected privileged request') } } })
    const response = await handleTeacherAdmin(new Request('https://fixture.invalid/admin-teachers', { method: 'POST', headers: scenario === 'missing' ? {} : { Authorization: adminAuthorization }, body: JSON.stringify({ action: 'create' }) }), caller, service)
    assert.ok([401, 403].includes(response.status), scenario)
    assert.deepEqual(await response.json(), { error: 'ACCESS_DENIED' })
    assert.equal(privileged, 0, scenario)
  }
})

test('management rejects password-only administrators before any service-role action, including with an older database', async () => {
  for (const scenario of ['database-gate', 'aal1', 'missing-aal', 'malformed']) {
    let privileged = 0
    const caller = createClient('https://fixture.invalid', 'public-key', { auth: { persistSession: false }, global: { fetch: async input => {
      const path = new URL(String(input)).pathname
      if (path === '/auth/v1/user') return Response.json({ id: 'admin-id' })
      return scenario === 'database-gate'
        ? Response.json({ message: 'MFA_REQUIRED' }, { status: 400 })
        : Response.json({ profile: { role: 'admin', auth_user_id: 'admin-id' } })
    } } })
    const service = createClient('https://fixture.invalid', 'service-key', { auth: { persistSession: false }, global: { fetch: async () => { privileged++; throw new Error('Unexpected privileged request') } } })
    const authorization = scenario === 'malformed' ? 'Bearer malformed' : bearer({ ...(scenario !== 'missing-aal' ? { aal: 'aal1' } : {}), user_metadata: { aal: 'aal2' } })
    for (const action of ['create', 'update', 'disable', 'reset-password', 'delete']) {
      const response = await handleTeacherAdmin(new Request('https://fixture.invalid/admin-teachers', { method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify({ action }) }), caller, service)
      assert.equal(response.status, 403, `${scenario}: ${action}`)
      assert.deepEqual(await response.json(), { error: 'MFA_REQUIRED' })
    }
    assert.equal(privileged, 0, scenario)
  }
})

test('blocking preserves employment dates; deleting removes Auth only after revoking sessions', async () => {
  const id = '20000000-0000-0000-0000-000000000001'
  const authId = '10000000-0000-0000-0000-000000000001'
  const scenarios = [
    { action: 'disable', teacher: { id, employed_from: '2026-09-01', employed_until: null } },
    { action: 'disable', teacher: null },
    { action: 'disable', teacher: { id, employed_from: null, employed_until: null } },
    { action: 'disable', teacher: { id, employed_from: 'invalid', employed_until: null } },
    { action: 'disable', teacher: { id, employed_from: '2026-09-01', employed_until: '2026-08-01' } },
    { action: 'delete', teacher: null },
  ]
  for (const { action, teacher } of scenarios) {
    const calls: { path: string; method: string; body: Record<string, unknown> }[] = []
    const caller = createClient('https://fixture.invalid', 'public-key', { auth: { persistSession: false }, global: { fetch: async input => {
      const path = new URL(String(input)).pathname
      return Response.json(path === '/auth/v1/user' ? { id: 'admin-id' } : { profile: { role: 'admin', auth_user_id: 'admin-id' } })
    } } })
    const service = createClient('https://fixture.invalid', 'service-key', { auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const path = new URL(String(input)).pathname
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      calls.push({ path, method, body })
      if (path.endsWith('/lock_teacher_admin')) return Response.json('30000000-0000-0000-0000-000000000001')
      if (path.endsWith('/profiles')) return Response.json(method === 'PATCH' ? { id } : { id, auth_user_id: authId, role: 'teacher', active: true, session_version: 1, full_name: 'Teacher A', cedula: '0000000001' })
      if (path.endsWith('/teachers')) return Response.json(teacher)
      if (path === `/auth/v1/admin/users/${authId}`) return Response.json({ id: authId, app_metadata: { ecic_profile_id: id, custom_flag: true } })
      if (path.includes('/rpc/finish_teacher_') || path.endsWith('/unlock_teacher_admin')) return Response.json(null)
      throw new Error(`Unexpected test request: ${method} ${path}`)
    } } })
    const response = await handleTeacherAdmin(new Request('https://fixture.invalid/admin-teachers', { method: 'POST', headers: { Authorization: adminAuthorization }, body: JSON.stringify({ action, id }) }), caller, service)
    assert.deepEqual(await response.json(), { ok: true, id })
    const revoke = calls.findIndex(call => call.path.endsWith('/profiles') && call.method === 'PATCH')
    assert.deepEqual(calls[revoke].body, { active: false, session_version: 2 })
    if (action === 'disable') {
      assert.ok(!calls.some(call => call.method === 'DELETE'))
      assert.ok(!calls.some(call => call.path.endsWith('/teachers') || call.path.endsWith('/attendance_events') || call.path.endsWith('/finish_teacher_admin')), 'Blocking must not read, validate, or rewrite employment/history')
      const ban = calls.findIndex(call => call.method === 'PUT')
      assert.ok(ban > revoke, 'Existing sessions must be revoked before banning new logins')
      assert.deepEqual(calls[ban].body, { ban_duration: '876000h', app_metadata: { ecic_profile_id: id, ecic_session_version: 2, custom_flag: true } })
    } else {
      const deletion = calls.findIndex(call => call.method === 'DELETE')
      assert.ok(deletion > revoke)
      assert.equal(calls[deletion].path, `/auth/v1/admin/users/${authId}`)
      assert.ok(calls.findIndex(call => call.path.endsWith('/finish_teacher_delete')) > deletion)
    }
    assert.ok(calls.at(-1)?.path.endsWith('/unlock_teacher_admin'))
  }
})

test('blocking verifies identity, detects concurrent changes, and keeps access revoked if Auth fails', async () => {
  const id = '20000000-0000-0000-0000-000000000001'
  const authId = '10000000-0000-0000-0000-000000000001'
  for (const scenario of ['identity', 'concurrent', 'auth-failure']) {
    const profile = { id, auth_user_id: authId, role: 'teacher', active: true, session_version: 1 }
    let profileWrites = 0, authWrites = 0, unlocks = 0
    const caller = createClient('https://fixture.invalid', 'public-key', { auth: { persistSession: false }, global: { fetch: async input => {
      const path = new URL(String(input)).pathname
      return Response.json(path === '/auth/v1/user' ? { id: 'admin-id' } : { profile: { role: 'admin', auth_user_id: 'admin-id' } })
    } } })
    const service = createClient('https://fixture.invalid', 'service-key', { auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const path = new URL(String(input)).pathname
      const method = init?.method ?? 'GET'
      if (path.endsWith('/lock_teacher_admin')) return Response.json('30000000-0000-0000-0000-000000000001')
      if (path.endsWith('/unlock_teacher_admin')) { unlocks++; return Response.json(null) }
      if (path.endsWith('/profiles')) {
        if (method === 'PATCH') {
          profileWrites++
          if (scenario === 'concurrent') return Response.json(null)
          Object.assign(profile, JSON.parse(String(init?.body)))
        }
        return Response.json(profile)
      }
      if (path === `/auth/v1/admin/users/${authId}`) {
        if (method === 'PUT') {
          authWrites++
          if (authWrites === 1) return Response.json({ message: 'Auth update failed' }, { status: 500 })
        }
        return Response.json({ id: authId, app_metadata: { ecic_profile_id: scenario === 'identity' ? 'another-profile' : id } })
      }
      throw new Error(`Unexpected test request: ${method} ${path}`)
    } } })
    const request = () => new Request('https://fixture.invalid/admin-teachers', { method: 'POST', headers: { Authorization: adminAuthorization }, body: JSON.stringify({ action: 'disable', id }) })
    const response = await handleTeacherAdmin(request(), caller, service)
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: scenario === 'identity' ? 'IDENTITY_MISMATCH' : scenario === 'concurrent' ? 'ACCOUNT_CHANGED' : 'ADMIN_OPERATION_FAILED' })
    assert.equal(unlocks, 1)
    assert.equal(profileWrites, scenario === 'identity' ? 0 : 1)
    assert.equal(authWrites, scenario === 'auth-failure' ? 1 : 0)
    if (scenario === 'auth-failure') {
      assert.equal(profile.active, false)
      assert.equal(profile.session_version, 2)
      const retry = await handleTeacherAdmin(request(), caller, service)
      assert.equal(retry.status, 200)
      assert.deepEqual(await retry.json(), { ok: true, id })
      assert.equal(profile.active, false)
      assert.equal(profile.session_version, 3)
      assert.equal(authWrites, 2)
      assert.equal(unlocks, 2)
    }
  }
})
