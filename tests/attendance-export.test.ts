import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currentSchoolWeek, excelBlob, exportTable, loadReportRows, tableCsv } from '../src/lib/attendanceExport.ts'
import type { Report, ReportRow } from '../src/types/app.ts'

const row: ReportRow = { teacher_id: 'teacher', full_name: 'Ana Torres', cedula: '0123456789', school_date: '2026-09-14', entry_at: '2026-09-14T11:30:00Z', exit_at: '2026-09-14T18:00:00Z', justification: 'Tráfico, "intenso".\nLlegué tarde.', entry_status: 'late', exit_status: 'registered', worked_minutes: 390 }

test('school-week shortcuts use Monday through Friday, including weekends and year boundaries', () => {
  for (const today of ['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-19', '2026-09-20']) {
    assert.deepEqual(currentSchoolWeek(today), { from: '2026-09-14', to: '2026-09-18' })
  }
  assert.deepEqual(currentSchoolWeek('2026-09-21'), { from: '2026-09-21', to: '2026-09-25' })
  assert.deepEqual(currentSchoolWeek('2027-01-01'), { from: '2026-12-28', to: '2027-01-01' })
})

test('filtered exports collect every page and preserve report order across weeks', async () => {
  const calls: unknown[] = []
  const report: Report = { as_of: '', page: 0, page_size: 2, totals: { expected: 6, on_time: 0, late: 0, entry_on_time: 0, entry_late: 0, exit_on_time: 0, exit_late: 0, missing_entry: 0, absent: 0, missing_exit: 0, completed: 0 }, rows: [] }
  const dates = ['2026-09-15', '2026-09-14', '2026-09-11', '2026-09-10', '2026-09-08', '2026-09-07']
  const range = { from: '2026-09-01', to: '2026-09-30' }
  const result = await loadReportRows(range, async page => {
    calls.push(page)
    return { ...report, rows: dates.slice(page * 2, page * 2 + 2).map(school_date => ({ ...row, school_date })) }
  })
  assert.deepEqual(calls, [0, 1, 2])
  assert.equal(result.from, range.from)
  assert.equal(result.to, range.to)
  assert.deepEqual(result.rows.map(row => row.school_date), dates)
})

test('preview and CSV preserve full justification, Ecuador times, missing exits and admin identity', () => {
  const table = exportTable([row], false)
  assert.deepEqual(table.headers, ['Fecha', 'Entrada', 'Salida', 'Estado', 'Tiempo', 'Justificación'])
  assert.deepEqual(table.values[0].slice(1), ['06:30', '13:00', 'Atraso justificado', '6 h 30 min', row.justification])
  assert.ok(tableCsv(table).startsWith('\uFEFF"Fecha"'))
  assert.ok(tableCsv(table).includes('"Tráfico, ""intenso"".\nLlegué tarde."'))
  const admin = exportTable([{ ...row, exit_at: null, exit_status: 'missing', worked_minutes: null, justification: '=1+1' }], true)
  assert.deepEqual(admin.values[0].slice(0, 2), ['Ana Torres', '0123456789'])
  assert.ok(admin.values[0].includes('Atraso justificado · Salida no registrada'))
  assert.ok(tableCsv(admin).includes('"\'=1+1"'))
})

test('Excel export produces a real XLSX archive', async () => {
  const blob = await excelBlob(exportTable([row], true))
  const bytes = new Uint8Array(await blob.arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04])
  assert.ok(bytes.length > 1000)
})

test('exports distinguish a full absence from an exit without entry', () => {
  const absent: ReportRow = { ...row, entry_at: null, exit_at: null, entry_status: 'absent', exit_status: 'pending', worked_minutes: null, justification: null }
  const missingEntry: ReportRow = { ...absent, exit_at: row.exit_at, entry_status: 'missing_entry', exit_status: 'registered' }
  for (const admin of [false, true]) {
    const table = exportTable([absent, missingEntry], admin)
    const status = table.headers.indexOf('Estado')
    assert.equal(table.values[0][status], 'Sin asistencia')
    assert.equal(table.values[1][status], 'Sin entrada')
  }
})
