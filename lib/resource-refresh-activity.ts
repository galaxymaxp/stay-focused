import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'

export type ResourceRefreshActivityStatus = 'completed' | 'warning' | 'failed'

export interface ResourceRefreshActivityRecord {
  id: string
  user_id: string
  course_id: string | null
  status: ResourceRefreshActivityStatus
  detail: string
  warnings: unknown
  metadata: unknown
  created_at: string
}

export async function recordResourceRefreshActivity(input: {
  userId: string
  courseId: string | null
  status: ResourceRefreshActivityStatus
  detail: string
  warnings?: string[]
  metadata?: Record<string, unknown>
}) {
  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('resource_refresh_activity')
    .insert({
      user_id: input.userId,
      course_id: input.courseId,
      status: input.status,
      detail: input.detail,
      warnings: input.warnings ?? [],
      metadata: input.metadata ?? {},
    })

  if (error) {
    console.error('[resource-refresh] activity insert failed', {
      userId: input.userId,
      courseId: input.courseId,
      status: input.status,
      code: error.code,
      message: error.message,
    })
    return false
  }

  return true
}

export function buildResourceRefreshActivityDetail(input: {
  courseName: string
  resourcesInserted: number
  resourcesUpdated: number
  warnings: string[]
}) {
  const changedCount = input.resourcesInserted + input.resourcesUpdated
  if (input.warnings.length > 0) {
    return changedCount > 0
      ? `${input.courseName} refreshed with ${changedCount} source ${changedCount === 1 ? 'change' : 'changes'}, but some items need review.`
      : `${input.courseName} refresh finished, but some items need review.`
  }

  return changedCount > 0
    ? `${input.courseName} refreshed with ${changedCount} source ${changedCount === 1 ? 'change' : 'changes'}.`
    : `${input.courseName} refresh finished with no new source changes.`
}
