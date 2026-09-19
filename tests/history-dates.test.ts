import assert from 'node:assert/strict'
import { test } from 'node:test'
import { displayDate, historyPresets, rangeError } from '../src/lib/historyDates.ts'
import { schoolDate } from '../src/lib/attendance.ts'
test('presets use Monday–Friday across month/year boundaries', () => {
  assert.deepEqual(historyPresets('2026-01-01'), [
    { label: 'Esta semana', from: '2025-12-29', to: '2026-01-02' },
    { label: 'Semana anterior', from: '2025-12-22', to: '2025-12-26' },
    { label: 'Este mes', from: '2026-01-01', to: '2026-01-31' },
  ])
  assert.equal(historyPresets('2028-02-05')[2].to, '2028-02-29')
})
test('Ecuador date controls presets independently of browser timezone', () => {
  const date = schoolDate('2026-09-21T04:59:00Z')
  assert.equal(date, '2026-09-20')
  assert.equal(historyPresets(date)[0].from, '2026-09-14')
  assert.equal(displayDate('2026-09-14'), '14/09/2026')
})
test('invalid ranges are blocked while preserving the 31-day limit', () => {
  assert.equal(rangeError('2026-09-19', '2026-09-18'), 'La fecha inicial no puede ser posterior a la final.')
  assert.equal(rangeError('2026-09-01', '2026-10-01'), '')
  assert.notEqual(rangeError('2026-09-01', '2026-10-02'), '')
})
