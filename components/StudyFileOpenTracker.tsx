'use client'

import { useEffect } from 'react'
import { markStudyFileOpened } from '@/actions/module-resource-study-state'

export function StudyFileOpenTracker({
  moduleId,
  resourceId,
  courseId,
}: {
  moduleId: string
  resourceId: string
  courseId?: string
}) {
  useEffect(() => {
    void markStudyFileOpened({
      moduleId,
      resourceId,
      courseId,
    }).catch((error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Could not record last-opened study file.', error)
      }
    })
  }, [courseId, moduleId, resourceId])

  return null
}
