import type { Report } from '../../types/app'

const groups = [
  { title: 'Entradas', cards: [
    { key: 'entry_on_time', title: 'A tiempo', description: 'Entradas realizadas a tiempo' },
    { key: 'entry_late', title: 'Atrasos', description: 'Entradas realizadas con atraso' },
    { key: 'missing_entry', title: 'Sin entrada', description: 'Registros sin entrada marcada' },
  ] },
  { title: 'Salidas', cards: [
    { key: 'exit_on_time', title: 'A tiempo', description: 'Salidas realizadas a tiempo' },
    { key: 'exit_late', title: 'Atrasos', description: 'Salidas realizadas con atraso' },
    { key: 'missing_exit', title: 'Sin salida', description: 'Registros sin salida marcada' },
  ] },
] as const

export function AttendanceStats({ totals, admin = false }: { totals: Report['totals']; admin?: boolean }) {
  return <div className="attendance-stats">
    {groups.map(({ title, cards }) => <section className="attendance-stat-group" aria-label={title} key={title}>
      <h2>{title}</h2>
      <div className={admin ? 'ecic-metrics-grid' : 'stats-grid'}>
        {cards.map(({ key, title, description }) => <StatCard key={key} title={title} description={description} value={totals[key]} admin={admin} warning={!key.endsWith('on_time')} />)}
      </div>
    </section>)}
    <section className="attendance-absence" aria-label="Faltas">
      <StatCard title="FALTAS" description="Registros no realizados" value={totals.absent} admin={admin} warning />
    </section>
  </div>
}

function StatCard({ title, description, value, admin, warning }: { title: string; description: string; value: number; admin: boolean; warning: boolean }) {
  return admin
    ? <div className={`ecic-stat-card${warning ? ' ecic-stat-card-warning' : ''}`}>
      <div className="ecic-stat-head"><span>{title}</span></div>
      <div className={`ecic-stat-value${warning ? ' warning' : ''}`}><strong>{value}</strong></div>
      <p>{description}</p>
    </div>
    : <div className="stat"><span>{title}</span><strong>{value}</strong><small>{description}</small></div>
}
