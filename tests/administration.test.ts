import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
// @ts-expect-error The isolated PostgreSQL harness is a Node ESM module.
import { database } from './helpers/database.mjs'
import type { PGlite } from '@electric-sql/pglite'
import type { Notifications, TeacherDirectory } from '../src/types/app.ts'

async function setup() {
  const db = await database() as PGlite
  await db.exec(await readFile('supabase/tests/fixtures.inc', 'utf8'))
  return db
}
async function login(db: PGlite, suffix: string) {
  await db.exec(`reset role; set "request.jwt.claim.sub"='10000000-0000-0000-0000-${suffix.padStart(12, '0')}'; set role authenticated;`)
}

test('teacher directory is admin-only, searchable, paginated, and contains no passwords', async () => {
  const db = await setup()
  try {
    await login(db, '1')
    await assert.rejects(db.exec('select public.admin_teachers()'), /ACCESS_DENIED/)
    await assert.rejects(db.exec("select public.lock_teacher_admin('fixture')"), /permission denied/)
    await login(db, '3')
    const { rows } = await db.query<{ result: TeacherDirectory }>("select public.admin_teachers(0,'0000000002') as result")
    assert.equal(rows[0].result.total, 1)
    assert.equal(rows[0].result.rows[0].full_name, 'Teacher B')
    assert.ok(!JSON.stringify(rows[0].result).includes('password'))
    await assert.rejects(db.exec("select public.lock_teacher_admin('fixture')"), /permission denied/)
    await db.exec("reset role; update public.profiles set session_version=2 where role='admin'; set role authenticated;")
    await assert.rejects(db.exec('select public.admin_teachers()'), /ACCESS_DENIED/)
  } finally { await db.close() }
})

test('notifications include missing and late entry windows and missed exits at exact cutoffs', async () => {
  const db = await setup()
  const notices = async () => (await db.query<{ result: Notifications }>('select public.admin_notifications() as result')).rows[0].result
  try {
    await login(db, '3')
    await db.exec("set test.school_time='2026-09-14T11:45:00Z'")
    assert.equal((await notices()).total, 0)
    await db.exec("set test.school_time='2026-09-14T11:45:00.001Z'")
    assert.equal((await notices()).total, 3)
    assert.ok((await notices()).rows.every(row => row.kind === 'entry' && row.cedula))
    await login(db, '1')
    await db.exec("select public.record_attendance('late_entry','2026-09-14',0,gen_random_uuid(),null,'Motivo de prueba')")
    await login(db, '3')
    assert.equal((await notices()).total, 3, 'Late justification retains the missed-entry notice')
    await db.exec("set test.school_time='2026-09-14T18:30:00Z'")
    assert.equal((await notices()).total, 3)
    await db.exec("set test.school_time='2026-09-14T18:30:00.001Z'")
    const result = await notices()
    assert.equal(result.total, 4)
    assert.equal(result.rows.filter(row => row.kind === 'exit').length, 1)
  } finally { await db.close() }
})

test('only the lease owner can release a teacher administration lock', async () => {
  const db = await setup()
  try {
    await db.exec('set role service_role')
    const { rows } = await db.query<{ token: string }>("select public.lock_teacher_admin('fixture') as token")
    await assert.rejects(db.exec("select public.lock_teacher_admin('fixture')"), /ACCOUNT_BUSY/)
    await db.exec("select public.unlock_teacher_admin('fixture',gen_random_uuid())")
    await assert.rejects(db.exec("select public.lock_teacher_admin('fixture')"), /ACCOUNT_BUSY/)
    await db.query('select public.unlock_teacher_admin($1,$2)', ['fixture', rows[0].token])
    await db.exec("select public.lock_teacher_admin('fixture')")
  } finally { await db.close() }
})
