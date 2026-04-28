'use client'

import dynamic from 'next/dynamic'

const ConnectCanvasFlow = dynamic(
  () => import('@/components/ConnectCanvasFlow').then((mod) => mod.ConnectCanvasFlow),
  { ssr: false }
)

export function ConnectCanvasFlowWrapper({
  currentUserId,
  initialConnectionUrl,
  initialAccessToken,
  lastSync,
  syncedCourseKeys,
  initialAction,
  syncedModules,
}: {
  currentUserId: string
  initialConnectionUrl: string | null
  initialAccessToken: string | null
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
      currentUserId={currentUserId}
      initialConnectionUrl={initialConnectionUrl}
      initialAccessToken={initialAccessToken}
      lastSync={lastSync}
      syncedCourseKeys={syncedCourseKeys}
      hasSyncedCourses={syncedModules.length > 0}
      initialAction={initialAction}
      syncedModules={syncedModules}
    />
  )
}
