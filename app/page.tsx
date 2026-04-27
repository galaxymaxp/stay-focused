import { TodayDashboard } from '@/components/TodayDashboard'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildHomeOverview } from '@/lib/home-overview'

export default async function Dashboard() {
  const workspace = await getClarityWorkspace()

  if (!workspace.hasSyncedData) {
    return (
      <main className="page-shell">
        <SyncFirstEmptyState eyebrow="Home" />
      </main>
    )
  }

  const overview = buildHomeOverview(workspace)

  return (
    <main className="page-shell">
      <TodayDashboard
        primaryAction={overview.primaryAction}
        upNext={overview.upNext}
        dueSoon={overview.dueSoon}
        recentActivity={overview.recentActivity}
        courseSnapshots={overview.courseSnapshots}
        undatedTaskCount={overview.undatedTaskCount}
      />
    </main>
  )
}
