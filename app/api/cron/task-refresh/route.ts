import { type NextRequest, NextResponse } from 'next/server'
import { refreshCanvasTaskMetadataForCourse } from '@/actions/canvas'
import { getAssignments, getCourses, normalizeCanvasUrl } from '@/lib/canvas'
import { getResourceRefreshCourseCandidateLimit, prioritizeResourceRefreshCourses } from '@/lib/resource-refresh-priority'
import { buildTaskRefreshActivityDetail, buildTaskRefreshRunActivity, recordTaskRefreshActivity } from '@/lib/task-refresh-activity'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'

export const runtime = 'nodejs'
export const maxDuration = 55

const DEFAULT_USER_LIMIT = 5
const DEFAULT_COURSE_LIMIT = 8
const DEFAULT_CANVAS_FETCH_TIMEOUT_MS = 8000
const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000

interface UserSettingsRow {
  user_id: string
  canvas_api_url: string | null
  canvas_access_token: string | null
  updated_at?: string | null
}

interface CourseRow {
  id: string
  user_id: string
  name: string
  canvas_instance_url: string | null
  canvas_course_id: number | null
}

function validateCronSecret(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  return Boolean(cronSecret) && req.headers.get('authorization') === `Bearer ${cronSecret}`
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'Service database client unavailable.' }, { status: 503 })
  }

  const userLimit = getPositiveIntegerEnv('TASK_REFRESH_USER_BATCH_LIMIT', DEFAULT_USER_LIMIT)
  const courseLimit = getPositiveIntegerEnv('TASK_REFRESH_COURSE_BATCH_LIMIT', DEFAULT_COURSE_LIMIT)
  const refreshWindowMs = getPositiveIntegerEnv('TASK_REFRESH_MIN_INTERVAL_MS', DEFAULT_REFRESH_INTERVAL_MS)
  const canvasFetchTimeoutMs = getPositiveIntegerEnv('TASK_REFRESH_CANVAS_FETCH_TIMEOUT_MS', DEFAULT_CANVAS_FETCH_TIMEOUT_MS)
  const courseCandidateLimit = getResourceRefreshCourseCandidateLimit(courseLimit)

  const summary = {
    usersChecked: 0,
    coursesChecked: 0,
    assignmentsChecked: 0,
    tasksInserted: 0,
    tasksUpdated: 0,
    tasksSkipped: 0,
    skipped: 0,
    warnings: [] as string[],
  }

  const { data: settingsRows, error: settingsError } = await supabase
    .from('user_settings')
    .select('user_id, canvas_api_url, canvas_access_token, updated_at')
    .not('canvas_api_url', 'is', null)
    .not('canvas_access_token', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(userLimit)

  if (settingsError) {
    return NextResponse.json({ ok: false, error: 'Could not load Canvas-connected users.' }, { status: 500 })
  }

  for (const row of (settingsRows ?? []) as UserSettingsRow[]) {
    if (summary.coursesChecked >= courseLimit) break
    if (!row.user_id || !row.canvas_api_url || !row.canvas_access_token) continue
    summary.usersChecked += 1
    const userSummary = {
      coursesChecked: 0,
      assignmentsChecked: 0,
      tasksInserted: 0,
      tasksUpdated: 0,
      tasksSkipped: 0,
      failures: 0,
      warnings: [] as string[],
    }

    const normalizedCanvasUrl = normalizeCanvasUrl(row.canvas_api_url)
    let activeCanvasCourseIds = new Set<number>()
    try {
      const activeCanvasCourses = await getCourses({
        url: normalizedCanvasUrl,
        token: row.canvas_access_token,
        timeoutMs: canvasFetchTimeoutMs,
      })
      activeCanvasCourseIds = new Set(activeCanvasCourses.map((course) => course.id))
    } catch (error) {
      summary.warnings.push('Could not load a Canvas course list for one account; using locally synced courses.')
      console.warn('[task-refresh] Canvas course list lookup failed', {
        userId: row.user_id,
        message: error instanceof Error ? error.message : String(error),
      })
      userSummary.warnings.push('Could not load a Canvas course list; using locally synced courses.')
    }

    const { data: courseRows, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id, name, canvas_instance_url, canvas_course_id')
      .eq('user_id', row.user_id)
      .eq('canvas_instance_url', normalizedCanvasUrl)
      .not('canvas_course_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(courseCandidateLimit)

    if (courseError) {
      summary.warnings.push('Could not load synced courses for one account.')
      userSummary.warnings.push('Could not load synced courses for this account.')
      await recordTaskRefreshActivity(buildTaskRefreshRunActivity({
        userId: row.user_id,
        coursesChecked: 0,
        assignmentsChecked: 0,
        tasksInserted: 0,
        tasksUpdated: 0,
        tasksSkipped: 0,
        failures: 1,
        warnings: userSummary.warnings,
      }))
      continue
    }

    const prioritizedCourses = prioritizeResourceRefreshCourses(
      (courseRows ?? []).map((course) => ({
        ...(course as CourseRow),
        canvasCourseId: (course as CourseRow).canvas_course_id,
      })),
      activeCanvasCourseIds,
    )
    const recentlyRefreshedCourseIds = await loadRecentlyRefreshedCourseIds({
      supabase,
      userId: row.user_id,
      courseIds: prioritizedCourses.map((course) => course.id),
      refreshWindowMs,
    })

    for (const course of prioritizedCourses) {
      if (summary.coursesChecked >= courseLimit) break
      if (typeof course.canvasCourseId !== 'number') continue
      if (recentlyRefreshedCourseIds.has(course.id)) {
        summary.skipped += 1
        continue
      }

      summary.coursesChecked += 1
      userSummary.coursesChecked += 1
      try {
        const assignments = await getAssignments(course.canvasCourseId, {
          url: normalizedCanvasUrl,
          token: row.canvas_access_token,
          timeoutMs: canvasFetchTimeoutMs,
        })
        const result = await refreshCanvasTaskMetadataForCourse({
          userId: row.user_id,
          courseId: course.id,
          courseName: course.name,
          assignments,
        })

        summary.assignmentsChecked += result.assignmentsChecked
        summary.tasksInserted += result.tasksInserted
        summary.tasksUpdated += result.tasksUpdated
        summary.tasksSkipped += result.tasksSkipped
        summary.warnings.push(...result.warnings)
        userSummary.assignmentsChecked += result.assignmentsChecked
        userSummary.tasksInserted += result.tasksInserted
        userSummary.tasksUpdated += result.tasksUpdated
        userSummary.tasksSkipped += result.tasksSkipped
        userSummary.warnings.push(...result.warnings)
        await recordTaskRefreshActivity({
          userId: row.user_id,
          courseId: course.id,
          status: result.warnings.length > 0 ? 'warning' : 'completed',
          detail: buildTaskRefreshActivityDetail({
            courseName: course.name,
            tasksInserted: result.tasksInserted,
            tasksUpdated: result.tasksUpdated,
            warnings: result.warnings,
          }),
          warnings: result.warnings,
          metadata: {
            assignmentsChecked: result.assignmentsChecked,
            tasksInserted: result.tasksInserted,
            tasksUpdated: result.tasksUpdated,
            tasksSkipped: result.tasksSkipped,
          },
        })
      } catch (error) {
        const warning = `${course.name}: ${error instanceof Error ? error.message : 'task refresh failed'}`
        summary.warnings.push(warning)
        userSummary.failures += 1
        userSummary.warnings.push(warning)
        await recordTaskRefreshActivity({
          userId: row.user_id,
          courseId: course.id,
          status: 'failed',
          detail: `${course.name} task refresh failed.`,
          warnings: [warning],
          metadata: {},
        })
      }
    }

    if (userSummary.coursesChecked > 0 || userSummary.warnings.length > 0) {
      await recordTaskRefreshActivity(buildTaskRefreshRunActivity({
        userId: row.user_id,
        coursesChecked: userSummary.coursesChecked,
        assignmentsChecked: userSummary.assignmentsChecked,
        tasksInserted: userSummary.tasksInserted,
        tasksUpdated: userSummary.tasksUpdated,
        tasksSkipped: userSummary.tasksSkipped,
        failures: userSummary.failures,
        warnings: userSummary.warnings,
      }))
    }
  }

  return NextResponse.json({
    ok: true,
    ...summary,
  })
}

async function loadRecentlyRefreshedCourseIds(input: {
  supabase: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>
  userId: string
  courseIds: string[]
  refreshWindowMs: number
}) {
  if (input.courseIds.length === 0) return new Set<string>()

  const cutoff = new Date(Date.now() - input.refreshWindowMs).toISOString()
  const { data, error } = await input.supabase
    .from('task_refresh_activity')
    .select('course_id')
    .eq('user_id', input.userId)
    .in('course_id', input.courseIds)
    .in('status', ['completed', 'warning'])
    .gte('created_at', cutoff)
    .limit(Math.min(input.courseIds.length, 200))

  if (error || !data) return new Set<string>()

  return new Set(
    (data as Array<{ course_id: string | null }>)
      .map((row) => row.course_id)
      .filter((courseId): courseId is string => typeof courseId === 'string' && courseId.length > 0),
  )
}
