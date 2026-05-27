import { type NextRequest, NextResponse } from 'next/server'
import { refreshCanvasTaskMetadataForCourse } from '@/actions/canvas'
import { getAssignments, getCourses, normalizeCanvasUrl } from '@/lib/canvas'
import { getResourceRefreshCourseCandidateLimit, prioritizeResourceRefreshCourses } from '@/lib/resource-refresh-priority'
import { buildTaskRefreshActivityDetail, buildTaskRefreshRunActivity, recordTaskRefreshActivity } from '@/lib/task-refresh-activity'
import {
  createTaskRefreshCronSummary,
  getTaskRefreshElapsedMs,
  getTaskRefreshRemainingMs,
  markTaskRefreshCronTimeLimit,
  resolveTaskRefreshCronLimits,
  shouldStopTaskRefreshCron,
} from '@/lib/task-refresh-cron'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'

export const runtime = 'nodejs'
export const maxDuration = 55

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

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'Service database client unavailable.' }, { status: 503 })
  }

  const startedAtMs = Date.now()
  const limits = resolveTaskRefreshCronLimits()
  const { userLimit, courseLimit, refreshWindowMs, canvasFetchTimeoutMs, timeBudgetMs } = limits
  const courseCandidateLimit = getResourceRefreshCourseCandidateLimit(courseLimit)

  const summary = createTaskRefreshCronSummary(limits)
  console.info('[task-refresh] cron started', {
    userLimit,
    courseLimit,
    courseCandidateLimit,
    canvasFetchTimeoutMs,
    timeBudgetMs,
  })

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

  const rows = (settingsRows ?? []) as UserSettingsRow[]
  for (let userIndex = 0; userIndex < rows.length; userIndex += 1) {
    const row = rows[userIndex]
    if (!row) continue
    if (summary.coursesChecked >= courseLimit) break
    if (!row.user_id || !row.canvas_api_url || !row.canvas_access_token) continue
    if (shouldStopTaskRefreshCron({ startedAtMs, timeBudgetMs, minRequiredMs: canvasFetchTimeoutMs })) {
      markTaskRefreshCronTimeLimit({
        summary,
        warning: 'Task refresh stopped before the next account because the cron time budget was nearly exhausted.',
      })
      break
    }

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
      console.info('[task-refresh] loading Canvas course list', {
        userId: row.user_id,
        remainingMs: getTaskRefreshRemainingMs(startedAtMs, timeBudgetMs),
      })
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

    if (shouldStopTaskRefreshCron({ startedAtMs, timeBudgetMs, minRequiredMs: 750 })) {
      const warning = 'Task refresh stopped before loading synced courses because the cron time budget was nearly exhausted.'
      markTaskRefreshCronTimeLimit({
        summary,
        warning,
      })
      userSummary.warnings.push(warning)
      break
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

    for (let courseIndex = 0; courseIndex < prioritizedCourses.length; courseIndex += 1) {
      const course = prioritizedCourses[courseIndex]
      if (summary.coursesChecked >= courseLimit) break
      if (typeof course.canvasCourseId !== 'number') continue
      if (recentlyRefreshedCourseIds.has(course.id)) {
        summary.skipped += 1
        continue
      }
      if (shouldStopTaskRefreshCron({ startedAtMs, timeBudgetMs, minRequiredMs: canvasFetchTimeoutMs })) {
        const warning = 'Task refresh stopped before the next course because the cron time budget was nearly exhausted.'
        markTaskRefreshCronTimeLimit({
          summary,
          skippedCourses: prioritizedCourses.length - courseIndex,
          warning,
        })
        userSummary.warnings.push(warning)
        break
      }

      summary.coursesChecked += 1
      userSummary.coursesChecked += 1
      try {
        console.info('[task-refresh] refreshing Canvas assignments', {
          userId: row.user_id,
          courseId: course.id,
          canvasCourseId: course.canvasCourseId,
          coursesChecked: summary.coursesChecked,
          remainingMs: getTaskRefreshRemainingMs(startedAtMs, timeBudgetMs),
        })
        const assignments = await getAssignments(course.canvasCourseId, {
          url: normalizedCanvasUrl,
          token: row.canvas_access_token,
          timeoutMs: canvasFetchTimeoutMs,
        })
        if (shouldStopTaskRefreshCron({ startedAtMs, timeBudgetMs, minRequiredMs: 1000 })) {
          const warning = 'Task refresh stopped after fetching assignments so database writes would not overrun the cron time budget.'
          markTaskRefreshCronTimeLimit({
            summary,
            skippedCourses: prioritizedCourses.length - courseIndex - 1,
            warning,
          })
          userSummary.warnings.push(warning)
          break
        }
        const result = await refreshCanvasTaskMetadataForCourse({
          userId: row.user_id,
          courseId: course.id,
          courseName: course.name,
          assignments,
        })

        summary.assignmentsChecked += result.assignmentsChecked
        summary.tasksChecked += result.assignmentsChecked
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
        summary.errors.push(warning)
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

    if (summary.timedOut) break
  }

  summary.elapsedMs = getTaskRefreshElapsedMs(startedAtMs)
  console.info('[task-refresh] cron finished', summary)

  return NextResponse.json({
    ok: true,
    usersChecked: summary.usersChecked,
    coursesChecked: summary.coursesChecked,
    tasksChecked: summary.tasksChecked,
    assignmentsChecked: summary.assignmentsChecked,
    tasksInserted: summary.tasksInserted,
    tasksUpdated: summary.tasksUpdated,
    tasksSkipped: summary.tasksSkipped,
    skipped: summary.skipped,
    skippedDueTimeLimit: summary.skippedDueTimeLimit,
    warnings: summary.warnings,
    errors: summary.errors,
    timedOut: summary.timedOut,
    partial: summary.partial,
    timeBudgetMs: summary.timeBudgetMs,
    elapsedMs: summary.elapsedMs,
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
