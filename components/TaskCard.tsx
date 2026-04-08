'use client'

import { useSyncExternalStore, useTransition } from 'react'
import { updateTaskStatus } from '@/actions/tasks'
import type { Task } from '@/lib/types'

export function TaskCard({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition()
  const isCompleted = task.status === 'completed'

  function handleToggle() {
    startTransition(() => updateTaskStatus(task.id, isCompleted ? 'pending' : 'completed'))
  }

  return (
    <li className="glass-panel glass-hover" style={{
      ['--glass-panel-bg' as string]: 'var(--glass-surface-strong)',
      ['--glass-panel-border' as string]: 'var(--glass-border)',
      ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.8rem',
      borderRadius: 'var(--radius-panel)',
      padding: '0.95rem 1rem',
      opacity: isPending ? 0.4 : isCompleted ? 0.55 : 1,
      transition: 'opacity 0.15s',
    }}>
      <button
        onClick={handleToggle}
        disabled={isPending}
        className="ui-control"
        style={{
          marginTop: '2px',
          width: '16px',
          height: '16px',
          borderRadius: 'var(--radius-tight)',
          border: isCompleted ? '1.5px solid color-mix(in srgb, var(--accent-border) 70%, var(--border-subtle) 30%)' : '1.5px solid var(--border-subtle)',
          background: isCompleted ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'border-color 0.15s',
        }}
        aria-label={isCompleted ? 'Mark pending' : 'Mark complete'}
      >
        {isCompleted && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '15px',
            lineHeight: 1.4,
            fontWeight: 600,
            color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: isCompleted ? 'line-through' : 'none',
            overflowWrap: 'anywhere',
          }}>
            {task.title}
          </span>
          <PriorityBadge priority={task.priority} />
        </div>
        {task.details && (
          <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.5, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{task.details}</p>
        )}
        {task.deadline && !isCompleted && <DeadlinePill deadline={task.deadline} />}
      </div>
    </li>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, { background: string; color: string; border: string }> = {
    high: { background: 'color-mix(in srgb, var(--red-light) 24%, var(--surface-soft) 76%)', color: 'var(--red)', border: 'color-mix(in srgb, var(--red) 24%, var(--border-subtle) 76%)' },
    medium: { background: 'color-mix(in srgb, var(--amber-light) 24%, var(--surface-soft) 76%)', color: 'var(--amber)', border: 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)' },
    low: { background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)', color: 'var(--text-muted)', border: 'var(--border-subtle)' },
  }
  const s = styles[priority] ?? styles.low
  return (
    <span className="ui-chip" style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '11px',
      fontWeight: 500,
      padding: '0.22rem 0.55rem',
      borderRadius: '999px',
      background: s.background,
      color: s.color,
      flexShrink: 0,
      border: `1px solid ${s.border}`,
    }}>
      {priority}
    </span>
  )
}

function subscribeToClock(callback: () => void) {
  const intervalId = window.setInterval(callback, 60_000)
  return () => window.clearInterval(intervalId)
}

function getClockSnapshot() {
  return Date.now()
}

function getClockServerSnapshot() {
  return 0
}

function DeadlinePill({ deadline }: { deadline: string }) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockServerSnapshot)
  const daysUntil = Math.ceil((new Date(deadline).getTime() - now) / (1000 * 60 * 60 * 24))

  const label = daysUntil < 0
    ? 'Overdue'
    : daysUntil === 0
      ? 'Due today'
      : daysUntil === 1
        ? 'Due tomorrow'
        : `Due in ${daysUntil} days`

  const color = daysUntil < 0
    ? 'var(--red)'
    : daysUntil <= 1
      ? '#C4672A'
      : daysUntil <= 3
        ? 'var(--amber)'
        : 'var(--text-muted)'

  return <p style={{ margin: '0.45rem 0 0', fontSize: '12px', color, overflowWrap: 'anywhere' }}>{label} - {deadline}</p>
}
