import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
// @ts-expect-error The isolated PostgreSQL harness is a Node ESM module.
import { database } from './helpers/database.mjs'
import type { PGlite } from '@electric-sql/pglite'
import type { Report } from '../src/types/app.ts'

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

test('reports distinguish actual late entries, exit-only days, missed exits and full absences at closing', async () => {
  const db = await setup()
  const report = async (search = '') => (await db.query<{ report: Report }>(
    "select public.attendance_report('2026-09-14','2026-09-14',0,$1) as report", [search],
  )).rows[0].report
  try {
    await db.exec(`
      insert into public.profiles(id,cedula,full_name,role) values
        ('20000000-0000-0000-0000-000000000005','0000000005','Exit only','teacher'),
        ('20000000-0000-0000-0000-000000000006','0000000006','Late without exit','teacher');
      insert into public.teachers(id,employed_from)
        select id,'2026-09-14' from public.profiles where cedula in ('0000000005','0000000006');
      insert into public.attendance_events(teacher_id,policy_id,checkpoint_id,kind,occurred_at,school_date,sequence_no,request_id,request_hash,justification)
      select v.teacher_id::uuid,p.id,
        case when v.kind='late_entry' then null else '30000000-0000-0000-0000-000000000001'::uuid end,
        v.kind,v.occurred_at::timestamptz,'2026-09-14',v.sequence_no,gen_random_uuid(),'fixture',
        case when v.kind='late_entry' then 'Motivo de prueba' end
      from public.attendance_policies p cross join (values
        ('20000000-0000-0000-0000-000000000001','entry','2026-09-14T11:40:00Z',1),
        ('20000000-0000-0000-0000-000000000002','late_entry','2026-09-14T11:41:00Z',1),
        ('20000000-0000-0000-0000-000000000002','exit','2026-09-14T17:40:00Z',2),
        ('20000000-0000-0000-0000-000000000005','exit','2026-09-14T17:40:00Z',2),
        ('20000000-0000-0000-0000-000000000006','late_entry','2026-09-14T11:41:00Z',1)
      ) v(teacher_id,kind,occurred_at,sequence_no)
      where '2026-09-14'::date <@ p.effective;
    `)
    await login(db, 3)
    await time(db, '2026-09-14T11:40:00Z')
    assert.deepEqual((await report()).totals, { expected: 5, on_time: 1, late: 0, entry_on_time: 1, entry_late: 0, exit_on_time: 0, exit_late: 0, missing_entry: 0, absent: 0, missing_exit: 0, completed: 0 })
    await time(db, '2026-09-14T11:40:00.001Z')
    const pending = await report()
    assert.equal(pending.rows.filter(row => row.entry_status === 'late_pending').length, 4)
    assert.equal(pending.totals.late, 0, 'Unmarked entries are not late registrations')
    await time(db, '2026-09-14T18:30:00Z')
    const atClosing = await report()
    assert.equal(atClosing.totals.on_time, 3, 'One on-time entry and two on-time exits')
    assert.equal(atClosing.totals.late, 2)
    assert.equal(atClosing.totals.missing_exit, 0)
    assert.equal(atClosing.totals.absent, 0, 'The closing instant is still inside the exit window')
    await time(db, '2026-09-14T18:30:00.001Z')
    const closed = await report()
    assert.deepEqual(closed.totals, { expected: 5, on_time: 3, late: 2, entry_on_time: 1, entry_late: 2, exit_on_time: 2, exit_late: 0, missing_entry: 1, absent: 1, missing_exit: 2, completed: 2 })
    assert.equal(closed.rows.find(row => row.full_name === 'Inactive Teacher')?.entry_status, 'absent')
    const exitOnly = (await report('Exit only')).rows[0]
    assert.equal(exitOnly.entry_status, 'missing_entry')
    assert.equal(exitOnly.exit_status, 'registered')
    assert.equal(exitOnly.worked_minutes, null)
    assert.equal((await report('Inactive Teacher')).totals.missing_entry, 0)
    const id = '20000000-0000-0000-0000-000000000001'
    const detail = (await db.query<{ report: Report }>("select public.admin_teacher_report($1,'2026-09-14','2026-09-14') as report", [id])).rows[0].report
    await login(db)
    assert.deepEqual((await report('Exit only')).totals, detail.totals, 'Teacher and admin detail share scoped aggregate rules')
    assert.equal(detail.totals.missing_exit, 1)
    assert.equal(detail.totals.absent, 0)
  } finally { await db.close() }
})

test('timeliness totals count entry and exit independently in all report endpoints', async () => {
  const db = await setup()
  const report = async (search = '') => (await db.query<{ report: Report }>(
    "select public.attendance_report('2026-09-14','2026-09-14',0,$1) as report", [search],
  )).rows[0].report
  try {
    await login(db)
    await time(db, '2026-09-14T11:00:00Z')
    await record(db)
    await time(db, '2026-09-14T18:30:00Z')
    await record(db, 'exit', 1)
    const onTime = await report()
    assert.equal(onTime.totals.expected, 1)
    assert.equal(onTime.totals.on_time, 2, 'Both window endpoints are inclusive and both marks count')
    assert.equal(onTime.totals.late, 0)
    assert.equal(onTime.totals.entry_on_time, 1)
    assert.equal(onTime.totals.exit_on_time, 1)
    assert.equal(onTime.totals.entry_late, 0)
    assert.equal(onTime.totals.exit_late, 0)

    await login(db, 2)
    await time(db, '2026-09-14T11:40:00.001Z')
    await record(db, 'late_entry', 0, randomUUID(), null, 'Motivo de prueba')
    await time(db, '2026-09-14T17:40:00Z')
    await record(db, 'exit', 1)
    const mixed = await report()
    assert.equal(mixed.totals.on_time, 1, 'An on-time exit counts even when the entry was late')
    assert.equal(mixed.totals.late, 1)
    assert.equal(mixed.totals.entry_on_time, 0)
    assert.equal(mixed.totals.exit_on_time, 1)
    assert.equal(mixed.totals.entry_late, 1)
    assert.equal(mixed.totals.exit_late, 0)
    await login(db, 3)
    await time(db, '2026-09-14T18:30:00Z')
    const all = await report()
    assert.equal(all.totals.on_time, 3)
    assert.equal(all.totals.late, 1)
    assert.equal(all.totals.entry_on_time, 1)
    assert.equal(all.totals.exit_on_time, 2)
    assert.deepEqual((await report('Teacher B')).totals, mixed.totals)
    const teacherId = '20000000-0000-0000-0000-000000000002'
    const detail = (await db.query<{ report: Report }>("select public.admin_teacher_report($1,'2026-09-14','2026-09-14') as report", [teacherId])).rows[0].report
    assert.deepEqual(detail.totals, mixed.totals)

    // Trusted fixture only: the live marking RPC continues to reject late exits.
    await db.exec("reset role; update public.attendance_events set occurred_at='2026-09-14T18:30:00.001Z' where kind='exit' and teacher_id='20000000-0000-0000-0000-000000000002'; set role authenticated")
    await time(db, '2026-09-14T18:30:00.001Z')
    const lateExit = await report('Teacher B')
    assert.equal(lateExit.totals.on_time, 0)
    assert.equal(lateExit.totals.late, 2, 'A late entry and a late exit are two separate late marks')
    assert.equal(lateExit.totals.entry_late, 1)
    assert.equal(lateExit.totals.exit_late, 1)
    assert.equal(lateExit.totals.entry_on_time, 0)
    assert.equal(lateExit.totals.exit_on_time, 0)
    assert.equal(lateExit.totals.missing_exit, 0, 'A recorded late exit is not a missing exit')
    assert.equal(lateExit.totals.absent, 0)
  } finally { await db.close() }
})
