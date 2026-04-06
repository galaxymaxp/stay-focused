'use client'

import { useTransition } from 'react'
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

const PLANNING_OPTIONS: Array<{ value: Exclude<TaskPlanningAnnotation, 'none'>; buttonLabel: string }> = [
  { value: 'best_next_step', buttonLabel: 'Best next' },
  { value: 'needs_attention', buttonLabel: 'Attention' },
  { value: 'worth_reviewing', buttonLabel: 'Review' },
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

  if (status === 'completed') {
    return null
  }

  function update(annotationValue: TaskPlanningAnnotation) {
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
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {PLANNING_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={isPending}
          onClick={() => update(option.value)}
          className={annotation === option.value ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
        >
          {option.buttonLabel}
        </button>
      ))}
      {annotation !== 'none' && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => update('none')}
          className="ui-button ui-button-ghost ui-button-xs"
        >
          Clear
        </button>
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
    }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: style.dot }} />
      {labelForTaskPlanningAnnotation(annotation)}
    </span>
  )
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
