import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
// @ts-expect-error The isolated PostgreSQL harness is a Node ESM module.
import { database } from './helpers/database.mjs'
import type { PGlite } from '@electric-sql/pglite'

const qr = 'ecic:test-only:0000000000000000000000000000000000000000000000000000'
async function setup(): Promise<PGlite> {
  const db = await database() as PGlite
  await db.exec(await readFile('supabase/tests/fixtures.inc', 'utf8'))
  return db
}
async function login(db: PGlite, user = 1) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-${String(user).padStart(12,'0')}',false); set role authenticated;`)
}
async function time(db: PGlite, value: string) {
  await db.exec('reset role')
  await db.query("select set_config('test.school_time',$1,false)", [value])
  await db.exec('set role authenticated')
}
async function record(db: PGlite, kind = 'entry', prior = 0, request = randomUUID(), payload: string | null = qr, justification: string | null = null) {
  const result = await db.query<{ event: { id: string; occurred_at: string; kind: string } }>('select public.record_attendance($1,$2,$3,$4,$5,$6) as event', [kind,'2026-09-14',prior,request,payload,justification])
  return result.rows[0].event
}

test('fresh schema enforces role isolation and no direct browser writes', async () => {
  const db = await setup()
  try {
    await login(db)
    assert.equal((await db.query('select * from public.profiles')).rows.length, 1)
    assert.equal((await db.query('select * from public.teachers')).rows.length, 1)
    await assert.rejects(db.exec("update public.profiles set role='admin'"), /permission denied/)
    await assert.rejects(db.exec('select * from private.checkpoint_tokens'), /permission denied/)
    await assert.rejects(db.exec('select private.server_now()'), /permission denied/)
    await assert.rejects(db.exec('select public.admin_notifications()'), /ACCESS_DENIED/)
    await assert.rejects(db.exec("insert into public.attendance_events default values"), /permission denied/)
    await record(db)
    await login(db, 2)
    assert.equal((await db.query('select * from public.attendance_events')).rows.length, 0)
    await login(db, 3)
    assert.equal((await db.query('select * from public.attendance_events')).rows.length, 1)
    await assert.rejects(record(db), /ACCESS_DENIED/)
    await login(db, 4)
    assert.equal((await db.query('select * from public.profiles')).rows.length, 0)
    await assert.rejects(db.exec('select public.app_context()'), /ACCESS_DENIED/)
    await db.exec('reset role; set role anon')
    await assert.rejects(db.exec('select public.app_context()'), /permission denied/)
  } finally { await db.close() }
})

test('entry and exit exact boundaries, lost-response replay and changed-payload rejection', async () => {
  const db = await setup()
  try {
    await login(db)
    await time(db,'2026-09-14T10:59:59.999Z')
    await assert.rejects(record(db), /ENTRY_CLOSED/)
    await time(db,'2026-09-14T11:00:00Z')
    await assert.rejects(record(db,'entry',0,randomUUID(),'untrusted'), /INVALID_QR/)
    await time(db,'2026-09-14T11:40:00Z')
    const id = randomUUID()
    const event = await record(db,'entry',0,id)
    assert.equal(event.kind,'entry')
    await time(db,'2026-09-14T17:39:59.999Z')
    await assert.rejects(record(db,'exit',1), /EXIT_CLOSED/)
    await time(db,'2026-09-14T18:30:00Z')
    const exit = await record(db,'exit',1)
    assert.equal(exit.kind,'exit')
    // A second teacher checks the opening boundary without reusing the first exit.
    await login(db, 2)
    await time(db,'2026-09-14T11:00:00Z')
    await record(db)
    await time(db,'2026-09-14T17:40:00Z')
    assert.equal((await record(db,'exit',1)).kind,'exit')
    await login(db)
    await time(db,'2026-09-15T01:00:00Z')
    assert.equal((await record(db,'entry',0,id)).id,event.id)
    await assert.rejects(record(db,'entry',0,id,'changed'), /REQUEST_REUSED/)
    await assert.rejects(record(db), /STALE_STATE/)
  } finally { await db.close() }
})

test('late arrival requires at most 250 words and exit closes immediately after the cutoff', async () => {
  const db = await setup()
  try {
    await login(db)
    await time(db,'2026-09-14T11:40:00.001Z')
    await assert.rejects(record(db), /ENTRY_CLOSED/)
    await assert.rejects(record(db,'late_entry',0,randomUUID(),null,'  '), /JUSTIFICATION_REQUIRED/)
    await assert.rejects(record(db,'late_entry',0,randomUUID(),null,'palabra '.repeat(251)), /JUSTIFICATION_REQUIRED/)
    await assert.rejects(record(db,'late_entry',0,randomUUID(),null,'palabra\u00a0'.repeat(251)), /JUSTIFICATION_REQUIRED/)
    await assert.rejects(record(db,'late_entry',0,randomUUID(),null,'\u00a0'), /JUSTIFICATION_REQUIRED/)
    assert.equal((await record(db,'late_entry',0,randomUUID(),null,'palabra '.repeat(250).trim())).kind,'late_entry')
    await time(db,'2026-09-14T18:30:00.001Z')
    await assert.rejects(record(db,'exit',1), /EXIT_CLOSED/)
    await login(db,3)
    const notifications = await db.query<{ result: {total: number} }>('select public.admin_notifications() as result')
    assert.equal(notifications.rows[0].result.total,4)
  } finally { await db.close() }
})

test('repeated device submissions cannot create extra events; history survives auth deletion', async () => {
  const db = await setup()
  try {
    await login(db)
    const id = randomUUID()
    const events = await Promise.all([record(db,'entry',0,id),record(db,'entry',0,id)])
    assert.equal(events[0].id,events[1].id)
    await assert.rejects(record(db), /STALE_STATE/)
    await db.exec("reset role; delete from auth.users where id='10000000-0000-0000-0000-000000000001'")
    assert.equal((await db.query('select * from public.attendance_events')).rows.length,1)
    await login(db)
    await assert.rejects(db.exec('select public.app_context()'), /ACCESS_DENIED/)
    await login(db,3)
    assert.equal((await db.query('select * from public.attendance_events')).rows.length,1)
  } finally { await db.close() }
})

test('working days, employment, stale dates and policy history cannot be bypassed', async () => {
  const db = await setup()
  try {
    await login(db)
    await assert.rejects(db.query('select public.record_attendance($1,$2,$3,$4,$5)', ['entry','2026-09-13',0,randomUUID(),qr]), /STALE_DATE/)
    await db.exec("reset role; insert into public.school_holidays values('2026-09-14','Fixture holiday'); set role authenticated")
    await assert.rejects(record(db), /NOT_WORKING_DAY/)
    await db.exec("reset role; delete from public.school_holidays; set role authenticated")
    await record(db)
    await db.exec('reset role')
    await assert.rejects(db.exec("update public.attendance_policies set entry_closes='07:00'"), /POLICY_HAS_HISTORY/)
    await assert.rejects(db.exec("insert into public.attendance_policies select gen_random_uuid(),effective,timezone,weekdays,entry_opens,entry_closes,exit_opens,exit_closes from public.attendance_policies"), /exclusion constraint/)
    await login(db,2)
    await time(db,'2026-09-19T11:30:00Z')
    await assert.rejects(db.query('select public.record_attendance($1,$2,$3,$4,$5)', ['entry','2026-09-19',0,randomUUID(),qr]), /NOT_WORKING_DAY/)
  } finally { await db.close() }
})

test('report totals cover more than the API row cap, paginate stably and filter before totals', async () => {
  const db = await setup()
  try {
    await db.exec(`insert into public.profiles(id,cedula,full_name,role) select gen_random_uuid(),lpad((n+1000)::text,10,'0'),'Fixture '||n,'teacher' from generate_series(1,1050) n;
      insert into public.teachers select id,'2026-09-14',null from public.profiles where full_name like 'Fixture %';`)
    await login(db)
    await record(db)
    await time(db,'2026-09-14T18:31:00Z')
    await login(db,3)
    type Report = { totals: { expected:number; absent:number; missing_exit:number }; rows: unknown[] }
    const result = await db.query<{report: Report}>("select public.attendance_report('2026-09-14','2026-09-14',0,'') as report")
    assert.equal(result.rows[0].report.totals.expected,1053)
    assert.equal(result.rows[0].report.totals.absent,1052)
    assert.equal(result.rows[0].report.totals.missing_exit,1)
    assert.equal(result.rows[0].report.rows.length,25)
    const last = await db.query<{report: Report}>("select public.attendance_report('2026-09-14','2026-09-14',42,'') as report")
    assert.equal(last.rows[0].report.rows.length,3)
    assert.deepEqual(last.rows[0].report.totals,result.rows[0].report.totals)
    const filtered = await db.query<{report: Report}>("select public.attendance_report('2026-09-14','2026-09-14',0,'Teacher A') as report")
    assert.equal(filtered.rows[0].report.totals.expected,1)
    await assert.rejects(db.exec("select public.attendance_report('2026-01-01','2026-09-14')"), /INVALID_FILTER/)
    await login(db,2)
    const personal = await db.query<{report: Report}>("select public.attendance_report('2026-09-14','2026-09-14',0,'Teacher A') as report")
    assert.equal(personal.rows[0].report.totals.expected,1)
  } finally { await db.close() }
})

test('trusted password reset invalidates old sessions and user metadata cannot confer admin', async () => {
  const db = await setup()
  try {
    await login(db)
    await db.exec(`reset role; update public.profiles set session_version=2 where cedula='0000000001'; set role authenticated`)
    await assert.rejects(db.exec('select public.app_context()'), /ACCESS_DENIED/)
    assert.equal((await db.query('select * from public.profiles')).rows.length,0)
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({app_metadata:{ecic_session_version:2},user_metadata:{role:'admin'}})])
    await db.exec('select public.app_context()')
    await assert.rejects(db.exec('select public.admin_notifications()'), /ACCESS_DENIED/)
  } finally { await db.close() }
})
