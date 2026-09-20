import '../admin.css'
import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { WorkspaceShell } from './WorkspaceShell'
import { PanelLoadingBoundary } from './PanelLoadingBoundary'
import { getAdminSidebarCounts, getContext } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useRemote } from './useRemote'
import { AccessFailure, Loading } from '../components/Feedback'
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
  if (context.loading) return <Loading fullPage description="Cargando tu cuenta." />
  if (context.error || !context.data || context.data.profile.auth_user_id !== userId) return <AccessFailure error={context.error ?? new Error('ACCESS_DENIED')} retry={context.refresh} logout={() => void logout()} loggingOut={loggingOut} logoutError={logoutError} />
  const data = context.data
  const admin = data.profile.role === 'admin'
  return <PanelLoadingBoundary><WorkspaceShell context={data} counts={sidebarCounts.data} logout={() => void logout()} loggingOut={loggingOut} logoutError={logoutError}>
    <Routes>{admin ? <>
      <Route path="/admin" element={<History admin context={data} />} />
      <Route path="/admin/docentes" element={<TeachersPage schoolDate={data.school_date} />} />
      <Route path="/admin/docentes/:teacherId" element={<TeacherPage context={data} />} />
      <Route path="/admin/docentes/:teacherId/editar" element={<Navigate to=".." relative="path" replace />} />
      <Route path="/admin/avisos" element={<NotificationsPage />} />
    </> : <>
      <Route path="/jornada" element={<Attendance context={data} refresh={context.refresh} />} />
      <Route path="/historial" element={<History context={data} />} />
    </>}<Route path="*" element={<Navigate to={admin ? '/admin' : '/jornada'} replace />} /></Routes>
  </WorkspaceShell></PanelLoadingBoundary>
}
