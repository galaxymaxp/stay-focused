'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ScrollText } from 'lucide-react'
import { makeDeepLearnSheetAction } from '@/actions/study-outputs'

export function MakeStudySheetButton({
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
      try {
        const result = await makeDeepLearnSheetAction({ moduleId, resourceId, mode: 'study_sheet' })
        router.push(result.href)
        router.refresh()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Could not make a study sheet right now.')
      }
    })
  }

  return (
    <>
      <button type="button" onClick={handleClick} className="ui-button ui-button-secondary ui-button-xs" disabled={isPending}>
        <ScrollText className="h-3.5 w-3.5" />
        {isPending ? 'Making study sheet...' : 'Make Study Sheet'}
      </button>
      {errorMessage ? (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--red)' }}>
          {errorMessage}
        </span>
      ) : null}
    </>
  )
}
