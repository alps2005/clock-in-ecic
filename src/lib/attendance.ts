import type { AppContext } from '../types/app.ts'
export const schoolTimezone = 'America/Guayaquil'
export const wordCount = (text: string) => text.trim() ? text.trim().split(/\s+/u).length : 0
export const validCedula = (value: string) => /^\d{10}$/.test(value)
export const loginIdentity = (cedula: string) => {
  if (!validCedula(cedula)) throw new Error('INVALID_CEDULA')
  return `${cedula}@login.clock-in.invalid`
}
export function schoolDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: schoolTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}
export function timeLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-EC', { timeZone: schoolTimezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—'
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
}
export function attendanceAction(context: AppContext, now: Date) {
  if (!context.policy) return 'not_configured'
  if (schoolDate(now) !== context.school_date) return 'refresh'
  if (!context.working_day) return 'not_working'
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: schoolTimezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now)
  const seconds = (value: string) => value.split(':').reduce((total, part) => total * 60 + Number(part), 0)
  const current = seconds(time) + now.getUTCMilliseconds() / 1000
  const p = context.policy
  if (context.events.length >= 2) return 'complete'
  if (context.events.length === 0) {
    if (current < seconds(p.entry_opens)) return 'before_entry'
    if (current <= seconds(p.entry_closes)) return 'entry'
    return 'late_entry'
  }
  if (current < seconds(p.exit_opens)) return 'before_exit'
  if (current <= seconds(p.exit_closes)) return 'exit'
  return 'missing_exit'
}
export const errors: Record<string, string> = {
  ACCOUNT_BUSY: 'Hay otro cambio en curso para esta cuenta. Espera un momento y vuelve a intentar.',
  ACCOUNT_EXISTS: 'Ya existe una cuenta con esa C.I.',
  ACCOUNT_CHANGED: 'La cuenta cambió. Actualiza la lista antes de continuar.',
  ACCOUNT_PENDING: 'La creación de esta cuenta está pendiente. Reintenta crearla con los mismos datos.',
  TEACHER_NOT_FOUND: 'No se encontró la cuenta del docente.',
  EMPLOYMENT_REQUIRED: 'Revisa las fechas de vinculación del docente.',
  EMPLOYMENT_HAS_HISTORY: 'Las fechas no pueden excluir asistencia ya registrada.',
  IDENTITY_MISMATCH: 'La identidad de acceso necesita revisión del operador.',
  PASSWORD_TOO_SHORT: 'La contraseña debe tener entre 12 y 256 caracteres.',
  ADMIN_OPERATION_FAILED: 'No se pudo completar el cambio. Actualiza la lista y revisa el estado de la cuenta antes de reintentar; por seguridad podría haber quedado inactiva.',
  ACCESS_DENIED: 'Tu cuenta no tiene acceso. Comunícate con la administración.',
  STALE_DATE: 'Cambió el día de registro. Actualiza tu jornada.', STALE_STATE: 'Tu asistencia cambió en otro dispositivo. Actualiza tu jornada.',
  ENTRY_CLOSED: 'El horario de entrada terminó. Registra una justificación por atraso.',
  EXIT_CLOSED: 'El escaneo de salida no está disponible en este horario.', INVALID_QR: 'Este código QR no corresponde a un punto de registro activo de ECIC.',
  JUSTIFICATION_REQUIRED: 'Escribe una justificación de entre 1 y 250 palabras.',
  JUSTIFICATION_NOT_OPEN: 'La justificación estará disponible después de las 06:45.',
  NOT_WORKING_DAY: 'Hoy no corresponde una jornada de registro para tu cuenta.',
  SCHOOL_NOT_CONFIGURED: 'El acceso estará disponible cuando termine la configuración de la institución.',
  INVALID_FILTER: 'Selecciona un rango válido de hasta 31 días.', REQUEST_REUSED: 'Esta solicitud ya se utilizó con otros datos. Actualiza tu jornada.',
  INVALID_REQUEST: 'No se pudo validar la solicitud. Actualiza tu jornada.',
}
export const errorMessage = (error: unknown) => error instanceof Error && errors[error.message]
  ? errors[error.message] : 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'
