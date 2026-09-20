type PanelPlaceholderVariant = 'table' | 'list' | 'detail'

export function PanelPlaceholder({ label, variant = 'list' }: { label: string; variant?: PanelPlaceholderVariant }) {
  const rows = variant === 'detail' ? 3 : variant === 'table' ? 5 : 4
  return <section className={`panel-placeholder ${variant}`} role="status" aria-label={label} aria-busy="true">
    <div className="skeleton panel-placeholder-heading" />
    <div className="skeleton panel-placeholder-subheading" />
    <div className="panel-placeholder-rows">{Array.from({ length: rows }, (_, index) => <div className="skeleton panel-placeholder-row" key={index} />)}</div>
  </section>
}
