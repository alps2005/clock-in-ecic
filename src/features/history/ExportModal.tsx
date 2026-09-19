import { notify } from '../../app/usePageRefresh'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, X } from 'lucide-react'
import { useRemote } from '../../app/useRemote'
import { Failure, Loading } from '../../components/Feedback'
import { getContext, getReport } from '../../lib/api'
import { dateLabel } from '../../lib/attendance'
import { downloadBlob, excelBlob, exportTable, loadWeeklyRows, tableCsv } from '../../lib/attendanceExport'

export function ExportModal({ admin, close }: { admin: boolean; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const load = useCallback(async () => {
    const context = await getContext()
    return loadWeeklyRows(context.school_date, (from, to, page) => getReport(from, to, page, ''))
  }, [])
  const result = useRemote(load)
  const table = exportTable(result.data?.rows ?? [], admin)

  useEffect(() => {
    const element = dialog.current!
    const previousFocus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      element.close()
      document.body.style.overflow = overflow
      previousFocus?.focus()
    }
  }, [])

  async function download(format: 'csv' | 'xlsx') {
    if (!result.data || downloading) return
    setDownloading(true)
    setDownloadError('')
    if (!admin) notify('Exportando tu historial…')
    try {
      const blob = format === 'csv' ? new Blob([tableCsv(table)], { type: 'text/csv;charset=utf-8' }) : await excelBlob(table)
      downloadBlob(blob, `asistencia-${result.data.from}-${result.data.to}.${format}`)
      if (!admin) notify('Historial exportado')
    } catch {
      if (!admin) notify('No se pudo exportar el historial')
      setDownloadError('No se pudo descargar el archivo. Inténtalo nuevamente.')
    } finally { setDownloading(false) }
  }

  return <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title" aria-describedby="export-description" onCancel={event => { event.preventDefault(); close() }} onClick={event => {
    if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
    }
  }}>
    <div className="export-heading">
      <div><p className="eyebrow">{admin ? 'EXPORTAR ASISTENCIA' : 'Exportar asistencia'}</p><h2 id="export-title">Asistencia de esta semana</h2></div>
      <button type="button" className="ecic-ghost-button" aria-label="Cerrar exportación" onClick={close} autoFocus><X size={18} aria-hidden="true" /></button>
    </div>
    <p id="export-description" className="export-description">De lunes a viernes · {admin ? 'Todos los docentes' : 'Mis registros'} · Hora de Ecuador (UTC-5).</p>
    {result.loading ? <Loading /> : result.error ? <Failure error={result.error} retry={result.refresh} /> : result.data && <>
      <div className="export-summary"><span className="ecic-status-pill">{dateLabel(result.data.from)} — {dateLabel(result.data.to)}</span><span>{table.values.length} {table.values.length === 1 ? 'registro' : 'registros'}</span></div>
      <p className="export-note">Se incluyen las jornadas hasta hoy dentro de la semana actual.</p>
      {table.values.length === 0 ? <div className="empty-state"><FileSpreadsheet size={32} aria-hidden="true" /><h3>No hay registros esta semana</h3><p>Los registros de asistencia aparecerán aquí.</p></div> : <div className="table-scroll export-table-scroll" role="region" aria-label="Vista previa de asistencia semanal" tabIndex={0}>
        <table className="ecic-table export-table"><thead><tr>{table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{table.values.map((row, index) => <tr key={`${result.data!.rows[index].teacher_id}-${result.data!.rows[index].school_date}`}>{row.map((value, column) => <td key={table.headers[column]}>{value}</td>)}</tr>)}</tbody></table>
      </div>}
    </>}
    {downloadError && <p className="feedback error" role="alert">{downloadError}</p>}
    <div className="export-actions">
      <span role="status">{downloading ? 'Preparando descarga…' : 'Descarga la tabla de la vista previa.'}</span>
      <button type="button" className="button secondary" disabled={result.loading || !!result.error || !table.values.length || downloading} onClick={() => void download('csv')}><Download size={16} aria-hidden="true" />Descargar CSV</button>
      <button type="button" className="button primary" disabled={result.loading || !!result.error || !table.values.length || downloading} onClick={() => void download('xlsx')}><FileSpreadsheet size={16} aria-hidden="true" />Descargar Excel</button>
    </div>
  </dialog>
}
