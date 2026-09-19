import { useCallback, useEffect, useRef, useState } from 'react'

export function useRemote<T>(load: () => Promise<T>, interval = 0, enabled = true, stopOnError = false) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean; source: (() => Promise<T>) | null; version: number }>({ data: null, error: null, loading: true, source: null, version: -1 })
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion(v => v + 1), [])
  const loggedFailure = useRef(false)
  useEffect(() => {
    if (!enabled) return
    let failed = false
    let alive = true
    let running = false
    async function fetchData() {
      if (running || failed) return
      running = true
      try {
        const data = await load()
        if (alive) setState({ data, error: null, loading: false, source: load, version })
      } catch (error) {
        if (stopOnError) {
          failed = true
          if (!loggedFailure.current) { console.warn('Sidebar counts unavailable'); loggedFailure.current = true }
        }
        if (alive) setState({ data: null, error, loading: false, source: load, version })
      } finally { running = false }
    }
    void fetchData()
    const timer = interval ? window.setInterval(() => void fetchData(), interval) : undefined
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchData() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load, version, interval, enabled, stopOnError])
  return !enabled ? { data: null, error: null, loading: false, refresh } : state.source === load ? { ...state, refresh } : { data: null, error: null, loading: true, refresh }
}
