import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { config, supabase } from '../../lib/supabase'
import { loginIdentity, validCedula } from '../../lib/attendance'

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
    <header className="site-header"><a className="brand" href="/" aria-label="Clock-in ECIC, inicio"><img className="brand-mark" src="/favicon.svg" alt="" width="43" height="43" /><span>ECIC <span className="brand-divider">/</span> <span className="brand-product">Clock-in</span></span></a><span className="header-label">ASISTENCIA DOCENTE</span></header>
    <main id="main" tabIndex={-1}>
      <section className="intro"><p className="eyebrow"><span /> PRESENTES, CADA DÍA</p><h1>Cada día<br />cuenta<span className="accent">.</span></h1><p className="intro-copy">Tu jornada, tu asistencia.<br />Un espacio para nuestra comunidad docente.</p><div className="preparation-note"><span className="note-icon" aria-hidden="true"><ArrowUpRight size={20} strokeWidth={1.8} /></span><div><h2>Tiempo para enseñar. Espacio para crecer.</h2><p>Registra tu entrada y salida, y consulta tu historial en un solo lugar.</p></div></div></section>
      <section className="login-card" aria-labelledby="login-title"><span className="card-eyebrow">BIENVENIDO A TU ESPACIO</span><h2 id="login-title">Inicia tu jornada.</h2><p>Ingresa con los datos de tu cuenta institucional.</p>
        {!config.ready && <div className="feedback notice" role="status"><h3>Estamos preparando tu espacio</h3><p>El acceso estará disponible cuando termine la configuración de la institución.</p></div>}
        <form onSubmit={submit}>
          <label htmlFor="cedula">Cédula</label><input id="cedula" name="username" autoComplete="username" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required placeholder="Tu cédula de 10 dígitos" value={cedula} onChange={e => setCedula(e.target.value.replace(/\D/g, ''))} disabled={pending || !config.ready} />
          <label htmlFor="password">Contraseña</label><div className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={pending || !config.ready} /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div>
          {error && <p className="feedback error" role="alert">{error}</p>}
          <button className="button primary login-submit" disabled={pending || !config.ready}>{pending ? 'Ingresando…' : 'Ingresar'}<ArrowUpRight size={17} strokeWidth={1.9} aria-hidden="true" /></button>
        </form><p className="login-help">¿Olvidaste tu contraseña?<br />Solicita el restablecimiento a la administración.</p>
      </section>
    </main><footer className="site-footer"><span>ECIC · Clock-in</span><span>Hecho para nuestra comunidad.</span></footer>
  </div>
}
