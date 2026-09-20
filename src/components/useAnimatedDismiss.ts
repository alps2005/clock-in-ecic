import { useEffect, useRef } from 'react'

// Keep overlays mounted and focus contained until their short exit completes.
export function useAnimatedDismiss<T extends HTMLElement>(close: () => void) {
  const ref = useRef<T>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  function dismiss() {
    if (timer.current !== undefined) return
    if (!ref.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      close()
      return
    }
    ref.current.dataset.closing = 'true'
    timer.current = window.setTimeout(close, 180)
  }
  return { ref, dismiss }
}
