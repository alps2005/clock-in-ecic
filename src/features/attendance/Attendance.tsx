import { usePageRefresh } from '../../app/usePageRefresh'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ScanLine } from 'lucide-react'
import type { AppContext, AttendanceRequest } from '../../types/app'
import { attendanceAction, errorMessage, errors, timeLabel, wordCount } from '../../lib/attendance'
import { recordAttendance } from '../../lib/api'
const Scanner = lazy(() => import('./Scanner').then(module => ({ default: module.Scanner })))

function recoverPending(owner: string): AttendanceRequest | null {
  try {
    if (sessionStorage.getItem('ecic-pending-owner') !== owner) return null
    const value = JSON.parse(sessionStorage.getItem('ecic-pending-attendance') ?? 'null') as AttendanceRequest | null
    return value && typeof value.p_request_id === 'string' && ['entry','late_entry','exit'].includes(value.p_kind) ? value : null
  } catch { return null }
}
export function Attendance({ context, refresh }: { context: AppContext; refresh: () => void }) {
  usePageRefresh(refresh, context, null)
  const [clock, setClock] = useState({ source: context.server_time, time: Date.parse(context.server_time) })
  const now = new Date(clock.source === context.server_time ? clock.time : Date.parse(context.server_time))
  useEffect(() => {
    const received = performance.now()
    const timer = window.setInterval(() => setClock({ source: context.server_time, time: Date.parse(context.server_time) + Math.max(0, performance.now() - received) }), 250)
    return () => clearInterval(timer)
  }, [context.server_time])
  const action = attendanceAction(context, now)
  const [scanning, setScanning] = useState(false)
  const [justification, setJustification] = useState('')
  const [pending, setPending] = useState(() => recoverPending(context.profile.auth_user_id!))
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const mounted = useRef(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    mounted.current = true
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) setScanning(false) }
    window.addEventListener('online', network); window.addEventListener('offline', network)
    return () => { mounted.current = false; window.removeEventListener('online', network); window.removeEventListener('offline', network) }
  }, [])
  useEffect(() => { if (action === 'refresh') refresh() }, [action, refresh])
  function clearPending() {
    setPending(null)
    sessionStorage.removeItem('ecic-pending-attendance'); sessionStorage.removeItem('ecic-pending-owner')
  }
  async function send(request: AttendanceRequest) {
    if (lock.current || !navigator.onLine) return
    lock.current = true; setBusy(true); setScanning(false); setMessage(''); setError(''); setPending(request)
    try {
      sessionStorage.setItem('ecic-pending-owner', context.profile.auth_user_id!)
      sessionStorage.setItem('ecic-pending-attendance', JSON.stringify(request))
      await recordAttendance(request)
      if (!mounted.current) return
      clearPending(); setJustification(''); setMessage(request.p_kind === 'exit' ? 'Tu salida se registró correctamente.' : 'Tu entrada se registró correctamente.'); refresh()
    } catch (error) {
      if (!mounted.current) return
      if (error instanceof Error && errors[error.message]) { clearPending(); setError(errorMessage(error)); refresh() }
      else setError('No pudimos confirmar el resultado. Usa “Comprobar registro” para consultar la misma solicitud sin duplicarla.')
    } finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  function begin(kind: AttendanceRequest['p_kind'], qr: string | null) {
    if (pending || lock.current) return
    void send({ p_kind: kind, p_qr: qr, p_justification: kind === 'late_entry' ? justification.trim() : null,
      p_school_date: context.school_date, p_prior_sequence: context.events.length, p_request_id: crypto.randomUUID() })
  }
  const firstName = context.profile.full_name.split(' ')[0]
  const entryOpens = context.policy?.entry_opens.slice(0, 5) ?? '—'
  const entryCloses = context.policy?.entry_closes.slice(0, 5) ?? '—'
  const exitOpens = context.policy?.exit_opens.slice(0, 5) ?? '—'
  const exitCloses = context.policy?.exit_closes.slice(0, 5) ?? '—'
  const entry = context.events.find(e => e.sequence_no === 1)
  const exit = context.events.find(e => e.sequence_no === 2)
  const scannerAllowed = action === 'entry' || action === 'exit'
  return <>
    <div className="page-heading"><div><h1>Hola, {firstName}</h1><p>Te deseamos una excelente jornada laboral.</p></div></div>
    {!online && <p className="feedback notice" role="alert">Estás sin conexión. Conéctate a internet para registrar tu asistencia.</p>}
    {message && <p className="feedback success" role="status">{message}</p>}{error && <p className="feedback error" role="alert">{error}</p>}
    <div className="attendance-grid"><section className="attendance-card"><div className="section-title"><h2>Tu asistencia de hoy</h2><span className={`badge ${exit ? 'green' : entry ? 'amber' : ''}`}>{exit ? 'Jornada registrada' : entry ? 'En jornada' : 'Sin entrada'}</span></div>
      <div className="clock-display"><span>HORA DE LA INSTITUCIÓN</span><strong>{timeLabel(now.toISOString())}</strong><p>Ecuador continental · UTC−5</p></div>
      <div className="event-pair"><div><span><ArrowUpRight size={15} strokeWidth={1.8} aria-hidden="true" />Entrada</span><strong>{timeLabel(entry?.occurred_at ?? null)}</strong><small>{entry?.kind === 'late_entry' ? 'Atraso justificado' : entry ? 'A tiempo' : 'Pendiente'}</small></div><div><span><ArrowDownLeft size={15} strokeWidth={1.8} aria-hidden="true" />Salida</span><strong>{timeLabel(exit?.occurred_at ?? null)}</strong><small>{exit ? 'Registrada' : action === 'missing_exit' ? 'Salida no registrada' : 'Pendiente'}</small></div></div>
      {pending ? <div className="action-block"><h3>Registro pendiente de confirmación</h3><p>Conservamos tu solicitud para verificar el resultado.</p><button className="button primary" disabled={busy || !online} onClick={() => void send(pending)}>{busy ? 'Comprobando…' : 'Comprobar registro'}</button></div> : <div className="action-block">
        {scannerAllowed && <><p>Escanea el código QR de la institución para registrar tu {action === 'entry' ? 'entrada' : 'salida'}.</p><button className="button primary" disabled={busy || !online} onClick={() => { setError(''); setScanning(true) }}><ScanLine size={17} strokeWidth={1.9} aria-hidden="true" />Escanear {action === 'entry' ? 'entrada' : 'salida'}</button></>}
        {action === 'late_entry' && <form onSubmit={event => { event.preventDefault(); if (wordCount(justification) > 0 && wordCount(justification) <= 250) begin('late_entry', null) }}><span className="badge amber">Atraso</span><h3>Cuéntanos el motivo de tu atraso</h3><p>El escaneo de entrada terminó a las {entryCloses}. Tu entrada se registrará al enviar esta justificación.</p><label htmlFor="justification">Justificación</label><textarea id="justification" required maxLength={10000} rows={4} value={justification} onChange={event => setJustification(event.target.value)} aria-describedby="word-count" /><span id="word-count" className={wordCount(justification) > 250 ? 'word-count invalid' : 'word-count'}>{wordCount(justification)} / 250 palabras</span><button className="button primary" disabled={busy || !online || wordCount(justification) === 0 || wordCount(justification) > 250}>Registrar entrada con justificación</button></form>}
        {action === 'before_entry' && <><h3>Tu jornada está por comenzar</h3><p>El escáner de entrada estará disponible a las {entryOpens}.</p></>}
        {action === 'before_exit' && <><h3>Que tengas una buena jornada</h3><p>Podrás registrar tu salida entre las {exitOpens} y las {exitCloses}.</p></>}
        {action === 'missing_exit' && <div className="feedback notice"><h3>Salida no registrada</h3><p>El escaneo terminó a las {exitCloses}. La administración tiene una notificación en su panel.</p></div>}
        {action === 'complete' && <><h3>Gracias por estar presente</h3><p>Tu entrada y salida quedaron registradas. Puedes consultarlas en tu historial.</p></>}
        {action === 'not_working' && <><h3>Hoy no tienes una jornada programada</h3><p>Consulta tus registros anteriores en Mi historial.</p></>}
        {action === 'not_configured' && <p>La institución todavía no ha configurado el horario de asistencia.</p>}
        {action === 'refresh' && <p role="status">Actualizando el día de registro…</p>}
      </div>}
    </section><aside className="schedule-card"><h2>Tu horario</h2><div className="schedule-line"><span className="schedule-dot" /><div><small>ENTRADA</small><strong>{entryOpens} — {entryCloses}</strong><p>Escanea el QR al llegar.</p></div></div><div className="schedule-line"><span className="schedule-dot" /><div><small>SALIDA</small><strong>{exitOpens} — {exitCloses}</strong><p>Registra el cierre de tu jornada.</p></div></div><p className="schedule-footnote">Fuera de estas ventanas, el escáner permanece bloqueado.</p></aside></div>
    {scanning && scannerAllowed && !pending && online && <Suspense fallback={<p role="status">Abriendo la cámara…</p>}><Scanner onClose={() => setScanning(false)} onScan={qr => begin(action, qr)} /></Suspense>}
  </>
}
