'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FileOutput } from 'lucide-react'
import { makeDeepLearnReviewerAction } from '@/actions/study-outputs'

export function MakeReviewerButton({
  moduleId,
  resourceId,
}: {
  moduleId: string
  resourceId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function handleClick() {
    setErrorMessage(null)
    startTransition(async () => {
      const result = await makeDeepLearnReviewerAction({ moduleId, resourceId })
      if (!result.ok) {
        setErrorMessage(result.error)
        return
      }
      try {
        router.push(result.href)
        router.refresh()
      } catch {
        setErrorMessage('Could not open this reviewer right now.')
      }
    })
  }

  return (
    <>
      <button type="button" onClick={handleClick} className="ui-button ui-button-secondary ui-button-xs" disabled={isPending}>
        <FileOutput className="h-3.5 w-3.5" />
        {isPending ? 'Making reviewer...' : 'Make Reviewer'}
      </button>
      {errorMessage ? (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--red)' }}>
          {errorMessage}
        </span>
      ) : null}
    </>
  )
}
