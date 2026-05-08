import { TodayDashboard } from '@/components/TodayDashboard'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { loadHomeDashboardData } from '@/lib/home-data'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const homeData = await loadHomeDashboardData()

  if (!homeData.hasSyncedData) {
    return (
      <main className="page-shell">
        <SyncFirstEmptyState eyebrow="Home" />
      </main>
    )
  }

  return (
    <main className="page-shell">
      <TodayDashboard {...homeData.dashboardProps} />
    </main>
  )
}
