'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { FileOutput } from 'lucide-react'
import { makeDeepLearnReviewerAction } from '@/actions/study-outputs'

export function MakeReviewerButton({
  moduleId,
  resourceId,
  existingHref = null,
}: {
  moduleId: string
  resourceId: string
  existingHref?: string | null
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

  if (existingHref) {
    return (
      <Link href={existingHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
        <FileOutput className="h-3.5 w-3.5" />
        Open Reviewer
      </Link>
    )
  }

  return (
    <>
      <button type="button" onClick={handleClick} className="ui-button ui-button-secondary ui-button-xs" disabled={isPending}>
        <FileOutput className="h-3.5 w-3.5" />
        {isPending ? 'Generating reviewer...' : 'Generate Reviewer'}
      </button>
      {errorMessage ? (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--red)' }}>
          {errorMessage}
        </span>
      ) : null}
    </>
  )
}
