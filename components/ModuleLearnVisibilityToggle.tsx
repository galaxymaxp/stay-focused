'use client'

import { useTransition } from 'react'
import { setModuleLearnVisibility } from '@/actions/modules'

export function ModuleLearnVisibilityToggle({
  moduleId,
  showInLearn,
}: {
  moduleId: string
  showInLearn: boolean
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className={showInLearn ? 'ui-button ui-button-ghost' : 'ui-button ui-button-secondary'}
      onClick={() => {
        startTransition(async () => {
          await setModuleLearnVisibility({
            moduleId,
            showInLearn: !showInLearn,
          })
        })
      }}
      disabled={isPending}
      style={{ minHeight: '2.5rem', padding: '0.68rem 0.95rem', fontSize: '13px' }}
    >
      {isPending ? 'Saving...' : showInLearn ? 'Hide from Learn' : 'Show in Learn'}
    </button>
  )
}
