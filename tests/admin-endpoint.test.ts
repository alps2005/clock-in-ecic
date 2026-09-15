import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { handleTeacherAdmin } from '../supabase/functions/admin-teachers/handler.ts'

test('management endpoint rejects missing, invalid, teacher, and revoked administrator credentials before privileged calls', async () => {
  for (const scenario of ['missing', 'invalid', 'teacher', 'revoked']) {
    let privileged = 0
    const caller = createClient('https://fixture.invalid', 'public-key', { auth: { persistSession: false }, global: { fetch: async input => {
      const path = new URL(String(input)).pathname
      if (path === '/auth/v1/user') return Response.json(scenario === 'invalid' ? { msg: 'invalid' } : { id: 'user-id' }, { status: scenario === 'invalid' ? 401 : 200 })
      return Response.json(scenario === 'revoked' ? { message: 'ACCESS_DENIED' } : { profile: { role: 'teacher', auth_user_id: 'user-id' } }, { status: scenario === 'revoked' ? 400 : 200 })
    } } })
    const service = createClient('https://fixture.invalid', 'service-key', { auth: { persistSession: false }, global: { fetch: async () => { privileged++; throw new Error('Unexpected privileged request') } } })
    const response = await handleTeacherAdmin(new Request('https://fixture.invalid/admin-teachers', { method: 'POST', headers: scenario === 'missing' ? {} : { Authorization: 'Bearer dummy-token' }, body: JSON.stringify({ action: 'create' }) }), caller, service)
    assert.ok([401, 403].includes(response.status), scenario)
    assert.deepEqual(await response.json(), { error: 'ACCESS_DENIED' })
    assert.equal(privileged, 0, scenario)
  }
})

test('blocking preserves employment dates; deleting removes Auth only after revoking sessions', async () => {
  const id = '20000000-0000-0000-0000-000000000001'
  const authId = '10000000-0000-0000-0000-000000000001'
  for (const action of ['disable', 'delete']) {
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
      if (path.endsWith('/teachers')) return Response.json({ id, employed_from: '2026-09-01', employed_until: null })
      if (path === `/auth/v1/admin/users/${authId}`) return Response.json({ id: authId, app_metadata: { ecic_profile_id: id } })
      if (path.includes('/rpc/finish_teacher_') || path.endsWith('/unlock_teacher_admin')) return Response.json(null)
      throw new Error(`Unexpected test request: ${method} ${path}`)
    } } })
    const response = await handleTeacherAdmin(new Request('https://fixture.invalid/admin-teachers', { method: 'POST', headers: { Authorization: 'Bearer dummy-token' }, body: JSON.stringify({ action, id }) }), caller, service)
    assert.deepEqual(await response.json(), { ok: true, id })
    const revoke = calls.findIndex(call => call.path.endsWith('/profiles') && call.method === 'PATCH')
    assert.deepEqual(calls[revoke].body, { active: false, session_version: 2 })
    if (action === 'disable') {
      assert.ok(!calls.some(call => call.method === 'DELETE'))
      const finish = calls.find(call => call.path.endsWith('/finish_teacher_admin'))!
      assert.equal(finish.body.p_until, null)
      assert.equal(finish.body.p_active, false)
      assert.equal(calls.find(call => call.method === 'PUT')?.body.ban_duration, '876000h')
    } else {
      const deletion = calls.findIndex(call => call.method === 'DELETE')
      assert.ok(deletion > revoke)
      assert.equal(calls[deletion].path, `/auth/v1/admin/users/${authId}`)
      assert.ok(calls.findIndex(call => call.path.endsWith('/finish_teacher_delete')) > deletion)
    }
    assert.ok(calls.at(-1)?.path.endsWith('/unlock_teacher_admin'))
  }
})
