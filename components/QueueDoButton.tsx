'use client'

import { useState } from 'react'
import { PlusCircle, Loader2 } from 'lucide-react'
import { queueDoGenerationAction } from '@/actions/queue-jobs'
import type { TaskDraftContext } from '@/lib/do-now'
import { cn } from '@/lib/cn'

interface Props {
  taskId: string
  moduleId: string
  context: TaskDraftContext
  className?: string
}

export function QueueDoButton({ taskId, moduleId, context, className }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'queued' | 'error'>('idle')

  async function handleClick() {
    if (state !== 'idle') return
    setState('loading')

    const result = await queueDoGenerationAction({ taskId, moduleId, context })

    if (result.error || !result.jobId) {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    } else {
      setState('queued')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading' || state === 'queued'}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        state === 'queued'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : state === 'error'
            ? 'bg-red-50 text-red-600 border border-red-200'
            : 'bg-sf-surface-2 text-sf-text border border-sf-border hover:bg-sf-accent-light hover:border-sf-accent-border hover:text-sf-accent-foreground',
        (state === 'loading' || state === 'queued') && 'opacity-70 cursor-not-allowed',
        className,
      )}
    >
      {state === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
      {state === 'queued' && '✓ Added to queue'}
      {state === 'error' && 'Failed — retry?'}
      {state === 'idle' && (
        <>
          <PlusCircle className="h-4 w-4" />
          Queue Do Now
        </>
      )}
    </button>
  )
}
