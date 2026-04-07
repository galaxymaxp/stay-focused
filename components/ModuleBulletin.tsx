'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { Course, Module } from '@/lib/types'

/**
 * Surfaces the freshest processed module on the Home page as a bulletin card.
 * Gives students immediate awareness of newly posted content without
 * requiring them to navigate to Learn first.
 */
export function ModuleBulletin({ module, course }: { module: Module; course: Course | null }) {
  const concepts = module.concepts?.slice(0, 3) ?? []

  return (
    <section className="glass-panel glass-soft motion-card" style={bulletinCardStyle} aria-label="Latest module">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <span className="ui-chip" style={newBadgeStyle}>Latest module</span>
            {course && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{course.name}</span>
            )}
            <ReleasedLabel value={module.released_at ?? module.created_at} />
          </div>

          <Link href={`/modules/${module.id}/learn`} style={{ textDecoration: 'none' }}>
            <h2 style={titleStyle}>{module.title}</h2>
          </Link>

          {module.summary && (
            <p style={summaryStyle}>{module.summary}</p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end', flexShrink: 0 }}>
          {module.estimated_minutes && (
            <span className="ui-chip" style={effortPillStyle}>
              {module.estimated_minutes} min review
            </span>
          )}
          {module.priority_signal === 'high' && (
            <span className="ui-chip" style={priorityPillStyle}>High priority</span>
          )}
        </div>
      </div>

      {concepts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
          <span style={conceptsLabelStyle}>Key ideas</span>
          {concepts.map((concept, i) => (
            <span key={i} className="ui-chip" style={conceptPillStyle}>{concept}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
        <Link href={`/modules/${module.id}/learn`} className="ui-button ui-button-secondary" style={actionButtonStyle}>
          Open in Learn
        </Link>
        <Link href={`/modules/${module.id}/do`} className="ui-button ui-button-ghost" style={actionButtonStyle}>
          See tasks
        </Link>
      </div>
    </section>
  )
}

function ReleasedLabel({ value }: { value: string | undefined }) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  const label = daysAgo === 0
    ? 'Posted today'
    : daysAgo === 1
      ? 'Posted yesterday'
      : daysAgo <= 6
        ? `Posted ${daysAgo} days ago`
        : `Posted ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)}`
  return <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
}

const bulletinCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-page)',
  padding: '1.2rem 1.35rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.9rem',
}

const newBadgeStyle: CSSProperties = {
  padding: '0.22rem 0.6rem',
  fontSize: '11px',
  fontWeight: 700,
  background: 'color-mix(in srgb, var(--green-light) 55%, var(--surface-soft) 45%)',
  color: 'var(--green)',
  border: '1px solid color-mix(in srgb, var(--green) 22%, var(--border-subtle) 78%)',
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '22px',
  lineHeight: 1.12,
  fontWeight: 650,
  letterSpacing: '-0.03em',
  color: 'var(--text-primary)',
}

const summaryStyle: CSSProperties = {
  margin: '0.5rem 0 0',
  maxWidth: '54rem',
  fontSize: '14px',
  lineHeight: 1.65,
  color: 'var(--text-secondary)',
}

const effortPillStyle: CSSProperties = {
  padding: '0.22rem 0.6rem',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
}

const priorityPillStyle: CSSProperties = {
  padding: '0.22rem 0.6rem',
  fontSize: '11px',
  fontWeight: 700,
  background: 'color-mix(in srgb, var(--amber-light) 55%, var(--surface-soft) 45%)',
  color: 'var(--amber)',
  border: '1px solid color-mix(in srgb, var(--amber) 22%, var(--border-subtle) 78%)',
}

const conceptsLabelStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginRight: '0.15rem',
}

const conceptPillStyle: CSSProperties = {
  padding: '0.22rem 0.65rem',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
}

const actionButtonStyle: CSSProperties = {
  minHeight: '2.4rem',
  padding: '0.6rem 0.95rem',
  fontSize: '13px',
}
