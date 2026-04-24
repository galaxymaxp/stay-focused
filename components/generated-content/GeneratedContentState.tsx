import type { CSSProperties, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function GeneratedContentState({
  title,
  description,
  action,
  loading = false,
  tone = 'default',
  align = 'start',
  kicker,
}: {
  title: string
  description?: string
  action?: ReactNode
  loading?: boolean
  tone?: 'default' | 'accent' | 'warning' | 'danger'
  align?: 'start' | 'center'
  kicker?: string
}) {
  return (
    <div className="ui-empty" style={containerStyle(tone, align)}>
      {kicker ? (
        <p className="ui-kicker" style={{ margin: 0 }}>
          {kicker}
        </p>
      ) : null}
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      <strong style={{ color: 'var(--text-primary)', fontSize: '15px', lineHeight: 1.4 }}>
        {title}
      </strong>
      {description ? (
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)', maxWidth: align === 'center' ? '32rem' : '42rem' }}>
          {description}
        </p>
      ) : null}
      {action ? (
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {action}
        </div>
      ) : null}
    </div>
  )
}

function containerStyle(
  tone: 'default' | 'accent' | 'warning' | 'danger',
  align: 'start' | 'center',
): CSSProperties {
  const border = tone === 'accent'
    ? 'color-mix(in srgb, var(--accent-border) 34%, var(--border-subtle) 66%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
      : tone === 'danger'
        ? 'color-mix(in srgb, var(--red) 24%, var(--border-subtle) 76%)'
        : 'color-mix(in srgb, var(--border-subtle) 84%, transparent)'
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 36%, var(--surface-elevated) 64%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 24%, var(--surface-elevated) 76%)'
      : tone === 'danger'
        ? 'color-mix(in srgb, var(--red-light) 22%, var(--surface-elevated) 78%)'
        : 'color-mix(in srgb, var(--surface-soft) 78%, transparent)'

  return {
    borderRadius: 'var(--radius-panel)',
    padding: '1rem',
    display: 'grid',
    gap: '0.55rem',
    border: `1px solid ${border}`,
    background,
    textAlign: align,
    justifyItems: align === 'center' ? 'center' : 'start',
  }
}
