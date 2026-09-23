import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, CheckCircle2, ChevronRight, LayoutGrid, List, RefreshCw, X } from 'lucide-react'
import { usePanelReady } from '../../app/usePanelReady'
import { getNotifications, readNotification } from '../../lib/api'
import { usePageRefresh } from '../../app/usePageRefresh'
import { useRemote } from '../../app/useRemote'
import { dateLabel, schoolDate, timeLabel } from '../../lib/attendance'
import { Failure, Pager } from '../../components/Feedback'
import { PanelPlaceholder } from '../../components/PanelPlaceholder'
import { useAnimatedDismiss } from '../../components/useAnimatedDismiss'
import { trapDialogFocus } from '../../components/dialogFocus'
import type { AdminNotification } from '../../types/app'

const title = (row: AdminNotification) => row.kind === 'entry' ? 'Entrada fuera de horario' : 'Salida no registrada'

export function NotificationsPage({ onRead }: { onRead: () => void }) {
  const [page, setPage] = useState(0)
  const [view, setView] = useState<'table' | 'gallery'>('table')
  const [selected, setSelected] = useState<AdminNotification | null>(null)
  const load = useCallback(async () => {
    const data = await getNotifications(page)
    if (page > 0 && page * 25 >= data.total) setPage(Math.max(0, Math.ceil(data.total / 25) - 1))
    return data
  }, [page])
  const result = useRemote(load, 30_000)
  usePanelReady(!result.loading)
  usePageRefresh(result.refresh, result.data, result.error)

  return <>
    <div className="page-heading"><div><h1>Notificaciones</h1><p>Entradas fuera de horario y salidas sin registrar.</p></div><button className="button secondary" onClick={result.refresh}><RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" />Actualizar</button></div>
    {result.loading ? <PanelPlaceholder label="Cargando notificaciones" variant="list" /> : result.error || !result.data ? <Failure error={result.error} retry={result.refresh} /> : <section className="report-card notification-panel" aria-label="Notificaciones de asistencia">
      <div className="notification-toolbar"><div className="notification-views" role="group" aria-label="Vista de notificaciones">
        <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}><List size={16} aria-hidden="true" />Tabla</button>
        <button type="button" aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}><LayoutGrid size={16} aria-hidden="true" />Galería</button>
      </div></div>
      {result.data.rows.length === 0 ? <div className="empty-state"><CheckCircle2 size={35} strokeWidth={1.7} aria-hidden="true" /><h3>Todo al día</h3><p>No hay notificaciones pendientes.</p></div> : <ul className={`notification-items notification-${view}`}>
        {result.data.rows.map(row => <li key={row.id}>
          <button type="button" className={`notification-item${row.read_at ? ' is-read' : ''}`} aria-haspopup="dialog" onClick={event => { event.currentTarget.focus(); setSelected(row) }}>
            <span className="notification-icon" aria-hidden="true"><AlertCircle size={20} strokeWidth={1.8} /></span>
            <span className="notification-summary"><strong>{row.full_name}</strong><span>{title(row)}</span><time dateTime={row.school_date}>{dateLabel(row.school_date)}</time></span>
            <span className="notification-read-state">{row.read_at ? <><Check size={14} aria-hidden="true" />Leído</> : <><span className="notification-unread-dot" aria-hidden="true" />Sin leer</>}</span>
            <ChevronRight className="notification-chevron" size={16} aria-hidden="true" />
          </button>
        </li>)}
      </ul>}
      <Pager page={page} total={result.data.total} onPage={setPage} />
    </section>}
    {selected && <NotificationModal row={selected} close={() => { setSelected(null); result.refresh(); onRead() }} />}
  </>
}

function NotificationModal({ row, close }: { row: AdminNotification; close: () => void }) {
  const { ref: dialog, dismiss } = useAnimatedDismiss<HTMLDialogElement>(close)
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current!
    const trigger = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; trigger?.focus() }
  }, [dialog])

  async function requestClose() {
    if (pending.current) return
    pending.current = true
    setError('')
    if (row.read_at) { dismiss(); return }
    setSaving(true)
    try { await readNotification(row.id); dismiss() }
    catch { pending.current = false; setSaving(false); setError('No se pudo marcar como leído. Intenta cerrar de nuevo para guardar la lectura.') }
  }

  return <dialog ref={dialog} className="history-dialog notification-dialog" aria-labelledby="notification-title" aria-describedby="notification-message" onKeyDown={trapDialogFocus} onCancel={event => { event.preventDefault(); void requestClose() }} onClick={event => {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) void requestClose()
  }}>
    <div className="dialog-heading"><h2 id="notification-title">{title(row)}</h2><button type="button" className="icon-button" aria-label="Cerrar notificación" disabled={saving} onClick={() => void requestClose()} autoFocus><X size={18} aria-hidden="true" /></button></div>
    <p className="notification-person">{row.full_name}</p>
    <dl className="notification-details">
      <div><dt>C.I.</dt><dd>{row.cedula}</dd></div>
      <div><dt>Fecha</dt><dd>{dateLabel(row.school_date)}</dd></div>
      <div><dt>Entrada registrada</dt><dd>{row.entry_at ? timeLabel(row.entry_at) : 'Sin registro'}</dd></div>
      <div><dt>Cierre de {row.kind === 'entry' ? 'entrada' : 'salida'}</dt><dd>{(row.kind === 'entry' ? row.entry_closes : row.exit_closes).slice(0, 5)}</dd></div>
    </dl>
    <p id="notification-message">{row.kind === 'entry' ? 'No se registró una entrada dentro del horario vigente para ese día.' : `No se registró una salida. El horario de salida terminó a las ${row.exit_closes.slice(0, 5)}.`}</p>
    <p className="notification-retention">{row.read_at && row.expires_at ? `Leído · Se eliminará el ${dateLabel(schoolDate(row.expires_at))}.` : 'Al cerrar, se marcará como leído y se eliminará después de 15 días.'}</p>
    {error && <p className="feedback error" role="alert">{error}</p>}
    <div className="notification-dialog-actions"><span role="status">{saving ? 'Guardando lectura…' : ''}</span><button type="button" className="button primary" disabled={saving} onClick={() => void requestClose()}>Cerrar</button></div>
  </dialog>
}
