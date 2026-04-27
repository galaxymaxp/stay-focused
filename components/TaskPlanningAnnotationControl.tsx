'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { updateTaskPlanningAnnotation } from '@/actions/tasks'
import { labelForTaskPlanningAnnotation } from '@/lib/task-planning'
import type { TaskPlanningAnnotation } from '@/lib/types'

interface TaskPlanningAnnotationControlProps {
  annotation: TaskPlanningAnnotation
  status?: 'pending' | 'completed'
  moduleId: string
  title: string
  taskItemId?: string | null
  legacyTaskId?: string | null
}

const PLANNING_OPTIONS: Array<{
  value: Exclude<TaskPlanningAnnotation, 'none'>
  buttonLabel: string
  note: string
}> = [
  { value: 'best_next_step', buttonLabel: 'Best next', note: 'Keep this task at the front of your list.' },
  { value: 'needs_attention', buttonLabel: 'Needs attention', note: 'Flag this when it should stay visible soon.' },
  { value: 'worth_reviewing', buttonLabel: 'Worth reviewing', note: 'Use this when the task mainly needs understanding first.' },
]

export function TaskPlanningAnnotationControl({
  annotation,
  status = 'pending',
  moduleId,
  title,
  taskItemId,
  legacyTaskId,
}: TaskPlanningAnnotationControlProps) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (status === 'completed') {
    return null
  }

  function update(annotationValue: TaskPlanningAnnotation) {
    setOpen(false)
    startTransition(async () => {
      await updateTaskPlanningAnnotation({
        annotation: annotationValue,
        moduleId,
        title,
        taskItemId,
        legacyTaskId,
      })
    })
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={annotation === 'none' ? 'ui-button ui-button-ghost ui-button-xs' : 'ui-button ui-button-secondary ui-button-xs'}
      >
        {isPending ? 'Saving...' : annotation === 'none' ? 'Set focus' : labelForMenuButton(annotation)}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Planning actions for ${title}`}
          className="ui-floating"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.42rem)',
            left: 0,
            minWidth: '16rem',
            maxWidth: 'min(18rem, calc(100vw - 3rem))',
            borderRadius: 'var(--radius-panel)',
            padding: '0.55rem',
            display: 'grid',
            gap: '0.38rem',
            zIndex: 30,
          }}
        >
          {PLANNING_OPTIONS.map((option) => {
            const selected = annotation === option.value

            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={isPending}
                onClick={() => update(option.value)}
                className={selected ? 'ui-button ui-button-secondary' : 'ui-button ui-button-ghost'}
                style={{
                  justifyContent: 'flex-start',
                  alignItems: 'flex-start',
                  padding: '0.6rem 0.72rem',
                  minHeight: 'auto',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'grid', gap: '0.18rem' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{option.buttonLabel}</span>
                  <span style={{ fontSize: '11px', lineHeight: 1.45, color: 'var(--text-secondary)', whiteSpace: 'normal' }}>{option.note}</span>
                </span>
              </button>
            )
          })}

          {annotation !== 'none' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => update('none')}
              className="ui-button ui-button-ghost"
              style={{
                justifyContent: 'flex-start',
                minHeight: 'auto',
                padding: '0.55rem 0.72rem',
              }}
            >
              Clear focus
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function TaskPlanningAnnotationPill({
  annotation,
  emphasis = false,
}: {
  annotation: TaskPlanningAnnotation
  emphasis?: boolean
}) {
  if (annotation === 'none') {
    return null
  }

  const style = getTaskPlanningStyle(annotation)

  return (
    <span className="ui-chip" style={{
      gap: '0.38rem',
      padding: emphasis ? '0.32rem 0.68rem' : '0.25rem 0.55rem',
      fontSize: emphasis ? '12px' : '11px',
      fontWeight: 700,
      background: style.background,
      color: style.color,
      border: `1px solid ${style.border}`,
      maxWidth: '100%',
      whiteSpace: 'normal',
    }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: style.dot, flexShrink: 0 }} />
      {labelForTaskPlanningAnnotation(annotation)}
    </span>
  )
}

function labelForMenuButton(annotation: Exclude<TaskPlanningAnnotation, 'none'>) {
  if (annotation === 'best_next_step') return 'Best next'
  if (annotation === 'needs_attention') return 'Needs attention'
  return 'Reviewing'
}

function getTaskPlanningStyle(annotation: Exclude<TaskPlanningAnnotation, 'none'>) {
  if (annotation === 'best_next_step') {
    return {
      dot: 'var(--accent)',
      color: 'var(--accent-foreground)',
      border: 'color-mix(in srgb, var(--accent-border) 34%, var(--border-subtle) 66%)',
      background: 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)',
    }
  }

  if (annotation === 'needs_attention') {
    return {
      dot: 'var(--amber)',
      color: 'var(--amber)',
      border: 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)',
      background: 'color-mix(in srgb, var(--amber-light) 34%, var(--surface-soft) 66%)',
    }
  }

  return {
    dot: 'var(--blue)',
    color: 'var(--blue)',
    border: 'color-mix(in srgb, var(--blue) 24%, var(--border-subtle) 76%)',
    background: 'color-mix(in srgb, var(--blue-light) 42%, var(--surface-soft) 58%)',
  }
}
