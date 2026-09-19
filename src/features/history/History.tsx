import { usePageRefresh } from '../../app/usePageRefresh'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, ClipboardList, RefreshCw, Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import type { AppContext, Report } from '../../types/app'
import { useRemote } from '../../app/useRemote'
import { getReport, getTeacherReport } from '../../lib/api'
import { dateLabel, timeLabel } from '../../lib/attendance'
import { Failure, Loading, Pager } from '../../components/Feedback'
import { AttendanceStats } from './AttendanceStats'

const entryLabels = { on_time: 'A tiempo', late: 'Atraso justificado', late_pending: 'Atraso • sin justificación', missing_entry: 'Sin entrada', absent: 'Sin asistencia', pending: 'Pendiente' }

function toDateInput(date: Date) {
  const offset = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offset.toISOString().slice(0, 10)
}

function shiftDate(base: string, days: number) {
  const date = new Date(`${base}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return toDateInput(date)
}

export function History({ admin = false, context, teacherId }: { admin?: boolean; context: AppContext; teacherId?: string }) {
  const [params] = useSearchParams()
  const initialSearch = admin ? (params.get('docente') ?? '').slice(0, 120) : ''
  const [from, setFrom] = useState(context.school_date)
  const [to, setTo] = useState(context.school_date)
  const [search, setSearch] = useState(initialSearch)
  const [filter, setFilter] = useState({ from, to, search: initialSearch })
  const [page, setPage] = useState(0)
  const [filterError, setFilterError] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos los estados')
  const load = useCallback(() => teacherId ? getTeacherReport(teacherId, filter.from, filter.to, page) : getReport(filter.from, filter.to, page, filter.search), [filter, page, teacherId])
  const result = useRemote(load, 30_000)
  usePageRefresh(result.refresh, result.data, result.error)

  function submit(event: FormEvent) {
    event.preventDefault()
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
    if (!from || !to || !Number.isFinite(days) || days < 0 || days > 30) { setFilterError('Selecciona un rango válido de hasta 31 días.'); return }
    setFilterError(''); setPage(0); setFilter({ from, to, search: search.trim() })
  }

  function applyRange(kind: 'today' | 'yesterday' | 'week' | 'month') {
    const base = context.school_date
    if (kind === 'today') { setFrom(base); setTo(base) }
    if (kind === 'yesterday') { setFrom(shiftDate(base, -1)); setTo(shiftDate(base, -1)) }
    if (kind === 'week') { setFrom(shiftDate(base, -6)); setTo(base) }
    if (kind === 'month') { setFrom(shiftDate(base, -30)); setTo(base) }
    setPage(0)
    setFilter({ from: kind === 'today' ? base : kind === 'yesterday' ? shiftDate(base, -1) : kind === 'week' ? shiftDate(base, -6) : shiftDate(base, -30), to: kind === 'today' ? base : kind === 'yesterday' ? shiftDate(base, -1) : base, search: search.trim() })
  }

  if (admin && !teacherId) {
    return <div className="ecic-main-column">
      <div className="ecic-page-header">
        <div className="ecic-page-header-top">
          <div>
            <p className="eyebrow">ADMINISTRACIÓN</p>
            <h1>Asistencia docente.</h1>
            <p>Una mirada clara a cada jornada de nuestra comunidad docente en tiempo real.</p>
          </div>
          <span className="ecic-connection-badge"><span className="ecic-live-dot" aria-hidden="true" />Servidor biométrico conectado • Activo</span>
        </div>
      </div>

      <form className="ecic-filter-bar" onSubmit={submit}>
        <div className="ecic-field">
          <label htmlFor="from">DESDE</label>
          <div className="ecic-input-shell">
            <input id="from" type="date" required max={context.school_date} value={from} onChange={e => setFrom(e.target.value)} />
            <CalendarDays size={16} strokeWidth={1.7} />
          </div>
        </div>
        <div className="ecic-field">
          <label htmlFor="to">HASTA</label>
          <div className="ecic-input-shell">
            <input id="to" type="date" required max={context.school_date} value={to} onChange={e => setTo(e.target.value)} />
            <CalendarDays size={16} strokeWidth={1.7} />
          </div>
        </div>
        <div className="ecic-field ecic-field-search">
          <label htmlFor="search">DOCENTE</label>
          <div className="ecic-input-shell ecic-input-shell-search">
            <Search size={16} strokeWidth={1.9} />
            <input id="search" placeholder="Nombre o cédula (ej. Adrian Palma)" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="ecic-field ecic-field-select">
          <label htmlFor="status">ESTADO</label>
          <select id="status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option>Todos los estados</option>
            <option>A tiempo</option>
            <option>Atrasos</option>
            <option>Justificados</option>
          </select>
        </div>
        <button className="ecic-button primary" type="submit">Consultar</button>
      </form>

      <div className="ecic-quick-range">
        <button type="button" className={from === context.school_date && to === context.school_date ? 'active' : ''} onClick={() => applyRange('today')}>Hoy ({new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' }).format(new Date(`${context.school_date}T12:00:00Z`))})</button>
        <button type="button" onClick={() => applyRange('yesterday')}>Ayer</button>
        <button type="button" onClick={() => applyRange('week')}>Esta semana</button>
        <button type="button" onClick={() => applyRange('month')}>Mes actual</button>
        <span className="ecic-range-label">Rango: {from} — {to}</span>
      </div>

      {filterError && <p className="feedback error" role="alert">{filterError}</p>}
      <ReportContent key={`${filter.from}-${filter.to}-${filter.search}-${page}`} result={result} admin={admin && !teacherId} page={page} setPage={setPage} />
    </div>
  }

  const personalHistory = !admin && !teacherId
  return <div className={`history-page${personalHistory ? ' personal-history' : ''}`}>
    <div className="page-heading">
      <div>
        {!personalHistory && <p className="eyebrow">{admin ? 'ADMINISTRACIÓN' : 'MI ESPACIO'}</p>}
        {teacherId ? <h2>Historial de asistencia</h2> : <h1>{admin ? <>Asistencia docente<span className="accent">.</span></> : 'Mi historial'}</h1>}
        <p>{teacherId ? 'Consulta las jornadas de este docente por fecha.' : admin ? 'Una mirada clara a cada jornada de nuestra comunidad.' : 'Tus jornadas, en un solo lugar.'}</p>
      </div>
      <button className="button secondary" onClick={result.refresh}>
        <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />
        {personalHistory ? 'Actualizar Historial' : 'Actualizar'}
      </button>
    </div>
    <form className={`filter-bar${teacherId ? ' teacher-history-filters' : ''}`} onSubmit={submit}><div><label htmlFor="from">Desde</label><input id="from" type="date" required max={context.school_date} value={from} onChange={e => setFrom(e.target.value)} /></div><div><label htmlFor="to">Hasta</label><input id="to" type="date" required max={context.school_date} value={to} onChange={e => setTo(e.target.value)} /></div>{admin && !teacherId && <div className="search-field"><label htmlFor="search">Docente</label><input id="search" placeholder="Nombre o cédula" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} /></div>}<button className="button primary">Consultar</button></form>
    {filterError && <p className="feedback error" role="alert">{filterError}</p>}
    <ReportContent key={`${filter.from}-${filter.to}-${filter.search}-${page}`} result={result} admin={admin && !teacherId} page={page} setPage={setPage} />
  </div>
}

function ReportContent({ result, admin, page, setPage }: { result: ReturnType<typeof useRemote<Awaited<ReturnType<typeof getReport>>>>; admin: boolean; page: number; setPage: (page: number) => void }) {
  const [justificationRow, setJustificationRow] = useState<Awaited<ReturnType<typeof getReport>>['rows'][number] | null>(null)
  if (result.loading) return <Loading />
  if (result.error || !result.data) return <Failure error={result.error} retry={result.refresh} />
  const data = result.data

  if (admin) {
    return <>
      <AttendanceStats totals={data.totals} admin />

      <section className="ecic-table-card">
        <div className="ecic-table-header">
          <div>
            <div className="ecic-table-title-row">
              <h2>Detalle de asistencia</h2>
              <span className="ecic-table-count">{data.rows.length} registro</span>
            </div>
            <p>Control individual con verificación de firmas horarias y justificaciones</p>
          </div>
          <div className="ecic-table-tabs">
            <button type="button" className="active">Todos ({data.rows.length})</button>
            <button type="button">Con retraso ({data.rows.filter(row => row.entry_status === 'late_pending' || row.entry_status === 'late').length})</button>
            <button type="button">Justificados (0)</button>
          </div>
        </div>

        {data.rows.length === 0 ? <div className="empty-state"><ClipboardList size={35} strokeWidth={1.7} aria-hidden="true" /><h3>No hay registros para esta consulta</h3><p>Prueba con otras fechas o un nombre diferente.</p></div> : <div className="table-scroll" role="region" aria-label="Registros de asistencia" tabIndex={0}><table className="ecic-table"><thead><tr><th>DOCENTE</th><th>FECHA</th><th>ENTRADA</th><th>SALIDA</th><th>ESTADO</th><th>TIEMPO</th><th>JUSTIFICACIÓN</th></tr></thead><tbody>{data.rows.map(row => <tr key={`${row.teacher_id}-${row.school_date}`}><td><div className="ecic-teacher-cell"><span className="ecic-avatar-pill">{row.full_name.split(' ').slice(0, 2).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span><div><strong>{row.full_name}</strong><small>{row.cedula}</small></div></div></td><td>{dateLabel(row.school_date)}</td><td>{timeLabel(row.entry_at)}</td><td>{timeLabel(row.exit_at)}</td><td><span className={`ecic-status-pill-table ${row.entry_status === 'late_pending' || row.entry_status === 'late' ? 'warning' : row.entry_status === 'on_time' ? 'success' : 'neutral'}`}>{`• ${entryLabels[row.entry_status]}`}</span></td><td>{row.worked_minutes === null ? '—' : `${Math.floor(row.worked_minutes / 60)}h ${row.worked_minutes % 60}m`}</td><td>{row.justification ? <button type="button" className="justification-link" onClick={() => setJustificationRow(row)}>Ver justificación</button> : '—'}</td></tr>)}</tbody></table></div>}

        <div className="ecic-table-footer">
          <span>{data.rows.length} registros • Página {page + 1} de {Math.max(1, Math.ceil(data.totals.expected / 25))} | Total activo: {data.rows.length} coincidencia</span>
          <div className="ecic-pager-buttons">
            <button type="button" className="ecic-ghost-button smaller" disabled={page === 0}>Anterior</button>
            <button type="button" className="ecic-ghost-button smaller" disabled={(page + 1) * 25 >= data.totals.expected}>Siguiente</button>
          </div>
        </div>
      </section>
      {justificationRow && <JustificationModal row={justificationRow} close={() => setJustificationRow(null)} />}
    </>
  }

  return <><AttendanceStats totals={data.totals} />
    <section className="report-card"><div className="section-title"><h2>Detalle de asistencia</h2><span className="muted">Actualizado a las {timeLabel(data.as_of)}</span></div>{data.rows.length === 0 ? <div className="empty-state"><ClipboardList size={35} strokeWidth={1.7} aria-hidden="true" /><h3>No hay registros para esta consulta</h3><p>Prueba con otras fechas o un nombre diferente.</p></div> : <div className="table-scroll" role="region" aria-label="Registros de asistencia" tabIndex={0}><table><thead><tr>{admin && <th>Docente</th>}<th>Fecha</th><th>Entrada</th><th>Salida</th><th>Estado</th><th>Tiempo</th><th>Justificación</th></tr></thead><tbody>{data.rows.map(row => <tr key={`${row.teacher_id}-${row.school_date}`}>{admin && <td><strong>{row.full_name}</strong><small>{row.cedula}</small></td>}<td>{dateLabel(row.school_date)}</td><td>{timeLabel(row.entry_at)}</td><td>{timeLabel(row.exit_at)}{row.exit_status === 'missing' && <small className="text-warning">Salida no registrada</small>}</td><td><span className={`badge ${row.entry_status === 'on_time' ? 'green' : row.entry_status === 'pending' ? '' : 'amber'}`}>{entryLabels[row.entry_status]}</span></td><td>{row.worked_minutes === null ? '—' : `${Math.floor(row.worked_minutes / 60)} h ${row.worked_minutes % 60} min`}</td><td>{row.justification ? <button type="button" className="justification-link" onClick={() => setJustificationRow(row)}>Ver justificación</button> : '—'}</td></tr>)}</tbody></table></div>}<Pager page={page} total={data.totals.expected} onPage={setPage} /></section>{justificationRow && <JustificationModal row={justificationRow} close={() => setJustificationRow(null)} />}</>
}

function JustificationModal({ row, close }: { row: Report['rows'][number]; close: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close])
  return <div className="justification-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <section className="justification-dialog" role="dialog" aria-modal="true" aria-labelledby="justification-title">
      <div className="section-title"><div><p className="eyebrow">REGISTRO DE ASISTENCIA</p><h2 id="justification-title">Justificación</h2></div><button type="button" className="button secondary" onClick={close} aria-label="Cerrar justificación"><X size={18} aria-hidden="true" /></button></div>
      <p className="justification-meta">{row.full_name} · {dateLabel(row.school_date)}</p>
      <p className="justification-message">{row.justification}</p>
    </section>
  </div>
}
