import { useState } from 'react'
import type { FormEvent } from 'react'
import { PublicLayout } from '../../components/PublicLayout'
import { supabase } from '../../lib/supabase'
import { useRemote } from '../../app/useRemote'

async function listFactors() {
  const { data, error } = await supabase!.auth.mfa.listFactors()
  if (error) throw error
  return data
}

type Enrollment = { id: string; qr: string; secret: string }

export function AdminMfa({ onVerified, logout, loggingOut, logoutError }: {
  onVerified: () => void; logout: () => void; loggingOut: boolean; logoutError: string
}) {
  const factors = useRemote(listFactors)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [selected, setSelected] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const verified = factors.data?.totp ?? []
  const factorId = enrollment?.id ?? (verified.some(factor => factor.id === selected) ? selected : verified[0]?.id)
  const busy = pending || loggingOut

  async function enroll() {
    if (busy) return
    setPending(true); setError(''); setEnrollment(null); setCode('')
    try {
      const current = await listFactors()
      // Another tab may have completed enrollment. Never remove a verified factor.
      if (current.totp.length) { factors.refresh(); return }
      for (const factor of current.all.filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified')) {
        const { error } = await supabase!.auth.mfa.unenroll({ factorId: factor.id })
        if (error) throw error
      }
      const { data, error } = await supabase!.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Clock-in ECIC', issuer: 'Clock-in ECIC' })
      if (error) throw error
      // The SDK prefixes raw SVG; encode characters such as '#' so they are not URL fragments.
      const prefix = 'data:image/svg+xml;utf-8,'
      const qr = data.totp.qr_code.startsWith(prefix)
        ? prefix + encodeURIComponent(data.totp.qr_code.slice(prefix.length)) : data.totp.qr_code
      setEnrollment({ id: data.id, qr, secret: data.totp.secret })
    } catch { setError('No pudimos preparar el autenticador. Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, contacta al responsable del sistema.') }
    finally { setPending(false) }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (busy || !factorId || !/^\d{6}$/.test(code)) return
    setPending(true); setError('')
    try {
      const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId, code })
      if (error) {
        setError('No pudimos verificar el código. Usa el código actual de tu autenticador y revisa que la hora del teléfono sea automática. Si hiciste varios intentos, espera antes de reintentar.')
        return
      }
      setEnrollment(null)
      // The SDK stores the upgraded session. Reload the server's authorization decision.
      onVerified()
    } catch { setError('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.') }
    finally { setCode(''); setPending(false) }
  }

  return <PublicLayout><section className="ui-card auth-card mfa-card" aria-labelledby="mfa-title">
    <h1 id="mfa-title">Verificación de administrador</h1>
    <p>Para proteger las cuentas y los registros de asistencia, confirma tu acceso con una aplicación de autenticación.</p>
    {factors.loading ? <p role="status">Comprobando tu autenticador…</p> : factors.error ? <>
      <p className="feedback error" role="alert">No pudimos consultar tu autenticador.</p>
      <button className="button secondary" onClick={factors.refresh} disabled={busy}>Reintentar</button>
    </> : <>
      {!factorId && <><p>Configura una aplicación de autenticación en tu teléfono. Solo tendrás que vincularla una vez.</p>
        <button className="button primary login-submit" onClick={() => void enroll()} disabled={busy}>{pending ? 'Preparando…' : 'Configurar autenticador'}</button></>}
      {enrollment && <div className="mfa-enrollment">
        <p>Escanea este QR con tu aplicación de autenticación y escribe el código de seis dígitos que aparece.</p>
        <img className="mfa-qr" src={enrollment.qr} alt="Código QR para vincular tu autenticador" width="240" height="240" />
        <details><summary>Ingresar clave manualmente</summary><code className="mfa-secret">{enrollment.secret}</code></details>
        <p>No compartas este QR, la clave ni tus códigos.</p>
      </div>}
      {factorId && <form onSubmit={event => void verify(event)} aria-busy={pending}>
        {!enrollment && verified.length > 1 && <><label htmlFor="mfa-factor">Autenticador</label><select id="mfa-factor" value={factorId} onChange={event => { setSelected(event.target.value); setCode(''); setError('') }} disabled={busy}>
          {verified.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Autenticador ${index + 1}`}</option>)}
        </select></>}
        <label htmlFor="mfa-code">Código de autenticación</label>
        <input id="mfa-code" name="one-time-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} aria-describedby="mfa-code-help" />
        <p id="mfa-code-help">Ingresa los seis dígitos que muestra tu aplicación.</p>
        <button className="button primary login-submit" disabled={busy || code.length !== 6}>{pending ? 'Verificando…' : 'Verificar y continuar'}</button>
      </form>}
    </>}
    {error && <p className="feedback error" role="alert">{error}</p>}
    <p className="login-help">¿Perdiste el acceso a tu autenticador? Contacta al responsable del sistema para recuperar tu cuenta.</p>
    {logoutError && <p className="feedback error" role="alert">{logoutError}</p>}
    <button className="button secondary mfa-logout" onClick={logout} disabled={busy}>{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
  </section></PublicLayout>
}
