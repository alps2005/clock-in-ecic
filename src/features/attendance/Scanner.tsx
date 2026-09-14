import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'

export function Scanner({ onScan, onClose }: { onScan: (payload: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const callback = useRef(onScan)
  const [error, setError] = useState('')
  useEffect(() => { callback.current = onScan }, [onScan])
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const element = video.current
    if (!element) return
    let disposed = false
    let decoded = false
    let scanner: QrScanner | undefined
    queueMicrotask(() => {
      if (disposed) return
      scanner = new QrScanner(element, result => {
      if (!disposed && !decoded) { decoded = true; scanner?.stop(); callback.current(result.data) }
    }, { preferredCamera: 'environment', highlightScanRegion: true, maxScansPerSecond: 5, returnDetailedScanResult: true })
    void scanner.start().then(() => { if (disposed) scanner?.destroy() }).catch(() => {
      if (!disposed) setError('No pudimos abrir la cámara. Permite el acceso en tu navegador y verifica que otra aplicación no la esté usando.')
    })
    })
    return () => { disposed = true; scanner?.destroy(); previousFocus?.focus() }
  }, [])
  return <div className="scanner-overlay" role="dialog" aria-modal="true" aria-labelledby="scanner-title" onKeyDown={event => {
    if (event.key === 'Escape') onClose()
    if (event.key === 'Tab') { event.preventDefault(); closeButton.current?.focus() }
  }}><div className="scanner-dialog"><div className="section-title"><h2 id="scanner-title">Escanea el código de ECIC</h2><button ref={closeButton} className="button secondary" onClick={onClose}>Cerrar</button></div><p>Apunta la cámara al código QR de la institución.</p>{error ? <p className="feedback error" role="alert">{error}</p> : <video ref={video} muted playsInline aria-label="Vista de la cámara" />}<p className="muted">El registro se realiza al reconocer un código válido.</p></div></div>
}
