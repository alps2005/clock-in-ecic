import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getJornadaState, jornadaTimeline } from '../src/lib/jornada.ts'
import type { AttendanceEvent } from '../src/types/app.ts'
const schedule = { school_date: '2026-09-14', working_day: true, policy: { id: 'test', timezone: 'America/Guayaquil', weekdays: [1,2,3,4,5], entry_opens: '06:00:00', entry_closes: '06:40:00', exit_opens: '12:40:00', exit_closes: '13:30:00' } }
const entry: AttendanceEvent = { id: '1', teacher_id: 'teacher', kind: 'entry', occurred_at: '2026-09-14T11:20:00Z', school_date: schedule.school_date, sequence_no: 1, justification: null, request_id: '1' }
const exit: AttendanceEvent = { ...entry, id: '2', kind: 'exit', occurred_at: '2026-09-14T17:50:00Z', sequence_no: 2 }
for (const [time, records, label, action] of [
  ['10:59:59Z', [], 'Pendiente', 'before_entry'],
  ['11:00:00Z', [], 'Ventana abierta', 'entry'],
  ['11:40:00Z', [], 'Ventana abierta', 'entry'],
  ['11:40:00.001Z', [], 'Entrada pendiente', 'late_entry'],
  ['12:00:00Z', [entry], 'En jornada', 'before_exit'],
  ['17:40:00Z', [entry], 'Ventana abierta', 'exit'],
  ['18:30:00Z', [entry], 'Ventana abierta', 'exit'],
  ['18:30:00.001Z', [entry], 'Jornada incompleta', 'missing_exit'],
  ['19:00:00Z', [entry, exit], 'Jornada completa', 'complete'],
] as const) test(`jornada at ${time}: ${action}`, () => {
  const state = getJornadaState(new Date(`2026-09-14T${time}`), schedule, [...records])
  assert.equal(state.label, label); assert.equal(state.action, action)
  if (action === 'complete') assert.equal(state.description, 'Hoy trabajaste 6 h 30 min.')
})
test('nonworking day and missing schedule stay explicit', () => {
  assert.equal(getJornadaState(new Date('2026-09-14T12:00Z'), { ...schedule, working_day: false }, []).entry.label, 'Sin jornada')
  assert.equal(getJornadaState(new Date('2026-09-14T12:00Z'), { ...schedule, policy: null }, []).label, 'Sin horario')
})
test('late entries remain warnings and school date rolls over at Ecuador midnight', () => {
  assert.equal(getJornadaState(new Date('2026-09-14T12:00Z'), schedule, [{ ...entry, kind: 'late_entry' }]).entry.tone, 'warning')
  assert.equal(getJornadaState(new Date('2026-09-15T04:59:59Z'), schedule, [entry]).action, 'missing_exit')
  assert.equal(getJornadaState(new Date('2026-09-15T05:00Z'), schedule, [entry]).action, 'refresh')
})
test('timeline clamps markers and expands for real schedule windows', () => {
  assert.equal(jornadaTimeline(schedule.policy, new Date('2026-09-14T05:00Z')).marker, 0)
  assert.equal(jornadaTimeline(schedule.policy, new Date('2026-09-15T04:00Z')).marker, 100)
  assert.deepEqual(jornadaTimeline(schedule.policy, new Date()).ticks, ['05:00', '08:00', '11:00', '14:00'])
  assert.equal(jornadaTimeline({ ...schedule.policy, exit_closes: '16:00:00' }, new Date()).ticks[3], '16:00')
})
