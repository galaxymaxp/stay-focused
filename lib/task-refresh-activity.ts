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

export function buildTaskRefreshRunActivity(input: {
  userId: string
  coursesChecked: number
  assignmentsChecked: number
  tasksInserted: number
  tasksUpdated: number
  tasksSkipped: number
  failures: number
  warnings: string[]
}) {
  const status: TaskRefreshActivityStatus = input.failures > 0 && input.failures >= Math.max(1, input.coursesChecked)
    ? 'failed'
    : input.warnings.length > 0
      ? 'warning'
      : 'completed'

  return {
    userId: input.userId,
    courseId: null,
    status,
    detail: status === 'failed'
      ? 'Synced courses task refresh failed.'
      : buildTaskRefreshActivityDetail({
          courseName: 'Synced courses',
          tasksInserted: input.tasksInserted,
          tasksUpdated: input.tasksUpdated,
          warnings: input.warnings,
        }),
    warnings: input.warnings,
    metadata: {
      usersChecked: 1,
      coursesChecked: input.coursesChecked,
      assignmentsChecked: input.assignmentsChecked,
      tasksInserted: input.tasksInserted,
      tasksUpdated: input.tasksUpdated,
      tasksSkipped: input.tasksSkipped,
      warningsCount: input.warnings.length,
    },
  }
}
