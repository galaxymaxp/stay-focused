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
        </Link>
      ))}
    </div>
  )
}
