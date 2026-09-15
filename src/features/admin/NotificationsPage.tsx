import { useCallback, useState } from 'react'
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import { getNotifications } from '../../lib/api'
import { useRemote } from '../../app/useRemote'
import { dateLabel, timeLabel } from '../../lib/attendance'
import { Failure, Loading, Pager } from '../../components/Feedback'
export function NotificationsPage() {
  const [page, setPage] = useState(0)
  const load = useCallback(() => getNotifications(page), [page])
  const result = useRemote(load, 30_000)
  return <><div className="page-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Notificaciones<span className="accent">.</span></h1><p>Entradas fuera de horario y salidas sin registrar.</p></div><button className="button secondary" onClick={result.refresh}><RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />Actualizar</button></div>{result.loading ? <Loading /> : result.error || !result.data ? <Failure error={result.error} retry={result.refresh} /> : <section className="report-card"><div className="section-title"><h2>Ventanas de registro incumplidas</h2><span className="badge amber">{result.data.total} avisos</span></div>{result.data.rows.length === 0 ? <div className="empty-state"><CheckCircle2 size={35} strokeWidth={1.7} aria-hidden="true" /><h3>Todo al día</h3><p>No hay ventanas de registro incumplidas.</p></div> : <ul className="notification-list">{result.data.rows.map(row => <li key={`${row.teacher_id}-${row.school_date}-${row.kind}`}><span className="notification-icon" aria-hidden="true"><AlertCircle size={20} strokeWidth={1.8} /></span><div><h3>{row.full_name}</h3><p>{row.kind === 'entry' ? 'Entrada fuera de horario' : 'Salida no registrada'} · {dateLabel(row.school_date)}</p><small>C.I. {row.cedula} · Entrada: {timeLabel(row.entry_at)}. {row.kind === 'entry' ? 'No se registró una entrada dentro del horario vigente para ese día.' : 'El horario de salida terminó a las 13:30.'}</small></div><span className="badge amber">{row.kind === 'entry' ? 'Entrada' : 'Sin salida'}</span></li>)}</ul>}<Pager page={page} total={result.data.total} onPage={setPage} /></section>}</>
}
