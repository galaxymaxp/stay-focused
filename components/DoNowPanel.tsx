'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveDraftFromTaskOutput } from '@/actions/drafts'
import { CopyTaskBundleActions } from '@/components/CopyTaskBundleActions'
import { PromptBuildViewer } from '@/components/PromptBuildViewer'
import { TaskDraftSourcePane } from '@/components/TaskDraftSourcePane'
import { usePromptBuild, type PromptBuildSnapshot } from '@/components/usePromptBuild'
import {
  buildTaskDraftFallback,
  buildTaskDraftContextText,
  buildTaskDraftSourceKey,
  buildTaskDraftRequestPayload,
  isTaskDraftApiResponse,
  type TaskDraftApiRequest,
  type TaskDraftResponse,
  type TaskDraftContext,
} from '@/lib/do-now'
import type { ManualCopyBundleResult } from '@/lib/manual-copy-bundle'

export function TaskDraftPanel({
  context,
  copyBundle,
  initialSnapshot,
  entryOrigin = 'do',
  doPageHref,
  onSnapshotChange,
  onClose,
}: {
  context: TaskDraftContext
  copyBundle?: Pick<ManualCopyBundleResult, 'bundleText' | 'promptText'>
  initialSnapshot?: PromptBuildSnapshot | null
  entryOrigin?: 'today' | 'do'
  doPageHref?: string
  onSnapshotChange?: (snapshot: PromptBuildSnapshot) => void
  onClose: () => void
}) {
  const router = useRouter()
  const fallbackDraft = buildTaskDraftFallback(context)
  const requestPayload = useMemo(() => buildTaskDraftRequestPayload(context), [context])
  const requestBody = useMemo(() => JSON.stringify(requestPayload), [requestPayload])
  const [reusableSnapshot] = useState<PromptBuildSnapshot | null>(() => (
    initialSnapshot?.requestBody === requestBody ? initialSnapshot : null
  ))
  const promptBuild = usePromptBuild({
    initialSnapshot: reusableSnapshot,
    onSnapshotChange,
    requestBody,
    requestPayload,
  })
  const draft = promptBuild.generatedDraft ?? fallbackDraft
  const [workingDraft, setWorkingDraft] = useState(draft)
  const [refinementPending, setRefinementPending] = useState<string | null>(null)
  const [refinementError, setRefinementError] = useState<string | null>(null)
  const [savePending, setSavePending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setWorkingDraft(draft)
    setRefinementPending(null)
    setRefinementError(null)
    setSavePending(false)
    setSaveError(null)
  }, [draft, requestBody])

  async function refineOutput(mode: 'shorter' | 'formal' | 'human' | 'expand' | 'improve' | 'retry') {
    if (refinementPending || promptBuild.isBuilding) return

    setRefinementPending(mode)
    setRefinementError(null)

    try {
      const refinementPayload = buildRefinementPayload({
        basePayload: requestPayload,
        currentDraft: workingDraft,
        mode,
      })

      const response = await fetch('/api/do-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refinementPayload),
      })
      const data = (await response.json().catch(() => null)) as unknown

      if (!response.ok) {
        throw new Error(extractRefinementErrorMessage(data))
      }
      if (!isTaskDraftApiResponse(data)) {
        throw new Error('Could not parse the refined output.')
      }

      setWorkingDraft(data.draft)
    } catch (error) {
      setRefinementError(error instanceof Error ? error.message : 'Could not refine the output.')
    } finally {
      setRefinementPending(null)
    }
  }

  async function saveToDraft() {
    if (!context.moduleId || savePending) return

    setSavePending(true)
    setSaveError(null)

    try {
      const result = await saveDraftFromTaskOutput({
        context,
        draft: workingDraft,
      })
      onClose()
      router.push(`/drafts/${result.draftId}`)
      router.refresh()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this draft.')
      setSavePending(false)
    }
  }

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
    }
  }, [])

  return (
    <div
      className="motion-modal-backdrop"
      style={backdropStyle}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="presentation"
    >
      <div
        className="glass-panel glass-strong motion-modal-card"
        style={cardStyle}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`First output - ${context.taskTitle}`}
      >
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <p className="ui-kicker" style={{ margin: 0 }}>Do output</p>
            <h2 style={titleStyle}>{context.taskTitle}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <span className="ui-chip" style={courseChipStyle}>{context.courseName}</span>
              {context.moduleTitle && context.moduleTitle !== context.taskTitle && (
                <span className="ui-chip" style={moduleChipStyle}>{context.moduleTitle}</span>
              )}
              {context.priority && (
                <span className="ui-chip" style={priorityChipStyle(context.priority)}>
                  {context.priority} priority
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-button ui-button-ghost"
            aria-label="Close output panel"
            style={closeButtonStyle}
          >
            X
          </button>
        </div>

        <div className="draft-workspace">
          <div className="draft-main-column">
            {promptBuild.isBuilding ? (
              <PromptBuildViewer
                phase={promptBuild.phase}
                progressValue={promptBuild.progressValue}
                promptText={promptBuild.promptText}
                taskTitle={context.taskTitle}
              />
            ) : (
              <>
                <StatusBanner
                  phase={promptBuild.phase === 'error' ? 'error' : 'done'}
                  draftSource={promptBuild.draftSource}
                  reopenSource={promptBuild.reopenSource}
                  errorMessage={promptBuild.errorMessage}
                />

                <div style={sectionsStyle}>
                  <PrimaryOutputSection
                    output={workingDraft.draftOutput}
                    onOutputChange={(value) => {
                      setWorkingDraft((current) => ({ ...current, draftOutput: value }))
                    }}
                    onRefine={refineOutput}
                    pendingMode={refinementPending}
                    errorMessage={refinementError ?? saveError}
                  />
                  <details className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem 0.95rem' }}>
                    <summary className="ui-interactive-summary" style={{ padding: 0 }}>
                      <div>
                        <p className="ui-kicker">Support details</p>
                        <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                          Requirement checks and next steps stay here so the primary output remains front and center.
                        </p>
                      </div>
                    </summary>
                    <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.65rem' }}>
                      <TextSection heading="Requirement summary" body={workingDraft.requirementSummary} />
                      <TextSection heading="Missing or unclear details" body={workingDraft.missingDetails} />
                      <TextSection heading="What to do on paper right now" body={workingDraft.paperAction} />
                      <TextSection heading="Smallest next step" body={workingDraft.smallestNextStep} />
                    </div>
                  </details>
                </div>
              </>
            )}
          </div>

          <div className="draft-source-column">
            <TaskDraftSourcePane context={context} isBuilding={promptBuild.isBuilding} />
          </div>
        </div>

        <div style={footerStyle}>
          {context.canvasUrl && (
            <a
              href={context.canvasUrl}
              target="_blank"
              rel="noreferrer"
              className="ui-button ui-button-primary"
              style={footerButtonStyle}
            >
              Open in Canvas
            </a>
          )}
          {copyBundle && (
            <CopyTaskBundleActions
              bundleText={copyBundle.bundleText}
              promptText={copyBundle.promptText}
              fullLabel="Copy for another AI tool"
              fullTone="secondary"
            />
          )}
          {context.moduleId && (
            <button
              type="button"
              onClick={saveToDraft}
              className="ui-button ui-button-ghost"
              style={footerButtonStyle}
              disabled={savePending}
            >
              {savePending ? 'Saving draft...' : 'Save to Draft'}
            </button>
          )}
          {entryOrigin === 'today' && doPageHref && (
            <Link
              href={doPageHref}
              className="ui-button ui-button-secondary"
              style={footerButtonStyle}
              onClick={onClose}
            >
              Open task page
            </Link>
          )}
          {context.learnHref && (
            <Link
              href={context.learnHref}
              className="ui-button ui-button-secondary"
              style={footerButtonStyle}
              onClick={onClose}
            >
              Open Learn
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ui-button ui-button-ghost"
            style={footerButtonStyle}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function TextSection({
  heading,
  body,
}: {
  heading: string
  body: string
}) {
  return (
    <section style={sectionStyle}>
      <p style={sectionHeadingStyle}>{heading}</p>
      <div style={draftBodyStyle}>{body}</div>
    </section>
  )
}

function PrimaryOutputSection({
  output,
  onOutputChange,
  onRefine,
  pendingMode,
  errorMessage,
}: {
  output: string
  onOutputChange: (value: string) => void
  onRefine: (mode: 'shorter' | 'formal' | 'human' | 'expand' | 'improve' | 'retry') => void
  pendingMode: string | null
  errorMessage: string | null
}) {
  return (
    <section style={primaryOutputSectionStyle}>
      <p style={sectionHeadingStyle}>Primary output</p>
      <p style={{ margin: '0.38rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
        Start with the usable answer. Refine it quickly, then save it into Draft when you want a persistent record.
      </p>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.68rem' }}>
        {[
          { key: 'shorter', label: 'Shorter' },
          { key: 'formal', label: 'More formal' },
          { key: 'human', label: 'More human' },
          { key: 'expand', label: 'Expand' },
          { key: 'improve', label: 'Improve' },
          { key: 'retry', label: 'Retry' },
        ].map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => onRefine(action.key as 'shorter' | 'formal' | 'human' | 'expand' | 'improve' | 'retry')}
            className="ui-button ui-button-ghost ui-button-xs"
            disabled={Boolean(pendingMode)}
          >
            {pendingMode === action.key ? 'Working...' : action.label}
          </button>
        ))}
      </div>
      {errorMessage && (
        <p style={{ margin: '0.55rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--red)' }}>
          {errorMessage}
        </p>
      )}
      <textarea
        value={output}
        onChange={(event) => onOutputChange(event.target.value)}
        className="ui-input"
        style={primaryOutputEditorStyle}
        spellCheck={false}
      />
    </section>
  )
}

function StatusBanner({
  phase,
  draftSource,
  reopenSource,
  errorMessage,
}: {
  phase: 'done' | 'error'
  draftSource: 'saved' | 'generated'
  reopenSource: 'session' | null
  errorMessage: string | null
}) {
  return (
    <div style={statusBannerStyle(phase)}>
      <p style={statusTitleStyle}>{phase === 'error' ? 'Output build failed' : 'Output ready'}</p>
      <p style={statusBodyStyle}>
        {phase === 'error'
          ? `${errorMessage ?? 'OpenAI generation failed.'} Showing the local first output instead.`
          : reopenSource === 'session'
            ? draftSource === 'saved'
              ? 'This reopened the same saved output from this session because the task context has not changed.'
              : 'This reopened the same generated output from this session because the task context has not changed.'
            : draftSource === 'saved'
              ? 'This output was loaded from a saved server result because the task context has not changed.'
              : 'This output was generated from the current task context.'}
      </p>
    </div>
  )
}

function buildRefinementPayload({
  basePayload,
  currentDraft,
  mode,
}: {
  basePayload: TaskDraftApiRequest
  currentDraft: TaskDraftResponse
  mode: 'shorter' | 'formal' | 'human' | 'expand' | 'improve' | 'retry'
}): TaskDraftApiRequest {
  const clippedOutput = buildTaskDraftContextText(currentDraft.draftOutput, 1200) ?? currentDraft.draftOutput
  const clippedRequirement = buildTaskDraftContextText(currentDraft.requirementSummary, 420) ?? currentDraft.requirementSummary
  const modeInstruction = mode === 'shorter'
    ? 'Make the output shorter while preserving the strongest points.'
    : mode === 'formal'
      ? 'Increase professionalism and formal tone without sounding robotic.'
      : mode === 'human'
        ? 'Make the writing more natural and human while keeping quality high.'
        : mode === 'expand'
          ? 'Expand with stronger supporting detail and clearer structure.'
          : mode === 'improve'
            ? 'Improve clarity, specificity, and overall quality.'
            : 'Regenerate a better first-pass output from the same task context.'

  const refinementContext = [
    basePayload.instructions,
    '',
    'Current output to refine:',
    clippedOutput,
    '',
    'Requirement summary:',
    clippedRequirement,
    '',
    `Refinement target: ${modeInstruction}`,
    'Return all sections in the same output format.',
  ].join('\n')

  return {
    ...basePayload,
    sourceKey: `${basePayload.sourceKey}:refine:${mode}:${Date.now()}`,
    instructions: refinementContext,
  }
}

function extractRefinementErrorMessage(value: unknown) {
  if (value && typeof value === 'object' && 'error' in value && typeof (value as { error?: unknown }).error === 'string') {
    return (value as { error: string }).error
  }
  return 'Could not refine the output right now.'
}

export function getTaskDraftSessionKey(context: TaskDraftContext) {
  return buildTaskDraftSourceKey(context)
}

function priorityChipStyle(priority: 'high' | 'medium' | 'low'): CSSProperties {
  if (priority === 'high') {
    return {
      padding: '0.22rem 0.55rem',
      fontSize: '11px',
      fontWeight: 700,
      background: 'color-mix(in srgb, var(--amber-light) 44%, var(--surface-soft) 56%)',
      color: 'var(--amber)',
      border: '1px solid color-mix(in srgb, var(--amber) 26%, var(--border-subtle) 74%)',
    }
  }

  if (priority === 'medium') {
    return {
      padding: '0.22rem 0.55rem',
      fontSize: '11px',
      fontWeight: 700,
      background: 'color-mix(in srgb, var(--accent-light) 46%, var(--surface-soft) 54%)',
      color: 'var(--accent-foreground)',
      border: '1px solid color-mix(in srgb, var(--accent-border) 32%, var(--border-subtle) 68%)',
    }
  }

  return {
    padding: '0.22rem 0.55rem',
    fontSize: '11px',
    fontWeight: 700,
    background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  }
}

function statusBannerStyle(phase: 'done' | 'error'): CSSProperties {
  if (phase === 'done') {
    return {
      borderRadius: 'var(--radius-panel)',
      padding: '0.8rem 0.9rem',
      background: 'color-mix(in srgb, var(--blue-light) 44%, var(--surface-soft) 56%)',
      border: '1px solid color-mix(in srgb, var(--blue) 24%, var(--border-subtle) 76%)',
    }
  }

  return {
    borderRadius: 'var(--radius-panel)',
    padding: '0.8rem 0.9rem',
    background: 'color-mix(in srgb, var(--amber-light) 42%, var(--surface-soft) 58%)',
    border: '1px solid color-mix(in srgb, var(--amber) 22%, var(--border-subtle) 78%)',
  }
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  background: 'color-mix(in srgb, rgba(15, 12, 10, 0.54) 100%, transparent)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
}

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '1180px',
  maxHeight: 'calc(100dvh - 2rem)',
  overflowY: 'auto',
  borderRadius: 'var(--radius-page)',
  padding: '1.35rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
  alignItems: 'flex-start',
}

const titleStyle: CSSProperties = {
  margin: '0.4rem 0 0',
  fontSize: '22px',
  lineHeight: 1.1,
  fontWeight: 650,
  letterSpacing: '-0.03em',
  color: 'var(--text-primary)',
}

const courseChipStyle: CSSProperties = {
  padding: '0.22rem 0.6rem',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
}

const moduleChipStyle: CSSProperties = {
  padding: '0.22rem 0.6rem',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
}

const closeButtonStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: '2.2rem',
  width: '2.2rem',
  padding: 0,
  fontSize: '13px',
  borderRadius: 'var(--radius-control)',
}

const statusTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const statusBodyStyle: CSSProperties = {
  margin: '0.38rem 0 0',
  fontSize: '13px',
  lineHeight: 1.6,
  color: 'var(--text-primary)',
}

const sectionsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.8rem',
}

const sectionStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-base)',
  padding: '0.95rem',
}

const primaryOutputSectionStyle: CSSProperties = {
  ...sectionStyle,
  border: '1px solid color-mix(in srgb, var(--accent-border) 34%, var(--border-subtle) 66%)',
  background: 'color-mix(in srgb, var(--surface-elevated) 96%, transparent)',
}

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const draftBodyStyle: CSSProperties = {
  marginTop: '0.45rem',
  fontSize: '14px',
  lineHeight: 1.68,
  color: 'var(--text-primary)',
  whiteSpace: 'pre-wrap',
}

const primaryOutputEditorStyle: CSSProperties = {
  marginTop: '0.7rem',
  minHeight: '19rem',
  padding: '0.9rem 0.95rem',
  fontSize: '14px',
  lineHeight: 1.68,
  resize: 'vertical',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  gap: '0.55rem',
  flexWrap: 'wrap',
  paddingTop: '0.1rem',
}

const footerButtonStyle: CSSProperties = {
  minHeight: '2.35rem',
  padding: '0.58rem 0.9rem',
  fontSize: '13px',
}
