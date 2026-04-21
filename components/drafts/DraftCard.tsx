import Link from 'next/link'
import { ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import type { Draft } from '@/lib/mock-data'
import { cn } from '@/lib/cn'

type Props = {
  draft: Draft
}

export function DraftCard({ draft }: Props) {
  const isGenerating = draft.status === 'generating'
  const isFailed = draft.status === 'failed'

  return (
    <Link
      href={`/drafts/${draft.id}`}
      className={cn(
        'group flex items-start gap-4 rounded-xl border bg-sf-surface p-5 hover:shadow-sm transition-all',
        isFailed ? 'border-sf-error-bg hover:border-sf-error/30' : 'border-sf-border hover:border-sf-border',
      )}
    >
      {/* Type icon indicator */}
      <div className={cn(
        'h-10 w-10 flex-shrink-0 rounded-xl flex items-center justify-center text-xs font-bold text-white',
        {
          'bg-sf-accent': draft.type === 'essay',
          'bg-sf-success': draft.type === 'study_guide',
          'bg-[#E8824B]': draft.type === 'notes',
          'bg-[#E84B9E]': draft.type === 'flashcards',
          'bg-sf-info': draft.type === 'template',
          'bg-sf-muted': draft.type === 'outline',
        }
      )}>
        {isGenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isFailed ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          draft.type.charAt(0).toUpperCase()
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <p className="text-sm font-semibold text-sf-text leading-5 group-hover:text-sf-accent transition-colors line-clamp-2">
            {draft.title}
          </p>
          <ArrowRight className="h-4 w-4 text-sf-border flex-shrink-0 mt-0.5 group-hover:text-sf-accent transition-colors" />
        </div>

        <p className="text-xs text-sf-muted mb-3 line-clamp-1">{draft.source}</p>

        {draft.excerpt && (
          <p className="text-xs text-sf-subtle leading-relaxed mb-3 line-clamp-2">{draft.excerpt}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={draft.type} />
          <StatusBadge status={draft.status} />
          {draft.wordCount && (
            <span className="text-xs text-sf-subtle">{draft.wordCount.toLocaleString()} words</span>
          )}
          <span className="text-xs text-sf-subtle ml-auto">{draft.updatedAt}</span>
        </div>
      </div>
    </Link>
  )
}
