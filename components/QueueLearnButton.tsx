'use client'

import { useState } from 'react'
import { PlusCircle, Loader2 } from 'lucide-react'
import { queueLearnGenerationAction } from '@/actions/queue-jobs'
import { cn } from '@/lib/cn'

interface Props {
  moduleId: string
  resourceId: string
  courseId?: string | null
  resourceTitle: string
  className?: string
  variant?: 'button' | 'inline'
}

export function QueueLearnButton({
  moduleId,
  resourceId,
  courseId,
  resourceTitle,
  className,
  variant = 'button',
}: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'queued' | 'error'>('idle')

  async function handleClick() {
    if (state !== 'idle') return
    setState('loading')

    const result = await queueLearnGenerationAction({
      moduleId,
      resourceId,
      courseId,
      resourceTitle,
    })

    if (result.error || !result.jobId) {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    } else {
      setState('queued')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  if (variant === 'inline') {
    return (
      <button
        onClick={handleClick}
        disabled={state === 'loading' || state === 'queued'}
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium transition-colors',
          state === 'queued'
            ? 'text-green-600'
            : state === 'error'
              ? 'text-red-500'
              : 'text-sf-accent hover:text-sf-accent-hover',
          className,
        )}
      >
        {state === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
        {state === 'queued' && '✓ Added to queue'}
        {state === 'error' && 'Failed — retry?'}
        {(state === 'idle') && (
          <>
            <PlusCircle className="h-3 w-3" />
            Queue Deep Learn
          </>
        )}
      </button>
    )
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
            : 'bg-sf-accent-light text-sf-accent-foreground border border-sf-accent-border hover:bg-sf-accent hover:text-white',
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
          Queue Deep Learn
        </>
      )}
    </button>
  )
}
