import Link from 'next/link'
import { Plus, FileText } from 'lucide-react'
import { DraftCard } from '@/components/drafts/DraftCard'
import { drafts } from '@/lib/mock-data'

export default function DraftsPage() {
  const ready = drafts.filter((d) => d.status === 'ready')
  const active = drafts.filter((d) => d.status === 'in_progress' || d.status === 'generating')
  const failed = drafts.filter((d) => d.status === 'failed')

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 lg:px-10 lg:py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-sf-text">Drafts</h1>
          <p className="text-sm text-sf-muted mt-1">{drafts.length} study outputs</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-sf-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-sf-accent-hover transition-colors">
          <Plus className="h-4 w-4" />
          New Draft
        </button>
      </div>

      <div className="space-y-8">
        {active.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-sf-subtle mb-3">In Progress</h2>
            <div className="space-y-3">
              {active.map((d) => <DraftCard key={d.id} draft={d} />)}
            </div>
          </section>
        )}

        {ready.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-sf-subtle mb-3">Ready</h2>
            <div className="space-y-3">
              {ready.map((d) => <DraftCard key={d.id} draft={d} />)}
            </div>
          </section>
        )}

        {failed.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-sf-subtle mb-3">Failed</h2>
            <div className="space-y-3">
              {failed.map((d) => <DraftCard key={d.id} draft={d} />)}
            </div>
          </section>
        )}

        {drafts.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sf-surface border border-sf-border mb-4">
              <FileText className="h-5 w-5 text-sf-subtle" />
            </div>
            <p className="text-sm font-medium text-sf-text">No drafts yet</p>
            <p className="text-xs text-sf-muted mt-1">Open a course task and generate your first draft.</p>
          </div>
        )}
      </div>
    </div>
  )
}
