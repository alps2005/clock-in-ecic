import { DatePicker } from '../../components/DatePicker'
import { historyPresets, rangeError } from '../../lib/historyDates'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Download, X } from 'lucide-react'
import type { AppContext, Report, ReportRow } from '../../types/app'
import { useRemote } from '../../app/useRemote'
import { usePageRefresh } from '../../app/usePageRefresh'
import { getReport } from '../../lib/api'
import { dateLabel, timeLabel } from '../../lib/attendance'
import { currentSchoolWeek } from '../../lib/attendanceExport'
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

export function TeacherHistory({ context }: { context: AppContext }) {
  const [from, setFrom] = useState(() => currentSchoolWeek(context.school_date).from)
  const [to, setTo] = useState(() => currentSchoolWeek(context.school_date).to)
  const [filter, setFilter] = useState({ from, to })
  const [page, setPage] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [selected, setSelected] = useState<ReportRow | null>(null)
  const filterError = rangeError(from, to)
  const presets = historyPresets(context.school_date)
  const load = useCallback(() => getReport(filter.from, filter.to, page, ''), [filter, page])
  const result = useRemote(load, 30_000)
  usePageRefresh(result.refresh, result.data, result.error)
  const data = result.data
  function thisWeek() { const range = currentSchoolWeek(context.school_date); setFrom(range.from); setTo(range.to); setFilter(range); setPage(0) }
  const openJustification = (row: ReportRow) => row.justification ? <button className="history-justification" onClick={() => setSelected(row)}>Ver justificación</button> : <span className="muted">—</span>
  return <div className="teacher-history">
    <div className="page-heading"><div><h1>Mi historial</h1><p>Tus jornadas, en un solo lugar.</p></div><button className="button secondary" onClick={() => setExportOpen(true)}><Download size={16} aria-hidden="true" />Exportar</button></div>
    {data ? <HistorySummary totals={data.totals} /> : <div className="history-summary" aria-label="Cargando estadísticas" aria-busy={result.loading}>{[1,2,3].map(i => <div key={i} className="skeleton" />)}</div>}
    <form className="ui-card history-filters" onSubmit={event => { event.preventDefault(); if (filterError) return; setFilter({ from, to }); setPage(0) }}>
      <div className="history-presets" role="group" aria-label="Rangos de fechas">{presets.map(range => <button type="button" key={range.label} aria-pressed={from === range.from && to === range.to} onClick={() => { setFrom(range.from); setTo(range.to); setFilter({ from: range.from, to: range.to }); setPage(0) }}>{range.label}</button>)}</div>
      <div className="history-date-fields"><DatePicker id="history-from" label="Desde" value={from} onChange={setFrom} invalid={!!filterError} /><DatePicker id="history-to" label="Hasta" value={to} onChange={setTo} invalid={!!filterError} /><button className="button primary" disabled={!!filterError}>Consultar</button></div>
      {filterError && <p id="history-range-error" role="alert" className="filter-error">{filterError}</p>}
    </form>
    {result.error ? <Failure error={result.error} retry={result.refresh} /> : <section className="ui-card history-report" aria-busy={result.loading}>
      <div className="history-report-heading"><div><h2>Detalle de asistencia</h2><p>{dateLabel(filter.from)} – {dateLabel(filter.to)}</p></div>{data && <span>Actualizado a las {timeLabel(data.as_of)}</span>}</div>
      {result.loading ? <div className="history-loading" role="status" aria-label="Cargando historial">{[1,2,3].map(i => <div key={i} className="skeleton" />)}</div> : data && <>
        {!data.rows.length ? <div className="empty-state"><ClipboardList size={32} aria-hidden="true" /><h3>No hay registros en este rango</h3><p>Prueba con otras fechas o vuelve a esta semana.</p><button className="button secondary" onClick={thisWeek}>Ver esta semana</button></div> : <>
          <div className="history-desktop-table" role="region" aria-label="Registros de asistencia" tabIndex={0}><table><thead><tr>{['Fecha','Entrada','Salida','Estado','Tiempo','Justificación'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={`${row.teacher_id}-${row.school_date}`}><td>{dateLabel(row.school_date)}<small>{weekday(row.school_date)}</small></td><td className="numeric">{timeLabel(row.entry_at)}</td><td className="numeric">{timeLabel(row.exit_at)}{row.exit_status === 'missing' && <small>Salida no registrada</small>}</td><td><Status row={row} /></td><td className="numeric">{duration(row)}</td><td>{openJustification(row)}</td></tr>)}</tbody></table></div>
          <div className="history-mobile-list">{data.rows.map(row => <article key={`${row.teacher_id}-${row.school_date}`}><div className="history-mobile-heading"><div><strong>{dateLabel(row.school_date)}</strong><small>{weekday(row.school_date)}</small></div><Status row={row} /></div><dl><div><dt>Entrada</dt><dd>{timeLabel(row.entry_at)}</dd></div><div><dt>Salida</dt><dd>{timeLabel(row.exit_at)}</dd>{row.exit_status === 'missing' && <small>Sin marcar</small>}</div><div><dt>Tiempo</dt><dd>{duration(row)}</dd></div></dl>{row.justification && openJustification(row)}</article>)}</div>
        </>}
        <div className="history-pager"><span>{data.totals.expected} registros, página {page + 1} de {Math.max(1, Math.ceil(data.totals.expected / data.page_size))}</span><div><button className="button secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><button className="button secondary" disabled={(page + 1) * data.page_size >= data.totals.expected} onClick={() => setPage(page + 1)}>Siguiente</button></div></div>
      </>}
    </section>}
    {selected && <JustificationDialog row={selected} close={() => setSelected(null)} />}
    {exportOpen && <ExportModal admin={false} close={() => setExportOpen(false)} />}
  </div>
}

function HistorySummary({ totals }: { totals: Report['totals'] }) {
  return <div className="history-summary">{[{ title: 'Entradas', values: [totals.entry_on_time, totals.entry_late, totals.missing_entry] }, { title: 'Salidas', values: [totals.exit_on_time, totals.exit_late, totals.missing_exit] }].map(({ title, values }) => {
    const sum = values.reduce((a,b) => a + b, 0)
    return <section className="ui-card" key={title}><h2>{title}</h2><div className="summary-stats">{values.map((count,i) => <div key={i}><span><i className={`stat-dot stat-${i}`} />{['A tiempo','Con atraso','Sin marcar'][i]}</span><strong className="numeric">{count}</strong></div>)}</div><div className="summary-bar" role="img" aria-label={`${values[0]} a tiempo, ${values[1]} con atraso, ${values[2]} sin marcar`}>{values.map((count,i) => count > 0 && <span className={`stat-${i}`} key={i} style={{ width: `${count / sum * 100}%` }} />)}</div></section>
  })}<section className="ui-card"><h2>Faltas</h2><strong className="absence-count numeric">{totals.absent}</strong><p className="muted">Registros no realizados</p></section></div>
}

function JustificationDialog({ row, close }: { row: ReportRow; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element = dialog.current!; const trigger = document.activeElement as HTMLElement | null; element.showModal(); return () => { element.close(); trigger?.focus() } }, [])
  return <dialog ref={dialog} className="history-dialog" aria-labelledby="justification-title" aria-describedby="justification-description" onCancel={event => { event.preventDefault(); close() }}>
    <div className="dialog-heading"><h2 id="justification-title">Justificación</h2><button className="icon-button" aria-label="Cerrar justificación" onClick={close} autoFocus><X size={18} /></button></div>
    <p id="justification-description" className="muted">Atraso del {weekday(row.school_date)} {new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${row.school_date}T12:00Z`))}</p>
    <dl className="justification-details"><div><dt>Entrada</dt><dd>{timeLabel(row.entry_at)}</dd></div><div><dt>Salida</dt><dd>{timeLabel(row.exit_at)}</dd></div><div><dt>Tiempo</dt><dd>{duration(row)}</dd></div><div><dt>Estado</dt><dd><Status row={row} /></dd></div></dl>
    <p className="justification-body">{row.justification}</p>
  </dialog>
}
