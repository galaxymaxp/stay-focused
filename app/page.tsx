import { TodayDashboard } from '@/components/TodayDashboard'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { getClarityWorkspace } from '@/lib/clarity-workspace'

export default async function Dashboard() {
  const workspace = await getClarityWorkspace()

  if (!workspace.hasSyncedData) {
    return (
      <main className="page-shell">
        <SyncFirstEmptyState eyebrow="Today" />
      </main>
    )
  }

  return (
    <main className="page-shell">
      <TodayDashboard
        nextBestMove={workspace.today.nextBestMove}
        needsAction={workspace.today.needsAction}
        needsUnderstanding={workspace.today.needsUnderstanding}
        comingUp={workspace.today.comingUp}
        undatedTaskCount={workspace.today.undatedTaskCount}
        freshestModule={workspace.freshestModule}
        freshestModuleCourse={workspace.freshestModuleCourse}
        recentAnnouncements={workspace.recentAnnouncements}
      />
    </main>
  )
}
