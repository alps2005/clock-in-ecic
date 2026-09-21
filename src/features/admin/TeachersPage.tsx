import { roleLabels } from '../../lib/roles'
import { usePanelReady } from '../../app/usePanelReady'
import { useCallback, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Link } from 'react-router'
import { usePageRefresh } from '../../app/usePageRefresh'
import { useRemote } from '../../app/useRemote'
import { getTeachers } from '../../lib/api'
import { dateLabel } from '../../lib/attendance'
import { Failure, Pager } from '../../components/Feedback'
import { PanelPlaceholder } from '../../components/PanelPlaceholder'
import type { TeacherAccount } from '../../types/app'
import { TeacherEditor } from './TeacherEditor'

export function TeachersPage({ schoolDate }: { schoolDate: string }) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const load = useCallback(() => getTeachers(page, filter), [page, filter])
  const result = useRemote(load, 30_000)
  usePanelReady(!result.loading)
  usePageRefresh(result.refresh, result.data, result.error)
  return <>
    <div className="page-heading teachers-heading"><div><h1>Docentes</h1><p>Cuentas, acceso e historial de cada docente.</p></div><button className="button primary" disabled={creating} onClick={() => { setMessage(''); setCreating(true) }}>Crear docente</button></div>
    {message && <p className="feedback success" role="status">{message}</p>}
    {creating && <TeacherEditor editor={{ action: 'create' }} schoolDate={schoolDate} close={() => setCreating(false)} saved={() => { setCreating(false); setMessage('Cambio guardado.'); result.refresh() }} />}
    <form className="filter-bar teachers-search" onSubmit={event => { event.preventDefault(); setFilter(search.trim()); setPage(0) }}><div><label htmlFor="teacher-search">Buscar por nombre o C.I.</label><input id="teacher-search" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} /></div><button className="button secondary">Buscar</button></form>
    {result.loading ? <PanelPlaceholder label="Cargando docentes" variant="table" /> : result.error || !result.data ? <Failure error={result.error} retry={result.refresh} /> : <section className="report-card"><div className="section-title"><h2>Cuentas de docentes</h2><span className="muted">{result.data.total} docentes</span></div>{result.data.rows.length === 0 ? <div className="empty-state"><h3>No hay docentes para esta búsqueda</h3></div> : <><div className="table-scroll directory-table" role="region" aria-label="Cuentas de docentes" tabIndex={0}><table><thead><tr><th>Docente / C.I.</th><th>Estado</th><th>Vinculación</th><th>Acciones</th></tr></thead><tbody>{result.data.rows.map(teacher => <tr key={teacher.id} className="directory-entry"><td><strong><TeacherProfileLink teacher={teacher} /></strong><small>{teacher.cedula} · {roleLabels[teacher.role]}</small></td><td><span className={`badge ${teacher.active ? 'green' : 'amber'}`}>{teacher.active ? 'Activo' : 'Bloqueado'}</span></td><td>{teacher.employed_from ? dateLabel(teacher.employed_from) : 'Pendiente'}<small>{teacher.employed_until ? `Hasta ${dateLabel(teacher.employed_until)}` : 'Sin fecha de fin'}</small></td><td><TeacherActions teacher={teacher} /></td></tr>)}</tbody></table></div><div className="directory-mobile-list">{result.data.rows.map(teacher => <article key={teacher.id} className="directory-entry" aria-label={teacher.full_name}>
      <div className="directory-card-heading"><div><h3><TeacherProfileLink teacher={teacher} /></h3><p className="muted">C.I. {teacher.cedula}</p></div><span className={`badge ${teacher.active ? 'green' : 'amber'}`}>{teacher.active ? 'Activo' : 'Bloqueado'}</span></div>
      <p className="directory-dates">Vinculación: {teacher.employed_from ? dateLabel(teacher.employed_from) : 'Pendiente'}<br />{teacher.employed_until ? `Hasta ${dateLabel(teacher.employed_until)}` : 'Sin fecha de fin'}</p>
      <TeacherActions teacher={teacher} />
    </article>)}</div></>}<Pager page={page} total={result.data.total} onPage={setPage} /></section>}
  </>
}


function TeacherProfileLink({ teacher }: { teacher: TeacherAccount }) {
  return <Link className="directory-profile-link" to={`/admin/docentes/${teacher.id}`} aria-label={`Historial de ${teacher.full_name}`}>{teacher.full_name}</Link>
}

function TeacherActions({ teacher }: { teacher: TeacherAccount }) {
  return <div className="teacher-row-actions"><Link className="teacher-icon edit-icon" to={`/admin/docentes/${teacher.id}`} aria-label={`Editar a ${teacher.full_name}`} title="Editar"><Pencil size={20} aria-hidden="true" /></Link></div>
}
