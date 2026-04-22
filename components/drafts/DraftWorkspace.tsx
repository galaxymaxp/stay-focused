'use client'

import { useState, useRef, useCallback, useTransition, useEffect } from 'react'
import {
  RefreshCw,
  Pencil,
  HelpCircle,
  Download,
  ChevronRight,
  BookOpen,
  Save,
  Trash2,
  X,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { simpleMarkdownToHtml } from '@/lib/markdown'
import {
  regenerateDraft,
  refineDraft,
  continueDraft,
  updateDraftBody,
  deleteDraft,
  makeQuizzable,
} from '@/actions/drafts'
import type { Draft } from '@/lib/types'

type Props = {
  draft: Draft
}

export function DraftWorkspace({ draft }: Props) {
  const [leftPct, setLeftPct] = useState(45)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(draft.bodyMarkdown)
  const [showRefine, setShowRefine] = useState(false)
  const [refineInput, setRefineInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [savePending, setSavePending] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save when editing
  useEffect(() => {
    if (!isEditing) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSavePending(true)
      startTransition(async () => {
        await updateDraftBody(draft.id, editContent)
        setSavePending(false)
      })
    }, 1500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [editContent, isEditing, draft.id])

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setLeftPct(Math.min(Math.max(pct, 25), 72))
    }

    const onUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  function handleAction(fn: () => Promise<void>) {
    setActionError(null)
    startTransition(async () => {
      try {
        await fn()
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  async function handleRefineSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!refineInput.trim()) return
    const instruction = refineInput.trim()
    setRefineInput('')
    setShowRefine(false)
    handleAction(() => refineDraft(draft.id, instruction))
  }

  function handleExport() {
    const blob = new Blob([draft.bodyMarkdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isWorking = isPending || draft.status === 'generating' || draft.status === 'refining'

  return (
    <div className="flex flex-col h-full">
      {/* Action bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-sf-border bg-sf-surface flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 mr-2">
          <TypeBadge type={draft.draftType} />
          <StatusBadge status={draft.status} />
        </div>

        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {isEditing ? (
            <>
              {savePending && (
                <span className="text-xs text-sf-muted flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              )}
              <button
                onClick={() => {
                  if (saveTimer.current) clearTimeout(saveTimer.current)
                  startTransition(async () => {
                    await updateDraftBody(draft.id, editContent)
                  })
                  setIsEditing(false)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sf-success text-white hover:opacity-90 transition-opacity"
              >
                <Check className="h-3.5 w-3.5" />
                Done
              </button>
              <button
                onClick={() => {
                  if (saveTimer.current) clearTimeout(saveTimer.current)
                  setEditContent(draft.bodyMarkdown)
                  setIsEditing(false)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-sf-muted hover:text-sf-text hover:bg-sf-surface-2 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleAction(() => continueDraft(draft.id))}
                disabled={isWorking}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sf-accent text-white hover:bg-sf-accent-hover transition-colors disabled:opacity-50"
              >
                {isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Continue
              </button>

              <button
                onClick={() => handleAction(() => regenerateDraft(draft.id))}
                disabled={isWorking}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sf-surface-2 text-sf-text hover:bg-sf-border border border-sf-border transition-colors disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>

              <button
                onClick={() => setShowRefine(!showRefine)}
                disabled={isWorking}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-50',
                  showRefine
                    ? 'bg-sf-accent-light border-sf-accent/30 text-sf-accent'
                    : 'bg-sf-surface-2 border-sf-border text-sf-text hover:bg-sf-border',
                )}
              >
                <Pencil className="h-3.5 w-3.5" />
                Refine
              </button>

              <button
                onClick={() => setIsEditing(true)}
                disabled={isWorking || draft.status !== 'ready'}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sf-surface-2 text-sf-text hover:bg-sf-border border border-sf-border transition-colors disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                Edit
              </button>

              <button
                onClick={() => handleAction(() => makeQuizzable(draft.id))}
                disabled={isWorking || !draft.sourceModuleId}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sf-surface-2 text-sf-text hover:bg-sf-border border border-sf-border transition-colors disabled:opacity-50"
                title={!draft.sourceModuleId ? 'Only available for module-sourced drafts' : undefined}
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Quiz
              </button>

              <button
                onClick={handleExport}
                disabled={!draft.bodyMarkdown}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-sf-muted hover:text-sf-text hover:bg-sf-surface-2 transition-colors disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>

              <button
                onClick={() => {
                  if (confirm('Delete this draft? This cannot be undone.')) {
                    handleAction(() => deleteDraft(draft.id))
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-sf-error hover:bg-sf-error-bg transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Refine input */}
      {showRefine && (
        <form
          onSubmit={handleRefineSubmit}
          className="flex items-center gap-2 px-4 py-2.5 border-b border-sf-border bg-sf-accent-light flex-shrink-0"
        >
          <Pencil className="h-3.5 w-3.5 text-sf-accent flex-shrink-0" />
          <input
            type="text"
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            placeholder="Describe what to change — e.g. 'add more practice questions' or 'simplify the definitions'"
            autoFocus
            className="flex-1 bg-transparent text-sm text-sf-text placeholder:text-sf-muted outline-none"
          />
          <button
            type="submit"
            disabled={!refineInput.trim()}
            className="rounded-lg px-3 py-1 text-xs font-semibold bg-sf-accent text-white hover:bg-sf-accent-hover disabled:opacity-50 transition-colors flex-shrink-0"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setShowRefine(false)}
            className="text-sf-muted hover:text-sf-text transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      )}

      {/* Error toast */}
      {actionError && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-sf-error-bg border-b border-sf-error/20 text-sf-error text-xs flex-shrink-0">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Two-pane split — stacks vertically on mobile */}
      <div
        ref={containerRef}
        className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0"
      >
        {/* LEFT: source pane — width controlled by drag on desktop */}
        <div
          data-left-pane
          className="flex-shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-sf-border bg-sf-surface-2"
        >
          <SourcePane draft={draft} />
        </div>

        {/* Drag divider — desktop only */}
        <div
          onMouseDown={startDrag}
          className="hidden lg:flex w-1 cursor-col-resize bg-sf-border hover:bg-sf-accent/40 flex-shrink-0 transition-colors items-center justify-center"
          style={{ touchAction: 'none' }}
        />

        {/* RIGHT: draft pane */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <DraftPane
            draft={draft}
            isEditing={isEditing}
            editContent={editContent}
            onEditChange={setEditContent}
            isWorking={isWorking}
          />
        </div>
      </div>

      {/* Desktop: left pane width from drag state */}
      <style>{`
        @media (min-width: 1024px) {
          [data-left-pane] { width: ${leftPct}%; }
        }
      `}</style>
    </div>
  )
}

// ─── Source pane ─────────────────────────────────────────────────────────────

function SourcePane({ draft }: { draft: Draft }) {
  return (
    <div className="px-5 py-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="h-4 w-4 text-sf-muted flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-widest text-sf-subtle">Source</span>
        <TypeBadge type={draft.sourceType} />
      </div>

      <p className="text-sm font-semibold text-sf-text mb-1 leading-snug">{draft.sourceTitle}</p>
      {draft.refinementHistory.length > 0 && (
        <p className="text-xs text-sf-muted mb-3">
          {draft.refinementHistory.length} refinement{draft.refinementHistory.length !== 1 ? 's' : ''}
        </p>
      )}

      <div className="mt-4 rounded-xl border border-sf-border bg-sf-surface overflow-hidden">
        <div className="px-3 py-2 border-b border-sf-border bg-sf-surface-2 flex items-center gap-2">
          <span className="text-xs font-medium text-sf-muted">Source Material</span>
        </div>
        <div className="px-4 py-4 overflow-auto max-h-[calc(100vh-280px)]">
          <pre className="text-xs text-sf-text leading-relaxed whitespace-pre-wrap font-sans break-words">
            {draft.sourceRawContent || 'No source content available.'}
          </pre>
        </div>
      </div>

      {draft.tokenCount && (
        <div className="mt-4 flex gap-4 text-xs text-sf-muted">
          <span>{draft.tokenCount.toLocaleString()} tokens</span>
          {draft.generationModel && <span>{draft.generationModel}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Draft pane ───────────────────────────────────────────────────────────────

type DraftPaneProps = {
  draft: Draft
  isEditing: boolean
  editContent: string
  onEditChange: (value: string) => void
  isWorking: boolean
}

function DraftPane({ draft, isEditing, editContent, onEditChange, isWorking }: DraftPaneProps) {
  if (draft.status === 'generating' || (isWorking && !draft.bodyMarkdown)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="h-10 w-10 rounded-full border-2 border-sf-accent border-t-transparent animate-spin" />
        <p className="text-sm font-medium text-sf-text">Generating your draft…</p>
        <p className="text-xs text-sf-muted">This usually takes 20–40 seconds depending on content length.</p>
      </div>
    )
  }

  if (draft.status === 'refining' || (isWorking && draft.bodyMarkdown)) {
    return (
      <div className="relative">
        <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 pointer-events-none">
          <div className="flex items-center gap-3 rounded-xl bg-sf-surface border border-sf-border shadow-lg px-5 py-3 pointer-events-auto">
            <Loader2 className="h-4 w-4 animate-spin text-sf-accent" />
            <span className="text-sm font-medium text-sf-text">Refining…</span>
          </div>
        </div>
        <div className="opacity-40 pointer-events-none">
          <MarkdownBody content={draft.bodyMarkdown} />
        </div>
      </div>
    )
  }

  if (draft.status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <AlertCircle className="h-10 w-10 text-sf-error" />
        <p className="text-sm font-medium text-sf-error">Generation failed</p>
        <p className="text-xs text-sf-muted max-w-sm">
          Something went wrong while generating this draft. Try regenerating, or check that your source material has sufficient content.
        </p>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className="h-full p-6 flex flex-col">
        <p className="text-xs text-sf-muted mb-3">Editing — changes auto-save after 1.5s of inactivity.</p>
        <textarea
          value={editContent}
          onChange={(e) => onEditChange(e.target.value)}
          className="flex-1 w-full resize-none rounded-xl border border-sf-accent/40 bg-sf-surface px-4 py-3 text-sm text-sf-text font-mono leading-relaxed focus:outline-none focus:border-sf-accent"
          spellCheck={false}
        />
      </div>
    )
  }

  if (!draft.bodyMarkdown) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
        <p className="text-sm text-sf-muted">No content yet. Try regenerating.</p>
      </div>
    )
  }

  return <MarkdownBody content={draft.bodyMarkdown} />
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <article
      className="prose prose-sm max-w-none px-8 py-7
        prose-headings:text-sf-text prose-headings:font-semibold
        prose-p:text-sf-text prose-p:leading-7
        prose-strong:text-sf-text
        prose-li:text-sf-text
        prose-code:text-sf-accent prose-code:bg-sf-surface-2 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-sf-surface-2 prose-pre:border prose-pre:border-sf-border prose-pre:rounded-xl
        prose-blockquote:border-sf-accent prose-blockquote:text-sf-muted
        prose-hr:border-sf-border
        prose-a:text-sf-accent
        [&_h1]:text-xl [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:pb-2 [&_h1]:border-b [&_h1]:border-sf-border
        [&_h2]:text-base [&_h2]:mt-6 [&_h2]:mb-3
        [&_h3]:text-sm [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-semibold
        [&_ul]:space-y-1 [&_ol]:space-y-1
        [&_li]:leading-6"
      dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content) }}
    />
  )
}
