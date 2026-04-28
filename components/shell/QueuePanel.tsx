'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ListTodo, X, CheckCircle, XCircle, Loader2, Clock, RefreshCw, AlertCircle, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { QueuedJob, QueuedJobStatus } from '@/lib/queue'

const PILL_BASE = 'queue-panel-pill relative inline-flex items-center gap-1.5 h-8 rounded-full px-3 transition-colors hover:opacity-90'
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
            <span style={statusTextStyle}>{isPending ? 'Waiting to start' : getActiveStatus(progress)}</span>
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
            <p style={titleStyle}>Study pack ready</p>
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
            <p style={titleStyle}>Failed: {getJobSourceName(job)}</p>
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
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState<QueuedJob[]>([])
  const [recentlyCompleted, setRecentlyCompleted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/jobs', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as { jobs: QueuedJob[] }
      const fetched = data.jobs ?? []
      setJobs(fetched)

      const active = fetched.filter((j) => j.status === 'pending' || j.status === 'running').length
      const oneMinAgo = Date.now() - 60 * 1000
      setRecentlyCompleted(
        active === 0 &&
        fetched.some((j) => j.status === 'completed' && j.completedAt && new Date(j.completedAt).getTime() > oneMinAgo),
      )
    } catch {
      // Keep the topbar quiet if polling fails.
    }
  }, [])

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
  const hasFailed = failedJobs.length > 0
  const hasAny = activeJobs.length + failedJobs.length + completedJobs.length > 0
  const toggle = () => setOpen((p) => !p)

  return (
    <div ref={ref} className="queue-panel relative">
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
          <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          <span>{runningCount > 0 ? `Processing ${activeCount}` : `Queue: ${activeCount}`}</span>
          {maxProgress > 0 && maxProgress < 100 && (
            <span
              className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full overflow-hidden"
              style={{ background: 'color-mix(in srgb, var(--accent) 20%, var(--border-subtle) 80%)' }}
            >
              <span
                className="block h-full transition-all duration-500"
                style={{ width: `${maxProgress}%`, background: 'var(--accent)' }}
              />
            </span>
          )}
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
          <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" onClick={() => setOpen(false)} />

          <div
            className={cn(
              'absolute right-0 top-10 z-50 w-[382px] rounded-2xl overflow-hidden',
              'max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:w-auto max-sm:rounded-2xl',
            )}
            style={{
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated) 96%, var(--accent-light) 4%), color-mix(in srgb, var(--surface-soft) 92%, var(--surface-elevated) 8%))',
              border: '1px solid color-mix(in srgb, var(--accent-border) 18%, var(--border-subtle) 82%)',
              boxShadow: '0 18px 46px rgba(0, 0, 0, 0.16), 0 0 28px color-mix(in srgb, var(--accent-shadow) 70%, transparent)',
            }}
          >
            <div style={{ padding: '0.92rem 0.98rem 0.72rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.8rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.35, fontWeight: 750, color: 'var(--text-primary)' }}>Study queue</p>
                <p style={{ margin: '0.18rem 0 0', fontSize: '12px', lineHeight: 1.45, color: 'var(--text-muted)' }}>
                  {activeCount > 0 ? `${activeCount} study job${activeCount === 1 ? '' : 's'} in progress` : hasFailed ? 'A study job needs attention' : 'Recent study pack activity'}
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

            <div style={{ maxHeight: '430px', overflowY: 'auto', padding: '0 0.78rem 0.9rem', display: 'grid', gap: '0.85rem' }}>
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
    return job.status === 'pending' ? 'Queued study pack' : `Generating: ${getJobSourceName(job)}`
  }
  return cleanJobTitle(job.title)
}

function getJobSourceName(job: QueuedJob) {
  return getString(job.result, 'resourceTitle')
    ?? getString(job.payload, 'resourceTitle')
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

function cleanJobTitle(title: string) {
  return title.replace(/^Deep Learn:\s*/i, 'Generating study pack: ').trim()
}

function stripKnownPrefix(title: string) {
  const stripped = title
    .replace(/^Generating study pack:\s*/i, '')
    .replace(/^Deep Learn:\s*/i, '')
    .replace(/^Do Now:\s*/i, '')
    .trim()
  return stripped || null
}

function getActiveStatus(progress: number) {
  if (progress < 30) return 'Reading the source'
  if (progress < 75) return 'Building notes, key terms, and questions'
  if (progress < 100) return 'Saving the study pack'
  return 'Finishing up'
}

function humanizeError(error: string | null) {
  const fallback = 'Could not build a study pack from this source yet.'
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
