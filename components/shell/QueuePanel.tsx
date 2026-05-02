'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ListTodo, X, CheckCircle, XCircle, Loader2, Clock, RefreshCw, AlertCircle, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { QueuedJob, QueuedJobStatus } from '@/lib/queue'
import { buildSourceOcrStatusMessage, SOURCE_OCR_JOB_TYPE } from '@/lib/source-ocr-queue'

const PILL_BASE = 'queue-panel-pill relative isolate inline-flex items-center gap-1.5 h-8 rounded-full px-3 overflow-hidden transition-colors hover:opacity-90'
const PILL_TEXT: React.CSSProperties = { fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer', lineHeight: 1 }

function ProgressBar({ progress, status }: { progress: number; status: QueuedJobStatus }) {
  if (status === 'pending' || status === 'cancelled') return null

  const color = status === 'failed'
    ? 'var(--red)'
    : status === 'completed'
      ? 'var(--green, #16a34a)'
      : 'var(--accent)'

  return (
    <div
      style={{
        marginTop: '0.52rem',
        height: '0.42rem',
        width: '100%',
        borderRadius: '999px',
        overflow: 'hidden',
        background: 'color-mix(in srgb, var(--surface-soft) 88%, transparent)',
        border: '1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent)',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.max(4, Math.min(progress, 100))}%`,
          borderRadius: '999px',
          background: color,
          boxShadow: `0 0 14px color-mix(in srgb, ${color} 20%, transparent)`,
          transition: 'width 500ms ease',
        }}
      />
    </div>
  )
}

function QueueSection({
  title,
  count,
  action,
  children,
}: {
  title: string
  count: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  if (count === 0) return null

  return (
    <section style={{ display: 'grid', gap: '0.55rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'center' }}>
        <p className="ui-kicker" style={{ margin: 0 }}>
          {title} - {count}
        </p>
        {action}
      </div>
      <div style={{ display: 'grid', gap: '0.52rem' }}>{children}</div>
    </section>
  )
}

function ActiveJobCard({ job }: { job: QueuedJob }) {
  const fileName = getJobSourceName(job)
  const progress = Math.max(0, Math.min(job.progress ?? 0, 100))
  const isPending = job.status === 'pending'

  return (
    <article className="glass-panel glass-soft" style={jobCardStyle('active')}>
      <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
        <span style={iconShellStyle('active')}>
          {isPending ? <Clock className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={titleStyle}>{formatQueueTitle(job)}</p>
          <p style={sourceStyle}>{fileName}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', marginTop: '0.35rem' }}>
            <span style={statusTextStyle}>{isPending ? 'Waiting to start' : getActiveStatus(job, progress)}</span>
            {!isPending && <span style={percentStyle}>{progress}%</span>}
          </div>
          <ProgressBar progress={progress} status={job.status} />
        </div>
      </div>
    </article>
  )
}

function CompletedJobCard({ job, onDismiss }: { job: QueuedJob; onDismiss: (jobId: string) => void }) {
  const resultHref = getResultHref(job)

  return (
    <article className="glass-panel glass-soft" style={jobCardStyle('completed')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
          <span style={iconShellStyle('completed')}>
            <CheckCircle className="h-3.5 w-3.5" />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={titleStyle}>{getCompletedTitle(job)}</p>
            <p style={sourceStyle}>{getJobSourceName(job)}</p>
          </div>
        </div>
        <button type="button" onClick={() => onDismiss(job.id)} className="queue-action-icon" style={ghostIconStyle} aria-label="Dismiss completed job">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.42rem', flexWrap: 'wrap', marginTop: '0.72rem' }}>
        {resultHref && (
          <a href={resultHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open result
          </a>
        )}
        <button type="button" onClick={() => onDismiss(job.id)} className="ui-button ui-button-ghost ui-button-xs">
          Dismiss
        </button>
      </div>
    </article>
  )
}

function FailedJobCard({ job, onDismiss }: { job: QueuedJob; onDismiss: (jobId: string) => void }) {
  return (
    <article className="glass-panel glass-soft" style={jobCardStyle('failed')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
          <span style={iconShellStyle('failed')}>
            <XCircle className="h-3.5 w-3.5" />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={titleStyle}>{getFailedTitle(job)}</p>
            <p style={{ ...statusTextStyle, color: 'var(--red)', marginTop: '0.22rem' }}>{humanizeError(job.error)}</p>
          </div>
        </div>
        <button type="button" onClick={() => onDismiss(job.id)} className="queue-action-icon" style={ghostIconStyle} aria-label="Dismiss failed job">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.42rem', flexWrap: 'wrap', marginTop: '0.72rem' }}>
        <button type="button" onClick={() => onDismiss(job.id)} className="ui-button ui-button-ghost ui-button-xs">
          Dismiss
        </button>
      </div>
    </article>
  )
}

export function QueuePanel() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState<QueuedJob[]>([])
  const [recentlyCompleted, setRecentlyCompleted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedJobIdsRef = useRef<Set<string>>(new Set())
  const completedJobsInitializedRef = useRef(false)
  const sourceOcrSignatureRef = useRef<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/jobs', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as { jobs: QueuedJob[] }
      const fetched = data.jobs ?? []
      setJobs(fetched)

      const sourceOcrSignature = buildSourceOcrQueueSignature(fetched)
      if (sourceOcrSignatureRef.current === null) {
        sourceOcrSignatureRef.current = sourceOcrSignature
      } else if (sourceOcrSignatureRef.current !== sourceOcrSignature) {
        sourceOcrSignatureRef.current = sourceOcrSignature
        router.refresh()
      }

      if (!completedJobsInitializedRef.current) {
        completedJobIdsRef.current = new Set(fetched.filter((job) => job.status === 'completed').map((job) => job.id))
        completedJobsInitializedRef.current = true
      }
      const completedNow = fetched.filter((job) => job.status === 'completed' && !completedJobIdsRef.current.has(job.id))
      if (completedNow.length > 0) {
        for (const job of completedNow) completedJobIdsRef.current.add(job.id)
        window.dispatchEvent(new CustomEvent('stay-focused:notifications-refresh'))
        if (completedNow.some((job) => job.type === 'canvas_sync')) {
          window.dispatchEvent(new CustomEvent('stay-focused:canvas-sync-complete', { detail: { jobs: completedNow } }))
        }
        router.refresh()
      }

      const active = fetched.filter((j) => j.status === 'pending' || j.status === 'running').length
      const oneMinAgo = Date.now() - 60 * 1000
      setRecentlyCompleted(
        active === 0 &&
        fetched.some((j) => j.status === 'completed' && j.completedAt && new Date(j.completedAt).getTime() > oneMinAgo),
      )
    } catch {
      // Keep the topbar quiet if polling fails.
    }
  }, [router])

  const mutateQueue = useCallback(async (body: Record<string, string>) => {
    setMutating(true)
    try {
      const res = await fetch('/api/queue/jobs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) await fetchJobs()
    } finally {
      setMutating(false)
    }
  }, [fetchJobs])

  const dismissJob = useCallback((jobId: string) => {
    setJobs((current) => current.filter((job) => job.id !== jobId))
    void mutateQueue({ action: 'dismiss', jobId })
  }, [mutateQueue])

  const clearCompleted = useCallback(() => {
    setJobs((current) => current.filter((job) => job.status !== 'completed'))
    void mutateQueue({ action: 'clear_completed' })
  }, [mutateQueue])

  const addOptimisticJob = useCallback((job: QueuedJob) => {
    if (job.dismissedAt) return
    setJobs((current) => {
      const next = current.filter((existing) => existing.id !== job.id)
      return [job, ...next]
    })
    if (job.status === 'pending' || job.status === 'running') {
      setRecentlyCompleted(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    const id = setInterval(fetchJobs, 30000)
    return () => clearInterval(id)
  }, [fetchJobs])

  useEffect(() => {
    function refreshQueue(event: Event) {
      const maybeJob = (event as CustomEvent<{ job?: QueuedJob | null }>).detail?.job
      if (maybeJob) addOptimisticJob(maybeJob)
      void fetchJobs()
    }

    window.addEventListener('stay-focused:queue-refresh', refreshQueue)
    return () => window.removeEventListener('stay-focused:queue-refresh', refreshQueue)
  }, [addOptimisticJob, fetchJobs])

  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    setLoading(true)
    fetchJobs().finally(() => setLoading(false))

    pollRef.current = setInterval(fetchJobs, 12000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open, fetchJobs])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'running')
  const failedJobs = jobs.filter((j) => j.status === 'failed')
  const completedJobs = jobs.filter((j) => j.status === 'completed').slice(0, 5)
  const runningJobs = jobs.filter((j) => j.status === 'running')
  const activeCount = activeJobs.length
  const runningCount = runningJobs.length
  const maxProgress = runningJobs.length > 0 ? Math.max(...runningJobs.map((j) => j.progress)) : 0
  const pillProgress = Math.max(0, Math.min(maxProgress, 100))
  const hasFailed = failedJobs.length > 0
  const hasAny = activeJobs.length + failedJobs.length + completedJobs.length > 0
  const toggle = () => setOpen((p) => !p)

  return (
    <div ref={ref} className="queue-panel queue-panel-anchor relative">
      {activeCount > 0 ? (
        <button
          onClick={toggle}
          aria-label={`Queue: ${runningCount > 0 ? `${runningCount} running` : `${activeCount} queued`}`}
          className={PILL_BASE}
          style={{
            ...PILL_TEXT,
            background: 'color-mix(in srgb, var(--accent) 18%, var(--surface-elevated) 82%)',
            border: '1px solid color-mix(in srgb, var(--accent) 48%, var(--border-subtle) 52%)',
            color: 'var(--accent-foreground)',
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent), 0 8px 18px rgba(0, 0, 0, 0.08)',
          }}
        >
          {pillProgress > 0 && pillProgress < 100 && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 -z-10 transition-all duration-500"
              style={{
                width: `${pillProgress}%`,
                background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 28%, transparent), color-mix(in srgb, var(--accent) 16%, transparent))',
              }}
            />
          )}
          <Loader2 className="relative z-10 h-3.5 w-3.5 animate-spin flex-shrink-0" />
          <span className="relative z-10">{getQueuePillLabel(activeJobs, runningCount, activeCount)}</span>
        </button>
      ) : hasFailed ? (
        <button
          onClick={toggle}
          aria-label="Queue: needs attention"
          className={PILL_BASE}
          style={{
            ...PILL_TEXT,
            background: 'color-mix(in srgb, var(--red) 14%, var(--surface-elevated) 86%)',
            border: '1px solid color-mix(in srgb, var(--red) 44%, var(--border-subtle) 56%)',
            color: 'var(--red)',
          }}
        >
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Needs attention</span>
        </button>
      ) : recentlyCompleted ? (
        <button
          onClick={toggle}
          aria-label="Queue: done"
          className={PILL_BASE}
          style={{
            ...PILL_TEXT,
            background: 'color-mix(in srgb, var(--green, #16a34a) 10%, var(--surface-elevated) 90%)',
            border: '1px solid color-mix(in srgb, var(--green, #16a34a) 30%, var(--border-subtle) 70%)',
            color: 'var(--green, #16a34a)',
          }}
        >
          <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Done</span>
        </button>
      ) : (
        <button
          onClick={toggle}
          aria-label="Queue"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors"
        >
          <ListTodo className="h-4 w-4" />
        </button>
      )}

      {open && (
        <>
          <div className="queue-panel-backdrop" onClick={() => setOpen(false)} />

          <div
            className={cn(
              'queue-panel-popover ui-floating absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(25.5rem,calc(100vw-2rem))] overflow-hidden',
            )}
            style={{
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated) 96%, var(--accent-light) 4%), color-mix(in srgb, var(--surface-soft) 92%, var(--surface-elevated) 8%))',
              border: '1px solid color-mix(in srgb, var(--accent-border) 18%, var(--border-subtle) 82%)',
              boxShadow: '0 18px 46px rgba(0, 0, 0, 0.16), 0 0 28px color-mix(in srgb, var(--accent-shadow) 70%, transparent)',
              borderRadius: 'var(--radius-panel)',
            }}
          >
            <div style={{ padding: '0.92rem 0.98rem 0.72rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.8rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.35, fontWeight: 750, color: 'var(--text-primary)' }}>Study queue</p>
                <p style={{ margin: '0.18rem 0 0', fontSize: '12px', lineHeight: 1.45, color: 'var(--text-muted)' }}>
                  {activeCount > 0 ? `${activeCount} background job${activeCount === 1 ? '' : 's'} in progress` : hasFailed ? 'A background job needs attention' : 'Recent background activity'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => { setLoading(true); fetchJobs().finally(() => setLoading(false)) }}
                  className="queue-action-icon"
                  style={ghostIconStyle}
                  aria-label="Refresh queue"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', (loading || mutating) && 'animate-spin')} />
                </button>
                <button type="button" onClick={() => setOpen(false)} className="queue-action-icon" style={ghostIconStyle} aria-label="Close queue">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="queue-panel-scroll" style={{ maxHeight: '430px', overflowY: 'auto', padding: '0 0.78rem 0.9rem', display: 'grid', gap: '0.85rem' }}>
              {loading && !hasAny ? (
                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1.4rem', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : !hasAny ? (
                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1.2rem', textAlign: 'center' }}>
                  <ListTodo className="h-7 w-7 mx-auto" style={{ color: 'var(--text-muted)' }} />
                  <p style={{ margin: '0.55rem 0 0', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 650 }}>Nothing in the queue.</p>
                  <p style={{ margin: '0.22rem 0 0', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                    Generate a study pack or sync Canvas to see progress here.
                  </p>
                </div>
              ) : (
                <>
                  <QueueSection title="Active" count={activeJobs.length}>
                    {activeJobs.map((job) => <ActiveJobCard key={job.id} job={job} />)}
                  </QueueSection>

                  <QueueSection title="Needs attention" count={failedJobs.length}>
                    {failedJobs.map((job) => <FailedJobCard key={job.id} job={job} onDismiss={dismissJob} />)}
                  </QueueSection>

                  <QueueSection
                    title="Recently completed"
                    count={completedJobs.length}
                    action={completedJobs.length > 1 ? (
                      <button type="button" onClick={clearCompleted} className="ui-button ui-button-ghost ui-button-xs">
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear completed
                      </button>
                    ) : null}
                  >
                    {completedJobs.map((job) => <CompletedJobCard key={job.id} job={job} onDismiss={dismissJob} />)}
                  </QueueSection>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatQueueTitle(job: QueuedJob) {
  if (job.type === 'learn_generation') {
    return `Generating study pack: ${getJobSourceName(job)}`
  }
  if (job.type === 'task_output' || job.type === 'do_generation') {
    return `Generating task output: ${getJobSourceName(job)}`
  }
  if (job.type === 'canvas_sync') {
    const count = getNumber(job.payload, 'courseCount') ?? 1
    return `Syncing Canvas: ${count} course${count === 1 ? '' : 's'}`
  }
  if (job.type === SOURCE_OCR_JOB_TYPE) {
    return cleanJobTitle(job.title)
  }
  return cleanJobTitle(job.title)
}

function getJobSourceName(job: QueuedJob) {
  if (job.type === 'canvas_sync') {
    const courseNames = getStringArray(job.result, 'courseNames') ?? getStringArray(job.payload, 'courseNames')
    if (courseNames?.length === 1) return courseNames[0]
    if (courseNames && courseNames.length > 1) return `${courseNames.length} Canvas courses`
    return 'Canvas'
  }
  if (job.type === SOURCE_OCR_JOB_TYPE) return 'Scanned PDF'

  return getString(job.result, 'resourceTitle')
    ?? getString(job.payload, 'resourceTitle')
    ?? getString(job.result, 'taskTitle')
    ?? getString(job.payload, 'taskTitle')
    ?? getTaskContextTitle(job)
    ?? stripKnownPrefix(cleanJobTitle(job.title))
    ?? 'Study source'
}

function getResultHref(job: QueuedJob) {
  return getString(job.result, 'href')
}

function getString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNumber(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getStringArray(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  if (!Array.isArray(value)) return null
  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return strings.length > 0 ? strings : null
}

function getTaskContextTitle(job: QueuedJob) {
  const context = job.payload?.context
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  const title = (context as Record<string, unknown>).taskTitle
  return typeof title === 'string' && title.trim() ? title.trim() : null
}

function cleanJobTitle(title: string) {
  return title.replace(/^Deep Learn:\s*/i, 'Generating study pack: ').trim()
}

function stripKnownPrefix(title: string) {
  const stripped = title
    .replace(/^Generating study pack:\s*/i, '')
    .replace(/^Generating task output:\s*/i, '')
    .replace(/^Deep Learn:\s*/i, '')
    .replace(/^Do Now:\s*/i, '')
    .trim()
  return stripped || null
}

function getActiveStatus(job: QueuedJob, progress: number) {
  const statusMessage = getString(job.result, 'statusMessage')
  if (statusMessage) return statusMessage
  if (job.type === 'canvas_sync') {
    if (progress < 18) return 'Connecting to Canvas'
    if (progress < 42) return 'Reading selected courses'
    if (progress < 58) return 'Importing module content'
    if (progress < 72) return 'Organizing data'
    if (progress < 86) return 'Saving to Stay Focused'
    if (progress < 96) return 'Extracting tasks/resources'
    return 'Finalizing sync'
  }
  if (job.type === SOURCE_OCR_JOB_TYPE) {
    return buildSourceOcrStatusMessage({
      pagesProcessed: getNumber(job.result, 'pagesProcessed') ?? getNumber(job.payload, 'pagesProcessed'),
      pageCount: getNumber(job.result, 'pageCount') ?? getNumber(job.payload, 'pageCount'),
      queued: job.status === 'pending',
    })
  }
  if (job.type === 'task_output' || job.type === 'do_generation') {
    if (progress < 30) return 'Reading task details'
    if (progress < 80) return 'Drafting the first output'
    if (progress < 100) return 'Saving the task output'
    return 'Finishing up'
  }
  if (progress < 30) return 'Reading the source'
  if (progress < 75) return 'Building notes, key terms, and questions'
  if (progress < 100) return 'Saving the study pack'
  return 'Finishing up'
}

function getCompletedTitle(job: QueuedJob) {
  if (job.type === 'canvas_sync') return 'Canvas sync complete'
  if (job.type === SOURCE_OCR_JOB_TYPE) return 'Scanned PDF prepared'
  if (job.type === 'learn_generation') return 'Study pack ready'
  if (job.type === 'task_output' || job.type === 'do_generation') return 'Task output ready'
  return 'Job complete'
}

function getFailedTitle(job: QueuedJob) {
  if (job.type === 'canvas_sync') return 'Canvas sync failed'
  if (job.type === SOURCE_OCR_JOB_TYPE) return 'Scanned PDF preparation failed'
  if (job.type === 'learn_generation') return 'Study pack failed'
  if (job.type === 'task_output' || job.type === 'do_generation') return 'Task output failed'
  return `Failed: ${getJobSourceName(job)}`
}

function getQueuePillLabel(activeJobs: QueuedJob[], runningCount: number, activeCount: number) {
  const canvasCount = activeJobs.filter((job) => job.type === 'canvas_sync').length
  const ocrCount = activeJobs.filter((job) => job.type === SOURCE_OCR_JOB_TYPE).length
  if (canvasCount === activeCount) return `Syncing ${activeCount}`
  if (ocrCount === activeCount) return `Scanning ${activeCount}`
  if (runningCount > 0) return `Processing ${activeCount}`
  return `Queue: ${activeCount}`
}

function buildSourceOcrQueueSignature(jobs: QueuedJob[]) {
  return jobs
    .filter((job) => job.type === SOURCE_OCR_JOB_TYPE)
    .map((job) => {
      const resourceId = getString(job.result, 'resourceId') ?? getString(job.payload, 'resourceId') ?? job.id
      return [
        job.id,
        resourceId,
        job.status,
        job.progress,
        getNumber(job.result, 'pagesProcessed') ?? getNumber(job.payload, 'pagesProcessed') ?? '',
        getNumber(job.result, 'pageCount') ?? getNumber(job.payload, 'pageCount') ?? '',
        job.completedAt ?? '',
      ].join(':')
    })
    .join('|')
}

function humanizeError(error: string | null) {
  const fallback = 'This background job could not finish yet.'
  if (!error) return fallback
  const trimmed = error.replace(/\s+/g, ' ').trim()
  if (!trimmed) return fallback
  return trimmed.length > 150 ? `${trimmed.slice(0, 147).trim()}...` : trimmed
}

function jobCardStyle(tone: 'active' | 'completed' | 'failed'): React.CSSProperties {
  return {
    ['--glass-panel-bg' as string]: tone === 'active'
      ? 'linear-gradient(180deg, color-mix(in srgb, var(--surface-selected) 44%, var(--surface-elevated) 56%), color-mix(in srgb, var(--surface-soft) 82%, var(--accent-light) 18%))'
      : tone === 'failed'
        ? 'linear-gradient(180deg, color-mix(in srgb, var(--red-light) 16%, var(--surface-elevated) 84%), color-mix(in srgb, var(--surface-soft) 90%, transparent))'
        : 'linear-gradient(180deg, color-mix(in srgb, var(--green-light) 16%, var(--surface-elevated) 84%), color-mix(in srgb, var(--surface-soft) 92%, transparent))',
    ['--glass-panel-border' as string]: tone === 'active'
      ? 'color-mix(in srgb, var(--accent-border) 26%, var(--border-subtle) 74%)'
      : tone === 'failed'
        ? 'color-mix(in srgb, var(--red) 24%, var(--border-subtle) 76%)'
        : 'color-mix(in srgb, var(--green, #16a34a) 18%, var(--border-subtle) 82%)',
    borderRadius: 'var(--radius-panel)',
    padding: '0.72rem 0.78rem',
    overflow: 'hidden',
    boxShadow: tone === 'active' ? '0 8px 22px color-mix(in srgb, var(--accent-shadow) 70%, transparent)' : 'none',
  }
}

function iconShellStyle(tone: 'active' | 'completed' | 'failed'): React.CSSProperties {
  return {
    width: '1.75rem',
    height: '1.75rem',
    borderRadius: '999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: tone === 'active'
      ? 'color-mix(in srgb, var(--accent-light) 70%, var(--surface-elevated) 30%)'
      : tone === 'failed'
        ? 'color-mix(in srgb, var(--red-light) 36%, var(--surface-elevated) 64%)'
        : 'color-mix(in srgb, var(--green-light) 36%, var(--surface-elevated) 64%)',
    color: tone === 'failed' ? 'var(--red)' : tone === 'completed' ? 'var(--green, #16a34a)' : 'var(--accent-foreground)',
  }
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  lineHeight: 1.35,
  fontWeight: 750,
  color: 'var(--text-primary)',
}

const sourceStyle: React.CSSProperties = {
  margin: '0.18rem 0 0',
  fontSize: '12px',
  lineHeight: 1.45,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const statusTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  lineHeight: 1.45,
  color: 'var(--text-muted)',
}

const percentStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 750,
  color: 'var(--accent-foreground)',
}

const ghostIconStyle: React.CSSProperties = {
  width: '1.8rem',
  height: '1.8rem',
  borderRadius: '999px',
  border: '0',
  background: 'color-mix(in srgb, var(--surface-soft) 72%, transparent)',
  color: 'var(--text-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}
