import { Link } from 'react-router'
import { adminLoginIdentity, validAdminUsername } from '../../lib/roles'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { config, supabase } from '../../lib/supabase'
import { loginIdentity, validCedula } from '../../lib/attendance'
import { PublicLayout } from '../../components/PublicLayout'

export function Login({ admin = false }: { admin?: boolean }) {
  const [cedula, setCedula] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || pending) return
    if (admin ? !validAdminUsername(cedula.trim()) : !validCedula(cedula)) { setError(admin ? 'Ingresa un nombre de usuario válido.' : 'Ingresa una cédula de 10 dígitos.'); return }
    setPending(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: admin ? adminLoginIdentity(cedula) : loginIdentity(cedula), password })
      if (error) setError(admin ? 'No pudimos iniciar sesión. Revisa tu usuario y contraseña.' : 'No pudimos iniciar sesión. Revisa tu cédula y contraseña o comunícate con la administración.')
    } catch { setError('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.') }
    finally { setPending(false); setPassword('') }
  }
  return <PublicLayout>
      <section className="ui-card auth-card" aria-labelledby="login-title"><h1 id="login-title">{admin ? 'Administración ECIC' : 'Asistencia Docente ECIC'}</h1><p>{admin ? 'Ingresa con tu cuenta de administrador.' : 'Ingresa con los datos de tu cuenta institucional.'}</p>
        {!config.ready && <div className="feedback notice" role="status"><h3>Estamos preparando tu espacio</h3><p>El acceso estará disponible cuando termine la configuración de la institución.</p></div>}
        <form onSubmit={submit} aria-busy={pending}>
          <label htmlFor="cedula">{admin ? 'Usuario' : 'Cédula'}</label><input id="cedula" name="username" autoComplete="username" inputMode={admin ? "text" : "numeric"} pattern={admin ? "[A-Za-z][A-Za-z0-9_]{2,63}" : "[0-9]{10}"} maxLength={admin ? 64 : 10} required placeholder={admin ? "Tu nombre de usuario" : "Tu cédula de 10 dígitos"} autoCapitalize="none" spellCheck={false} value={cedula} onChange={e => setCedula(admin ? e.target.value : e.target.value.replace(/\D/g, ''))} disabled={pending || !config.ready} />
          <label htmlFor="password">Contraseña</label><div className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={pending || !config.ready} /><button type="button" onClick={() => setShowPassword(v => !v)} aria-pressed={showPassword} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>
          {error && <p className="feedback error" role="alert">{error}</p>}
          <button className="button primary login-submit" disabled={pending || !config.ready}>{pending ? 'Ingresando…' : 'Ingresar'}{pending ? <LoaderCircle className="loading-spinner" size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}</button>
        </form><p className="login-help">¿Olvidaste tu contraseña?<br />Solicita el restablecimiento a la <a href="https://wa.me/593967953821" target="_blank" rel="noopener noreferrer" aria-label="Contactar a administración por WhatsApp (se abre en una pestaña nueva)"><strong>administración</strong></a>.</p>
        <p className="login-help"><Link to={admin ? "/" : "/admin/login"}>{admin ? "Volver al ingreso del personal" : "Entrar como administrador"}</Link></p>
      </section>
  </PublicLayout>
}
