import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowUpRight, Clock3 } from 'lucide-react'
import { config, supabase } from '../../lib/supabase'
import { loginIdentity, validCedula } from '../../lib/attendance'
import { SiteFooter } from '../../components/SiteFooter'

const clockFormatter = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function LoginClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return <div className="login-clock" title="Hora de Ecuador continental (UTC-5)">
    <Clock3 size={16} strokeWidth={1.8} aria-hidden="true" />
    <time dateTime={now.toISOString()} aria-label={`Hora de Ecuador: ${clockFormatter.format(now)}`}>{clockFormatter.format(now)}</time>
  </div>
}

export function Login() {
  const [cedula, setCedula] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || pending) return
    if (!validCedula(cedula)) { setError('Ingresa una cédula de 10 dígitos.'); return }
    setPending(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginIdentity(cedula), password })
      if (error) setError('No pudimos iniciar sesión. Revisa tu cédula y contraseña o comunícate con la administración.')
    } catch { setError('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.') }
    finally { setPending(false); setPassword('') }
  }
  return <div className="welcome">
    <a className="skip-link" href="#main">Ir al contenido</a>
    <header className="site-header"><a className="brand" href="/" aria-label="Asistencia Docente ECIC, inicio"><img className="brand-mark" src="/favicon.svg" alt="" width="43" height="43" /><span>Asistencia Docente ECIC</span></a><LoginClock /></header>
    <main id="main" tabIndex={-1}>
      <section className="login-card" aria-labelledby="login-title"><h1 id="login-title">Asistencia Docente ECIC</h1><p>Ingresa con los datos de tu cuenta institucional.</p>
        {!config.ready && <div className="feedback notice" role="status"><h3>Estamos preparando tu espacio</h3><p>El acceso estará disponible cuando termine la configuración de la institución.</p></div>}
        <form onSubmit={submit}>
          <label htmlFor="cedula">Cédula</label><input id="cedula" name="username" autoComplete="username" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required placeholder="Tu cédula de 10 dígitos" value={cedula} onChange={e => setCedula(e.target.value.replace(/\D/g, ''))} disabled={pending || !config.ready} />
          <label htmlFor="password">Contraseña</label><div className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={pending || !config.ready} /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div>
          {error && <p className="feedback error" role="alert">{error}</p>}
          <button className="button primary login-submit" disabled={pending || !config.ready}>{pending ? 'Ingresando…' : 'Ingresar'}<ArrowUpRight size={17} strokeWidth={1.9} aria-hidden="true" /></button>
        </form><p className="login-help">¿Olvidaste tu contraseña?<br />Solicita el restablecimiento a la <a href="https://wa.me/593967953821" target="_blank" rel="noopener noreferrer" aria-label="Contactar a administración por WhatsApp (se abre en una pestaña nueva)"><strong>administración</strong></a>.</p>
      </section>
    </main>
    <SiteFooter />
  </div>
}
