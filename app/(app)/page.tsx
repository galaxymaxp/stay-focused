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
      .select('id,title,subtitle,start_at,end_at,status,source_table,source_id,course_id,source_type,block_type,estimate_confidence,estimate_reason')
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
          sourceId: block.source_id,
          courseId: block.course_id,
          sourceType: block.source_type,
          subtitle: block.subtitle,
          blockType: block.block_type,
          estimateConfidence: normalizeEstimateConfidence(block.estimate_confidence),
          estimateReason: block.estimate_reason,
        }))}
        dueSoon={overview.dueSoon}
        courseSnapshots={overview.courseSnapshots}
      />
    </main>
  )
}

function normalizeEstimateConfidence(value: unknown) {
  if (typeof value === 'string') {
    if (value === 'low' || value === 'medium' || value === 'high') return value
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numericToEstimateConfidence(numeric)
  }
  if (typeof value === 'number') return numericToEstimateConfidence(value)
  return null
}

function numericToEstimateConfidence(value: number) {
  if (value >= 0.7) return 'high'
  if (value >= 0.5) return 'medium'
  return 'low'
}
