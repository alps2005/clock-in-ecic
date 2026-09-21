// Integration test for the actual Edge Function, Auth and PostgREST. Loopback only.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { totp } from '../tests/helpers/totp.mjs'

const status = spawnSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8' })
if (status.status !== 0) throw new Error('Start the local Supabase stack first.')
const settings = JSON.parse(status.stdout)
const url = settings.API_URL
assert.equal(url, 'http://127.0.0.1:54321', 'This test only permits the local disposable stack.')
const key = settings.ANON_KEY
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, settings.SERVICE_ROLE_KEY, options)
const client = () => createClient(url, key, options)
const check = result => { if (result.error) throw new Error(result.error.message); return result.data }
const password = randomBytes(24).toString('base64url')
const nextPassword = randomBytes(24).toString('base64url')
const cedula = () => '88' + String(randomBytes(4).readUInt32BE() % 100000000).padStart(8, '0')
const adminCedula = cedula(), teacherCedula = cedula(), editedCedula = cedula()
const adminId = randomUUID()
let adminAuthId, teacherId
const scopedCedulas = [teacherCedula, editedCedula]
async function invoke(token, body) {
  const response = await fetch(`${url}/functions/v1/admin-teachers`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(70000) })
  let result
  try { result = await response.json() } catch { throw new Error(`Edge Function returned HTTP ${response.status} without JSON`) }
  return { status: response.status, body: result }
}
async function login(cedula, password) {
  const instance = client()
  const data = check(await instance.auth.signInWithPassword({ email: `${cedula}@login.clock-in.invalid`, password }))
  return { instance, token: data.session.access_token }
}
try {
  const auth = check(await service.auth.admin.createUser({ email: `${adminCedula}@login.clock-in.invalid`, password, email_confirm: true, app_metadata: { ecic_profile_id: adminId, ecic_session_version: 1 } }))
  adminAuthId = auth.user.id
  check(await service.from('profiles').insert({ id: adminId, auth_user_id: adminAuthId, cedula: adminCedula, full_name: 'Disposable integration admin', role: 'admin', active: true }))
  const admin = await login(adminCedula, password)
  const passwordOnlyToken = admin.token
  assert.equal((await admin.instance.rpc('app_context')).error?.message, 'MFA_REQUIRED')
  assert.deepEqual(check(await admin.instance.from('profiles').select('id')), [])
  assert.equal((await invoke(admin.token, { action: 'create' })).status, 403)
  const factor = check(await admin.instance.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Disposable test authenticator' }))
  const challenge = check(await admin.instance.auth.mfa.challenge({ factorId: factor.id }))
  const upgraded = check(await admin.instance.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: totp(factor.totp.secret) }))
  admin.token = upgraded.access_token
  assert.equal((await invoke(passwordOnlyToken, { action: 'create' })).status, 403)
  const freshPasswordLogin = await login(adminCedula, password)
  assert.equal((await freshPasswordLogin.instance.rpc('app_context')).error?.message, 'MFA_REQUIRED')
  console.log('PASS mandatory TOTP enrollment, aal2 upgrade, and rejection of password-only admin sessions')
  const context = check(await admin.instance.rpc('app_context'))
  const today = context.school_date
  const input = { action: 'create', full_name: 'Disposable integration teacher', cedula: teacherCedula, password, employed_from: today }
  assert.equal((await invoke(null, input)).status, 401)
  const created = await invoke(admin.token, input)
  assert.equal(created.status, 200, JSON.stringify(created.body))
  teacherId = created.body.id
  assert.ok(teacherId)
  const teacher = await login(teacherCedula, password)
  assert.equal((check(await teacher.instance.rpc('app_context'))).profile.role, 'teacher')
  assert.equal((await invoke(teacher.token, input)).status, 403)
  assert.equal((await teacher.instance.rpc('admin_teachers')).error?.message, 'ACCESS_DENIED')
  assert.equal((await invoke(admin.token, { ...input, cedula: adminCedula })).status, 409)
  assert.equal((await invoke(admin.token, { ...input, role: 'admin' })).status, 400)
  const directory = check(await admin.instance.rpc('admin_teachers', { p_search: teacherCedula }))
  assert.equal(directory.total, 1)
  assert.ok(!JSON.stringify(directory).includes('password'))
  console.log('PASS live creation, directory, duplicate rejection, role restrictions, and teacher denial')

  // Deliberate local fixture: verifies account changes preserve attendance.
  const fixture = spawnSync('docker', ['exec', '-i', 'supabase_db_clock-in-ecic', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    encoding: 'utf8',
    input: `insert into public.attendance_events(teacher_id,policy_id,kind,occurred_at,school_date,sequence_no,request_id,request_hash,justification) values('${teacherId}','${context.policy.id}','late_entry','${today}T12:00:00Z','${today}',1,'${randomUUID()}','${'a'.repeat(64)}','Disposable local fixture');`,
  })
  assert.equal(fixture.status, 0, 'Local attendance fixture failed: ' + fixture.stderr)
  const update = { action: 'update', id: teacherId, full_name: 'Updated integration teacher', cedula: editedCedula, employed_from: today, employed_until: null, active: true }
  const edited = await invoke(admin.token, update)
  assert.equal(edited.status, 200, JSON.stringify(edited.body))
  assert.equal((await teacher.instance.rpc('app_context')).error?.message, 'ACCESS_DENIED')
  const renamed = await login(editedCedula, password)
  assert.equal(check(await renamed.instance.rpc('app_context')).profile.full_name, update.full_name)
  const reset = await invoke(admin.token, { action: 'reset-password', id: teacherId, password: nextPassword })
  assert.equal(reset.status, 200, JSON.stringify(reset.body))
  assert.equal((await renamed.instance.rpc('app_context')).error?.message, 'ACCESS_DENIED')
  assert.ok((await client().auth.signInWithPassword({ email: `${editedCedula}@login.clock-in.invalid`, password })).error)
  const refreshed = await login(editedCedula, nextPassword)
  assert.equal(check(await refreshed.instance.rpc('app_context')).profile.active, true)
  const past = new Date(`${today}T12:00:00Z`); past.setUTCDate(past.getUTCDate() - 1)
  assert.equal((await invoke(admin.token, { action: 'disable', id: teacherId, employed_until: past.toISOString().slice(0, 10) })).status, 400)
  const disabled = await invoke(admin.token, { action: 'disable', id: teacherId, employed_until: today })
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body))
  assert.equal((await refreshed.instance.rpc('app_context')).error?.message, 'ACCESS_DENIED')
  assert.ok((await client().auth.signInWithPassword({ email: `${editedCedula}@login.clock-in.invalid`, password: nextPassword })).error)
  assert.equal(check(await service.from('attendance_events').select('id').eq('teacher_id', teacherId)).length, 1)
  const retained = check(await admin.instance.rpc('attendance_report', { p_from: today, p_to: today, p_search: editedCedula }))
  assert.equal(retained.rows.length, 1)
  assert.equal((await invoke(admin.token, update)).status, 200)
  assert.equal(check(await (await login(editedCedula, nextPassword)).instance.rpc('app_context')).profile.active, true)
  console.log('PASS live edit/C.I. change, password reset, old-session revocation, disable/reactivate, and retained history')

  check(await service.from('profiles').update({ session_version: 2 }).eq('id', adminId))
  assert.equal((await invoke(admin.token, update)).status, 403)
  console.log('PASS revoked administrator token cannot manage accounts')
} finally {
  const profiles = check(await service.from('profiles').select('id,auth_user_id').in('cedula', scopedCedulas))
  for (const profile of profiles) {
    check(await service.from('attendance_events').delete().eq('teacher_id', profile.id))
    check(await service.from('teachers').delete().eq('id', profile.id))
    check(await service.from('profiles').delete().eq('id', profile.id))
    if (profile.auth_user_id) check(await service.auth.admin.deleteUser(profile.auth_user_id))
  }
  // A failed create may leave an unlinked Auth identity; remove only these random local aliases.
  const users = check(await service.auth.admin.listUsers({ perPage: 1000 })).users
  for (const user of users.filter(user => scopedCedulas.some(c => user.email === `${c}@login.clock-in.invalid`))) check(await service.auth.admin.deleteUser(user.id))
  check(await service.from('profiles').delete().eq('id', adminId))
  if (adminAuthId) check(await service.auth.admin.deleteUser(adminAuthId))
  console.log('Local integration test accounts and attendance removed.')
}
