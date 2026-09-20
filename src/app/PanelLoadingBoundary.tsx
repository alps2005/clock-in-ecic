import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Loading } from '../components/Feedback'
import { PanelReadyContext } from './usePanelReady'

// Session, code, and account are ready. Keep the initial panel mounted so its
// real data requests can finish, then reveal it after the completion animation.
export function PanelLoadingBoundary({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [panelComplete, setPanelComplete] = useState(false)
  const revealTimer = useRef<number | undefined>(undefined)
  const complete = useCallback(() => {
    setPanelComplete(true)
    revealTimer.current = window.setTimeout(() => setReady(true), 180)
  }, [])
  useEffect(() => () => { if (revealTimer.current) window.clearTimeout(revealTimer.current) }, [])
  return <PanelReadyContext value={complete}>
    {!ready && <Loading fullPage complete={panelComplete} description="Cargando los datos del panel." />}
    <div hidden={!ready}>{children}</div>
  </PanelReadyContext>
}
