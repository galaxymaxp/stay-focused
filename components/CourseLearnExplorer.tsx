import Link from 'next/link'
import type { CourseLearnModuleCard } from '@/lib/course-learn-overview'

export function CourseLearnExplorer({ modules }: { modules: CourseLearnModuleCard[] }) {
  return (
    <div style={{ display: 'grid', gap: '0.65rem' }}>
      {modules.map((module, index) => (
        <Link
          key={module.id}
          href={module.moduleHref}
          className={`ui-interactive-card motion-card motion-delay-${Math.min(index + 1, 4)}`}
          style={{
            borderRadius: 'var(--radius-panel)',
            border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
            background: 'color-mix(in srgb, var(--surface-soft) 94%, transparent)',
            boxShadow: 'var(--shadow-low)',
            padding: '0.86rem 0.9rem',
            display: 'grid',
            gap: '0.35rem',
            textDecoration: 'none',
          }}
        >
          {module.orderLabel && (
            <span className="ui-kicker" style={{ color: 'var(--text-muted)' }}>{module.orderLabel}</span>
          )}
          <h2 style={{ margin: 0, fontSize: '18px', lineHeight: 1.28, fontWeight: 650, color: 'var(--text-primary)' }}>
            {module.title}
          </h2>
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
            {module.summary}
          </p>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.12rem' }}>
            <MiniPill label={`${module.studyCount} sources`} tone={module.readinessTone === 'ready' ? 'accent' : 'muted'} />
            <MiniPill label={`${module.studyMaterials.filter((item) => item.readinessLabel === 'Ready').length} ready`} tone="accent" />
            <MiniPill
              label={`${module.studyMaterials.filter((item) => item.readinessLabel === 'Partial' || item.deepLearnStatus === 'blocked').length} need action`}
              tone="warning"
            />
            <MiniPill
              label={`${module.studyMaterials.filter((item) => item.readinessLabel === 'Unsupported' || item.readinessLabel === 'Link only' || item.readinessLabel === 'Source first').length} reference`}
              tone="muted"
            />
          </div>
        </Link>
      ))}
    </div>
  )
}

function MiniPill({ label, tone }: { label: string; tone: 'accent' | 'warning' | 'muted' }) {
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 42%, var(--surface-soft) 58%)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'

  return (
    <span style={{
      display: 'inline-flex',
      padding: '0.2rem 0.48rem',
      borderRadius: '999px',
      border: '1px solid var(--border-subtle)',
      background,
      color: 'var(--text-primary)',
      fontSize: '11px',
      fontWeight: 700,
    }}>
      {label}
    </span>
  )
}
