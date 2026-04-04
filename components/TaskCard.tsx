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
    <li style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '12px 14px',
      opacity: isPending ? 0.4 : isCompleted ? 0.55 : 1,
      transition: 'opacity 0.15s',
    }}>
      <button
        onClick={handleToggle}
        disabled={isPending}
        style={{
          marginTop: '2px',
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: isCompleted ? '1.5px solid var(--accent)' : '1.5px solid var(--border-hover)',
          background: isCompleted ? 'var(--accent-light)' : 'transparent',
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 500,
            color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: isCompleted ? 'line-through' : 'none',
          }}>
            {task.title}
          </span>
          <PriorityBadge priority={task.priority} />
        </div>
        {task.details && (
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{task.details}</p>
        )}
        {task.deadline && !isCompleted && <DeadlinePill deadline={task.deadline} />}
      </div>
    </li>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, { background: string; color: string; border: string }> = {
    high: { background: 'var(--red-light)', color: 'var(--red)', border: '#F5C5BC' },
    medium: { background: 'var(--amber-light)', color: 'var(--amber)', border: '#F0DCBF' },
    low: { background: 'var(--bg-hover)', color: 'var(--text-muted)', border: 'var(--border)' },
  }
  const s = styles[priority] ?? styles.low
  return (
    <span style={{
      fontSize: '11px',
      fontWeight: 500,
      padding: '2px 8px',
      borderRadius: '6px',
      border: `1px solid ${s.border}`,
      background: s.background,
      color: s.color,
      flexShrink: 0,
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

  return (
    <p style={{ margin: '4px 0 0', fontSize: '12px', color }}>{label} - {deadline}</p>
  )
}
