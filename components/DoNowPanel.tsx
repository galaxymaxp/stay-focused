'use client'

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, Printer } from 'lucide-react'
import { queueDoGenerationAction } from '@/actions/queue-jobs'
import { TaskDraftSourcePane } from '@/components/TaskDraftSourcePane'
import type { TaskDraftContext } from '@/lib/do-now'
import { dispatchInAppToast } from '@/lib/notifications'
import type { QueuedJob } from '@/lib/queue'
import type { ManualCopyBundleResult } from '@/lib/manual-copy-bundle'
import type {
  StudyOutputTaskOutputContent,
  TaskOutputPreset,
  TaskOutputTargetType,
} from '@/lib/types'

const OUTPUT_PRESETS: Array<{ value: TaskOutputPreset; label: string; note: string }> = [
  { value: 'report', label: 'Report', note: 'Structured writing for submission-ready documents.' },
  { value: 'presentation', label: 'Presentation', note: 'Slide-first outline and talking structure.' },
  { value: 'reviewer', label: 'Reviewer', note: 'Deliverable-shaped review handout when the task asks for it.' },
  { value: 'webpage', label: 'Webpage', note: 'HTML-first layout for page-style submissions.' },
  { value: 'documentation', label: 'Documentation', note: 'Reference-style structure with sections and notes.' },
]

const OUTPUT_TYPES: Array<{ value: TaskOutputTargetType; label: string; note: string }> = [
  { value: 'docx', label: 'DOCX', note: 'Document-style export foundation.' },
  { value: 'pdf', label: 'PDF', note: 'Printable submission preview.' },
  { value: 'ppt', label: 'PPT', note: 'Presentation deck structure.' },
  { value: 'html', label: 'HTML', note: 'Browser-renderable page.' },
  { value: 'css', label: 'CSS', note: 'Stylesheet output.' },
  { value: 'js', label: 'JS', note: 'Script output.' },
]

export function TaskDraftPanel({
  context,
  copyBundle,
  entryOrigin = 'do',
  doPageHref,
  onClose,
}: {
  context: TaskDraftContext
  copyBundle?: Pick<ManualCopyBundleResult, 'bundleText' | 'promptText'>
  entryOrigin?: 'today' | 'do'
  doPageHref?: string
  onClose: () => void
}) {
  const [preset, setPreset] = useState<TaskOutputPreset>('report')
  const [outputType, setOutputType] = useState<TaskOutputTargetType>('docx')
  const [queueJob, setQueueJob] = useState<QueuedJob | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const selectedPreset = OUTPUT_PRESETS.find((item) => item.value === preset) ?? OUTPUT_PRESETS[0]
  const selectedOutputType = OUTPUT_TYPES.find((item) => item.value === outputType) ?? OUTPUT_TYPES[0]
  const generatedOutput = extractTaskOutputFromJob(queueJob)
  const completedHref = typeof queueJob?.result?.href === 'string' ? queueJob.result.href : null
  const isQueuedOrRunning = queueJob?.status === 'pending' || queueJob?.status === 'running'
  const failedReason = queueJob?.status === 'failed' ? queueJob.error : null
  const groundingTone = generatedOutput?.groundingStatus ?? estimateGroundingStatus(context)

  useEffect(() => {
    if (!context.taskId) return
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null

    async function fetchJob() {
      try {
        const response = await fetch('/api/queue/jobs', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json() as { jobs?: QueuedJob[] }
        const nextJob = (data.jobs ?? []).find((job) =>
          (job.type === 'task_output' || job.type === 'do_generation')
          && (job.payload?.taskId === context.taskId || job.result?.taskId === context.taskId)
        ) ?? null
        if (!cancelled) setQueueJob(nextJob)
      } catch {
        // Queue polling should not close the modal.
      }
    }

    void fetchJob()
    interval = setInterval(fetchJob, 5000)
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [context.taskId])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
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

  const printableHtml = generatedOutput?.exports.find((item) => item.filename.endsWith('.html'))?.content ?? null

  async function queueGeneration() {
    if (!context.taskId || !context.moduleId || isQueuedOrRunning) return
    setQueueError(null)

    const result = await queueDoGenerationAction({
      taskId: context.taskId,
      moduleId: context.moduleId,
      context,
      preset,
      outputType,
    })

    if (result.error || !result.jobId) {
      setQueueError(result.error ?? 'Could not add this task output to the queue.')
      dispatchInAppToast({ title: 'Could not queue task output', description: result.error ?? 'Try again in a moment.', tone: 'error' })
      return
    }

    if (result.job) setQueueJob(result.job)
    window.dispatchEvent(new CustomEvent('stay-focused:queue-refresh', { detail: { job: result.job ?? null } }))
    dispatchInAppToast({ title: 'Task output added to queue.', description: 'The Study queue will track progress.', tone: 'success' })
  }

  return (
    <div
      className="motion-modal-backdrop"
      style={backdropStyle}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className="glass-panel glass-strong motion-modal-card"
        style={cardStyle}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Task output - ${context.taskTitle}`}
      >
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <p className="ui-kicker" style={{ margin: 0 }}>Generate output</p>
            <h2 style={titleStyle}>{context.taskTitle}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <span className="ui-chip" style={courseChipStyle}>{context.courseName}</span>
              {context.moduleTitle && context.moduleTitle !== context.taskTitle && (
                <span className="ui-chip" style={moduleChipStyle}>{context.moduleTitle}</span>
              )}
              <span className="ui-chip" style={groundingChipStyle(groundingTone)}>
                {groundingTone === 'limited' ? 'Limited grounding' : 'Grounded'}
              </span>
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
            <TaskQueueStatus
              job={queueJob}
              error={queueError ?? failedReason}
              hasOutput={Boolean(generatedOutput)}
              canGenerate={Boolean(context.taskId && context.moduleId)}
              onGenerate={queueGeneration}
            />

            <section style={sectionStyle}>
              <p style={sectionHeadingStyle}>Generation setup</p>
              <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                Pick the deliverable preset and target output type first. If readable task/source text is weak, Stay Focused will generate a scaffold instead of inventing missing content.
              </p>

              <div style={setupGridStyle}>
                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>Preset</span>
                  <select value={preset} onChange={(event) => setPreset(event.target.value as TaskOutputPreset)} className="ui-input" style={selectStyle} disabled={isQueuedOrRunning}>
                    {OUTPUT_PRESETS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <span style={fieldNoteStyle}>{selectedPreset.note}</span>
                </label>

                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>Output type</span>
                  <select value={outputType} onChange={(event) => setOutputType(event.target.value as TaskOutputTargetType)} className="ui-input" style={selectStyle} disabled={isQueuedOrRunning}>
                    {OUTPUT_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <span style={fieldNoteStyle}>{selectedOutputType.note}</span>
                </label>
              </div>
            </section>

            {generatedOutput ? (
              <section style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <p style={sectionHeadingStyle}>Preview</p>
                    <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                      {generatedOutput.summary}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {generatedOutput.previewMode !== 'code' && (
                      <button type="button" onClick={() => window.print()} className="ui-button ui-button-secondary ui-button-xs">
                        <Printer className="h-3.5 w-3.5" />
                        Print / Save PDF
                      </button>
                    )}
                    {generatedOutput.exports.map((file) => (
                      <button key={file.filename} type="button" onClick={() => downloadExportFile(file.filename, file.mimeType, file.content)} className="ui-button ui-button-ghost ui-button-xs">
                        <Download className="h-3.5 w-3.5" />
                        {file.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  <span className="ui-chip ui-chip-soft">{generatedOutput.preset}</span>
                  <span className="ui-chip ui-chip-soft">{generatedOutput.outputType.toUpperCase()}</span>
                  <span className="ui-chip ui-chip-soft">{generatedOutput.requirements.length} requirement{generatedOutput.requirements.length === 1 ? '' : 's'}</span>
                </div>

                {generatedOutput.previewMode === 'html' ? (
                  <iframe title={`${generatedOutput.title} preview`} srcDoc={printableHtml ?? generatedOutput.previewContent} className="task-output-preview-frame" />
                ) : generatedOutput.previewMode === 'code' ? (
                  <pre className="task-output-code-block">{generatedOutput.previewContent}</pre>
                ) : (
                  <pre className="task-output-rich-block">{generatedOutput.previewContent}</pre>
                )}

                <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.65rem' }}>
                  <TextSection heading="Requirement summary" body={generatedOutput.requirementSummary} />
                  <TextSection heading="Grounding note" body={generatedOutput.groundingNote} />
                  {generatedOutput.limitationNote ? (
                    <TextSection heading="Limits" body={generatedOutput.limitationNote} />
                  ) : null}
                </div>
              </section>
            ) : (
              <TaskInspectionCard context={context} />
            )}
          </div>

          <div className="draft-source-column">
            <TaskDraftSourcePane context={context} isBuilding={isQueuedOrRunning} />
          </div>
        </div>

        <div style={footerStyle}>
          {completedHref && (
            <Link href={completedHref} className="ui-button ui-button-primary" style={footerButtonStyle} onClick={onClose}>
              Open saved output
            </Link>
          )}
          {copyBundle && (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(copyBundle.bundleText)}
              className="ui-button ui-button-ghost"
              style={footerButtonStyle}
            >
              Copy task bundle
            </button>
          )}
          {entryOrigin === 'today' && doPageHref && (
            <Link href={doPageHref} className="ui-button ui-button-secondary" style={footerButtonStyle} onClick={onClose}>
              Open task page
            </Link>
          )}
          {context.learnHref && (
            <Link href={context.learnHref} className="ui-button ui-button-secondary" style={footerButtonStyle} onClick={onClose}>
              Open Learn
            </Link>
          )}
          <button type="button" onClick={onClose} className="ui-button ui-button-ghost" style={footerButtonStyle}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function TextSection({ heading, body }: { heading: string; body: string }) {
  return (
    <section style={sectionStyle}>
      <p style={sectionHeadingStyle}>{heading}</p>
      <div style={draftBodyStyle}>{body}</div>
    </section>
  )
}

function TaskInspectionCard({ context }: { context: TaskDraftContext }) {
  return (
    <section style={sectionStyle}>
      <p style={sectionHeadingStyle}>Task details</p>
      <div style={{ marginTop: '0.55rem', display: 'grid', gap: '0.55rem' }}>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
          {context.taskDetails || 'No extra task instructions were surfaced.'}
        </p>
        <div className="ui-meta-list">
          <span><strong>Course:</strong> {context.courseName}</span>
          <span><strong>Module:</strong> {context.moduleTitle ?? 'Module not surfaced'}</span>
          <span><strong>Source:</strong> {context.sourceTitle ?? 'No linked source surfaced'}</span>
        </div>
      </div>
    </section>
  )
}

function TaskQueueStatus({
  job,
  error,
  hasOutput,
  canGenerate,
  onGenerate,
}: {
  job: QueuedJob | null
  error: string | null
  hasOutput: boolean
  canGenerate: boolean
  onGenerate: () => void
}) {
  const isActive = job?.status === 'pending' || job?.status === 'running'
  const progress = Math.max(0, Math.min(job?.progress ?? 0, 100))

  return (
    <div style={statusBannerStyle(error ? 'error' : hasOutput ? 'done' : 'idle')}>
      <p style={statusTitleStyle}>
        {error ? 'Task output failed' : hasOutput ? 'Task output ready' : isActive ? 'Generating task output' : 'Prepare task output'}
      </p>
      <p style={statusBodyStyle}>
        {error
          ? error
          : hasOutput
            ? 'The generated output has been saved into Study Library and is ready for preview or export.'
            : isActive
              ? `The Study queue is building this output${job?.status === 'running' ? ` (${progress}%)` : ''}.`
              : 'Choose an output type and preset, then generate a first pass from the surfaced task requirements.'}
      </p>
      {isActive && (
        <div style={{ marginTop: '0.65rem', height: '0.45rem', borderRadius: '999px', overflow: 'hidden', background: 'var(--surface-soft)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ height: '100%', width: `${Math.max(4, progress)}%`, background: 'var(--accent)', transition: 'width 400ms ease' }} />
        </div>
      )}
      {!hasOutput && !isActive && (
        <button type="button" className="ui-button ui-button-secondary" onClick={onGenerate} disabled={!canGenerate} style={{ marginTop: '0.75rem' }}>
          Generate Output
        </button>
      )}
    </div>
  )
}

export function getTaskDraftSessionKey(context: TaskDraftContext) {
  return `${context.taskId ?? 'task'}::${context.taskTitle}::${context.sourceHref ?? context.canvasUrl ?? context.learnHref ?? 'context'}`
}

function extractTaskOutputFromJob(job: QueuedJob | null): StudyOutputTaskOutputContent | null {
  if (job?.status !== 'completed') return null
  const output = job.result?.output
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null
  return (output as StudyOutputTaskOutputContent).version === 'task-output-v1'
    ? output as StudyOutputTaskOutputContent
    : null
}

function estimateGroundingStatus(context: TaskDraftContext) {
  const text = [
    context.taskDetails,
    context.resourceSnippet,
    context.sourceText,
    context.sourceNote,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .trim()
  return text.length >= 220 ? 'grounded' : 'limited'
}

function groundingChipStyle(value: 'grounded' | 'limited'): CSSProperties {
  return value === 'grounded'
    ? {
        padding: '0.22rem 0.55rem',
        fontSize: '11px',
        fontWeight: 700,
        background: 'color-mix(in srgb, var(--accent-light) 44%, var(--surface-soft) 56%)',
        color: 'var(--accent-foreground)',
        border: '1px solid color-mix(in srgb, var(--accent-border) 30%, var(--border-subtle) 70%)',
      }
    : {
        padding: '0.22rem 0.55rem',
        fontSize: '11px',
        fontWeight: 700,
        background: 'color-mix(in srgb, var(--amber-light) 44%, var(--surface-soft) 56%)',
        color: 'var(--amber)',
        border: '1px solid color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)',
      }
}

function downloadExportFile(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
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

const sectionStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-base)',
  padding: '0.95rem',
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

const setupGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '0.8rem',
  marginTop: '0.8rem',
}

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: '0.35rem',
}

const fieldLabelStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--text-primary)',
}

const fieldNoteStyle: CSSProperties = {
  fontSize: '12px',
  lineHeight: 1.5,
  color: 'var(--text-muted)',
}

const selectStyle: CSSProperties = {
  minHeight: '2.6rem',
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

function statusBannerStyle(phase: 'done' | 'error' | 'idle'): CSSProperties {
  if (phase === 'done') {
    return {
      borderRadius: 'var(--radius-panel)',
      padding: '0.8rem 0.9rem',
      background: 'color-mix(in srgb, var(--blue-light) 44%, var(--surface-soft) 56%)',
      border: '1px solid color-mix(in srgb, var(--blue) 24%, var(--border-subtle) 76%)',
    }
  }

  if (phase === 'idle') {
    return {
      borderRadius: 'var(--radius-panel)',
      padding: '0.8rem 0.9rem',
      background: 'color-mix(in srgb, var(--surface-soft) 82%, transparent)',
      border: '1px solid var(--border-subtle)',
    }
  }

  return {
    borderRadius: 'var(--radius-panel)',
    padding: '0.8rem 0.9rem',
    background: 'color-mix(in srgb, var(--amber-light) 42%, var(--surface-soft) 58%)',
    border: '1px solid color-mix(in srgb, var(--amber) 22%, var(--border-subtle) 78%)',
  }
}
