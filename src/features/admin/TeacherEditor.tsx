import { useAnimatedDismiss } from '../../components/useAnimatedDismiss'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { manageTeacher } from '../../lib/api'
import { errorMessage } from '../../lib/attendance'
import type { TeacherAccount, TeacherMutation } from '../../types/app'

export type Editor = { action: TeacherMutation['action']; teacher?: TeacherAccount }

export function TeacherEditor({ editor, schoolDate, close, saved }: { editor: Editor; schoolDate: string; close: () => void; saved: () => void }) {
  const { ref: panel, dismiss } = useAnimatedDismiss<HTMLElement>(close)
  const { action, teacher } = editor
  const details = action === 'create' || action === 'update'
  const passwordAction = action === 'create' || action === 'reset-password'
  const [name, setName] = useState(teacher?.full_name ?? '')
  const [cedula, setCedula] = useState(teacher?.cedula ?? '')
  const [from, setFrom] = useState(teacher?.employed_from ?? schoolDate)
  const [until, setUntil] = useState(teacher?.employed_until ?? '')
  const [active, setActive] = useState(teacher?.active ?? true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const title = { create: 'Crear docente', update: 'Editar docente', 'reset-password': 'Restablecer contraseña', disable: 'Bloquear acceso del docente', delete: 'Eliminar cuenta del docente' }[action]
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('')
    const input: TeacherMutation = { action, id: teacher?.id }
    if (details) Object.assign(input, { full_name: name.trim(), cedula, employed_from: from, employed_until: until || null, ...(action === 'update' ? { active } : {}) })
    if (passwordAction) input.password = password
    try { await manageTeacher(input); setPassword(''); saved() }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setPending(false) }
  }
  return <section ref={panel} className="attendance-card teacher-editor" aria-labelledby="teacher-editor-title"><h2 id="teacher-editor-title">{title}</h2>{teacher && <p>{teacher.full_name} · C.I. {teacher.cedula}</p>}
    {action === 'disable' && <p>Se bloqueará el inicio de sesión. Podrás permitir el acceso nuevamente desde Editar datos. Su historial de asistencia se conservará.</p>}
    {action === 'delete' && <p>Se eliminará la cuenta de inicio de sesión de forma permanente y finalizará su vinculación. Su historial de asistencia se conservará.</p>}
    <form onSubmit={event => void submit(event)}><fieldset disabled={pending}><div className="teacher-fields">
      {details && <><div><label htmlFor="teacher-name">Nombre completo</label><input id="teacher-name" required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} /></div><div><label htmlFor="teacher-cedula">C.I.</label><input id="teacher-cedula" required pattern="[0-9]{10}" inputMode="numeric" maxLength={10} value={cedula} onChange={event => setCedula(event.target.value.replace(/\D/g, ''))} /></div><div><label htmlFor="teacher-from">Fecha de vinculación</label><input id="teacher-from" type="date" required value={from} onChange={event => setFrom(event.target.value)} /></div></>}
      {action === 'update' && <div><label htmlFor="teacher-until">Último día de vinculación</label><input id="teacher-until" type="date" min={from} value={until} onChange={event => setUntil(event.target.value)} /></div>}
      {action === 'update' && <label className="teacher-checkbox"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Permitir acceso</label>}
      {passwordAction && <div><label htmlFor="teacher-password">Nueva contraseña</label><div className="password-field"><input id="teacher-password" type={showPassword ? 'text' : 'password'} required minLength={12} maxLength={256} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div><p className="muted">Mínimo 12 caracteres. Entrega la contraseña de forma privada; no podrás consultarla después.</p></div>}
    </div>{error && <p className="feedback error" role="alert">{error}</p>}<div className="teacher-actions"><button className="button primary" type="submit">{pending ? 'Guardando…' : action === 'disable' ? 'Confirmar bloqueo' : action === 'delete' ? 'Confirmar eliminación de cuenta' : 'Guardar'}</button><button type="button" className="button secondary" onClick={dismiss}>Cancelar</button></div></fieldset></form></section>
}
