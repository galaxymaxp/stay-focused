'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ListChecks } from 'lucide-react'
import { makeDeepLearnQuizPackAction } from '@/actions/study-outputs'

export function MakeQuizPackButton({
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
      const result = await makeDeepLearnQuizPackAction({ moduleId, resourceId })
      if (!result.ok) {
        setErrorMessage(result.error)
        return
      }
      try {
        router.push(result.href)
        router.refresh()
      } catch {
        setErrorMessage('Could not open this quiz pack right now.')
      }
    })
  }

  return (
    <>
      <button type="button" onClick={handleClick} className="ui-button ui-button-secondary ui-button-xs" disabled={isPending}>
        <ListChecks className="h-3.5 w-3.5" />
        {isPending ? 'Making quiz pack...' : 'Make Quiz Pack'}
      </button>
      {errorMessage ? (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--red)' }}>
          {errorMessage}
        </span>
      ) : null}
    </>
  )
}
