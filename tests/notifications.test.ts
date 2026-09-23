import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
// @ts-expect-error The isolated PostgreSQL harness is a Node ESM module.
import { database } from './helpers/database.mjs'
import type { PGlite } from '@electric-sql/pglite'
import type { Notifications } from '../src/types/app.ts'

async function setup() {
  const db = await database() as PGlite
  await db.exec(await readFile('supabase/tests/fixtures.inc', 'utf8'))
  await db.exec(`set "request.jwt.claim.sub"='10000000-0000-0000-0000-000000000003'; set role authenticated`)
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ app_metadata: { ecic_session_version: 1 }, aal: 'aal2' })])
  return db
}
const notices = async (db: PGlite, page = 0) => (await db.query<{ result: Notifications }>('select public.admin_notifications($1) as result', [page])).rows[0].result
const read = async (db: PGlite, id: string) => (await db.query<{ result: { read_at: string; deleted?: boolean } }>('select public.admin_read_notification($1) as result', [id])).rows[0].result

test('reading is persistent and idempotent; only read notices expire at exactly 15 days and never regenerate', async () => {
  const db = await setup()
  try {
    await db.exec("set test.school_time='2026-09-14T19:00:00Z'")
    const initial = await notices(db)
    assert.equal(initial.total, 3)
    assert.equal(initial.unread, 3)
    assert.ok(initial.rows.every(row => row.read_at === null && row.expires_at === null))
    const id = initial.rows[0].id
    const firstRead = await read(db, id)
    assert.equal(Date.parse(firstRead.read_at), Date.parse('2026-09-14T19:00:00Z'))
    assert.equal((await notices(db)).unread, 2)
    assert.equal((await db.query<{ result: { notifications: number } }>('select public.admin_sidebar_counts() as result')).rows[0].result.notifications, 2)
    await db.exec("set test.school_time='2026-09-15T19:00:00Z'")
    assert.equal((await read(db, id)).read_at, firstRead.read_at, 'Reopening does not restart retention')
    await db.exec("set test.school_time='2026-09-29T18:59:59.999Z'; reset role; select private.sync_admin_notifications()")
    assert.equal((await db.query('select id from private.admin_notifications where id=$1', [id])).rows.length, 1)
    await db.exec("set test.school_time='2026-09-29T19:00:00Z'; select private.sync_admin_notifications()")
    assert.equal((await db.query('select id from private.admin_notifications where id=$1', [id])).rows.length, 0, 'Physical deletion at the boundary')
    await db.exec('select private.sync_admin_notifications()')
    assert.equal((await db.query('select id from private.admin_notifications where teacher_id=$1 and school_date=$2 and kind=$3', [initial.rows[0].teacher_id, initial.rows[0].school_date, initial.rows[0].kind])).rows.length, 0, 'Expired history is not recreated')
    assert.equal((await db.query('select id from private.admin_notifications where school_date=\'2026-09-14\'')).rows.length, 2, 'Unread history remains')
    await db.exec('set role authenticated')
    assert.equal((await read(db, id)).deleted, true, 'Closing an expired tab is safe')
  } finally { await db.close() }
})

test('inbox backfills offline days and newly enrolled teachers; details use the actual policy and attendance survives cleanup', async () => {
  const db = await setup()
  try {
    await db.exec(`set "request.jwt.claim.sub"='10000000-0000-0000-0000-000000000001'; set test.school_time='2026-09-14T12:00:00Z';
      select public.record_attendance('late_entry','2026-09-14',0,gen_random_uuid(),null,'Motivo de prueba');
      set "request.jwt.claim.sub"='10000000-0000-0000-0000-000000000003'; set test.school_time='2026-09-14T19:00:00Z'`)
    const initial = await notices(db)
    assert.equal(initial.total, 4)
    assert.equal(initial.rows.find(row => row.kind === 'exit')?.exit_closes, '13:30:00')
    for (const row of initial.rows) await read(db, row.id)
    // No sync occurs during the next 16 days; expired rows must not be recreated.
    await db.exec("set test.school_time='2026-09-30T19:00:00Z'; reset role; select private.sync_admin_notifications(); select private.sync_admin_notifications()")
    assert.equal((await db.query("select id from private.admin_notifications where school_date='2026-09-14'")).rows.length, 0)
    assert.equal((await db.query('select id from public.attendance_events')).rows.length, 1)
    await db.exec(`insert into public.profiles(id,cedula,full_name,role,active) values('20000000-0000-0000-0000-000000000005','0000000005','New teacher','teacher',false);
      insert into public.teachers(id,employed_from) values('20000000-0000-0000-0000-000000000005','2026-09-14');
      select private.sync_admin_notifications()`)
    assert.equal((await db.query("select id from private.admin_notifications where teacher_id='20000000-0000-0000-0000-000000000005' and school_date='2026-09-14'")).rows.length, 1)
    await db.exec('set role authenticated')
    const first = await notices(db)
    const second = await notices(db, 1)
    assert.equal(first.rows.length, 25)
    assert.equal(first.total, second.total)
    assert.ok(second.rows.length > 0)
    assert.ok(second.rows.every(row => !first.rows.some(other => other.id === row.id)))
  } finally { await db.close() }
})

test('read mutation enforces administrator role, MFA and session version; storage and cleanup are private', async () => {
  const db = await setup()
  try {
    await db.exec("set test.school_time='2026-09-14T19:00:00Z'")
    const id = (await notices(db)).rows[0].id
    await assert.rejects(db.exec('select * from private.admin_notifications'), /permission denied/)
    await assert.rejects(db.exec('select private.sync_admin_notifications()'), /permission denied/)
    await db.exec(`set "request.jwt.claim.sub"='10000000-0000-0000-0000-000000000001'`)
    await assert.rejects(read(db, id), /ACCESS_DENIED/)
    await db.exec(`set "request.jwt.claim.sub"='10000000-0000-0000-0000-000000000003'`)
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ app_metadata: { ecic_session_version: 1 }, aal: 'aal1' })])
    await assert.rejects(read(db, id), /MFA_REQUIRED/)
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ app_metadata: { ecic_session_version: 9 }, aal: 'aal2' })])
    await assert.rejects(read(db, id), /ACCESS_DENIED/)
    await db.exec('reset role; set role anon')
    await assert.rejects(read(db, id), /permission denied/)
  } finally { await db.close() }
})

test('read notices move below every unread notice across pages, keeping newest dates first within each group', async () => {
  const db = await setup()
  try {
    await db.exec("set test.school_time='2026-09-30T19:00:00Z'")
    const initialFirst = await notices(db)
    const initialSecond = await notices(db, 1)
    const initial = [...initialFirst.rows, ...initialSecond.rows]
    assert.equal(initial.length, initialFirst.total)
    assert.ok(initial.length > 30)
    const readIds = new Set([initial[0].id, initial[26].id, initial.at(-1)!.id])
    for (const id of readIds) await read(db, id)
    const first = await notices(db)
    const second = await notices(db, 1)
    assert.equal(first.unread, initial.length - readIds.size)
    assert.ok(first.rows.every(row => row.read_at === null), 'Read notices must not occupy page one while unread notices remain on page two')
    assert.deepEqual([...first.rows, ...second.rows].map(row => row.id), [
      ...initial.filter(row => !readIds.has(row.id)),
      ...initial.filter(row => readIds.has(row.id)),
    ].map(row => row.id))
    assert.ok(second.rows.slice(-readIds.size).every(row => row.read_at !== null))
    assert.deepEqual((await notices(db, 1)).rows.map(row => row.id), second.rows.map(row => row.id), 'Refresh preserves stable order')
  } finally { await db.close() }
})
