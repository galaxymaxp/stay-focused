import { type NextRequest, NextResponse } from 'next/server'
import { refreshCanvasModuleResourceMetadataForCourse } from '@/actions/canvas'
import { getCourses, normalizeCanvasUrl } from '@/lib/canvas'
import { buildResourceRefreshActivityDetail, recordResourceRefreshActivity } from '@/lib/resource-refresh-activity'
import { getResourceRefreshCourseCandidateLimit, prioritizeResourceRefreshCourses } from '@/lib/resource-refresh-priority'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'

export const runtime = 'nodejs'
export const maxDuration = 55

const DAILY_REFRESH_WINDOW_MS = 20 * 60 * 60 * 1000
const DEFAULT_USER_LIMIT = 4
const DEFAULT_COURSE_LIMIT = 6
const DEFAULT_MODULE_LIMIT = 40
const DEFAULT_MODULE_ITEM_LIMIT = 400
const DEFAULT_CANVAS_FETCH_TIMEOUT_MS = 8000

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

  const userLimit = getPositiveIntegerEnv('RESOURCE_REFRESH_USER_BATCH_LIMIT', DEFAULT_USER_LIMIT)
  const courseLimit = getPositiveIntegerEnv('RESOURCE_REFRESH_COURSE_BATCH_LIMIT', DEFAULT_COURSE_LIMIT)
  const moduleLimit = getPositiveIntegerEnv('RESOURCE_REFRESH_MODULE_LIMIT', DEFAULT_MODULE_LIMIT)
  const moduleItemLimit = getPositiveIntegerEnv('RESOURCE_REFRESH_MODULE_ITEM_LIMIT', DEFAULT_MODULE_ITEM_LIMIT)
  const refreshWindowMs = getPositiveIntegerEnv('RESOURCE_REFRESH_MIN_INTERVAL_MS', DAILY_REFRESH_WINDOW_MS)
  const canvasFetchTimeoutMs = getPositiveIntegerEnv('RESOURCE_REFRESH_CANVAS_FETCH_TIMEOUT_MS', DEFAULT_CANVAS_FETCH_TIMEOUT_MS)
  const courseCandidateLimit = getResourceRefreshCourseCandidateLimit(courseLimit)

  const summary = {
    usersChecked: 0,
    coursesChecked: 0,
    modulesChecked: 0,
    moduleItemsChecked: 0,
    resourcesInserted: 0,
    resourcesUpdated: 0,
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
      summary.warnings.push(`User ${row.user_id}: could not load current Canvas course list; using local course order.`)
      console.warn('[resource-refresh] Canvas active course lookup failed', {
        userId: row.user_id,
        message: error instanceof Error ? error.message : String(error),
      })
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
      console.error(`[resource-refresh] DB error loading courses for user ${row.user_id}:`, {
        code: courseError.code,
        message: courseError.message,
        details: courseError.details,
        hint: courseError.hint,
      })
      summary.warnings.push(`User ${row.user_id}: could not load synced courses.`)
      continue
    }

    if (!courseRows || courseRows.length === 0) {
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
      if (typeof course.canvasCourseId !== 'number' || !course.canvas_instance_url) continue
      if (recentlyRefreshedCourseIds.has(course.id)) {
        summary.skipped += 1
        continue
      }

      summary.coursesChecked += 1

      try {
        const result = await refreshCanvasModuleResourceMetadataForCourse({
          userId: row.user_id,
          courseId: course.id,
          courseName: course.name,
          canvasUrl: row.canvas_api_url,
          canvasAccessToken: row.canvas_access_token,
          canvasCourseId: course.canvasCourseId,
          maxModules: moduleLimit,
          maxModuleItems: moduleItemLimit,
        })

        summary.modulesChecked += result.modulesChecked
        summary.moduleItemsChecked += result.moduleItemsChecked
        summary.resourcesInserted += result.resourcesInserted
        summary.resourcesUpdated += result.resourcesUpdated
        summary.skipped += result.skipped
        summary.warnings.push(...result.warnings)
        await recordResourceRefreshActivity({
          userId: row.user_id,
          courseId: course.id,
          status: result.warnings.length > 0 ? 'warning' : 'completed',
          detail: buildResourceRefreshActivityDetail({
            courseName: course.name,
            resourcesInserted: result.resourcesInserted,
            resourcesUpdated: result.resourcesUpdated,
            warnings: result.warnings,
          }),
          warnings: result.warnings,
          metadata: {
            modulesChecked: result.modulesChecked,
            moduleItemsChecked: result.moduleItemsChecked,
            resourcesInserted: result.resourcesInserted,
            resourcesUpdated: result.resourcesUpdated,
            skipped: result.skipped,
          },
        })
      } catch (error) {
        summary.warnings.push(`${course.name}: ${error instanceof Error ? error.message : 'refresh failed'}`)
        await recordResourceRefreshActivity({
          userId: row.user_id,
          courseId: course.id,
          status: 'failed',
          detail: `${course.name} refresh failed.`,
          warnings: [error instanceof Error ? error.message : 'refresh failed'],
          metadata: {},
        })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    usersChecked: summary.usersChecked,
    coursesChecked: summary.coursesChecked,
    modulesChecked: summary.modulesChecked,
    moduleItemsChecked: summary.moduleItemsChecked,
    resourcesInserted: summary.resourcesInserted,
    resourcesUpdated: summary.resourcesUpdated,
    skipped: summary.skipped,
    warnings: summary.warnings,
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
    .from('module_resources')
    .select('course_id')
    .eq('user_id', input.userId)
    .in('course_id', input.courseIds)
    .gte('updated_at', cutoff)
    .limit(Math.min(input.courseIds.length, 200))

  if (error || !data) return new Set<string>()

  return new Set(
    (data as Array<{ course_id: string | null }>)
      .map((row) => row.course_id)
      .filter((courseId): courseId is string => typeof courseId === 'string' && courseId.length > 0),
  )
}
