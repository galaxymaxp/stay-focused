import type { CSSProperties, ReactNode } from 'react'

export function WorkspacePanel({
  title,
  children,
  style,
}: {
  title: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', ...style }}>
      <p className="ui-kicker">{title}</p>
      <div style={{ marginTop: '0.6rem' }}>{children}</div>
    </section>
  )
}
