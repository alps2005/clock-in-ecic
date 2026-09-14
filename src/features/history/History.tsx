import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import type { AppContext } from '../../types/app'
import { useRemote } from '../../app/useRemote'
import { getReport } from '../../lib/api'
import { dateLabel, timeLabel } from '../../lib/attendance'
import { Failure, Loading, Pager } from '../../components/Feedback'

const entryLabels = { on_time: 'A tiempo', late: 'Atraso justificado', late_pending: 'Atraso · sin justificación', absent: 'Sin entrada', pending: 'Pendiente' }
export function History({ admin = false, context }: { admin?: boolean; context: AppContext }) {
  const [params] = useSearchParams()
  const initialSearch = admin ? (params.get('docente') ?? '').slice(0, 120) : ''
  const [from, setFrom] = useState(context.school_date)
  const [to, setTo] = useState(context.school_date)
  const [search, setSearch] = useState(initialSearch)
  const [filter, setFilter] = useState({ from, to, search: initialSearch })
  const [page, setPage] = useState(0)
  const [filterError, setFilterError] = useState('')
  const load = useCallback(() => getReport(filter.from, filter.to, page, filter.search), [filter, page])
  const result = useRemote(load, 30_000)
  function submit(event: FormEvent) {
    event.preventDefault()
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
    if (!from || !to || !Number.isFinite(days) || days < 0 || days > 30) { setFilterError('Selecciona un rango válido de hasta 31 días.'); return }
    setFilterError(''); setPage(0); setFilter({ from, to, search: search.trim() })
  }
  return <><div className="page-heading"><div><p className="eyebrow">{admin ? 'ADMINISTRACIÓN' : 'MI ESPACIO'}</p><h1>{admin ? 'Asistencia docente' : 'Mi historial'}<span className="accent">.</span></h1><p>{admin ? 'Una mirada clara a cada jornada de nuestra comunidad.' : 'Cada jornada, en un solo lugar.'}</p></div><button className="button secondary" onClick={result.refresh}>Actualizar ↻</button></div>
    <form className="filter-bar" onSubmit={submit}><div><label htmlFor="from">Desde</label><input id="from" type="date" required max={context.school_date} value={from} onChange={e => setFrom(e.target.value)} /></div><div><label htmlFor="to">Hasta</label><input id="to" type="date" required max={context.school_date} value={to} onChange={e => setTo(e.target.value)} /></div>{admin && <div className="search-field"><label htmlFor="search">Docente</label><input id="search" placeholder="Nombre o cédula" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} /></div>}<button className="button primary">Consultar</button></form>
    {filterError && <p className="feedback error" role="alert">{filterError}</p>}
    <ReportContent key={`${filter.from}-${filter.to}-${filter.search}-${page}`} result={result} admin={admin} page={page} setPage={setPage} />
  </>
}
function ReportContent({ result, admin, page, setPage }: { result: ReturnType<typeof useRemote<Awaited<ReturnType<typeof getReport>>>>; admin: boolean; page: number; setPage: (page: number) => void }) {
  if (result.loading) return <Loading />
  if (result.error || !result.data) return <Failure error={result.error} retry={result.refresh} />
  const data = result.data
  return <><div className="stats-grid"><div className="stat"><span>A tiempo</span><strong>{data.totals.on_time}</strong><small>Entradas registradas</small></div><div className="stat"><span>Atrasos</span><strong>{data.totals.late}</strong><small>Incluye justificación pendiente</small></div><div className="stat"><span>Sin entrada</span><strong>{data.totals.absent}</strong><small>Al cierre de la jornada</small></div><div className="stat"><span>Sin salida</span><strong>{data.totals.missing_exit}</strong><small>Requieren atención</small></div></div>
    <section className="report-card"><div className="section-title"><h2>Detalle de asistencia</h2><span className="muted">Actualizado a las {timeLabel(data.as_of)}</span></div>{data.rows.length === 0 ? <div className="empty-state"><span aria-hidden="true">▤</span><h3>No hay registros para esta consulta</h3><p>Prueba con otras fechas o un nombre diferente.</p></div> : <div className="table-scroll" role="region" aria-label="Registros de asistencia" tabIndex={0}><table><thead><tr>{admin && <th>Docente</th>}<th>Fecha</th><th>Entrada</th><th>Salida</th><th>Estado</th><th>Tiempo</th><th>Justificación</th></tr></thead><tbody>{data.rows.map(row => <tr key={`${row.teacher_id}-${row.school_date}`}>{admin && <td><strong>{row.full_name}</strong><small>{row.cedula}</small></td>}<td>{dateLabel(row.school_date)}</td><td>{timeLabel(row.entry_at)}</td><td>{timeLabel(row.exit_at)}{row.exit_status === 'missing' && <small className="text-warning">Salida no registrada</small>}</td><td><span className={`badge ${row.entry_status === 'on_time' ? 'green' : row.entry_status === 'pending' ? '' : 'amber'}`}>{entryLabels[row.entry_status]}</span></td><td>{row.worked_minutes === null ? '—' : `${Math.floor(row.worked_minutes / 60)} h ${row.worked_minutes % 60} min`}</td><td className="justification-cell">{row.justification ? <details><summary>Ver justificación</summary><p>{row.justification}</p></details> : '—'}</td></tr>)}</tbody></table></div>}<Pager page={page} total={data.totals.expected} onPage={setPage} /></section></>
}
