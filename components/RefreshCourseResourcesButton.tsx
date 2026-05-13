'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { refreshCourseResourcesAction } from '@/actions/course-resource-refresh'
import { dispatchInAppToast } from '@/lib/notifications'

export function RefreshCourseResourcesButton({
  courseId,
  label = 'Refresh resources',
  className = 'ui-button ui-button-ghost ui-button-xs',
}: {
  courseId: string
  label?: string
  className?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function handleClick() {
    setErrorMessage(null)
    startTransition(async () => {
      const result = await refreshCourseResourcesAction({ courseId })
      if (!result.ok) {
        setErrorMessage(result.error)
        dispatchInAppToast({ title: 'Could not refresh course', description: result.error, tone: 'error' })
        return
      }

      dispatchInAppToast({ title: 'Course refresh started', description: result.message, tone: 'success' })
      router.refresh()
    })
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={isPending} className={className}>
        <RefreshCw className={`h-3.5 w-3.5${isPending ? ' animate-spin' : ''}`} />
        {isPending ? 'Refreshing...' : label}
      </button>
      {errorMessage ? (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--red)' }}>
          {errorMessage}
        </span>
      ) : null}
    </>
  )
}
