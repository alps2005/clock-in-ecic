import '../teacher.css'
import '../admin.css'
import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { WorkspaceShell } from './WorkspaceShell'
import { getAdminSidebarCounts, getContext } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useRemote } from './useRemote'
import { Failure } from '../components/Feedback'
import { Attendance } from '../features/attendance/Attendance'
import { History } from '../features/history/History'
import { TeacherPage } from '../features/admin/TeacherPage'
import { TeachersPage } from '../features/admin/TeachersPage'
import { NotificationsPage } from '../features/admin/NotificationsPage'

export function Workspace({ userId }: { userId: string }) {
  const context = useRemote(getContext, 15_000)
  const sidebarCounts = useRemote(getAdminSidebarCounts, 30_000, !context.loading && !context.error && context.data?.profile.auth_user_id === userId && context.data.profile.role === 'admin', true)
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
  if (context.loading) return <div className="teacher-ui workspace-loading" role="status" aria-label="Cargando tu espacio" aria-busy="true"><div className="jornada-kpis">{[1, 2, 3].map(i => <div className="skeleton" key={i} />)}</div><div className="skeleton schedule" /></div>
  if (context.error || !context.data || context.data.profile.auth_user_id !== userId) return <div className="access-error"><Failure error={context.error ?? new Error('ACCESS_DENIED')} retry={context.refresh} /><button className="button secondary" onClick={() => void logout()}>Cerrar sesión</button>{logoutError && <p role="alert">{logoutError}</p>}</div>
  const data = context.data
  const admin = data.profile.role === 'admin'
  return <WorkspaceShell context={data} counts={sidebarCounts.data} logout={() => void logout()} loggingOut={loggingOut} logoutError={logoutError}>
    <Routes>{admin ? <>
      <Route path="/admin" element={<History admin context={data} />} />
      <Route path="/admin/docentes" element={<TeachersPage schoolDate={data.school_date} />} />
      <Route path="/admin/docentes/:teacherId" element={<TeacherPage context={data} />} />
      <Route path="/admin/docentes/:teacherId/editar" element={<TeacherPage context={data} editing />} />
      <Route path="/admin/avisos" element={<NotificationsPage />} />
    </> : <>
      <Route path="/jornada" element={<Attendance context={data} refresh={context.refresh} />} />
      <Route path="/historial" element={<History context={data} />} />
    </>}<Route path="*" element={<Navigate to={admin ? '/admin' : '/jornada'} replace />} /></Routes>
  </WorkspaceShell>
}
