'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { generateDeepLearnNoteAction } from '@/actions/deep-learn'
import { buildDeepLearnNoteHref } from '@/lib/stay-focused-links'

export function DeepLearnGenerateButton({
  moduleId,
  resourceId,
  courseId = null,
  label = 'Build Exam Prep Pack',
  pendingLabel = 'Preparing...',
  className = 'ui-button ui-button-secondary ui-button-xs',
}: {
  moduleId: string
  resourceId: string
  courseId?: string | null
  label?: string
  pendingLabel?: string
  className?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  return (
    <div style={{ display: 'grid', gap: '0.35rem' }}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setErrorMessage(null)

            try {
              const result = await generateDeepLearnNoteAction({
                moduleId,
                resourceId,
                courseId,
              })

              router.push(buildDeepLearnNoteHref(result.moduleId, result.resourceId))
              router.refresh()
            } catch (error) {
              setErrorMessage(error instanceof Error ? error.message : 'Deep Learn failed to start the exam prep pack.')
            }
          })
        }}
        className={className}
      >
        {isPending ? pendingLabel : label}
      </button>

      {errorMessage && (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--red)' }}>
          {errorMessage}
        </span>
      )}
    </div>
  )
}
