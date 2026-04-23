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
    <div className="rounded-2xl border border-sf-border bg-sf-surface overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-sf-border bg-sf-surface-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-sf-text truncate">{courseName}</p>
            {courseCode && (
              <span className="shrink-0 text-xs font-mono text-sf-subtle">{courseCode}</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-sf-muted">
              {totalCount} draft{totalCount !== 1 ? 's' : ''}
            </span>
            {quizReadyCount > 0 && (
              <span className="text-xs font-medium text-purple-500">{quizReadyCount} quiz-ready</span>
            )}
            <span className="text-xs text-sf-subtle">Updated {lastUpdated}</span>
            {statusText && <span className="text-xs text-sf-subtle">{statusText}</span>}
          </div>
        </div>
        <Link
          href={`/drafts/${latestDraftId}`}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-sf-border bg-sf-surface px-3 py-1.5 text-xs font-medium text-sf-text hover:bg-sf-surface-2 hover:border-sf-border transition-colors"
        >
          Resume latest
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="p-5 space-y-3">
        {drafts.map((d) => (
          <DraftCard key={d.id} draft={d} />
        ))}
      </div>
    </div>
  )
}
