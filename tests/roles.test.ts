import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Node ESM database harness.
import { database } from './helpers/database.mjs'
import { staffRoles, adminLoginIdentity, validAdminUsername } from '../src/lib/roles.ts'

const id = '20000000-0000-0000-0000-000000000001'
const authId = '10000000-0000-0000-0000-000000000001'

test('every staff role records entry/exit, sees only its own records, and is denied admin access', async () => {
  const db = await database() as PGlite
  try {
    await db.exec(await readFile('supabase/tests/fixtures.inc', 'utf8'))
    for (const role of staffRoles) {
      await db.exec('reset role; delete from public.attendance_events;')
      await db.query('update public.profiles set role=$1 where id=$2', [role, id])
      await db.exec(`set "request.jwt.claim.sub"='${authId}'; set role authenticated; set test.school_time='2026-09-14T11:30:00Z';`)
      const context = (await db.query<{ value: { working_day: boolean; profile: { role: string } } }>('select public.app_context() as value')).rows[0].value
      assert.equal(context.profile.role, role)
      assert.equal(context.working_day, true)
      await db.exec("select public.record_attendance('entry','2026-09-14',0,gen_random_uuid(),'ecic:test-only:0000000000000000000000000000000000000000000000000000')")
      await db.exec("set test.school_time='2026-09-14T17:40:00Z'; select public.record_attendance('exit','2026-09-14',1,gen_random_uuid(),'ecic:test-only:0000000000000000000000000000000000000000000000000000')")
      const report = (await db.query<{ value: { rows: { teacher_id: string }[] } }>("select public.attendance_report('2026-09-14','2026-09-14',0,'Teacher B') as value")).rows[0].value
      assert.equal(report.rows.length, 1)
      assert.equal(report.rows[0].teacher_id, id)
      assert.equal((await db.query('select * from public.profiles')).rows.length, 1)
      assert.equal((await db.query('select * from public.attendance_events')).rows.length, 2)
      for (const rpc of ['admin_teachers()', 'admin_sidebar_counts()', 'admin_notifications()', `admin_teacher('${id}')`, `admin_teacher_report('${id}','2026-09-14','2026-09-14')`]) {
        await assert.rejects(db.exec(`select public.${rpc}`), /ACCESS_DENIED/, role)
      }
      await db.exec(`reset role; set "request.jwt.claim.sub"='10000000-0000-0000-0000-000000000003'; set "request.jwt.claims"='{"app_metadata":{"ecic_session_version":1},"aal":"aal2"}'; set role authenticated;`)
      const directory = (await db.query<{ value: { rows: { id: string; role: string }[] } }>('select public.admin_teachers() as value')).rows[0].value
      assert.equal(directory.rows.find(row => row.id === id)?.role, role)
      await assert.rejects(db.exec("select public.record_attendance('entry','2026-09-14',0,gen_random_uuid())"), /ACCESS_DENIED/)
      await db.exec(`reset role; set "request.jwt.claims"='{"app_metadata":{"ecic_session_version":1},"aal":"aal1"}';`)
    }
  } finally { await db.close() }
})

test('username administrator activation needs matching identity and creates no attendance obligation', async () => {
  const db = await database() as PGlite
  try {
    await db.query("insert into auth.users(id,email) values($1,'adminecic2026@admin.clock-in.invalid')", [authId])
    await db.query("insert into public.profiles(id,username,full_name,role) values($1,'AdminEcic2026','Administrator','admin')", [id])
    await db.query('select public.activate_profile($1,$2)', [id, authId])
    assert.equal((await db.query('select * from public.teachers')).rows.length, 0)
    await assert.rejects(db.exec("insert into public.profiles(username,full_name,role) values('adminecic2026','Another Admin','admin')"), /duplicate key/)
    await assert.rejects(db.exec("insert into public.profiles(username,full_name,role) values('StaffName','Staff Member','principal')"), /profiles_login_check/)
    await assert.rejects(db.exec("insert into public.profiles(cedula,full_name,role) values('0000000002','Unknown Role','superadmin')"), /profiles_role_check/)
    await db.exec(`set "request.jwt.claim.sub"='${authId}'; set role authenticated;`)
    await assert.rejects(db.exec('select public.app_context()'), /MFA_REQUIRED/)
  } finally { await db.close() }
  assert.equal(adminLoginIdentity(' AdminEcic2026 '), 'adminecic2026@admin.clock-in.invalid')
  assert.equal(validAdminUsername('0000000001'), false)
})

test('staff role changes are atomic, preserve history, reject administrator promotion, and invalidate old sessions', async () => {
  const db = await database() as PGlite
  try {
    await db.exec(await readFile('supabase/tests/fixtures.inc', 'utf8'))
    await db.query("update auth.users set email='0000000001@login.clock-in.invalid' where id=$1", [authId])
    await db.exec(`set "request.jwt.claim.sub"='${authId}'; set role authenticated;`)
    await db.exec("select public.record_attendance('entry','2026-09-14',0,gen_random_uuid(),'ecic:test-only:0000000000000000000000000000000000000000000000000000')")
    await db.exec('reset role')
    const token = (await db.query<{ value: string }>("select public.lock_teacher_admin('profile:'||$1) as value", [id])).rows[0].value
    await db.query('update public.profiles set active=false,session_version=2 where id=$1', [id])
    const finish = (role: string) => db.query("select public.finish_teacher_admin('profile:'||$1,$2::uuid,$1::uuid,2,$3::uuid,'Teacher A','0000000001','2026-09-14',null,true,$4)", [id, token, authId, role])
    await assert.rejects(finish('admin'), /INVALID_REQUEST/)
    await finish('principal')
    await db.exec('set role authenticated')
    await assert.rejects(db.exec('select public.app_context()'), /ACCESS_DENIED/)
    await db.exec(`set "request.jwt.claims"='{"app_metadata":{"ecic_session_version":2},"aal":"aal1"}';`)
    const context = (await db.query<{ value: { profile: { role: string }; events: unknown[] } }>('select public.app_context() as value')).rows[0].value
    assert.equal(context.profile.role, 'principal')
    assert.equal(context.events.length, 1)
    await assert.rejects(db.exec('select public.admin_teachers()'), /ACCESS_DENIED/)
  } finally { await db.close() }
})
