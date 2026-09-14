import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { getTeachers, manageTeacher } from '../../lib/api'
import { dateLabel, errorMessage } from '../../lib/attendance'
import { Failure, Loading, Pager } from '../../components/Feedback'
import type { TeacherAccount, TeacherMutation } from '../../types/app'

type Editor = { action: TeacherMutation['action']; teacher?: TeacherAccount }
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
    <form className="filter-bar" onSubmit={event => { event.preventDefault(); setFilter(search.trim()); setPage(0) }}><div><label htmlFor="teacher-search">Buscar por nombre o C.I.</label><input id="teacher-search" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} /></div><button className="button secondary">Buscar</button></form>
    {result.loading ? <Loading /> : result.error || !result.data ? <Failure error={result.error} retry={result.refresh} /> : <section className="report-card"><div className="section-title"><h2>Cuentas de docentes</h2><span className="muted">{result.data.total} docentes</span></div>{result.data.rows.length === 0 ? <div className="empty-state"><h3>No hay docentes para esta búsqueda</h3></div> : <div className="table-scroll" role="region" aria-label="Cuentas de docentes" tabIndex={0}><table><thead><tr><th>Docente / C.I.</th><th>Estado</th><th>Vinculación</th><th>Acciones</th></tr></thead><tbody>{result.data.rows.map(teacher => <tr key={teacher.id}><td><strong>{teacher.full_name}</strong><small>{teacher.cedula}</small></td><td><span className={`badge ${teacher.active ? 'green' : 'amber'}`}>{teacher.active ? 'Activo' : 'Inactivo'}</span></td><td>{teacher.employed_from ? dateLabel(teacher.employed_from) : 'Pendiente'}<small>{teacher.employed_until ? `Hasta ${dateLabel(teacher.employed_until)}` : 'Sin fecha de fin'}</small></td><td><div className="teacher-actions"><Link className="button secondary" to={`/admin?docente=${teacher.cedula}`}>Historial</Link><button className="button secondary" disabled={Boolean(editor)} onClick={() => open('update', teacher)}>Editar</button><button className="button secondary" disabled={Boolean(editor)} onClick={() => open('reset-password', teacher)}>Restablecer contraseña</button><button className="button secondary danger-text" disabled={Boolean(editor) || !teacher.active} onClick={() => open('disable', teacher)}>Eliminar acceso</button></div></td></tr>)}</tbody></table></div>}<Pager page={page} total={result.data.total} onPage={setPage} /></section>}
  </>
}

function TeacherEditor({ editor, schoolDate, close, saved }: { editor: Editor; schoolDate: string; close: () => void; saved: () => void }) {
  const { action, teacher } = editor
  const details = action === 'create' || action === 'update'
  const passwordAction = action === 'create' || action === 'reset-password'
  const [name, setName] = useState(teacher?.full_name ?? '')
  const [cedula, setCedula] = useState(teacher?.cedula ?? '')
  const [from, setFrom] = useState(teacher?.employed_from ?? schoolDate)
  const [until, setUntil] = useState(teacher?.employed_until ?? (action === 'disable' ? schoolDate : ''))
  const [active, setActive] = useState(teacher?.active ?? true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const title = { create: 'Crear docente', update: 'Editar docente', 'reset-password': 'Restablecer contraseña', disable: 'Eliminar acceso del docente' }[action]
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('')
    const input: TeacherMutation = { action, id: teacher?.id }
    if (details) Object.assign(input, { full_name: name.trim(), cedula, employed_from: from, employed_until: until || null, ...(action === 'update' ? { active } : {}) })
    if (passwordAction) input.password = password
    if (action === 'disable') input.employed_until = until
    try { await manageTeacher(input); setPassword(''); saved() }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setPending(false) }
  }
  return <section className="attendance-card teacher-editor" aria-labelledby="teacher-editor-title"><h2 id="teacher-editor-title">{title}</h2>{teacher && <p>{teacher.full_name} · C.I. {teacher.cedula}</p>}
    {action === 'disable' && <p>Se bloqueará el inicio de sesión y finalizará su vinculación. Su historial de asistencia se conservará.</p>}
    <form onSubmit={event => void submit(event)}><fieldset disabled={pending}><div className="teacher-fields">
      {details && <><div><label htmlFor="teacher-name">Nombre completo</label><input id="teacher-name" required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} /></div><div><label htmlFor="teacher-cedula">C.I.</label><input id="teacher-cedula" required pattern="[0-9]{10}" inputMode="numeric" maxLength={10} value={cedula} onChange={event => setCedula(event.target.value.replace(/\D/g, ''))} /></div><div><label htmlFor="teacher-from">Fecha de vinculación</label><input id="teacher-from" type="date" required value={from} onChange={event => setFrom(event.target.value)} /></div></>}
      {(action === 'update' || action === 'disable') && <div><label htmlFor="teacher-until">Último día de vinculación</label><input id="teacher-until" type="date" required={action === 'disable'} min={from} value={until} onChange={event => setUntil(event.target.value)} /></div>}
      {action === 'update' && <label className="teacher-checkbox"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Permitir acceso</label>}
      {passwordAction && <div><label htmlFor="teacher-password">Nueva contraseña</label><div className="password-field"><input id="teacher-password" type={showPassword ? 'text' : 'password'} required minLength={12} maxLength={256} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div><p className="muted">Mínimo 12 caracteres. Entrega la contraseña de forma privada; no podrás consultarla después.</p></div>}
    </div>{error && <p className="feedback error" role="alert">{error}</p>}<div className="teacher-actions"><button className="button primary" type="submit">{pending ? 'Guardando…' : action === 'disable' ? 'Confirmar eliminación de acceso' : 'Guardar'}</button><button type="button" className="button secondary" onClick={close}>Cancelar</button></div></fieldset></form></section>
}
