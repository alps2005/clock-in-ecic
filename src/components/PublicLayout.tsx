import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Clock3 } from 'lucide-react'
import { schoolTimezone } from '../lib/attendance'
import { SiteFooter } from './SiteFooter'

const clockFormatter = new Intl.DateTimeFormat('es-EC', {
  timeZone: schoolTimezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function SchoolClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <div className="public-clock" title="Hora de Ecuador continental (UTC-5)">
    <Clock3 size={16} aria-hidden="true" />
    <div><span>Hora de Ecuador</span><time dateTime={now.toISOString()} aria-label={`Hora de Ecuador: ${clockFormatter.format(now)}`}>{clockFormatter.format(now)}</time></div>
  </div>
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="teacher-ui public-shell">
    <a className="skip-link" href="#main">Ir al contenido</a>
    <div className="public-frame">
      <header className="public-topbar">
        <a className="public-brand" href="/" aria-label="ECIC Clock-in, inicio">
          <img src="/favicon.svg" width="36" height="36" alt="" />
          <div><strong>ECIC Clock-in</strong><small>Gestión de personal docente</small></div>
        </a>
        <SchoolClock />
      </header>
      <main id="main" tabIndex={-1} className="public-content">{children}</main>
      <SiteFooter />
    </div>
  </div>
}
