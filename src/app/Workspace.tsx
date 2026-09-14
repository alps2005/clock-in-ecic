import { NavLink, Navigate, Route, Routes } from 'react-router'
import { useState } from 'react'
import { getContext, getNotifications } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useRemote } from './useRemote'
import { Failure, Loading } from '../components/Feedback'
import { Attendance } from '../features/attendance/Attendance'
import { History } from '../features/history/History'
import { TeachersPage } from '../features/admin/TeachersPage'
import { NotificationsPage } from '../features/admin/NotificationsPage'

export function Workspace({ userId }: { userId: string }) {
  const context = useRemote(getContext, 15_000)
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  async function logout() {
    setLoggingOut(true); setLogoutError('')
    try {
      const result = await supabase!.auth.signOut({ scope: 'local' })
      if (result.error) throw result.error
      sessionStorage.removeItem('ecic-pending-attendance'); sessionStorage.removeItem('ecic-pending-owner')
    } catch { setLogoutError('No se pudo cerrar la sesión. Inténtalo nuevamente.'); setLoggingOut(false) }
  }
  if (context.loading) return <Loading />
  if (context.error || !context.data || context.data.profile.auth_user_id !== userId) return <div className="access-error"><Failure error={context.error ?? new Error('ACCESS_DENIED')} retry={context.refresh} /><button className="button secondary" onClick={() => void logout()}>Cerrar sesión</button>{logoutError && <p role="alert">{logoutError}</p>}</div>
  const data = context.data
  const admin = data.profile.role === 'admin'
  return <div className="workspace">
    <a className="skip-link" href="#main">Ir al contenido</a>
    <aside className="sidebar"><a className="brand" href="/"><span className="brand-mark" aria-hidden="true">e<span>.</span></span><span>ECIC<span className="sidebar-product">Clock-in</span></span></a>
      <p className="nav-label">{admin ? 'ADMINISTRACIÓN' : 'MI ESPACIO'}</p>
      <nav aria-label="Navegación principal">{admin ? <><NavLink to="/admin" end><span aria-hidden="true">▤</span>Reporte de asistencia</NavLink><NavLink to="/admin/docentes"><span aria-hidden="true">♙</span>Docentes</NavLink><NotificationsLink /></> : <><NavLink to="/jornada"><span aria-hidden="true">◷</span>Mi jornada</NavLink><NavLink to="/historial"><span aria-hidden="true">▤</span>Mi historial</NavLink></>}</nav>
      <div className="sidebar-bottom"><span className="avatar" aria-hidden="true">{data.profile.full_name.slice(0, 1)}</span><div><strong>{data.profile.full_name}</strong><span>{admin ? 'Administrador' : 'Docente'}</span></div></div>
      <button className="logout" onClick={() => void logout()} disabled={loggingOut}>{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión ↗'}</button>
      {logoutError && <p className="feedback error" role="alert">{logoutError}</p>}
    </aside>
    <div className="workspace-content"><header className="workspace-header"><span>ASISTENCIA DOCENTE</span><span className="school-tag"><span aria-hidden="true" />ECIC · Ecuador</span></header>
      <main id="main" className="workspace-main" tabIndex={-1}><Routes>{admin ? <><Route path="/admin" element={<History admin context={data} />} /><Route path="/admin/docentes" element={<TeachersPage schoolDate={data.school_date} />} /><Route path="/admin/avisos" element={<NotificationsPage />} /></> : <><Route path="/jornada" element={<Attendance context={data} refresh={context.refresh} />} /><Route path="/historial" element={<History context={data} />} /></>}<Route path="*" element={<Navigate to={admin ? '/admin' : '/jornada'} replace />} /></Routes></main>
      <footer className="workspace-footer">Clock-in ECIC <span>Zona horaria: Ecuador continental (UTC−5)</span></footer>
    </div>
  </div>
}

const loadNoticeCount = () => getNotifications(0)
function NotificationsLink() {
  const result = useRemote(loadNoticeCount, 30_000)
  return <NavLink to="/admin/avisos"><span aria-hidden="true">♧</span>Notificaciones{result.data && result.data.total > 0 && <span className="notice-count" aria-label={`${result.data.total} ventanas de registro incumplidas`}>{result.data.total}</span>}</NavLink>
}
