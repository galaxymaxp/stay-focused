'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { AlertCircle, Check, Download, Loader2, Pencil, Save, X } from 'lucide-react'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { DeepLearnReviewPackSurface } from '@/components/DeepLearnReviewPackSurface'
import { simpleMarkdownToHtml } from '@/lib/markdown'
import { createDraftForDeepLearnResource, refineDraft, updateDraftBody } from '@/actions/drafts'
import type { DeepLearnNote, Draft, DraftLoadAvailability } from '@/lib/types'
import type { ModuleSourceResource } from '@/lib/module-workspace'

type DeepLearnMode = 'draft' | 'review'

const MODE_LABELS: Record<DeepLearnMode, string> = {
  draft: 'Draft',
  review: 'Review',
}

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
  resourceDraft = null,
  draftAvailability = 'available',
  draftAvailabilityMessage = null,
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
  resourceDraft?: Draft | null
  draftAvailability?: DraftLoadAvailability
  draftAvailabilityMessage?: string | null
  legacyDraft?: Draft | null
}) {
  const router = useRouter()
  const activeDraft = resourceDraft ?? legacyDraft
  const workspaceIdentity = `${moduleId}:${deepLearnResourceId}:${resource.id}:${activeDraft?.id ?? 'no-draft'}`
  const [mode, setMode] = useState<DeepLearnMode>('draft')
  const [isEditing, setIsEditing] = useState(false)
  const [body, setBody] = useState(activeDraft?.bodyMarkdown ?? '')
  const [showRefine, setShowRefine] = useState(false)
  const [refineInput, setRefineInput] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savePending, setSavePending] = useState(false)
  const [isPending, startTransition] = useTransition()
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    setBody(activeDraft?.bodyMarkdown ?? '')
  }, [activeDraft?.bodyMarkdown, workspaceIdentity])

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setIsEditing(false)
    setShowRefine(false)
    setRefineInput('')
    setErrorMessage(null)
    setSavePending(false)
  }, [workspaceIdentity])

  useEffect(() => {
    if (!isEditing || !activeDraft) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)

    saveTimer.current = window.setTimeout(() => {
      setSavePending(true)
      startTransition(async () => {
        try {
          await updateDraftBody(activeDraft.id, body)
          router.refresh()
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not save Draft edits.')
        } finally {
          setSavePending(false)
        }
      })
    }, 1500)

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [activeDraft, body, isEditing, router])

  function saveNow() {
    if (!activeDraft) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setSavePending(true)
    startTransition(async () => {
      try {
        await updateDraftBody(activeDraft.id, body)
        setIsEditing(false)
        router.refresh()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not save Draft edits.')
      } finally {
        setSavePending(false)
      }
    })
  }

  function refine(e: FormEvent) {
    e.preventDefault()
    if (!refineInput.trim() || !activeDraft) return

    const instruction = refineInput.trim()
    setRefineInput('')
    setShowRefine(false)
    setErrorMessage(null)
    startTransition(async () => {
      try {
        await refineDraft(activeDraft.id, instruction)
        router.refresh()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not refine the Draft.')
      }
    })
  }

  function createDraft() {
    setErrorMessage(null)
    startTransition(async () => {
      try {
        await createDraftForDeepLearnResource({ moduleId, resourceId: deepLearnResourceId, courseId })
        router.refresh()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not create the Draft.')
      }
    })
  }

  function exportMarkdown() {
    const blob = new Blob([body], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(activeDraft?.title ?? resource.title).replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sourceText = resource.extractedText ?? resource.extractedTextPreview ?? ''
  const sourceFallbackMessage = resource.extractionError
    ? `Source preview failed: ${resource.extractionError}`
    : 'No extracted source text is available in this item.'
  const hasDraftSurface = Boolean(activeDraft)
  const isWorking = isPending || savePending || activeDraft?.status === 'generating' || activeDraft?.status === 'refining'

  return (
    <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.1rem 1.15rem', display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 430px' }}>
          <p className="ui-kicker">Deep Learn</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>
            {activeDraft?.title ?? (note?.status === 'ready' ? note.title : resource.title)}
          </h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
            {statusSummary}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {!activeDraft && (!note || note.status === 'failed') ? (
            <DeepLearnGenerateButton
              moduleId={moduleId}
              resourceId={deepLearnResourceId}
              courseId={courseId}
              label="Create Draft"
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

      <div className="deep-learn-mode-row" style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {(['draft', 'review'] as const).map((nextMode) => (
          <button
            key={nextMode}
            type="button"
            onClick={() => setMode(nextMode)}
            className={`ui-button ${mode === nextMode ? 'ui-button-secondary' : 'ui-button-ghost'} ui-button-xs`}
          >
            {MODE_LABELS[nextMode]}
          </button>
        ))}
        {note?.status === 'ready' && !activeDraft && (
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            Review
          </span>
        )}
        <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
          {getDeepLearnStageBadge(note, activeDraft)}
        </span>
      </div>

      {blockedMessage && (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.85rem 0.9rem' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>{blockedMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.78rem 0.85rem', color: 'var(--red)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertCircle className="h-4 w-4" />
          <span style={{ fontSize: '13px' }}>{errorMessage}</span>
        </div>
      )}

      {mode === 'draft' && (
        <BuildMode
          hasDraftSurface={hasDraftSurface}
          body={body}
          draftAvailability={draftAvailability}
          draftAvailabilityMessage={draftAvailabilityMessage}
          sourceTitle={resource.title}
          sourceText={sourceText}
          sourceFallbackMessage={sourceFallbackMessage}
          isEditing={isEditing}
          isWorking={isWorking}
          savePending={savePending}
          showRefine={showRefine}
          refineInput={refineInput}
          setBody={setBody}
          setIsEditing={setIsEditing}
          setShowRefine={setShowRefine}
          setRefineInput={setRefineInput}
          saveNow={saveNow}
          refine={refine}
          exportMarkdown={exportMarkdown}
          createDraft={createDraft}
        />
      )}

      {mode === 'review' && (
        <ReviewMode
          note={note}
          legacyDraft={activeDraft}
          body={body}
          hasDraftSurface={hasDraftSurface}
          isWorking={isWorking}
          createDraft={createDraft}
          readerHref={readerHref}
          sourceHref={sourceHref}
        />
      )}
    </section>
  )
}

function BuildMode({
  hasDraftSurface,
  body,
  draftAvailability,
  draftAvailabilityMessage,
  sourceTitle,
  sourceText,
  sourceFallbackMessage,
  isEditing,
  isWorking,
  savePending,
  showRefine,
  refineInput,
  setBody,
  setIsEditing,
  setShowRefine,
  setRefineInput,
  saveNow,
  refine,
  exportMarkdown,
  createDraft,
}: {
  hasDraftSurface: boolean
  body: string
  draftAvailability: DraftLoadAvailability
  draftAvailabilityMessage: string | null
  sourceTitle: string
  sourceText: string
  sourceFallbackMessage: string
  isEditing: boolean
  isWorking: boolean
  savePending: boolean
  showRefine: boolean
  refineInput: string
  setBody: (value: string) => void
  setIsEditing: (value: boolean) => void
  setShowRefine: (value: boolean) => void
  setRefineInput: (value: string) => void
  saveNow: () => void
  refine: (e: FormEvent) => void
  exportMarkdown: () => void
  createDraft: () => void
}) {
  return (
    <div id="deep-learn-draft-surface" style={{ display: 'grid', gap: '0.75rem' }}>
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
            <button type="button" onClick={() => setShowRefine(!showRefine)} disabled={!hasDraftSurface || isWorking} className="ui-button ui-button-secondary ui-button-xs">
              <Pencil className="h-3.5 w-3.5" /> Refine
            </button>
            <button type="button" onClick={() => setIsEditing(true)} disabled={!hasDraftSurface || isWorking} className="ui-button ui-button-ghost ui-button-xs">
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
          <p style={{ margin: '0.38rem 0 0', fontSize: '14px', lineHeight: 1.45, color: 'var(--text-primary)', fontWeight: 650 }}>{sourceTitle}</p>
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

        <div className="glass-panel glass-soft deep-learn-draft-pane" style={{ borderRadius: 'var(--radius-panel)', minHeight: 0, overflow: 'hidden' }}>
          {draftAvailability === 'failed' ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68, display: 'grid', gap: '0.7rem' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Failed to load Draft.</strong>
              <span>{draftAvailabilityMessage ?? 'The saved draft for this Deep Learn item could not be loaded.'}</span>
            </div>
          ) : !hasDraftSurface ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68, display: 'grid', gap: '0.8rem' }}>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>No draft yet.</strong>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)' }}>
                  Create a saved Draft document for this Deep Learn item. It will stay tied to this selected resource and open here beside the source.
                </p>
              </div>
              <button type="button" onClick={createDraft} disabled={isWorking || draftAvailability === 'unavailable'} className="ui-button ui-button-secondary ui-button-xs" style={{ width: 'fit-content' }}>
                {isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {isWorking ? 'Generating draft' : 'Create draft'}
              </button>
              {draftAvailability === 'unavailable' && (
                <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                  {draftAvailabilityMessage ?? 'Draft is unavailable for this item right now.'}
                </span>
              )}
              {isWorking && (
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  <div style={{ height: '0.42rem', borderRadius: '999px', overflow: 'hidden', background: 'color-mix(in srgb, var(--surface-soft) 90%, transparent)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ width: '68%', height: '100%', borderRadius: 'inherit', background: 'linear-gradient(90deg, var(--accent), var(--blue))' }} />
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Generating from the pinned source. This page will refresh when the draft is saved.</span>
                </div>
              )}
            </div>
          ) : isWorking && !body ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68, display: 'grid', gap: '0.7rem' }}>
              <Loader2 className="h-5 w-5 animate-spin" />
              <strong style={{ color: 'var(--text-primary)' }}>Generating draft...</strong>
              <span style={{ color: 'var(--text-secondary)' }}>Draft has a saved record and is writing the first version from the pinned source.</span>
            </div>
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
  )
}

function ReviewMode({
  note,
  legacyDraft,
  body,
  hasDraftSurface,
  isWorking,
  createDraft,
  readerHref,
  sourceHref,
}: {
  note: DeepLearnNote | null
  legacyDraft: Draft | null
  body: string
  hasDraftSurface: boolean
  isWorking: boolean
  createDraft: () => void
  readerHref: string
  sourceHref: string | null
}) {
  if (!note && !hasDraftSurface) {
    return (
      <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.7rem' }}>
        <div style={{ display: 'grid', gap: '0.32rem' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Review unlocks after Draft exists.</strong>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            Start by creating a draft from this source. Once saved, this space shows answer-bank review and quiz-ready signals.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={createDraft} disabled={isWorking} className="ui-button ui-button-secondary ui-button-xs">
            {isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isWorking ? 'Generating draft' : 'Create draft'}
          </button>
          <Link href={readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Source fallback
          </Link>
          {sourceHref && (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open original source
            </a>
          )}
        </div>
      </div>
    )
  }

  if (!note && legacyDraft) {
    return (
      <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', overflow: 'hidden' }}>
        <div className="ui-card-soft" style={{ borderRadius: 0, padding: '0.85rem 0.95rem' }}>
          <p className="ui-kicker">Saved draft in Deep Learn</p>
          <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
            This saved draft remains editable in Draft. Generate a native Deep Learn item from the course/module resource to unlock answer-bank presets and quiz-ready output.
          </p>
        </div>
        <MarkdownBody content={body} />
      </div>
    )
  }
  if (!note) return <EmptyMode body="Review appears after the Draft exists." />
  if (note.status !== 'ready') {
    return (
      <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.62rem' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Review is still preparing.</strong>
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          Deep Learn is finishing this pack. Stay in Draft for edits, or verify source details while review artifacts are generated.
        </p>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href={readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Source fallback
          </Link>
          {sourceHref && (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open original source
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem' }}>
      <DeepLearnReviewPackSurface note={note} />
    </div>
  )
}

function getDeepLearnStageBadge(note: DeepLearnNote | null, legacyDraft: Draft | null) {
  if (legacyDraft) {
    if (legacyDraft.status === 'generating' || legacyDraft.status === 'refining') return 'Draft'
    if (legacyDraft.draftType === 'exam_reviewer' || legacyDraft.draftType === 'flashcard_set') return 'Draft'
    return 'Review'
  }

  if (!note || note.status === 'pending' || note.status === 'failed') return 'Draft'
  if (note.quizReady) return 'Review Ready'
  return 'Review'
}

function EmptyMode({ body }: { body: string }) {
  return (
    <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
      {body}
    </div>
  )
}

function MarkdownBody({ content, headingIds = false }: { content: string; headingIds?: boolean }) {
  return (
    <article
      className="prose prose-sm max-w-none px-6 py-5 prose-headings:text-sf-text prose-p:text-sf-text prose-li:text-sf-text prose-strong:text-sf-text"
      style={{ scrollMarginTop: '5rem' }}
      dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content || 'No draft content yet.', { headingIds }) }}
    />
  )
}
