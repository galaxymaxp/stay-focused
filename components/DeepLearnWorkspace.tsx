'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, Download, Pencil, Save, X } from 'lucide-react'
import { refineDraft, updateDraftBody } from '@/actions/drafts'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { DeepLearnReviewPackSurface } from '@/components/DeepLearnReviewPackSurface'
import { simpleMarkdownToHtml } from '@/lib/markdown'
import type { ModuleSourceResource } from '@/lib/module-workspace'
import type { DeepLearnNote, Draft } from '@/lib/types'

export function DeepLearnWorkspace({
  moduleId,
  courseId,
  resource,
  deepLearnResourceId,
  note,
  sourceHref,
  readerHref,
  readerLabel = 'Source detail',
  statusSummary,
  blockedMessage = null,
  legacyDraft = null,
  canGenerate = true,
}: {
  moduleId: string
  courseId: string | null
  resource: ModuleSourceResource
  deepLearnResourceId: string
  note: DeepLearnNote | null
  sourceHref: string | null
  readerHref: string
  readerLabel?: string
  statusSummary: string
  blockedMessage?: string | null
  legacyDraft?: Draft | null
  canGenerate?: boolean
}) {
  if (!note && legacyDraft) {
    return (
      <LegacyDraftWorkspace
        resource={resource}
        readerHref={readerHref}
        readerLabel={readerLabel}
        sourceHref={sourceHref}
        legacyDraft={legacyDraft}
      />
    )
  }

  const sourceText = resource.extractedText ?? resource.extractedTextPreview ?? ''
  const isImageOnly = resource.visualExtractionStatus === 'available'

  return (
    <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.1rem 1.15rem', display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 430px' }}>
          <p className="ui-kicker">Deep Learn</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>
            {note?.title ?? resource.title}
          </h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
            {statusSummary}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {canGenerate && (!note || note.status === 'failed') ? (
            <DeepLearnGenerateButton
              moduleId={moduleId}
              resourceId={deepLearnResourceId}
              courseId={courseId}
              label={note?.status === 'failed' ? 'Generate again' : 'Generate study pack'}
              className="ui-button ui-button-secondary ui-button-xs"
              resourceTitle={resource.title}
            />
          ) : null}
          {sourceHref && (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open original source
            </a>
          )}
          <Link href={readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            {readerLabel}
          </Link>
        </div>
      </div>

      {blockedMessage && note && (
        <GeneratedContentState
          title="This saved pack is still available, but its original source could not be reopened."
          description={blockedMessage}
          tone="warning"
        />
      )}

      <div className="deep-learn-build-grid">
        <PinnedSourcePane
          resourceTitle={resource.title}
          sourceText={sourceText}
          isImageOnly={isImageOnly}
          sourceHref={sourceHref}
          readerHref={readerHref}
          readerLabel={readerLabel}
        />

        <div className="glass-panel glass-soft deep-learn-review-pane" style={{ borderRadius: 'var(--radius-panel)', minHeight: 0, overflow: 'hidden' }}>
          {!note ? (
            <PackEmptyState
              title="No saved learning pack yet."
              body="Generate structured notes, key terms, review questions, and quiz-ready study material from this source."
            />
          ) : note.status === 'pending' ? (
            <PackEmptyState
              title="Generating study pack..."
              body={note.overview || 'Deep Learn is building your saved study pack from the pinned source.'}
              loading
              tone="accent"
            />
          ) : note.status === 'failed' ? (
            <PackEmptyState
              title="Couldn't generate this yet."
              body="Try again, or open the source and check that it has readable content."
              tone="warning"
            />
          ) : (
            <div style={{ padding: '0.9rem' }}>
              <DeepLearnReviewPackSurface note={note} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function LegacyDraftWorkspace({
  resource,
  readerHref,
  readerLabel,
  sourceHref,
  legacyDraft,
}: {
  resource: ModuleSourceResource
  readerHref: string
  readerLabel: string
  sourceHref: string | null
  legacyDraft: Draft
}) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [body, setBody] = useState(legacyDraft.bodyMarkdown ?? '')
  const [showRefine, setShowRefine] = useState(false)
  const [refineInput, setRefineInput] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorTone, setErrorTone] = useState<'save' | 'refine'>('save')
  const [savePending, setSavePending] = useState(false)
  const [isPending, startTransition] = useTransition()
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    setBody(legacyDraft.bodyMarkdown ?? '')
    setIsEditing(false)
    setShowRefine(false)
    setRefineInput('')
    setErrorMessage(null)
    setErrorTone('save')
    setSavePending(false)
  }, [legacyDraft.bodyMarkdown, legacyDraft.id, legacyDraft.updatedAt])

  useEffect(() => {
    if (!isEditing) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)

    saveTimer.current = window.setTimeout(() => {
      setSavePending(true)
      startTransition(async () => {
        try {
          await updateDraftBody(legacyDraft.id, body)
          router.refresh()
        } catch (error) {
          console.error('Legacy draft autosave failed:', error)
          setErrorTone('save')
          setErrorMessage("Couldn't save your work. Your draft is still on screen. Try saving again before leaving.")
        } finally {
          setSavePending(false)
        }
      })
    }, 1500)

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [body, isEditing, legacyDraft.id, router, startTransition])

  function saveNow() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setSavePending(true)
    setErrorMessage(null)
    startTransition(async () => {
      try {
        await updateDraftBody(legacyDraft.id, body)
        setIsEditing(false)
        router.refresh()
      } catch (error) {
        console.error('Legacy draft save failed:', error)
        setErrorTone('save')
        setErrorMessage("Couldn't save your work. Your draft is still on screen. Try saving again before leaving.")
      } finally {
        setSavePending(false)
      }
    })
  }

  function refine(event: FormEvent) {
    event.preventDefault()
    if (!refineInput.trim()) return

    const instruction = refineInput.trim()
    setRefineInput('')
    setShowRefine(false)
    setErrorMessage(null)
    startTransition(async () => {
      try {
        await refineDraft(legacyDraft.id, instruction)
        router.refresh()
      } catch (error) {
        console.error('Legacy draft refine failed:', error)
        setErrorTone('refine')
        setErrorMessage("Couldn't refine this yet. Try again, or reopen the source and check that it has readable content.")
      }
    })
  }

  function exportMarkdown() {
    const blob = new Blob([body], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${(legacyDraft.title ?? resource.title).replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const sourceText = resource.extractedText ?? resource.extractedTextPreview ?? ''
  const isWorking = isPending || savePending || legacyDraft.status === 'generating' || legacyDraft.status === 'refining'

  return (
    <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.1rem 1.15rem', display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 430px' }}>
          <p className="ui-kicker">Saved study output</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{legacyDraft.title}</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
            This older saved document still resumes here with its source context, but Learn now saves the exam prep pack itself instead of a second draft document.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {sourceHref && (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open original source
            </a>
          )}
          <Link href={readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            {readerLabel}
          </Link>
        </div>
      </div>

      {errorMessage && (
        <GeneratedContentState
          title={errorTone === 'save' ? "Couldn't save your work." : "Couldn't refine this yet."}
          description={errorMessage}
          tone="warning"
        />
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {savePending && (
            <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
              Saving...
            </span>
          )}
          {isEditing ? (
            <>
              <button type="button" onClick={saveNow} className="ui-button ui-button-secondary ui-button-xs" disabled={isWorking}>
                <Check className="h-3.5 w-3.5" /> {savePending ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setIsEditing(false)} className="ui-button ui-button-ghost ui-button-xs" disabled={isWorking}>
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setShowRefine(!showRefine)} disabled={isWorking} className="ui-button ui-button-secondary ui-button-xs">
                <Pencil className="h-3.5 w-3.5" /> Refine
              </button>
              <button type="button" onClick={() => setIsEditing(true)} disabled={isWorking} className="ui-button ui-button-ghost ui-button-xs">
                <Save className="h-3.5 w-3.5" /> Edit
              </button>
              <button type="button" onClick={exportMarkdown} disabled={!body} className="ui-button ui-button-ghost ui-button-xs">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </>
          )}
        </div>

        {showRefine && (
          <form onSubmit={refine} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.75rem 0.8rem', display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
            <Pencil className="h-4 w-4" />
            <input
              value={refineInput}
              onChange={(event) => setRefineInput(event.target.value)}
              placeholder="Describe what to change"
              className="flex-1 bg-transparent text-sm text-sf-text placeholder:text-sf-muted outline-none"
            />
            <button type="submit" disabled={!refineInput.trim() || isWorking} className="ui-button ui-button-secondary ui-button-xs">
              {isWorking ? 'Refining...' : 'Apply'}
            </button>
          </form>
        )}

        <div className="deep-learn-build-grid">
          <PinnedSourcePane
            resourceTitle={resource.title}
            sourceText={sourceText}
            sourceHref={sourceHref}
            readerHref={readerHref}
            readerLabel={readerLabel}
          />

          <div className="glass-panel glass-soft deep-learn-review-pane" style={{ borderRadius: 'var(--radius-panel)', minHeight: 0, overflow: 'hidden' }}>
            {isWorking && !body ? (
              <PackEmptyState
                title="Saving study output..."
                body="This saved document already exists. Stay here while the first version finishes writing."
                loading
                tone="accent"
              />
            ) : isEditing ? (
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="w-full min-h-[420px] resize-y bg-transparent px-4 py-4 text-sm text-sf-text font-mono leading-relaxed focus:outline-none"
                spellCheck={false}
              />
            ) : (
              <MarkdownBody content={body} headingIds emptyMessage="No saved content yet." />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function PinnedSourcePane({
  resourceTitle,
  sourceText,
  isImageOnly = false,
  sourceHref,
  readerHref,
  readerLabel,
}: {
  resourceTitle: string
  sourceText: string
  isImageOnly?: boolean
  sourceHref: string | null
  readerHref: string
  readerLabel: string
}) {
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [isOpen, setIsOpen] = useState(true)
  const viewportInitialized = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(max-width: 840px)')
    const syncViewport = (matches: boolean) => {
      setIsMobileViewport(matches)
      setIsOpen(() => {
        if (!viewportInitialized.current) {
          viewportInitialized.current = true
          return !matches
        }

        if (matches) return false
        return true
      })
    }

    syncViewport(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => syncViewport(event.matches)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  const snippet = buildSourceSnippet(sourceText)

  if (!isMobileViewport) {
    return (
      <aside className="ui-card-soft deep-learn-source-pane" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem', minHeight: 0 }}>
        <div className="deep-learn-source-header">
          <div>
            <p className="ui-kicker">Pinned Source</p>
            <p className="deep-learn-source-title">{resourceTitle}</p>
          </div>
          <SourceLinks sourceHref={sourceHref} readerHref={readerHref} readerLabel={readerLabel} />
        </div>

        <div className="deep-learn-source-content" style={{ marginTop: '0.7rem' }}>
          <SourcePreview sourceText={sourceText} isImageOnly={isImageOnly} />
        </div>
      </aside>
    )
  }

  return (
    <aside className="ui-card-soft deep-learn-source-pane" style={{ borderRadius: 'var(--radius-panel)', padding: '0.55rem', minHeight: 0 }}>
      <details
        className="deep-learn-source-disclosure"
        open={isOpen}
        onToggle={(event) => setIsOpen(event.currentTarget.open)}
        data-disable-expansion-scroll="true"
      >
        <summary className="ui-interactive-summary deep-learn-source-summary" data-disable-expansion-scroll="true">
          <span className="deep-learn-source-summary-copy">
            <span className="deep-learn-source-summary-label">Pinned Source</span>
            <span className="deep-learn-source-summary-title">{resourceTitle}</span>
            <span className="deep-learn-source-summary-snippet">{snippet}</span>
          </span>
          <span className="deep-learn-source-summary-toggle" aria-hidden="true">
            {isOpen ? 'Hide' : 'Show'}
          </span>
        </summary>

        <div className="deep-learn-source-disclosure-body">
          <div className="deep-learn-source-content">
            <SourcePreview sourceText={sourceText} isImageOnly={isImageOnly} />
          </div>
          <SourceLinks sourceHref={sourceHref} readerHref={readerHref} readerLabel={readerLabel} />
        </div>
      </details>
    </aside>
  )
}

function SourcePreview({ sourceText, isImageOnly = false }: { sourceText: string; isImageOnly?: boolean }) {
  if (!sourceText) {
    if (isImageOnly) {
      return (
        <GeneratedContentState
          title="Scanned PDF."
          description="OCR is required before text can be read here."
          tone="warning"
        />
      )
    }
    return (
      <GeneratedContentState
        title="No extracted text available."
        description="Process or repair this source so Deep Learn can read it."
        tone="warning"
      />
    )
  }

  return (
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
      {sourceText}
    </pre>
  )
}

function SourceLinks({
  sourceHref,
  readerHref,
  readerLabel,
}: {
  sourceHref: string | null
  readerHref: string
  readerLabel: string
}) {
  return (
    <div className="deep-learn-source-links">
      {sourceHref ? (
        <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
          Open original source
        </a>
      ) : null}
      <Link href={readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
        {readerLabel}
      </Link>
    </div>
  )
}

function buildSourceSnippet(sourceText: string) {
  if (!sourceText.trim()) return 'Source preview unavailable.'
  return sourceText.replace(/\s+/g, ' ').trim().slice(0, 120).trimEnd() + (sourceText.trim().length > 120 ? '...' : '')
}

function PackEmptyState({
  title,
  body,
  loading = false,
  tone = 'default',
}: {
  title: string
  body: string
  loading?: boolean
  tone?: 'default' | 'accent' | 'warning'
}) {
  return (
    <GeneratedContentState
      title={title}
      description={body}
      loading={loading}
      tone={tone === 'accent' ? 'accent' : tone === 'warning' ? 'warning' : 'default'}
    />
  )
}

function MarkdownBody({
  content,
  headingIds = false,
  emptyMessage,
}: {
  content: string
  headingIds?: boolean
  emptyMessage: string
}) {
  return (
    <article
      className="prose prose-sm max-w-none px-6 py-5 prose-headings:text-sf-text prose-p:text-sf-text prose-li:text-sf-text prose-strong:text-sf-text"
      style={{ scrollMarginTop: '5rem' }}
      dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content || emptyMessage, { headingIds }) }}
    />
  )
}
