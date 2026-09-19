import { NavLink, Navigate, Route, Routes } from 'react-router'
import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  LogOut,
  RefreshCw,
  Settings,
  Users,
} from 'lucide-react'
import { getAdminSidebarCounts, getContext } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useRemote } from './useRemote'
import { Failure, Loading } from '../components/Feedback'
import { Attendance } from '../features/attendance/Attendance'
import { History } from '../features/history/History'
import { TeacherPage } from '../features/admin/TeacherPage'
import { TeachersPage } from '../features/admin/TeachersPage'
import { NotificationsPage } from '../features/admin/NotificationsPage'
import { ExportModal } from '../features/history/ExportModal'
import { schoolTimezone } from '../lib/attendance'
import { SiteFooter } from '../components/SiteFooter'

export function Workspace({ userId }: { userId: string }) {
  const context = useRemote(getContext, 15_000)
  const sidebarCounts = useRemote(getAdminSidebarCounts, 30_000, !context.loading && !context.error && context.data?.profile.auth_user_id === userId && context.data.profile.role === 'admin', true)
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [exportOpen, setExportOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuToggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

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
  const formattedClock = new Intl.DateTimeFormat('es-EC', {
    timeZone: schoolTimezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(now)

  return <div className="ecic-shell">
    <a className="skip-link" href="#main">Ir al contenido</a>
    <aside className={`ecic-sidebar${menuOpen ? ' menu-open' : ''}`} onKeyDown={event => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false)
        menuToggle.current?.focus()
      }
    }}>
      <div className="ecic-mobile-header">
      <div className="ecic-brand-wrap">
        <img className="ecic-brand-mark" src="/favicon.svg" alt="" width="42" height="42" />
        <div className="ecic-brand-copy">
          <span className="ecic-brand-title">ECIC</span>
          <span className="ecic-brand-badge">CLOCK-IN</span>
        </div>
      </div>
      <button ref={menuToggle} className="ecic-user-card ecic-mobile-user" type="button" aria-expanded={menuOpen} aria-controls="ecic-navbar" onClick={() => setMenuOpen(open => !open)}>
        <UserIdentity name={data.profile.full_name} admin={admin} />
        <ChevronDown className="ecic-menu-chevron" size={16} aria-hidden="true" />
      </button>
      </div>
      <p className="ecic-sidebar-subtitle">Gestión de Personal Docente</p>
      <div id="ecic-navbar" className="ecic-navbar">
      <div className="ecic-navbar-content">
      <div className="ecic-nav-block">
        <p className="ecic-nav-label">ADMINISTRACIÓN</p>
        <nav aria-label="Navegación principal" className="ecic-nav" onClick={event => {
          if ((event.target as HTMLElement).closest('a') && menuOpen) {
            setMenuOpen(false)
            menuToggle.current?.focus()
          }
        }}>
          {admin ? <>
            <NavLink to="/admin" end className={({ isActive }) => `ecic-nav-item${isActive ? ' active' : ''}`}><span className="ecic-nav-icon"><ClipboardCheck size={18} strokeWidth={1.75} /></span><span>Reporte de asistencia</span><span className="ecic-nav-dot" aria-hidden="true" /></NavLink>
            <NavLink to="/admin/docentes" className={({ isActive }) => `ecic-nav-item${isActive ? ' active' : ''}`}><span className="ecic-nav-icon"><Users size={18} strokeWidth={1.75} /></span><span>Docentes</span><SidebarCount value={sidebarCounts.data?.teachers} /></NavLink>
            <NavLink to="/admin/horarios" className="ecic-nav-item"><span className="ecic-nav-icon"><Clock3 size={18} strokeWidth={1.75} /></span><span>Horarios y Turnos</span></NavLink>
            <NavLink to="/admin/justificaciones" className="ecic-nav-item"><span className="ecic-nav-icon"><CheckCircle2 size={18} strokeWidth={1.75} /></span><span>Justificaciones</span><SidebarCount value={sidebarCounts.data?.justifications} alert /></NavLink>
            <NavLink to="/admin/avisos" className={({ isActive }) => `ecic-nav-item${isActive ? ' active' : ''}`}><span className="ecic-nav-icon"><Bell size={18} strokeWidth={1.75} /></span><span>Notificaciones</span><SidebarCount value={sidebarCounts.data?.notifications} alert /></NavLink>
            <NavLink to="/admin/configuracion" className="ecic-nav-item"><span className="ecic-nav-icon"><Settings size={18} strokeWidth={1.75} /></span><span>Configuración</span></NavLink>
          </> : <>
            <NavLink to="/jornada" className="ecic-nav-item"><span className="ecic-nav-icon"><FileText size={18} strokeWidth={1.75} /></span><span>Mi jornada</span></NavLink>
            <NavLink to="/historial" className="ecic-nav-item"><span className="ecic-nav-icon"><ClipboardCheck size={18} strokeWidth={1.75} /></span><span>Mi historial</span></NavLink>
          </>}
        </nav>
      </div>

      <div className="ecic-user-card ecic-desktop-user">
        <UserIdentity name={data.profile.full_name} admin={admin} />
      </div>
      <button className="ecic-logout" type="button" onClick={() => void logout()} disabled={loggingOut}>
        <LogOut size={16} strokeWidth={1.8} />
        {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
      {logoutError && <p className="feedback error" role="alert">{logoutError}</p>}
      </div>
      </div>
    </aside>

    <div className="ecic-main-panel">
      <header className="ecic-topbar">
        <div className="ecic-status-pill ecic-live-clock"><Clock3 size={16} strokeWidth={1.9} aria-hidden="true" /><time dateTime={now.toISOString()}>{formattedClock}</time></div>
        <div className="ecic-topbar-actions">
          <button className="ecic-ghost-button" type="button" onClick={() => setExportOpen(true)}><Download size={15} strokeWidth={1.8} />Exportar</button>
          <button className="ecic-ghost-button" type="button" onClick={() => window.location.reload()}><RefreshCw size={15} strokeWidth={1.8} />Actualizar</button>
        </div>
      </header>
      {exportOpen && <ExportModal admin={admin} close={() => setExportOpen(false)} />}

      <main id="main" className="ecic-workbench" tabIndex={-1}>
        <Routes>{admin ? <><Route path="/admin" element={<History admin context={data} />} /><Route path="/admin/docentes" element={<TeachersPage schoolDate={data.school_date} />} /><Route path="/admin/docentes/:teacherId" element={<TeacherPage context={data} />} /><Route path="/admin/docentes/:teacherId/editar" element={<TeacherPage context={data} editing />} /><Route path="/admin/avisos" element={<NotificationsPage />} /></> : <><Route path="/jornada" element={<Attendance context={data} refresh={context.refresh} />} /><Route path="/historial" element={<History context={data} />} /></>}<Route path="*" element={<Navigate to={admin ? '/admin' : '/jornada'} replace />} /></Routes>
      </main>

      <SiteFooter />
    </div>
  </div>
}

function SidebarCount({ value, alert = false }: { value?: number; alert?: boolean }) {
  if (value === undefined) return null
  return <span className={`ecic-nav-badge${alert ? ' ecic-nav-badge-warning' : ''}`}>{value}</span>
}

function UserIdentity({ name, admin }: { name: string; admin: boolean }) {
  return <>
    <span className="ecic-user-avatar" aria-hidden="true">{name.slice(0, 1)}</span>
    <span className="ecic-user-meta">
      <strong>{name}</strong>
      <span>{admin ? 'Administrador' : 'Docente'}</span>
    </span>
  </>
}
