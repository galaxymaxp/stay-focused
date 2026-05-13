'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FileStack } from 'lucide-react'
import { makeDeepLearnSheetAction } from '@/actions/study-outputs'

export function MakeCramSheetButton({
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
      const result = await makeDeepLearnSheetAction({ moduleId, resourceId, mode: 'cram_sheet' })
      if (!result.ok) {
        setErrorMessage(result.error)
        return
      }
      try {
        router.push(result.href)
        router.refresh()
      } catch {
        setErrorMessage('Could not open this cram sheet right now.')
      }
    })
  }

  return (
    <>
      <button type="button" onClick={handleClick} className="ui-button ui-button-secondary ui-button-xs" disabled={isPending}>
        <FileStack className="h-3.5 w-3.5" />
        {isPending ? 'Making cram sheet...' : 'Make Cram Sheet'}
      </button>
      {errorMessage ? (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--red)' }}>
          {errorMessage}
        </span>
      ) : null}
    </>
  )
}
