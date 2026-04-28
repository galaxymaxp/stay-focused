'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ListTodo, X, CheckCircle, XCircle, Loader2, Clock, ChevronDown, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { QueuedJob, QueuedJobStatus } from '@/lib/queue'

const JOB_TYPE_LABELS: Record<string, string> = {
  canvas_sync: 'Canvas Sync',
  learn_generation: 'Deep Learn',
  do_generation: 'Do Now',
  resource_extraction: 'Resource Extraction',
  notification_scan: 'Notification Scan',
}

const STATUS_ORDER: QueuedJobStatus[] = ['running', 'pending', 'completed', 'failed', 'cancelled']

const GROUP_LABELS: Record<QueuedJobStatus, string> = {
  running: 'Running',
  pending: 'Pending',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function StatusIcon({ status }: { status: QueuedJobStatus }) {
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 text-sf-accent animate-spin" />
  if (status === 'pending') return <Clock className="h-3.5 w-3.5 text-sf-muted" />
  if (status === 'completed') return <CheckCircle className="h-3.5 w-3.5 text-green-600" />
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-500" />
  return <X className="h-3.5 w-3.5 text-sf-subtle" />
}

function ProgressBar({ progress, status }: { progress: number; status: QueuedJobStatus }) {
  if (status === 'pending' || status === 'cancelled') return null
  const color = status === 'failed' ? 'bg-red-400' : status === 'completed' ? 'bg-green-500' : 'bg-sf-accent'
  return (
    <div className="mt-1.5 h-1 w-full rounded-full bg-sf-border overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

function JobRow({ job }: { job: QueuedJob }) {
  const resultHref = job.result?.href as string | undefined
  const typeLabel = JOB_TYPE_LABELS[job.type] ?? job.type

  return (
    <div className="px-4 py-3 hover:bg-sf-surface-2 transition-colors">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex-shrink-0">
          <StatusIcon status={job.status} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-sf-text leading-snug line-clamp-1">{job.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-sf-muted bg-sf-surface-2 rounded px-1.5 py-0.5 font-medium">
              {typeLabel}
            </span>
            {job.status === 'running' && job.progress > 0 && (
              <span className="text-[11px] text-sf-accent font-medium">{job.progress}%</span>
            )}
          </div>
          <ProgressBar progress={job.progress} status={job.status} />
          {job.status === 'failed' && job.error && (
            <p className="text-[11px] text-red-500 mt-1 line-clamp-2">{job.error}</p>
          )}
          {job.status === 'completed' && resultHref && (
            <a
              href={resultHref}
              className="text-[11px] text-sf-accent hover:underline mt-1 inline-block font-medium"
            >
              Open result →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function JobGroup({ status, jobs }: { status: QueuedJobStatus; jobs: QueuedJob[] }) {
  const [collapsed, setCollapsed] = useState(
    status === 'completed' || status === 'cancelled',
  )

  if (jobs.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2 border-b border-sf-border bg-sf-surface-2/60 hover:bg-sf-surface-2 transition-colors"
      >
        <span className="text-[11px] font-semibold text-sf-muted uppercase tracking-wide">
          {GROUP_LABELS[status]} · {jobs.length}
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-sf-muted transition-transform',
            collapsed && '-rotate-90',
          )}
        />
      </button>
      {!collapsed && (
        <div className="divide-y divide-sf-border-muted">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}

export function QueuePanel() {
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState<QueuedJob[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bgPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/jobs', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as { jobs: QueuedJob[] }
      setJobs(data.jobs ?? [])
    } catch {
      // silent
    }
  }, [])

  // Initial fetch on mount so the badge is immediately correct
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchJobs()
  }, [fetchJobs])

  // Background poll every 30 s when panel is closed — keeps the pill visible
  useEffect(() => {
    if (open) {
      if (bgPollRef.current) {
        clearInterval(bgPollRef.current)
        bgPollRef.current = null
      }
      return
    }
    bgPollRef.current = setInterval(fetchJobs, 30000)
    return () => {
      if (bgPollRef.current) clearInterval(bgPollRef.current)
    }
  }, [open, fetchJobs])

  // Active panel poll at 12 s
  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetchJobs().finally(() => setLoading(false))

    pollRef.current = setInterval(fetchJobs, 12000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open, fetchJobs])

  // Outside click to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeCount = jobs.filter(
    (j) => j.status === 'pending' || j.status === 'running',
  ).length

  const grouped = STATUS_ORDER.reduce<Record<QueuedJobStatus, QueuedJob[]>>(
    (acc, s) => {
      acc[s] = jobs.filter((j) => j.status === s)
      return acc
    },
    { running: [], pending: [], completed: [], failed: [], cancelled: [] },
  )

  const hasAny = jobs.length > 0

  return (
    <div ref={ref} className="relative">
      {activeCount > 0 ? (
        <button
          onClick={() => setOpen((p) => !p)}
          aria-label="Queue — jobs in progress"
          className="relative flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-sf-accent-border bg-sf-accent-light text-sf-accent hover:bg-sf-accent hover:text-white transition-colors"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          <span className="text-xs font-semibold whitespace-nowrap hidden sm:inline">
            {activeCount === 1 ? 'Queue: 1 running' : `Processing ${activeCount} items`}
          </span>
          <span className="text-[11px] font-bold sm:hidden">{activeCount}</span>
        </button>
      ) : (
        <button
          onClick={() => setOpen((p) => !p)}
          aria-label="Queue"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors"
        >
          <ListTodo className="h-4 w-4" />
        </button>
      )}

      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={() => setOpen(false)}
          />

          <div
            className={cn(
              'absolute right-0 top-10 z-50 w-[360px] rounded-2xl border border-sf-border bg-sf-surface shadow-xl overflow-hidden',
              // Mobile: full-width sheet from bottom
              'max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:w-auto max-sm:rounded-2xl',
            )}
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-sf-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-sf-text">Background Jobs</p>
                {activeCount > 0 && (
                  <p className="text-xs text-sf-accent mt-0.5 font-medium">
                    {activeCount} active
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setLoading(true); fetchJobs().finally(() => setLoading(false)) }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors"
                  aria-label="Refresh"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="max-h-[420px] overflow-y-auto">
              {loading && !hasAny ? (
                <div className="flex items-center justify-center py-10 text-sf-muted">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : !hasAny ? (
                <div className="px-4 py-8 text-center">
                  <ListTodo className="h-8 w-8 text-sf-subtle mx-auto mb-2" />
                  <p className="text-sm text-sf-muted">No jobs yet.</p>
                  <p className="text-xs text-sf-subtle mt-0.5">
                    Queue a sync, Deep Learn, or Do Now to see progress here.
                  </p>
                </div>
              ) : (
                STATUS_ORDER.map((status) => (
                  <JobGroup key={status} status={status} jobs={grouped[status]} />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
