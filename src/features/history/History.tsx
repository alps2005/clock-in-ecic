import { useAnimatedDismiss } from '../../components/useAnimatedDismiss'
import { usePanelReady } from '../../app/usePanelReady'
import { trapDialogFocus } from '../../components/dialogFocus'
import { DatePicker } from '../../components/DatePicker'
import { historyPresets, rangeError } from '../../lib/historyDates'
import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Download, X } from 'lucide-react'
import type { AppContext, Report, ReportRow } from '../../types/app'
import { useRemote } from '../../app/useRemote'
import { usePageRefresh } from '../../app/usePageRefresh'
import { useHistoryRange } from '../../app/useHistoryRange'
import { Link, useSearchParams } from 'react-router'
import { getReport, getTeacherReport } from '../../lib/api'
import { dateLabel, timeLabel } from '../../lib/attendance'
import { currentSchoolWeek } from '../../lib/attendanceExport'
import type { ReportExportFilter } from '../../lib/attendanceExport'
import { ExportModal } from './ExportModal'
import { Failure } from '../../components/Feedback'

const statuses = {
  on_time: { label: 'A tiempo', tone: 'success' }, late: { label: 'Atraso justificado', tone: 'warning' },
  late_pending: { label: 'Atraso sin justificación', tone: 'warning' }, missing_entry: { label: 'Sin entrada', tone: 'danger' },
  absent: { label: 'Sin asistencia', tone: 'danger' }, pending: { label: 'Pendiente', tone: 'neutral' },
}
const duration = (row: ReportRow) => row.worked_minutes === null ? '—' : `${Math.floor(row.worked_minutes / 60)} h ${row.worked_minutes % 60} min`
const weekday = (date: string) => new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${date}T12:00Z`))
function Status({ row }: { row: ReportRow }) { const status = statuses[row.entry_status]; return <span className={`ui-badge tone-${status.tone}`}>{status.label}</span> }

export function History({ context, admin = false, teacherId }: { context: AppContext; admin?: boolean; teacherId?: string }) {
  const [params] = useSearchParams()
  const [search, setSearch] = useState(() => admin && !teacherId ? (params.get('docente') ?? '').slice(0, 120) : '')
  const [appliedSearch, setAppliedSearch] = useState(search)
  const { from, to, setFrom, setTo, filter, apply, page, setPage, presets: allPresets } = useHistoryRange(context.school_date, admin ? 'Hoy' : 'Esta semana')
  const [exportFilter, setExportFilter] = useState<ReportExportFilter | null>(null)
  const [selected, setSelected] = useState<ReportRow | null>(null)
  const filterError = rangeError(from, to)
  const presets = admin ? allPresets : historyPresets(context.school_date)
  const load = useCallback(() => teacherId ? getTeacherReport(teacherId, filter.from, filter.to, page) : getReport(filter.from, filter.to, page, appliedSearch), [filter, page, teacherId, appliedSearch])
  const result = useRemote(load, 30_000)
  usePanelReady(!result.loading)
  usePageRefresh(result.refresh, result.data, result.error)
  const data = result.data
  function thisWeek() { apply(currentSchoolWeek(context.school_date)) }
  const openJustification = (row: ReportRow) => row.justification ? <button className="history-justification" onClick={event => { event.currentTarget.focus(); setSelected(row) }}>Ver justificación</button> : <span className="muted">—</span>
  return <div className="teacher-history">
    <div className="page-heading"><div>{teacherId ? <h2>Historial de asistencia</h2> : <h1>{admin ? 'Asistencia docente' : 'Mi historial'}</h1>}<p>{teacherId ? 'Consulta las jornadas de este docente por fecha.' : admin ? 'Consulta las jornadas y los registros de tu equipo.' : 'Tus jornadas, en un solo lugar.'}</p></div></div>
    {data ? <HistorySummary totals={data.totals} /> : !result.error && <div className="history-summary" aria-label="Cargando estadísticas" aria-busy={result.loading}>{[1,2,3].map(i => <div key={i} className="skeleton" />)}</div>}
    <form className="ui-card history-filters" onSubmit={event => { event.preventDefault(); if (filterError) return; setAppliedSearch(search.trim()); apply() }}>
      <div className="history-filter-actions">
        <div className="history-presets" role="group" aria-label="Rangos de fechas">{presets.map(range => <button type="button" key={range.label} aria-pressed={from === range.from && to === range.to} onClick={() => { setAppliedSearch(search.trim()); apply(range) }}>{range.label}</button>)}</div>
        <button type="button" className="button secondary" disabled={result.loading || !!result.error || !data} onClick={event => { event.currentTarget.focus(); setExportFilter({ ...filter, search: appliedSearch, teacherId }) }}><Download size={16} aria-hidden="true" />Exportar</button>
      </div>
      <div className="history-date-fields"><DatePicker id="history-from" label="Desde" value={from} onChange={setFrom} invalid={!!filterError} /><DatePicker id="history-to" label="Hasta" value={to} onChange={setTo} invalid={!!filterError} />{admin && !teacherId && <div className="admin-report-search"><label htmlFor="search">Docente</label><input id="search" placeholder="Nombre o cédula" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} /></div>}<button className="button primary" disabled={!!filterError}>Consultar</button></div>
      {filterError && <p id="history-range-error" role="alert" className="filter-error">{filterError}</p>}
    </form>
    {result.error ? <Failure error={result.error} retry={result.refresh} /> : <section className="ui-card history-report" aria-busy={result.loading}>
      <div className="history-report-heading"><div><h2>Detalle de asistencia</h2><p>{dateLabel(filter.from)} – {dateLabel(filter.to)}</p></div>{data && <span>Actualizado a las {timeLabel(data.as_of)}</span>}</div>
      {result.loading ? <div className="history-loading" role="status" aria-label="Cargando historial">{[1,2,3].map(i => <div key={i} className="skeleton" />)}</div> : data && <>
        {!data.rows.length ? <div className="empty-state"><ClipboardList size={32} aria-hidden="true" /><h3>No hay registros en este rango</h3><p>Prueba con otras fechas o vuelve a esta semana.</p><button className="button secondary" onClick={thisWeek}>Ver esta semana</button></div> : <>
          <div className="history-desktop-table" role="region" aria-label="Registros de asistencia" tabIndex={0}><table><thead><tr>{[...(admin && !teacherId ? ['Docente'] : []),'Fecha','Entrada','Salida','Estado','Tiempo','Justificación'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={`${row.teacher_id}-${row.school_date}`}>{admin && !teacherId && <td><Link className="report-teacher-link" to={`/admin/docentes/${row.teacher_id}`}>{row.full_name}</Link><small>{row.cedula}</small></td>}<td>{dateLabel(row.school_date)}<small>{weekday(row.school_date)}</small></td><td className="numeric">{timeLabel(row.entry_at)}</td><td className="numeric">{timeLabel(row.exit_at)}{row.exit_status === 'missing' && <small>Salida no registrada</small>}</td><td><Status row={row} /></td><td className="numeric">{duration(row)}</td><td>{openJustification(row)}</td></tr>)}</tbody></table></div>
          <div className="history-mobile-list">{data.rows.map(row => <article key={`${row.teacher_id}-${row.school_date}`}><div className="history-mobile-heading"><div>{admin && !teacherId && <><Link className="report-teacher-link" to={`/admin/docentes/${row.teacher_id}`}>{row.full_name}</Link><small>C.I. {row.cedula}</small></>}<strong>{dateLabel(row.school_date)}</strong><small>{weekday(row.school_date)}</small></div><Status row={row} /></div><dl><div><dt>Entrada</dt><dd>{timeLabel(row.entry_at)}</dd></div><div><dt>Salida</dt><dd>{timeLabel(row.exit_at)}{row.exit_status === 'missing' && <small>Salida no registrada</small>}</dd></div><div><dt>Tiempo</dt><dd>{duration(row)}</dd></div></dl>{row.justification && openJustification(row)}</article>)}</div>
        </>}
        <div className="history-pager"><span>{data.totals.expected} registros, página {page + 1} de {Math.max(1, Math.ceil(data.totals.expected / data.page_size))}</span><div><button className="button secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><button className="button secondary" disabled={(page + 1) * data.page_size >= data.totals.expected} onClick={() => setPage(page + 1)}>Siguiente</button></div></div>
      </>}
    </section>}
    {selected && <JustificationDialog row={selected} close={() => setSelected(null)} />}
    {exportFilter && <ExportModal admin={admin} filter={exportFilter} close={() => setExportFilter(null)} />}
  </div>
}

function HistorySummary({ totals }: { totals: Report['totals'] }) {
  return <div className="history-summary">{[{ title: 'Entradas', values: [totals.entry_on_time, totals.entry_late, totals.missing_entry] }, { title: 'Salidas', values: [totals.exit_on_time, totals.exit_late, totals.missing_exit] }].map(({ title, values }) => {
    const sum = values.reduce((a,b) => a + b, 0)
    return <section className="ui-card" aria-label={title} key={title}><h2>{title}</h2><div className="summary-stats">{values.map((count,i) => <div key={i}><span><i className={`stat-dot stat-${i}`} />{['A tiempo','Con atraso','Sin marcar'][i]}</span><strong className="numeric">{count}</strong></div>)}</div><div className="summary-bar" role="img" aria-label={`${values[0]} a tiempo, ${values[1]} con atraso, ${values[2]} sin marcar`}>{values.map((count,i) => count > 0 && <span className={`stat-${i}`} key={i} style={{ width: `${count / sum * 100}%` }} />)}</div></section>
  })}<section className="ui-card" aria-label="Faltas"><h2>Faltas</h2><strong className="absence-count numeric">{totals.absent}</strong><p className="muted">Registros no realizados</p></section></div>
}

function JustificationDialog({ row, close }: { row: ReportRow; close: () => void }) {
  const { ref: dialog, dismiss } = useAnimatedDismiss<HTMLDialogElement>(close)
  useEffect(() => { const element = dialog.current!; const trigger = document.activeElement as HTMLElement | null; element.showModal(); return () => { element.close(); trigger?.focus() } }, [dialog])
  return <dialog ref={dialog} onKeyDown={trapDialogFocus} className="history-dialog" aria-labelledby="justification-title" aria-describedby="justification-description" onCancel={event => { event.preventDefault(); dismiss() }}>
    <div className="dialog-heading"><h2 id="justification-title">Justificación</h2><button className="icon-button" aria-label="Cerrar justificación" onClick={dismiss} autoFocus><X size={18} /></button></div>
    <p id="justification-description" className="muted">{row.full_name} · Atraso del {weekday(row.school_date)} {new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${row.school_date}T12:00Z`))}</p>
    <dl className="justification-details"><div><dt>Entrada</dt><dd>{timeLabel(row.entry_at)}</dd></div><div><dt>Salida</dt><dd>{timeLabel(row.exit_at)}</dd></div><div><dt>Tiempo</dt><dd>{duration(row)}</dd></div><div><dt>Estado</dt><dd><Status row={row} /></dd></div></dl>
    <p className="justification-body">{row.justification}</p>
  </dialog>
}
