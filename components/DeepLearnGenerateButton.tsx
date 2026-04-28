'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { queueLearnGenerationAction } from '@/actions/queue-jobs'
import { dispatchInAppToast } from '@/lib/notifications'
import { cn } from '@/lib/cn'

export function DeepLearnGenerateButton({
  moduleId,
  resourceId,
  courseId = null,
  resourceTitle = '',
  label = 'Generate study pack',
  className = 'ui-button ui-button-secondary ui-button-xs',
  disabledReason = null,
}: {
  moduleId: string
  resourceId: string
  courseId?: string | null
  resourceTitle?: string
  label?: string
  className?: string
  disabledReason?: string | null
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'queued' | 'error'>('idle')

  async function handleClick() {
    if (state !== 'idle' || disabledReason) return
    setState('loading')

    const result = await queueLearnGenerationAction({
      moduleId,
      resourceId,
      courseId,
      resourceTitle: resourceTitle || label,
    })

    if (result.error || !result.jobId) {
      setState('error')
      dispatchInAppToast({ title: 'Could not queue Deep Learn', description: result.error ?? 'Try again in a moment.', tone: 'error' })
      setTimeout(() => setState('idle'), 3000)
    } else {
      setState('queued')
      window.dispatchEvent(new CustomEvent('stay-focused:queue-refresh'))
      dispatchInAppToast({ title: 'Study pack added to queue.', description: 'Check the queue indicator above to track progress.', tone: 'success' })
      setTimeout(() => setState('idle'), 4000)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '0.35rem' }}>
      <button
        type="button"
        disabled={state === 'loading' || state === 'queued' || Boolean(disabledReason)}
        onClick={handleClick}
        className={cn(className, (state === 'loading' || state === 'queued') && 'opacity-70 cursor-default')}
      >
        {state === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin inline-block mr-1.5 align-middle" />}
        {state === 'queued' ? 'Added to queue' : state === 'error' ? 'Failed - retry?' : label}
      </button>

      {disabledReason && (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
          {disabledReason}
        </span>
      )}
    </div>
  )
}
