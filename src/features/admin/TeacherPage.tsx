import { usePanelReady } from '../../app/usePanelReady'
import { useCallback, useState } from 'react'
import { ArrowLeft, BookOpen, Pencil } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { useRemote } from '../../app/useRemote'
import { usePageRefresh } from '../../app/usePageRefresh'
import { Failure } from '../../components/Feedback'
import { PanelPlaceholder } from '../../components/PanelPlaceholder'
import { getTeacher } from '../../lib/api'
import type { AppContext } from '../../types/app'
import { History } from '../history/History'
import { TeacherEditor } from './TeacherEditor'
import type { Editor } from './TeacherEditor'

export function TeacherPage({ context, editing = false }: { context: AppContext; editing?: boolean }) {
  const { teacherId = '' } = useParams()
  return <TeacherDetails key={`${teacherId}-${editing}`} teacherId={teacherId} context={context} editing={editing} />
}

function TeacherDetails({ teacherId, context, editing }: { teacherId: string; context: AppContext; editing: boolean }) {
  const load = useCallback(() => getTeacher(teacherId), [teacherId])
  const result = useRemote(load)
  usePanelReady(!result.loading && !result.data)
  usePageRefresh(result.refresh, result.data, result.error, !result.data)
  const navigate = useNavigate()
  const [action, setAction] = useState<Editor['action'] | null>(editing ? 'update' : null)
  const [message, setMessage] = useState('')
  const back = <Link className="button secondary teacher-back" to="/admin/docentes"><ArrowLeft size={18} aria-hidden="true" />Volver a docentes</Link>
  if (result.loading) return <>{back}<PanelPlaceholder label="Cargando docente" variant="detail" /></>
  if (result.error || !result.data) return <>{back}<Failure error={result.error} retry={result.refresh} /></>
  const teacher = result.data
  return <>
    {back}
    <div className="page-heading teacher-detail-heading"><div><h1>{teacher.full_name}</h1><p>C.I. {teacher.cedula} · <span className={`badge ${teacher.active ? 'green' : 'amber'}`}>{teacher.active ? 'Activo' : 'Bloqueado'}</span></p></div>
      <Link className="button secondary" to={`/admin/docentes/${teacher.id}${editing ? '' : '/editar'}`}>{editing ? <BookOpen size={18} aria-hidden="true" /> : <Pencil size={18} aria-hidden="true" />}{editing ? 'Ver historial' : 'Editar docente'}</Link>
    </div>
    {message && <p className="feedback success" role="status">{message}</p>}
    {editing && <>
      <div className="teacher-actions teacher-account-actions">
        <button className="button secondary" disabled={Boolean(action)} onClick={() => { setMessage(''); setAction('update') }}>Editar datos</button>
        <button className="button secondary" disabled={Boolean(action)} onClick={() => { setMessage(''); setAction('reset-password') }}>Restablecer contraseña</button>
        <button className="button secondary danger-text" disabled={Boolean(action) || !teacher.active} onClick={() => { setMessage(''); setAction('disable') }}>Bloquear acceso</button>
        <button className="button secondary danger-text" disabled={Boolean(action)} onClick={() => { setMessage(''); setAction('delete') }}>Eliminar cuenta</button>
      </div>
      {action && <TeacherEditor key={action} editor={{ action, teacher }} schoolDate={context.school_date} close={() => setAction(null)} saved={() => {
        if (action === 'delete') { void navigate('/admin/docentes'); return }
        setAction(null); setMessage('Cambio guardado.'); result.refresh()
      }} />}
    </>}
    <History key={`${teacher.id}-${teacher.cedula}`} admin context={context} teacherId={teacher.id} />
  </>
}
