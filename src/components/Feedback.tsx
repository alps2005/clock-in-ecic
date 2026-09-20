import { errorMessage } from '../lib/attendance'
import { AlertCircle, LoaderCircle, LogOut, RefreshCw } from 'lucide-react'
import { PublicLayout } from './PublicLayout'

export function Loading({ fullPage = false }: { fullPage?: boolean }) {
  const content = <div className="loading-state" role="status" aria-live="polite" aria-label="Cargando tu espacio">
    <span className="auth-symbol" aria-hidden="true"><LoaderCircle className="loading-spinner" size={24} /></span>
    {fullPage ? <h1>Cargando tu espacio…</h1> : <strong>Cargando tu espacio…</strong>}
    <p>Estamos preparando tus datos.</p>
    <div className="loading-progress" aria-hidden="true"><span /></div>
  </div>
  return fullPage ? <PublicLayout><section className="ui-card access-card">{content}</section></PublicLayout> : content
}

export function AccessFailure({ error, retry, logout, loggingOut, logoutError }: { error: unknown; retry: () => void; logout: () => void; loggingOut: boolean; logoutError: string }) {
  return <PublicLayout><section className="ui-card access-card" aria-labelledby="access-title">
    <span className="auth-symbol access-symbol" aria-hidden="true"><AlertCircle size={24} /></span>
    <h1 id="access-title">No pudimos cargar tu espacio</h1>
    <p className="access-message" role="alert">{errorMessage(error)}</p>
    <div className="access-actions">
      <button className="button primary" onClick={retry}><RefreshCw size={16} aria-hidden="true" />Volver a intentar</button>
      <button className="button secondary" onClick={logout} disabled={loggingOut}><LogOut size={16} aria-hidden="true" />{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    </div>
    {logoutError && <p className="feedback error" role="alert">{logoutError}</p>}
  </section></PublicLayout>
}
export function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="feedback error" role="alert"><p>{errorMessage(error)}</p><button className="button secondary" onClick={retry}>Volver a intentar</button></div>
}
export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  return <div className="pager"><span>{total} registros · Página {page + 1} de {Math.max(1, Math.ceil(total / 25))}</span><div><button className="button secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>Anterior</button><button className="button secondary" disabled={(page + 1) * 25 >= total} onClick={() => onPage(page + 1)}>Siguiente</button></div></div>
}
