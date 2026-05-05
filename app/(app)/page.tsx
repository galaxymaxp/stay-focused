import { TodayDashboard } from '@/components/TodayDashboard'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildHomeOverview } from '@/lib/home-overview'
import { buildLearnFocusRows, buildSyllabusFocusRows, mergeScheduledBlocksIntoFocusRows } from '@/lib/home-focus'

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

  const [scheduledBlocksResult, studyPacksResult, resourcesResult, sourceProgressResult] = client
    ? await Promise.all([
      client
        .from('scheduled_blocks')
        .select('id,title,subtitle,start_at,end_at,status,source_table,source_id,course_id,source_type,block_type,estimate_confidence,estimate_reason')
        .order('start_at', { ascending: true })
        .limit(24),
      client
        .from('deep_learn_notes')
        .select('id,module_id,resource_id,title,quiz_ready')
        .eq('status', 'ready'),
      // Canonical Learn source: module_resources with quality fields.
      // extraction_status + extracted_char_count mirror how /modules/:id/learn
      // classifies "Ready for Deep Learn" resources.
      client
        .from('module_resources')
        .select('id,course_id,module_id,title,resource_type,extracted_text,extracted_text_preview,visual_extraction_status,visual_extracted_text,html_url,source_url,estimated_minutes,extraction_status,extracted_char_count')
        .order('title', { ascending: true }),
      client
        .from('user_source_progress')
        .select('source_id')
        .eq('source_table', 'module_resources')
        .in('status', ['reviewed', 'completed']),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const studyPacksByModuleId: Record<string, Array<{ id: string; title: string; quizReady: boolean }>> = {}
  const studyPacksByResourceId: Record<string, Array<{ id: string; title: string; quizReady: boolean }>> = {}
  for (const pack of studyPacksResult.data ?? []) {
    const entry = { id: pack.id, title: pack.title ?? 'Study pack', quizReady: pack.quiz_ready ?? false }
    if (pack.module_id) {
      const list = studyPacksByModuleId[pack.module_id] ?? []
      list.push(entry)
      studyPacksByModuleId[pack.module_id] = list
    }
    if (pack.resource_id) {
      const list = studyPacksByResourceId[pack.resource_id] ?? []
      list.push(entry)
      studyPacksByResourceId[pack.resource_id] = list
    }
  }

  // Build course name map for Learn focus rows
  const courseNameById: Record<string, string> = {}
  for (const course of workspace.courses) {
    courseNameById[course.id] = course.name
  }

  const reviewedSourceIds = (sourceProgressResult.data ?? [])
    .map((row) => row.source_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  const homeLearnResourceRows = resourcesResult.data ?? []

  // Canonical Syllabus focus rows from workspace task_items (all pending tasks, not just scheduled)
  const syllabusFocusRows = buildSyllabusFocusRows(workspace.taskItems)

  // Canonical Learn focus rows from module_resources (same classification as /modules/:id/learn)
  const learnFocusRows = buildLearnFocusRows(
    homeLearnResourceRows,
    studyPacksByResourceId,
    courseNameById,
  )

  const rawScheduledBlocks = (scheduledBlocksResult.data ?? []).map((block) => ({
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
  }))

  const { mergedSyllabus, mergedLearn } = mergeScheduledBlocksIntoFocusRows(
    syllabusFocusRows,
    learnFocusRows,
    rawScheduledBlocks,
    courseNameById,
  )

  return (
    <main className="page-shell">
      <TodayDashboard
        primaryAction={overview.primaryAction}
        upNext={overview.upNext}
        dueSoon={overview.dueSoon}
        recentActivity={overview.recentActivity}
        courseSnapshots={overview.courseSnapshots}
        undatedTaskCount={overview.undatedTaskCount}
        scheduledBlocks={rawScheduledBlocks}
        syllabusFocusRows={mergedSyllabus}
        learnFocusRows={mergedLearn}
        reviewedSourceIds={reviewedSourceIds}
        studyPacksByModuleId={studyPacksByModuleId}
        studyPacksByResourceId={studyPacksByResourceId}
      />
    </main>
  )
}

function normalizeEstimateConfidence(value: unknown): 'low' | 'medium' | 'high' | null {
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
