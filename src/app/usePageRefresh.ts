import { useEffect, useRef } from 'react'

export function notify(message: string) { window.dispatchEvent(new CustomEvent('ecic-toast', { detail: message })) }

export function usePageRefresh(refresh: () => void, data: unknown, error: unknown) {
  const pending = useRef(false)
  useEffect(() => {
    const onRefresh = () => { pending.current = true; refresh() }
    window.addEventListener('ecic-refresh', onRefresh)
    return () => window.removeEventListener('ecic-refresh', onRefresh)
  }, [refresh])
  useEffect(() => {
    if (pending.current) { pending.current = false; notify(error ? 'No se pudieron actualizar los datos' : 'Datos actualizados') }
  }, [data, error])
}
