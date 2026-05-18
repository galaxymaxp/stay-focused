import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'

export type TaskRefreshActivityStatus = 'completed' | 'warning' | 'failed'

export interface TaskRefreshActivityRow {
  status: string | null
  detail: string | null
  created_at: string | null
}

export async function recordTaskRefreshActivity(input: {
  userId: string
  courseId: string | null
  status: TaskRefreshActivityStatus
  detail: string
  warnings?: string[]
  metadata?: Record<string, unknown>
}) {
  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('task_refresh_activity')
    .insert({
      user_id: input.userId,
      course_id: input.courseId,
      status: input.status,
      detail: input.detail,
      warnings: input.warnings ?? [],
      metadata: input.metadata ?? {},
    })

  if (error) {
    console.error('[task-refresh] activity insert failed', {
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

export function buildTaskRefreshActivityDetail(input: {
  courseName: string
  tasksInserted: number
  tasksUpdated: number
  warnings: string[]
}) {
  const changedCount = input.tasksInserted + input.tasksUpdated
  if (input.warnings.length > 0) {
    return changedCount > 0
      ? `${input.courseName} refreshed with ${changedCount} task ${changedCount === 1 ? 'change' : 'changes'}, but some items need review.`
      : `${input.courseName} task refresh finished, but some items need review.`
  }

  return changedCount > 0
    ? `${input.courseName} refreshed with ${changedCount} task ${changedCount === 1 ? 'change' : 'changes'}.`
    : `${input.courseName} task refresh finished with no new task changes.`
}
