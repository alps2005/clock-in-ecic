import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attendanceAction, loginIdentity, schoolDate, wordCount } from '../src/lib/attendance.ts'
import type { AppContext, AttendanceEvent } from '../src/types/app.ts'
const context: AppContext = { profile: { id:'p',auth_user_id:'a',full_name:'Fixture',role:'teacher',active:true,cedula:'0000000001' },server_time:'2026-09-14T11:00:00Z',school_date:'2026-09-14',working_day:true,events:[],policy:{id:'policy',timezone:'America/Guayaquil',weekdays:[1,2,3,4,5],entry_opens:'06:00:00',entry_closes:'06:40:00',exit_opens:'12:40:00',exit_closes:'13:30:00'} }
test('UI reflects exact scanner windows, late justification and missing exit', () => {
  assert.equal(attendanceAction(context,new Date('2026-09-14T10:59:59.999Z')),'before_entry')
  assert.equal(attendanceAction(context,new Date('2026-09-14T11:00:00Z')),'entry')
  assert.equal(attendanceAction(context,new Date('2026-09-14T11:40:00Z')),'entry')
  assert.equal(attendanceAction(context,new Date('2026-09-14T11:40:00.001Z')),'late_entry')
  const entered = {...context,events:[{sequence_no:1} as AttendanceEvent]}
  assert.equal(attendanceAction(entered,new Date('2026-09-14T17:39:59.999Z')),'before_exit')
  assert.equal(attendanceAction(entered,new Date('2026-09-14T17:40:00Z')),'exit')
  assert.equal(attendanceAction(entered,new Date('2026-09-14T18:30:00Z')),'exit')
  assert.equal(attendanceAction(entered,new Date('2026-09-14T18:30:00.001Z')),'missing_exit')
  assert.equal(attendanceAction(context,new Date('2026-09-15T05:00:00Z')),'refresh')
})
test('school date is independent of the browser timezone and cédulas remain text', () => {
  assert.equal(schoolDate('2026-09-15T04:59:59Z'),'2026-09-14')
  assert.equal(loginIdentity('0123456789'),'0123456789@login.clock-in.invalid')
  assert.throws(()=>loginIdentity('123'))
})
test('word limits treat whitespace and line breaks consistently', () => {
  assert.equal(wordCount('   \n\t'),0)
  assert.equal(wordCount('Una\njustificación\tbreve.'),3)
  assert.equal(wordCount('palabra '.repeat(250)),250)
})
