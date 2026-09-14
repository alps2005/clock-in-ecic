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
