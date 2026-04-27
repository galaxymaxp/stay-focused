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
  initialAction,
  syncedModules,
}: {
  initialConnectionUrl: string | null
  lastSync: {
    label: string
    tone: 'success' | 'neutral' | 'warning'
  } | null
  syncedCourseKeys: string[]
  initialAction: string | null
  syncedModules: {
    id: string
    title: string
    summary: string | null
    createdAt: string
  }[]
}) {
  return (
    <ConnectCanvasFlow
      initialConnectionUrl={initialConnectionUrl}
      lastSync={lastSync}
      syncedCourseKeys={syncedCourseKeys}
      hasSyncedCourses={syncedModules.length > 0}
      initialAction={initialAction}
      syncedModules={syncedModules}
    />
  )
}
