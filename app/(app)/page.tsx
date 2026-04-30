import { TodayDashboard } from '@/components/TodayDashboard'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildHomeOverview } from '@/lib/home-overview'

export const dynamic = 'force-dynamic'

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
  const client = await createAuthenticatedSupabaseServerClient()
  const { data: scheduledBlocks } = client
    ? await client
      .from('scheduled_blocks')
      .select('id,title,start_at,end_at,status,source_table')
      .order('start_at', { ascending: true })
      .limit(24)
    : { data: [] }

  return (
    <main className="page-shell">
      <TodayDashboard
        scheduledBlocks={(scheduledBlocks ?? []).map((block) => ({
          id: block.id,
          title: block.title,
          startAt: block.start_at,
          endAt: block.end_at,
          status: block.status,
          sourceTable: block.source_table,
        }))}
        dueSoon={overview.dueSoon}
        courseSnapshots={overview.courseSnapshots}
      />
    </main>
  )
}
