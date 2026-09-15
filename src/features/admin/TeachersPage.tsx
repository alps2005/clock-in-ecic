import { useCallback, useState } from 'react'
import { BookOpen, LockKeyhole, Pencil } from 'lucide-react'
import { Link } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { getTeachers } from '../../lib/api'
import { dateLabel } from '../../lib/attendance'
import { Failure, Loading, Pager } from '../../components/Feedback'
import type { TeacherAccount } from '../../types/app'
import { TeacherEditor } from './TeacherEditor'
import type { Editor } from './TeacherEditor'

export function TeachersPage({ schoolDate }: { schoolDate: string }) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [message, setMessage] = useState('')
  const load = useCallback(() => getTeachers(page, filter), [page, filter])
  const result = useRemote(load, 30_000)
  function open(action: Editor['action'], teacher?: TeacherAccount) { setMessage(''); setEditor({ action, teacher }) }
  return <>
    <div className="page-heading teachers-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Docentes<span className="accent">.</span></h1><p>Cuentas, acceso e historial de cada docente.</p></div><button className="button primary" disabled={Boolean(editor)} onClick={() => open('create')}>Crear docente</button></div>
    {message && <p className="feedback success" role="status">{message}</p>}
    {editor && <TeacherEditor key={`${editor.action}-${editor.teacher?.id ?? 'new'}`} editor={editor} schoolDate={schoolDate} close={() => setEditor(null)} saved={() => { setEditor(null); setMessage('Cambio guardado.'); result.refresh() }} />}
    <form className="filter-bar teachers-search" onSubmit={event => { event.preventDefault(); setFilter(search.trim()); setPage(0) }}><div><label htmlFor="teacher-search">Buscar por nombre o C.I.</label><input id="teacher-search" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} /></div><button className="button secondary">Buscar</button></form>
    {result.loading ? <Loading /> : result.error || !result.data ? <Failure error={result.error} retry={result.refresh} /> : <section className="report-card"><div className="section-title"><h2>Cuentas de docentes</h2><span className="muted">{result.data.total} docentes</span></div>{result.data.rows.length === 0 ? <div className="empty-state"><h3>No hay docentes para esta búsqueda</h3></div> : <div className="table-scroll" role="region" aria-label="Cuentas de docentes" tabIndex={0}><table><thead><tr><th>Docente / C.I.</th><th>Estado</th><th>Vinculación</th><th>Acciones</th></tr></thead><tbody>{result.data.rows.map(teacher => <tr key={teacher.id}><td><strong>{teacher.full_name}</strong><small>{teacher.cedula}</small></td><td><span className={`badge ${teacher.active ? 'green' : 'amber'}`}>{teacher.active ? 'Activo' : 'Bloqueado'}</span></td><td>{teacher.employed_from ? dateLabel(teacher.employed_from) : 'Pendiente'}<small>{teacher.employed_until ? `Hasta ${dateLabel(teacher.employed_until)}` : 'Sin fecha de fin'}</small></td><td><div className="teacher-row-actions"><Link className="teacher-icon history-icon" to={`/admin/docentes/${teacher.id}`} aria-label={`Historial de ${teacher.full_name}`} title="Historial"><BookOpen size={20} aria-hidden="true" /></Link><Link className="teacher-icon edit-icon" to={`/admin/docentes/${teacher.id}/editar`} aria-label={`Editar a ${teacher.full_name}`} title="Editar"><Pencil size={20} aria-hidden="true" /></Link><button className="teacher-icon lock-icon" disabled={Boolean(editor) || !teacher.active} onClick={() => open('disable', teacher)} aria-label={`Bloquear acceso de ${teacher.full_name}`} title={teacher.active ? 'Bloquear acceso' : 'Acceso bloqueado'}><LockKeyhole size={20} aria-hidden="true" /></button></div></td></tr>)}</tbody></table></div>}<Pager page={page} total={result.data.total} onPage={setPage} /></section>}
  </>
}

