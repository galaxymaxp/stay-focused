import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { DraftCard } from '@/components/drafts/DraftCard'
import type { DraftShelfItem } from '@/lib/types'

interface CourseShelfProps {
  courseName: string
  courseCode: string
  drafts: DraftShelfItem[]
  latestDraftId: string
  totalCount: number
  quizReadyCount: number
  statusBreakdown: { ready: number; inProgress: number; needsAttention: number }
  lastUpdated: string
}

export function CourseShelf({
  courseName,
  courseCode,
  drafts,
  latestDraftId,
  totalCount,
  quizReadyCount,
  statusBreakdown,
  lastUpdated,
}: CourseShelfProps) {
  const statusParts: string[] = []
  if (statusBreakdown.ready > 0) statusParts.push(`${statusBreakdown.ready} ready`)
  if (statusBreakdown.inProgress > 0) statusParts.push(`${statusBreakdown.inProgress} in progress`)
  if (statusBreakdown.needsAttention > 0) statusParts.push(`${statusBreakdown.needsAttention} needs attention`)
  const statusText = statusParts.join(', ')

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
            {quizReadyCount > 0 && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--blue)' }}>
                {quizReadyCount} quiz-ready
              </span>
            )}
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Updated {lastUpdated}</span>
            {statusText && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{statusText}</span>}
          </div>
        </div>
        <Link
          href={`/library/${latestDraftId}`}
          className="ui-button ui-button-ghost ui-button-xs"
          style={{ flexShrink: 0, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          Resume latest
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div style={{ padding: '0.85rem 1rem', display: 'grid', gap: '0.6rem' }}>
        {drafts.map((d) => (
          <DraftCard key={d.id} draft={d} />
        ))}
      </div>
    </div>
  )
}
