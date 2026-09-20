import { createContext, useContext, useEffect } from 'react'

export const PanelReadyContext = createContext<(() => void) | null>(null)

// An error is also a settled request: reveal the page's retry UI, never leave
// the user waiting behind a progress bar. Later refreshes stay within the page.
export function usePanelReady(settled: boolean) {
  const complete = useContext(PanelReadyContext)
  useEffect(() => { if (settled) complete?.() }, [settled, complete])
}
