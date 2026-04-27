'use client'

import type { CSSProperties } from 'react'
import { useTransition } from 'react'
import { updateTaskCompletion } from '@/actions/tasks'

interface TaskStatusToggleProps {
  status: 'pending' | 'completed'
  moduleId: string
  title: string
  taskItemId?: string | null
  legacyTaskId?: string | null
  align?: 'start' | 'end'
  style?: CSSProperties
}

export function TaskStatusToggle({
  status,
  moduleId,
  title,
  taskItemId,
  legacyTaskId,
  align = 'start',
  style,
}: TaskStatusToggleProps) {
  const [isPending, startTransition] = useTransition()
  const nextStatus = status === 'completed' ? 'pending' : 'completed'

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await updateTaskCompletion({
            status: nextStatus,
            moduleId,
            title,
            taskItemId,
            legacyTaskId,
          })
        })
      }}
      className={`ui-button ${status === 'completed' ? 'ui-button-ghost' : 'ui-button-secondary'} ui-button-xs`}
      style={{
        alignSelf: align === 'end' ? 'flex-end' : 'flex-start',
        opacity: isPending ? 0.7 : 1,
        ...style,
      }}
      aria-pressed={status === 'completed'}
      aria-label={status === 'completed' ? `Reopen ${title}` : `Mark ${title} as done`}
    >
      {isPending ? 'Saving...' : status === 'completed' ? 'Reopen task' : 'Mark done'}
    </button>
  )
}
