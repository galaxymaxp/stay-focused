'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { AlertCircle, Check, Download, Loader2, Pencil, Save, X } from 'lucide-react'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { DeepLearnReviewPackSurface } from '@/components/DeepLearnReviewPackSurface'
import { simpleMarkdownToHtml } from '@/lib/markdown'
import { refineDraft, updateDraftBody } from '@/actions/drafts'
import type { DeepLearnNote, Draft } from '@/lib/types'
import type { ModuleSourceResource } from '@/lib/module-workspace'

export function DeepLearnWorkspace({
  moduleId,
  courseId,
  resource,
  deepLearnResourceId,
  note,
  sourceHref,
  readerHref,
  statusSummary,
  blockedMessage = null,
  legacyDraft = null,
}: {
  moduleId: string
  courseId: string | null
  resource: ModuleSourceResource
  deepLearnResourceId: string
  note: DeepLearnNote | null
  sourceHref: string | null
  readerHref: string
  statusSummary: string
  blockedMessage?: string | null
  legacyDraft?: Draft | null
}) {
  if (!note && legacyDraft) {
    return (
      <LegacyDraftWorkspace
        resource={resource}
        readerHref={readerHref}
        sourceHref={sourceHref}
        legacyDraft={legacyDraft}
      />
    )
  }

  const sourceText = resource.extractedText ?? resource.extractedTextPreview ?? ''
  const sourceFallbackMessage = resource.extractionError
    ? `Source preview failed: ${resource.extractionError}`
    : 'No extracted source text is available in this item.'

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
          {!note || note.status === 'failed' ? (
            <DeepLearnGenerateButton
              moduleId={moduleId}
              resourceId={deepLearnResourceId}
              courseId={courseId}
              label={note?.status === 'failed' ? 'Rebuild pack' : 'Generate pack'}
              className="ui-button ui-button-secondary ui-button-xs"
            />
          ) : null}
          {sourceHref && (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open original source
            </a>
          )}
          <Link href={readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Source detail
          </Link>
        </div>
      </div>

      {blockedMessage && (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.85rem 0.9rem' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>{blockedMessage}</p>
        </div>
      )}

      <div className="deep-learn-build-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '0.8rem', alignItems: 'stretch' }}>
        <aside className="ui-card-soft deep-learn-source-pane" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem', minHeight: 0 }}>
          <p className="ui-kicker">Pinned source</p>
          <p style={{ margin: '0.38rem 0 0', fontSize: '14px', lineHeight: 1.45, color: 'var(--text-primary)', fontWeight: 650 }}>{resource.title}</p>
          <div className="deep-learn-source-content" style={{ marginTop: '0.7rem' }}>
            {sourceText ? (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                {sourceText}
              </pre>
            ) : (
              <div style={{ display: 'grid', gap: '0.45rem', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.58 }}>
                <AlertCircle className="h-4 w-4" />
                <span>{sourceFallbackMessage}</span>
              </div>
            )}
          </div>
        </aside>

        <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', minHeight: 0, overflow: 'hidden' }}>
          {!note ? (
            <PackEmptyState
              title="Generate the saved review pack"
              body="Deep Learn saves the exam prep pack itself for this source. Once generated, this pane becomes the resumable answer bank, identification drill, MCQ, and timeline surface."
            />
          ) : note.status === 'pending' ? (
            <PackEmptyState
              title="Exam prep pack is still preparing"
              body={note.overview || 'Deep Learn is building the saved review pack from the pinned source.'}
              loading
            />
          ) : note.status === 'failed' ? (
            <PackEmptyState
              title="Exam prep pack could not be built"
              body={note.errorMessage || 'Deep Learn could not produce a trustworthy review pack from the current source evidence.'}
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
  sourceHref,
  legacyDraft,
}: {
  resource: ModuleSourceResource
  readerHref: string
  sourceHref: string | null
  legacyDraft: Draft
}) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [body, setBody] = useState(legacyDraft.bodyMarkdown ?? '')
  const [showRefine, setShowRefine] = useState(false)
  const [refineInput, setRefineInput] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savePending, setSavePending] = useState(false)
  const [isPending, startTransition] = useTransition()
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    setBody(legacyDraft.bodyMarkdown ?? '')
    setIsEditing(false)
    setShowRefine(false)
    setRefineInput('')
    setErrorMessage(null)
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
          setErrorMessage(error instanceof Error ? error.message : 'Could not save the study output.')
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
    startTransition(async () => {
      try {
        await updateDraftBody(legacyDraft.id, body)
        setIsEditing(false)
        router.refresh()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not save the study output.')
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
        setErrorMessage(error instanceof Error ? error.message : 'Could not refine the study output.')
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
  const sourceFallbackMessage = resource.extractionError
    ? `Source preview failed: ${resource.extractionError}`
    : 'No extracted source text is available in this item.'
  const isWorking = isPending || savePending || legacyDraft.status === 'generating' || legacyDraft.status === 'refining'

  return (
    <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.1rem 1.15rem', display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 430px' }}>
          <p className="ui-kicker">Saved study output</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{legacyDraft.title}</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
            This older saved document still resumes here with its source context, but Learn-origin study flows now persist the exam prep pack itself instead of a secondary draft document.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {sourceHref && (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open original source
            </a>
          )}
          <Link href={readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Source detail
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.78rem 0.85rem', color: 'var(--red)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertCircle className="h-4 w-4" />
          <span style={{ fontSize: '13px' }}>{errorMessage}</span>
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {savePending && (
            <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
              Saving
            </span>
          )}
          {isEditing ? (
            <>
              <button type="button" onClick={saveNow} className="ui-button ui-button-secondary ui-button-xs">
                <Check className="h-3.5 w-3.5" /> Done
              </button>
              <button type="button" onClick={() => setIsEditing(false)} className="ui-button ui-button-ghost ui-button-xs">
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
              {isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply'}
            </button>
          </form>
        )}

        <div className="deep-learn-build-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '0.8rem', alignItems: 'stretch' }}>
          <aside className="ui-card-soft deep-learn-source-pane" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem', minHeight: 0 }}>
            <p className="ui-kicker">Pinned source</p>
            <p style={{ margin: '0.38rem 0 0', fontSize: '14px', lineHeight: 1.45, color: 'var(--text-primary)', fontWeight: 650 }}>{resource.title}</p>
            <div className="deep-learn-source-content" style={{ marginTop: '0.7rem' }}>
              {sourceText ? (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                  {sourceText}
                </pre>
              ) : (
                <div style={{ display: 'grid', gap: '0.45rem', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.58 }}>
                  <AlertCircle className="h-4 w-4" />
                  <span>{sourceFallbackMessage}</span>
                </div>
              )}
            </div>
          </aside>

          <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', minHeight: 0, overflow: 'hidden' }}>
            {isWorking && !body ? (
              <PackEmptyState
                title="Saved study output is still preparing"
                body="This record already exists and is still writing its first version from the pinned source."
                loading
              />
            ) : isEditing ? (
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="w-full min-h-[420px] resize-y bg-transparent px-4 py-4 text-sm text-sf-text font-mono leading-relaxed focus:outline-none"
                spellCheck={false}
              />
            ) : (
              <MarkdownBody content={body} headingIds />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function PackEmptyState({
  title,
  body,
  loading = false,
}: {
  title: string
  body: string
  loading?: boolean
}) {
  return (
    <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68, display: 'grid', gap: '0.7rem' }}>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      <strong style={{ color: 'var(--text-primary)' }}>{title}</strong>
      <span style={{ color: 'var(--text-secondary)' }}>{body}</span>
    </div>
  )
}

function MarkdownBody({ content, headingIds = false }: { content: string; headingIds?: boolean }) {
  return (
    <article
      className="prose prose-sm max-w-none px-6 py-5 prose-headings:text-sf-text prose-p:text-sf-text prose-li:text-sf-text prose-strong:text-sf-text"
      style={{ scrollMarginTop: '5rem' }}
      dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content || 'No saved content yet.', { headingIds }) }}
    />
  )
}
