'use client'

import { useState } from 'react'
import { RefreshCw, Pencil, HelpCircle, Download, ChevronRight, BookOpen } from 'lucide-react'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import type { Draft } from '@/lib/mock-data'
import { cn } from '@/lib/cn'

type Props = {
  draft: Draft
}

const actions = [
  { id: 'continue', label: 'Continue', icon: ChevronRight, variant: 'primary' },
  { id: 'regenerate', label: 'Regenerate', icon: RefreshCw, variant: 'secondary' },
  { id: 'refine', label: 'Refine', icon: Pencil, variant: 'secondary' },
  { id: 'quiz', label: 'Make Quizzable', icon: HelpCircle, variant: 'secondary' },
  { id: 'export', label: 'Export', icon: Download, variant: 'ghost' },
]

export function DraftWorkspace({ draft }: Props) {
  const [activeAction, setActiveAction] = useState<string | null>(null)

  return (
    <div className="flex flex-col h-full">
      {/* Action bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-sf-border bg-sf-surface flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 mr-4">
          <TypeBadge type={draft.type} />
          <StatusBadge status={draft.status} />
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                onClick={() => setActiveAction(action.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  action.variant === 'primary'
                    ? 'bg-sf-accent text-white hover:bg-sf-accent-hover'
                    : action.variant === 'secondary'
                    ? 'bg-sf-surface-2 text-sf-text hover:bg-sf-border border border-sf-border'
                    : 'text-sf-muted hover:text-sf-text hover:bg-sf-surface-2',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {action.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left pane: source */}
        <div className="w-[320px] lg:w-[380px] flex-shrink-0 border-r border-sf-border overflow-y-auto bg-sf-surface-2">
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="h-4 w-4 text-sf-muted" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-sf-subtle">Source</h3>
            </div>

            <p className="text-xs font-medium text-sf-accent mb-1">{draft.source}</p>

            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-sf-border bg-sf-surface p-4">
                <p className="text-xs font-semibold text-sf-text mb-2">Context</p>
                <p className="text-xs text-sf-muted leading-relaxed">
                  This draft was generated from the course module content. The source material covers the foundational concepts, key arguments, and supporting evidence relevant to this topic.
                </p>
              </div>

              <div className="rounded-xl border border-sf-border bg-sf-surface p-4">
                <p className="text-xs font-semibold text-sf-text mb-3">Key Points</p>
                <ul className="space-y-2">
                  {[
                    'Primary sources and historical evidence',
                    'Economic and social impact analysis',
                    'Comparative frameworks across regions',
                    'Long-term consequences and modern relevance',
                  ].map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-sf-muted">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sf-accent-muted flex-shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-sf-border bg-sf-surface p-4">
                <p className="text-xs font-semibold text-sf-text mb-2">Generation settings</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-sf-muted">Type</span>
                    <span className="text-sf-text capitalize">{draft.type.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-sf-muted">Words</span>
                    <span className="text-sf-text">{draft.wordCount ?? '—'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-sf-muted">Updated</span>
                    <span className="text-sf-text">{draft.updatedAt}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right pane: output */}
        <div className="flex-1 overflow-y-auto px-8 py-7">
          {draft.status === 'generating' ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="h-10 w-10 rounded-full border-2 border-sf-accent border-t-transparent animate-spin" />
              <p className="text-sm font-medium text-sf-text">Generating your draft…</p>
              <p className="text-xs text-sf-muted">This usually takes 15–30 seconds.</p>
            </div>
          ) : draft.status === 'failed' ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <p className="text-sm font-medium text-sf-error">Generation failed</p>
              <p className="text-xs text-sf-muted max-w-xs">Something went wrong. Try regenerating or adjusting the source material.</p>
              <button className="text-xs text-sf-accent hover:underline">Try again</button>
            </div>
          ) : (
            <article className="prose prose-sm max-w-none">
              <h1 className="text-xl font-bold text-sf-text mb-2">{draft.title}</h1>
              <p className="text-xs text-sf-muted mb-6 not-prose">{draft.source}</p>

              {draft.excerpt && (
                <p className="text-sm text-sf-text leading-7 mb-4">{draft.excerpt}</p>
              )}

              <p className="text-sm text-sf-text leading-7 mb-4">
                The transformation of industrial economies during this period created unprecedented shifts in social structure, labor relations, and economic organization. Factory systems replaced cottage industries, drawing workers from rural areas into expanding urban centers where conditions were often dangerous and hours were long.
              </p>

              <h2 className="text-base font-semibold text-sf-text mt-6 mb-3">Economic Transformation</h2>
              <p className="text-sm text-sf-text leading-7 mb-4">
                Capital accumulation accelerated as mechanized production dramatically reduced per-unit costs while increasing output capacity. This created a virtuous cycle of investment in new technology, further driving down costs and expanding markets. The rise of the joint-stock company enabled broader capital formation, democratizing investment while concentrating industrial control.
              </p>

              <h2 className="text-base font-semibold text-sf-text mt-6 mb-3">Social Consequences</h2>
              <p className="text-sm text-sf-text leading-7 mb-4">
                Urban population growth strained municipal infrastructure, creating public health crises that ultimately spurred modern sanitation and public health movements. The emergence of a distinct working class consciousness laid groundwork for organized labor movements, while middle-class expansion created new markets for consumer goods and professional services.
              </p>

              <div className="mt-8 p-4 rounded-xl bg-sf-accent-light border border-sf-accent/20 not-prose">
                <p className="text-xs font-semibold text-sf-accent mb-1">AI-generated content</p>
                <p className="text-xs text-sf-muted">This draft was generated from your course materials. Review and edit before submitting.</p>
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
