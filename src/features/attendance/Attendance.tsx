import { usePageRefresh } from '../../app/usePageRefresh'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Clock3, LogIn, LogOut, LockKeyhole, Info, CircleCheck, ScanLine } from 'lucide-react'
import { Link } from 'react-router'
import { getJornadaState, jornadaTimeline } from '../../lib/jornada'
import { schoolTimezone } from '../../lib/attendance'
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
    const timer = window.setInterval(() => setClock({ source: context.server_time, time: Date.parse(context.server_time) + Math.max(0, performance.now() - received) }), 1000)
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
  const state = getJornadaState(now, context, context.events)
  const timeline = context.policy ? jornadaTimeline(context.policy, now) : null
  const seconds = new Intl.DateTimeFormat('en-GB', { timeZone: schoolTimezone, second: '2-digit' }).format(now).padStart(2, '0')
  return <>
    <div className="page-heading"><div><h1>Hola, {firstName}</h1><p>Te deseamos una excelente jornada laboral.</p></div><span className={`ui-badge tone-${state.tone}`}>{state.label}</span></div>
    <div className={`jornada-alert tone-${state.tone === 'neutral' ? 'accent' : state.tone}`} role="status">{state.tone === 'success' ? <CircleCheck size={20} aria-hidden="true" /> : <Info size={20} aria-hidden="true" />}<div><strong>{state.title}</strong><p>{state.description}</p></div>{state.showHistory && <Link className="button secondary" to="/historial">Ver mi historial</Link>}</div>
    {!online && <p className="feedback notice" role="alert">Estás sin conexión. Conéctate a internet para registrar tu asistencia.</p>}
    {message && <p className="feedback success" role="status">{message}</p>}{error && <p className="feedback error" role="alert">{error}</p>}
    <div className="jornada-kpis">
      <section className="ui-card jornada-kpi"><div className="kpi-heading"><h2>Hora de la institución</h2><Clock3 size={18} aria-hidden="true" /></div><div className="kpi-value numeric">{timeLabel(now.toISOString())}<span>:{seconds}</span></div><p>Ecuador continental, UTC−5</p></section>
      {[{ title: 'Entrada', Icon: LogIn, event: entry, status: state.entry }, { title: 'Salida', Icon: LogOut, event: exit, status: state.exit }].map(({ title, Icon, event, status }) => <section key={title} className="ui-card jornada-kpi"><div className="kpi-heading"><h2><Icon size={17} aria-hidden="true" />{title}</h2><span className={`ui-badge tone-${status.tone}`}>{status.label}</span></div><div className="kpi-value numeric">{timeLabel(event?.occurred_at ?? null)}</div><p>{status.hint}</p></section>)}
    </div>
    {(pending || scannerAllowed || action === 'late_entry') && <section className="ui-card attendance-actions" aria-label="Registrar asistencia">
      {pending ? <div className="action-block"><h3>Registro pendiente de confirmación</h3><p>Conservamos tu solicitud para verificar el resultado.</p><button className="button primary" disabled={busy || !online} onClick={() => void send(pending)}>{busy ? 'Comprobando…' : 'Comprobar registro'}</button></div> : <div className="action-block">
        {scannerAllowed && <><p>Escanea el código QR de la institución para registrar tu {action === 'entry' ? 'entrada' : 'salida'}.</p><button className="button primary" disabled={busy || !online} onClick={() => { setError(''); setScanning(true) }}><ScanLine size={17} strokeWidth={1.9} aria-hidden="true" />Escanear {action === 'entry' ? 'entrada' : 'salida'}</button></>}
        {action === 'late_entry' && <form onSubmit={event => { event.preventDefault(); if (wordCount(justification) > 0 && wordCount(justification) <= 250) begin('late_entry', null) }}><span className="badge amber">Atraso</span><h3>Cuéntanos el motivo de tu atraso</h3><p>El escaneo de entrada terminó a las {entryCloses}. Tu entrada se registrará al enviar esta justificación.</p><label htmlFor="justification">Justificación</label><textarea id="justification" required maxLength={10000} rows={4} value={justification} onChange={event => setJustification(event.target.value)} aria-describedby="word-count" /><span id="word-count" className={wordCount(justification) > 250 ? 'word-count invalid' : 'word-count'}>{wordCount(justification)} / 250 palabras</span><button className="button primary" disabled={busy || !online || wordCount(justification) === 0 || wordCount(justification) > 250}>Registrar entrada con justificación</button></form>}
      </div>}</section>}
    <section className={`ui-card jornada-schedule${!context.working_day ? ' no-jornada' : ''}`}>
      <h2>Tu horario</h2><p className="schedule-description">{!context.working_day ? 'Horario habitual. Hoy no aplica porque no tienes jornada.' : 'Tus ventanas de registro para la jornada de hoy.'}</p>
      {timeline && <div className="day-timeline" aria-label={`Horario: entrada de ${entryOpens} a ${entryCloses}, salida de ${exitOpens} a ${exitCloses}`}><div className="timeline-track">{timeline.windows.map((window, index) => <span key={index} className="timeline-window" style={{ left: `${window.left}%`, width: `${window.width}%` }} />)}<span className="timeline-marker" style={{ left: `${timeline.marker}%` }}><span style={{ transform: timeline.marker < 10 ? 'translateX(0)' : timeline.marker > 90 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{timeLabel(now.toISOString())}</span></span></div><div className="timeline-ticks numeric">{timeline.ticks.map(tick => <span key={tick}>{tick}</span>)}</div></div>}
      {[{ title: 'Entrada', Icon: LogIn, start: entryOpens, end: entryCloses, hint: 'Escanea el QR al llegar.', status: state.entry }, { title: 'Salida', Icon: LogOut, start: exitOpens, end: exitCloses, hint: 'Registra el cierre de tu jornada.', status: state.exit }].map(({ title, Icon, start, end, hint, status }) => <div className="jornada-window" key={title}><span className="window-icon"><Icon size={18} aria-hidden="true" /></span><div><h3>{title}</h3><strong className="numeric">{start}–{end}</strong><p>{hint}</p></div><span className={`ui-badge tone-${status.tone}`}>{status.window}</span></div>)}
      <p className="jornada-lock"><LockKeyhole size={14} aria-hidden="true" />Fuera de estas ventanas, el escáner permanece bloqueado.</p>
    </section>
    {scanning && scannerAllowed && !pending && online && <Suspense fallback={<p role="status">Abriendo la cámara…</p>}><Scanner onClose={() => setScanning(false)} onScan={qr => begin(action, qr)} /></Suspense>}
  </>
}
