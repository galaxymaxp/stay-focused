import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { DraftCard } from '@/components/drafts/DraftCard'
import type { StudyLibraryItem } from '@/lib/types'

interface CourseShelfProps {
  courseName: string
  courseCode: string
  items: StudyLibraryItem[]
  latestItemHref: string
  totalCount: number
  lastUpdated: string
}

export function CourseShelf({
  courseName,
  courseCode,
  items,
  latestItemHref,
  totalCount,
  lastUpdated,
}: CourseShelfProps) {
  return (
    <div
      className="section-shell"
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '1rem',
        padding: '0.85rem 1rem',
        borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent)',
        background: 'color-mix(in srgb, var(--surface-soft) 56%, transparent)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.28rem' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {courseName}
            </p>
            {courseCode && (
              <span style={{ flexShrink: 0, fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                {courseCode}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {totalCount} saved output{totalCount !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Updated {lastUpdated}</span>
          </div>
        </div>
        <Link
          href={latestItemHref}
          className="ui-button ui-button-ghost ui-button-xs"
          style={{ flexShrink: 0, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          Resume latest
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div style={{ padding: '0.85rem 1rem', display: 'grid', gap: '0.6rem' }}>
        {items.map((item) => (
          <DraftCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
