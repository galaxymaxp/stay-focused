'use client'

import { useEffect } from 'react'
import { markStudyFileOpened } from '@/actions/module-resource-study-state'

export function StudyFileOpenTracker({
  moduleId,
  resourceId,
}: {
  moduleId: string
  resourceId: string
}) {
  useEffect(() => {
    void markStudyFileOpened({
      moduleId,
      resourceId,
    }).catch((error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Could not record last-opened study file.', error)
      }
    })
  }, [moduleId, resourceId])

  return null
}
