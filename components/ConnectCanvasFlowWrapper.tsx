'use client'

import dynamic from 'next/dynamic'

const ConnectCanvasFlow = dynamic(
  () => import('@/components/ConnectCanvasFlow').then((mod) => mod.ConnectCanvasFlow),
  { ssr: false }
)

export function ConnectCanvasFlowWrapper({
  initialConnectionUrl,
  lastSync,
  syncedCourseKeys,
}: {
  initialConnectionUrl: string | null
  lastSync: {
    label: string
    tone: 'success' | 'neutral' | 'warning'
  } | null
  syncedCourseKeys: string[]
}) {
  return (
    <ConnectCanvasFlow
      initialConnectionUrl={initialConnectionUrl}
      lastSync={lastSync}
      syncedCourseKeys={syncedCourseKeys}
      hasSyncedCourses={syncedCourseKeys.length > 0}
    />
  )
}
