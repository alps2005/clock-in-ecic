import { dateLabel, timeLabel } from './attendance.ts'
import type { Report, ReportRow } from '../types/app.ts'

export function currentSchoolWeek(today: string) {
  const monday = new Date(`${today}T12:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  const friday = new Date(monday)
  friday.setUTCDate(friday.getUTCDate() + 4)
  return { from: monday.toISOString().slice(0, 10), to: friday.toISOString().slice(0, 10) }
}

export type ReportExportFilter = { from: string; to: string; search: string; teacherId?: string }

export async function loadReportRows(range: { from: string; to: string }, loadPage: (page: number) => Promise<Report>) {
  const first = await loadPage(0)
  const rows = [...first.rows]
  const pages = Math.ceil(first.totals.expected / first.page_size)
  for (let page = 1; page < pages; page++) {
    const next = await loadPage(page)
    rows.push(...next.rows)
  }
  return {
    ...range,
    rows,
  }
}

const entryLabels = { on_time: 'A tiempo', late: 'Atraso justificado', late_pending: 'Atraso sin justificación', missing_entry: 'Sin entrada', absent: 'Sin asistencia', pending: 'Pendiente' }

export function exportTable(rows: ReportRow[], admin: boolean) {
  const headers = [...(admin ? ['Docente', 'Cédula'] : []), 'Fecha', 'Entrada', 'Salida', 'Estado', 'Tiempo', 'Justificación']
  const values = rows.map(row => [
    ...(admin ? [row.full_name, row.cedula] : []),
    dateLabel(row.school_date), timeLabel(row.entry_at), timeLabel(row.exit_at),
    `${entryLabels[row.entry_status]}${row.exit_status === 'missing' ? ' · Salida no registrada' : ''}`,
    row.worked_minutes === null ? '—' : `${Math.floor(row.worked_minutes / 60)} h ${row.worked_minutes % 60} min`,
    row.justification || '—',
  ])
  return { headers, values }
}

export function tableCsv(table: ReturnType<typeof exportTable>) {
  const quote = (value: string) => {
    // Keep user-entered messages as text when a spreadsheet opens the CSV.
    const safe = /^[\s]*[=+\-@\t\r\n]/u.test(value) ? `'${value}` : value
    return `"${safe.replaceAll('"', '""')}"`
  }
  return '\uFEFF' + [table.headers, ...table.values].map(row => row.map(quote).join(',')).join('\r\n')
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function excelBlob(table: ReturnType<typeof exportTable>) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  return writeExcelFile([
    table.headers.map(value => ({ value, fontWeight: 'bold' as const, backgroundColor: '#EAF6F8' })),
    ...table.values.map(row => row.map(value => ({ value, type: String, wrap: true }))),
  ], {
    sheet: 'Asistencia',
    columns: table.headers.map(header => ({ width: header === 'Justificación' ? 65 : header === 'Estado' ? 38 : header === 'Docente' ? 28 : 20 })),
  }).toBlob()
}
