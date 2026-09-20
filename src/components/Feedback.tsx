import { errorMessage } from '../lib/attendance'
import { AlertCircle, LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { PublicLayout } from './PublicLayout'

const LOADING_CEILING = 94
const COMPLETE_DURATION = 160

const loadingProgressStore = (() => {
  let value = 0
  let startedAt = 0
  let completedAt: number | undefined
  let completeFrom = 0
  let frame: number | undefined
  let resetTimer: number | undefined
  const listeners = new Set<() => void>()

  function notify() { listeners.forEach(listener => listener()) }

  function reset() {
    value = 0
    startedAt = performance.now()
    completedAt = undefined
    completeFrom = 0
  }

  function tick(now: number) {
    if (!listeners.size) { frame = undefined; return }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion && completedAt === undefined) {
      value = 0
      notify()
      frame = undefined
      return
    }
    if (reducedMotion) {
      value = 100
      notify()
      frame = undefined
      return
    }
    if (completedAt === undefined) {
      const elapsed = now - startedAt
      value = Math.min(LOADING_CEILING, LOADING_CEILING * (1 - Math.exp(-elapsed / 4200)))
    } else {
      const elapsed = Math.min(1, (now - completedAt) / COMPLETE_DURATION)
      const eased = 1 - Math.pow(1 - elapsed, 3)
      value = completeFrom + (100 - completeFrom) * eased
    }
    notify()
    if (value < 100) frame = window.requestAnimationFrame(tick)
    else frame = undefined
  }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(tick)
  }

  return {
    subscribe(listener: () => void) {
      if (resetTimer) {
        window.clearTimeout(resetTimer)
        resetTimer = undefined
      }
      if (!listeners.size && completedAt !== undefined) reset()
      if (!startedAt) startedAt = performance.now()
      listeners.add(listener)
      schedule()
      return () => {
        listeners.delete(listener)
        if (!listeners.size && frame) {
          window.cancelAnimationFrame(frame)
          frame = undefined
        }
        if (!listeners.size) resetTimer = window.setTimeout(() => {
          if (!listeners.size) reset()
          resetTimer = undefined
        }, 0)
      }
    },
    getSnapshot: () => Math.round(value),
    complete() {
      if (completedAt !== undefined) return
      completeFrom = value
      completedAt = performance.now()
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) value = 100
      notify()
      schedule()
    },
  }
})()

function FullPageLoading({ complete, description }: { complete: boolean; description: string }) {
  const percent = useSyncExternalStore(loadingProgressStore.subscribe, loadingProgressStore.getSnapshot, loadingProgressStore.getSnapshot)
  useEffect(() => { if (complete) loadingProgressStore.complete() }, [complete])
  return <LoadingContent percent={percent} fullPage description={description} />
}

function LoadingContent({ percent, fullPage, description }: { percent: number; fullPage: boolean; description: string }) {
  const content = <div className="loading-state" role="status" aria-live="polite" aria-label="Cargando tu espacio">
    {fullPage ? <h1>Cargando tu espacio…</h1> : <strong>Cargando tu espacio…</strong>}
    <p>{description}</p>
    <div className="loading-meter">
      <div className="loading-progress" role="progressbar" aria-label="Progreso de carga" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}% de carga completada`}><span style={{ width: `${percent}%` }} /></div>
      <span className="loading-percentage" aria-hidden="true">{percent}%</span>
    </div>
  </div>
  return fullPage ? <PublicLayout><section className="ui-card access-card">{content}</section></PublicLayout> : content
}

export function Loading({ fullPage = false, complete = false, description = 'Estamos preparando tus datos.' }: { fullPage?: boolean; complete?: boolean; description?: string }) {
  if (fullPage) return <FullPageLoading complete={complete} description={description} />
  return <LoadingContent percent={0} fullPage={false} description={description} />
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
