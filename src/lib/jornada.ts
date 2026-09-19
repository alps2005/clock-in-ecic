import { attendanceAction, schoolTimezone, timeLabel } from './attendance.ts'
import type { AppContext, AttendanceEvent } from '../types/app.ts'
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
type Indicator = { label: string; tone: Tone; hint: string; window: string }
export function getJornadaState(now: Date, schedule: Pick<AppContext, 'policy' | 'school_date' | 'working_day'>, record: AttendanceEvent[]) {
  const action = attendanceAction({ ...schedule, events: record }, now)
  const entry = record.find(event => event.sequence_no === 1)
  const exit = record.find(event => event.sequence_no === 2)
  const p = schedule.policy
  const entryStart = p?.entry_opens.slice(0, 5) ?? '—'
  const entryEnd = p?.entry_closes.slice(0, 5) ?? '—'
  const exitStart = p?.exit_opens.slice(0, 5) ?? '—'
  const exitEnd = p?.exit_closes.slice(0, 5) ?? '—'
  const entryState: Indicator = entry ? { label: entry.kind === 'late_entry' ? 'Atraso justificado' : 'A tiempo', tone: entry.kind === 'late_entry' ? 'warning' : 'success', hint: entry.kind === 'late_entry' ? 'Registrada con justificación' : 'Registrada a tiempo', window: 'Registrada' } : { label: 'Pendiente', tone: 'neutral', hint: `Abre a las ${entryStart}`, window: 'Próxima' }
  const exitState: Indicator = exit ? { label: 'Registrada', tone: 'success', hint: 'Cierre de jornada registrado', window: 'Registrada' } : { label: 'Pendiente', tone: 'neutral', hint: `Abre a las ${exitStart}`, window: 'Próxima' }
  let label = 'Pendiente', tone: Tone = 'neutral', title = 'La ventana de entrada aún no abre', description = `Podrás escanear el QR desde las ${entryStart}.`
  if (action === 'not_working') {
    label = 'Sin jornada'; title = 'Hoy no tienes una jornada programada'; description = 'Consulta tus registros anteriores en Mi historial.'
    for (const state of [entryState, exitState]) Object.assign(state, { label: 'Sin jornada', tone: 'neutral', hint: 'Sin jornada hoy', window: 'Sin jornada' })
  } else if (action === 'entry' || action === 'exit') {
    const isEntry = action === 'entry'
    label = 'Ventana abierta'; tone = 'accent'; title = `La ventana de ${isEntry ? 'entrada' : 'salida'} está abierta`
    description = isEntry ? `Escanea el QR al llegar. Cierra a las ${entryEnd}.` : `Registra el cierre de tu jornada antes de las ${exitEnd}.`
    Object.assign(isEntry ? entryState : exitState, { label: 'Abierta', tone: 'accent', hint: `Cierra a las ${isEntry ? entryEnd : exitEnd}`, window: 'Abierta' })
  } else if (action === 'before_exit') {
    label = 'En jornada'; tone = 'success'; title = `Entrada registrada a las ${timeLabel(entry?.occurred_at ?? null)}`; description = `Tu salida se habilita a las ${exitStart}.`
  } else if (action === 'complete') {
    label = 'Jornada completa'; tone = 'success'; title = 'Registraste entrada y salida'
    const minutes = Math.max(0, Math.floor((Date.parse(exit!.occurred_at) - Date.parse(entry!.occurred_at)) / 60000))
    description = `Hoy trabajaste ${Math.floor(minutes / 60)} h ${minutes % 60} min.`
  } else if (action === 'late_entry') {
    label = 'Entrada pendiente'; tone = 'warning'; title = 'La ventana de entrada ya cerró'; description = 'Registra tu entrada con una justificación por atraso.'
    Object.assign(entryState, { label: 'Sin entrada', tone: 'warning', hint: 'Registra una justificación', window: 'Cerrada' })
    if (schoolMinutes(now) > minutesOf(exitEnd)) Object.assign(exitState, { label: 'Sin salida', tone: 'warning', hint: 'La ventana de salida ya cerró', window: 'Cerrada' })
  } else if (action === 'missing_exit') {
    label = 'Jornada incompleta'; tone = 'warning'; title = 'La ventana de salida ya cerró'; description = 'Tu salida no fue registrada. La administración tiene una notificación en su panel.'
    Object.assign(exitState, { label: 'Sin salida', tone: 'warning', hint: 'Salida no registrada', window: 'Cerrada' })
  } else if (action === 'not_configured' || action === 'refresh') {
    label = action === 'refresh' ? 'Actualizando' : 'Sin horario'; title = action === 'refresh' ? 'Actualizando el día de registro…' : 'Horario pendiente de configuración'; description = action === 'refresh' ? 'Espera mientras consultamos tu jornada.' : 'La institución todavía no ha configurado el horario de asistencia.'
    for (const state of [entryState, exitState]) Object.assign(state, { label, hint: title, window: 'Pendiente' })
  }
  return { action, label, tone, title, description, entry: entryState, exit: exitState, showHistory: action === 'not_working' || action === 'complete' }
}
export const minutesOf = (time: string) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes }
export const schoolMinutes = (now: Date) => minutesOf(new Intl.DateTimeFormat('en-GB', { timeZone: schoolTimezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now))
export function jornadaTimeline(policy: NonNullable<AppContext['policy']>, now: Date) {
  const start = Math.min(300, Math.floor(minutesOf(policy.entry_opens) / 60) * 60)
  const end = Math.max(840, Math.ceil(minutesOf(policy.exit_closes) / 60) * 60)
  const position = (minute: number) => Math.min(100, Math.max(0, (minute - start) / (end - start) * 100))
  return { marker: position(schoolMinutes(now)), windows: [[policy.entry_opens, policy.entry_closes], [policy.exit_opens, policy.exit_closes]].map(([a, b]) => ({ left: position(minutesOf(a)), width: position(minutesOf(b)) - position(minutesOf(a)) })), ticks: Array.from({ length: 4 }, (_, i) => { const minute = Math.round(start + (end - start) * i / 3); return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` }) }
}
