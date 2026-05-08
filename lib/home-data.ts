import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import {
  buildLearnFocusRows,
  buildSyllabusFocusRows,
  filterHomeActionableScheduledBlocks,
  filterHomeRelevantScheduledBlocks,
  getHomeScheduleWindow,
  mergeScheduledBlocksIntoFocusRows,
  type LearnFocusRow,
  type SyllabusFocusRow,
} from '@/lib/home-focus'
import { buildHomeOverview, type HomeActivityItem, type HomeCourseSnapshot, type HomeDueSoonItem } from '@/lib/home-overview'
import type { ScheduledBlockStatus, SchedulerBlockType, SchedulerEstimateConfidence, SchedulerSourceTable } from '@/lib/scheduler/types'
import type { TodayItem } from '@/lib/types'

type StudyPackRef = { id: string; title: string; quizReady: boolean }

export interface HomeDashboardProps {
  primaryAction: TodayItem | null
  upNext: TodayItem[]
  dueSoon: HomeDueSoonItem[]
  recentActivity: HomeActivityItem[]
  courseSnapshots: HomeCourseSnapshot[]
  undatedTaskCount: number
  scheduledBlocks: Array<{
    id: string
    title: string
    startAt: string
    endAt: string
    status: ScheduledBlockStatus
    sourceTable: SchedulerSourceTable
    sourceId: string | null
    courseId: string | null
    sourceType: string | null
    subtitle: string | null
    blockType: SchedulerBlockType | null
    estimateConfidence: SchedulerEstimateConfidence | null
    estimateReason: string | null
  }>
  syllabusFocusRows: SyllabusFocusRow[]
  learnFocusRows: LearnFocusRow[]
  reviewedSourceIds: string[]
  studyPacksByModuleId: Record<string, StudyPackRef[]>
  studyPacksByResourceId: Record<string, StudyPackRef[]>
}

export type HomeDashboardData =
  | { hasSyncedData: false }
  | { hasSyncedData: true; dashboardProps: HomeDashboardProps }

export async function loadHomeDashboardData(): Promise<HomeDashboardData> {
  const workspace = await getClarityWorkspace()

  if (!workspace.hasSyncedData) {
    return { hasSyncedData: false }
  }

  const overview = buildHomeOverview(workspace)
  const client = await createAuthenticatedSupabaseServerClient()
  const scheduleWindow = getHomeScheduleWindow()

  const [scheduledBlocksResult, studyPacksResult, resourcesResult, sourceProgressResult] = client
    ? await Promise.all([
      client
        .from('scheduled_blocks')
        .select('id,title,subtitle,start_at,end_at,status,source_table,source_id,course_id,source_type,block_type,estimate_confidence,estimate_reason')
        .lt('start_at', scheduleWindow.endAt)
        .gt('end_at', scheduleWindow.startAt)
        .order('start_at', { ascending: true })
        .limit(48),
      client
        .from('deep_learn_notes')
        .select('id,module_id,resource_id,title,quiz_ready')
        .eq('status', 'ready'),
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

  const studyPacksByModuleId: Record<string, StudyPackRef[]> = {}
  const studyPacksByResourceId: Record<string, StudyPackRef[]> = {}
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

  const courseNameById: Record<string, string> = {}
  for (const course of workspace.courses) {
    courseNameById[course.id] = course.name
  }

  const reviewedSourceIds = (sourceProgressResult.data ?? [])
    .map((row) => row.source_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  const syllabusFocusRows = buildSyllabusFocusRows(workspace.taskItems)
  const learnFocusRows = buildLearnFocusRows(
    resourcesResult.data ?? [],
    studyPacksByResourceId,
    courseNameById,
  )

  const rawScheduledBlocks = (scheduledBlocksResult.data ?? []).map((block) => ({
    id: block.id,
    title: block.title,
    startAt: block.start_at,
    endAt: block.end_at,
    status: normalizeScheduleStatus(block.status),
    sourceTable: normalizeSchedulerSourceTable(block.source_table),
    sourceId: block.source_id,
    courseId: block.course_id,
    sourceType: block.source_type,
    subtitle: block.subtitle,
    blockType: normalizeSchedulerBlockType(block.block_type),
    estimateConfidence: normalizeEstimateConfidence(block.estimate_confidence),
    estimateReason: block.estimate_reason,
  }))

  const relevantScheduledBlocks = filterHomeRelevantScheduledBlocks(rawScheduledBlocks)
  const actionableScheduledBlocks = filterHomeActionableScheduledBlocks(rawScheduledBlocks)

  const { mergedSyllabus, mergedLearn } = mergeScheduledBlocksIntoFocusRows(
    syllabusFocusRows,
    learnFocusRows,
    actionableScheduledBlocks,
    courseNameById,
  )

  return {
    hasSyncedData: true,
    dashboardProps: {
      primaryAction: overview.primaryAction,
      upNext: overview.upNext,
      dueSoon: overview.dueSoon,
      recentActivity: overview.recentActivity,
      courseSnapshots: overview.courseSnapshots,
      undatedTaskCount: overview.undatedTaskCount,
      scheduledBlocks: relevantScheduledBlocks,
      syllabusFocusRows: mergedSyllabus,
      learnFocusRows: mergedLearn,
      reviewedSourceIds,
      studyPacksByModuleId,
      studyPacksByResourceId,
    },
  }
}

function normalizeEstimateConfidence(value: unknown): SchedulerEstimateConfidence | null {
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

function normalizeScheduleStatus(value: unknown): ScheduledBlockStatus {
  if (value === 'opened' || value === 'completed' || value === 'skipped' || value === 'missed') return value
  return 'scheduled'
}

function normalizeSchedulerSourceTable(value: unknown): SchedulerSourceTable {
  if (
    value === 'task_items' ||
    value === 'tasks' ||
    value === 'deadlines' ||
    value === 'modules' ||
    value === 'module_resources' ||
    value === 'learning_items' ||
    value === 'deep_learn_notes' ||
    value === 'drafts'
  ) return value
  return 'tasks'
}

function normalizeSchedulerBlockType(value: unknown): SchedulerBlockType | null {
  if (
    value === 'assignment' ||
    value === 'learning_material' ||
    value === 'module_review' ||
    value === 'quiz_practice' ||
    value === 'reading' ||
    value === 'drafting' ||
    value === 'break'
  ) return value
  return null
}
