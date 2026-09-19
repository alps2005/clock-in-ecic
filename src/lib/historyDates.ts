import { currentSchoolWeek } from './attendanceExport.ts'
export function shiftSchoolDate(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function historyPresets(today: string) {
  const week = currentSchoolWeek(today)
  const end = new Date(`${today.slice(0, 7)}-01T12:00:00Z`)
  end.setUTCMonth(end.getUTCMonth() + 1, 0)
  return [
    { label: 'Esta semana', ...week },
    { label: 'Semana anterior', from: shiftSchoolDate(week.from, -7), to: shiftSchoolDate(week.to, -7) },
    { label: 'Este mes', from: `${today.slice(0, 7)}-01`, to: end.toISOString().slice(0, 10) },
  ]
}
export const displayDate = (iso: string) => iso.split('-').reverse().join('/')
export function rangeError(from: string, to: string) {
  if (from > to) return 'La fecha inicial no puede ser posterior a la final.'
  const days = (Date.parse(to) - Date.parse(from)) / 86400000
  return !from || !to || !Number.isFinite(days) || days > 30 ? 'Selecciona un rango válido de hasta 31 días.' : ''
}
