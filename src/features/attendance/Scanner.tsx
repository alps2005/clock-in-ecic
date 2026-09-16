import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'

function cameraError(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'El acceso a la cámara está bloqueado. Permite la cámara en los permisos de este sitio y en los ajustes del teléfono para tu navegador. Luego toca “Reintentar cámara”. Si abriste el enlace dentro de otra aplicación, ábrelo en Safari o Chrome.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No se encontró una cámara disponible. Abre esta página en un teléfono con cámara usando Safari o Chrome.'
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'No pudimos iniciar la cámara. Cierra otras aplicaciones que la estén usando y toca “Reintentar cámara”.'
  }
  return 'No pudimos abrir la cámara. Reintenta o abre esta página directamente en Safari o Chrome.'
}

export function Scanner({ onScan, onClose }: { onScan: (payload: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const scanRegion = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const retryButton = useRef<HTMLButtonElement>(null)
  const callback = useRef(onScan)
  const retry = useRef<() => void>(() => {})
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [canRetry, setCanRetry] = useState(true)
  useEffect(() => { callback.current = onScan }, [onScan])
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const element = video.current
    if (!element) return
    let disposed = false
    let decoded = false
    let opening = false
    let scanner: QrScanner | undefined
    let stream: MediaStream | undefined
    function releaseCamera() {
      scanner?.destroy()
      scanner = undefined
      // The library may replace the stream when the browser resumes this tab.
      if (typeof MediaStream !== 'undefined' && element!.srcObject instanceof MediaStream) {
        element!.srcObject.getTracks().forEach(track => track.stop())
      }
      stream?.getTracks().forEach(track => track.stop())
      stream = undefined
      element!.srcObject = null
    }
    async function startCamera() {
      if (disposed || opening || decoded) return
      opening = true
      setStarting(true)
      setError('')
      try {
        if (!window.isSecureContext) {
          setCanRetry(false)
          setError('La cámara necesita una conexión segura (HTTPS). Abre el enlace HTTPS de ECIC. Una dirección local como http://192.168… no permite usar la cámara en el teléfono.')
          return
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setCanRetry(false)
          setError('Este navegador no permite acceder a la cámara. Abre el enlace de ECIC directamente en Safari o Chrome.')
          return
        }
        // Request once with a soft rear-camera preference. qr-scanner's own camera
        // acquisition retries denied requests and replaces every error with “Camera not found”.
        const acquired = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }, audio: false,
        })
        if (disposed) { acquired.getTracks().forEach(track => track.stop()); return }
        stream = acquired
        scanner = new QrScanner(element!, result => {
          if (!disposed && !decoded) {
            decoded = true
            releaseCamera()
            callback.current(result.data)
          }
        }, {
          preferredCamera: 'environment', maxScansPerSecond: 5, returnDetailedScanResult: true,
          highlightScanRegion: true, overlay: scanRegion.current!,
        })
        // Reuse the granted stream instead of asking the library to acquire another one.
        element!.srcObject = stream
        await scanner.start()
        if (disposed) releaseCamera()
      } catch (failure) {
        releaseCamera()
        if (!disposed) setError(cameraError(failure))
      } finally {
        opening = false
        if (!disposed) setStarting(false)
      }
    }
    retry.current = () => { void startCamera() }
    queueMicrotask(() => { if (!disposed) void startCamera() })
    return () => {
      disposed = true
      retry.current = () => {}
      releaseCamera()
      previousFocus?.focus()
    }
  }, [])
  return <div className="scanner-overlay" role="dialog" aria-modal="true" aria-labelledby="scanner-title" onKeyDown={event => {
    if (event.key === 'Escape') onClose()
    if (event.key === 'Tab') {
      const first = closeButton.current
      const last = retryButton.current ?? first
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}><div className="scanner-dialog">
    <div className="section-title"><h2 id="scanner-title">Escanea el código de ECIC</h2><button ref={closeButton} className="button secondary" onClick={onClose}>Cerrar</button></div>
    <p>Coloca todo el código QR dentro del recuadro azul y mantén el teléfono quieto. Se registrará automáticamente, sin tocar la pantalla.</p>
    {starting && <p role="status">Abriendo la cámara… Acepta el permiso si aparece.</p>}
    {error && <p className="feedback error" role="alert">{error}</p>}
    <div className="scanner-camera" style={error ? { display: 'none' } : undefined}>
      <video ref={video} muted autoPlay playsInline aria-label="Vista de la cámara" />
      <div ref={scanRegion} className="scanner-region" style={{ display: 'none' }} aria-hidden="true" />
    </div>
    {error && canRetry && <button ref={retryButton} className="button primary" onClick={() => { closeButton.current?.focus(); retry.current() }}>Reintentar cámara</button>}
  </div></div>
}
