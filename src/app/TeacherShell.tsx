import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, ClipboardCheck, LogOut, PanelLeft, RefreshCw } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import type { AppContext } from '../types/app'
import { schoolTimezone } from '../lib/attendance'

export function TeacherShell({ context, children, logout, loggingOut, logoutError }: { context: AppContext; children: ReactNode; logout: () => void; loggingOut: boolean; logoutError: string }) {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('ecic-sidebar-collapsed') === 'true' } catch { return false } })
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState('')
  const [now, setNow] = useState(() => new Date())
  const main = useRef<HTMLElement>(null)
  const account = useRef<HTMLDivElement>(null)
  const location = useLocation()
  useLayoutEffect(() => { main.current?.scrollTo({ top: 0, behavior: 'instant' }); account.current?.hidePopover() }, [location.pathname])
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    const complete = (event: Event) => { setRefreshing(false); setToast((event as CustomEvent<string>).detail) }
    window.addEventListener('ecic-toast', complete)
    return () => window.removeEventListener('ecic-toast', complete)
  }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer) }, [toast])
  function toggle() { setCollapsed(value => { try { localStorage.setItem('ecic-sidebar-collapsed', String(!value)) } catch { /* Storage can be unavailable. */ } return !value }) }
  const nav = <><NavLink to="/jornada"><CalendarDays size={18} aria-hidden="true" /><span>Mi jornada</span></NavLink><NavLink to="/historial"><ClipboardCheck size={18} aria-hidden="true" /><span>Mi historial</span></NavLink></>
  const identity = <div className="teacher-identity"><span className="teacher-avatar" aria-hidden="true">{context.profile.full_name[0]}</span><div><strong>{context.profile.full_name}</strong><small>Docente</small></div></div>
  const logoutButton = <button className="button teacher-logout" disabled={loggingOut} onClick={logout}><LogOut size={16} aria-hidden="true" />{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
  return <div className={`teacher-ui teacher-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
    <a className="skip-link" href="#main">Ir al contenido</a>
    <aside className="teacher-sidebar" aria-label="Barra lateral">
      <div className="teacher-brand"><img src="/favicon.svg" width="36" height="36" alt="" /><div><strong>ECIC Clock-in</strong><small>Gestión de personal docente</small></div></div>
      <p className="teacher-menu-label">Menú</p><nav aria-label="Navegación principal" onClick={() => setRefreshing(false)}>{nav}</nav>
      <div className="teacher-sidebar-footer">{identity}{logoutButton}{logoutError && <p role="alert">{logoutError}</p>}</div>
    </aside>
    <div className="teacher-frame">
      <header className="teacher-topbar">
        <div className="teacher-desktop-title"><button className="icon-button" onClick={toggle} aria-label="Alternar barra lateral" aria-expanded={!collapsed}><PanelLeft size={18} /></button><span className="topbar-separator" /><span>{location.pathname === '/historial' ? 'Mi historial' : 'Mi jornada'}</span></div>
        <div className="teacher-mobile-brand"><img src="/favicon.svg" width="28" height="28" alt="" /><strong>ECIC Clock-in</strong></div>
        <time className="teacher-date" dateTime={now.toISOString()}>{new Intl.DateTimeFormat('es-EC', { timeZone: schoolTimezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)}</time>
        <button className="icon-button" aria-label="Actualizar datos" disabled={refreshing} onClick={() => { setRefreshing(true); setToast(''); window.dispatchEvent(new Event('ecic-refresh')) }}><RefreshCw className={refreshing ? 'refreshing' : ''} size={18} /></button>
        <button className="teacher-avatar teacher-account-toggle" popoverTarget="teacher-account" aria-label="Abrir menú de cuenta">{context.profile.full_name[0]}</button>
        <div ref={account} id="teacher-account" popover="auto" className="teacher-account">{identity}{logoutButton}{logoutError && <p role="alert">{logoutError}</p>}</div>
      </header>
      <main id="main" ref={main} tabIndex={-1} className="teacher-content"><div className="teacher-content-inner">{children}</div></main>
    </div>
    <nav className="teacher-bottom-nav" aria-label="Navegación móvil" onClick={() => setRefreshing(false)}>{nav}</nav>
    <div role="status" aria-live="polite" aria-atomic="true">{toast && <div className="toast">{toast}</div>}</div>
  </div>
}
