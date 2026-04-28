import Link from 'next/link'
import { LibraryDeleteButton } from '@/components/drafts/LibraryDeleteButton'
import type { StudyLibraryItem } from '@/lib/types'

const kindLabels: Record<StudyLibraryItem['kind'], string> = {
  learning: 'Learning',
  task: 'Task',
}

export function DraftCard({ item }: { item: StudyLibraryItem }) {
  return (
    <article
      style={{
        borderRadius: 'var(--radius-tight)',
        border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
        background: 'color-mix(in srgb, var(--surface-elevated) 94%, transparent)',
        padding: '0.8rem 0.85rem',
        boxShadow: 'var(--shadow-low)',
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
      className="ui-interactive-card"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
        <Link
          href={item.href}
          style={{ display: 'grid', gap: '0.38rem', minWidth: 0, flex: 1, textDecoration: 'none' }}
        >
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.24rem 0.55rem',
              borderRadius: '999px',
              border: '1px solid var(--border-subtle)',
              background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
              fontSize: '11px',
              fontWeight: 700,
              lineHeight: 1.2,
              color: 'var(--text-primary)',
            }}>
              {kindLabels[item.kind]}
            </span>
            {item.subtitle ? <span className="ui-chip ui-chip-soft" style={{ fontSize: '11px', fontWeight: 700 }}>{item.subtitle}</span> : null}
          </div>

          <p style={{ margin: 0, fontSize: '0.93rem', lineHeight: 1.4, color: 'var(--text-primary)', fontWeight: 650 }}>
            {item.title}
          </p>

          {(item.courseTitle || item.moduleTitle || item.taskTitle) && (
            <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
              {buildContextLine(item)}
            </p>
          )}

          <p style={{ margin: '0.1rem 0 0', fontSize: '11px', lineHeight: 1.4, color: 'var(--text-muted)' }}>
            Updated {formatShortDate(item.updatedAt)}
          </p>
        </Link>
        <LibraryDeleteButton id={item.id} entryKind={item.entryKind} title={item.title} />
      </div>
    </article>
  )
}

function buildContextLine(item: StudyLibraryItem) {
  const parts = [item.courseTitle, item.moduleTitle].filter(Boolean)
  if (item.kind === 'task' && item.taskTitle && item.taskTitle !== item.title) parts.push(`Task: ${item.taskTitle}`)
  return parts.join(' / ')
}

function formatShortDate(value?: string) {
  if (!value) return 'recently'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
