import { type NextRequest, NextResponse } from 'next/server'
import { createQueuedJobAsService, type QueuedJob } from '@/lib/queue'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'
import { getCourses, normalizeCanvasUrl, type CanvasCourse } from '@/lib/canvas'
import { tryAcquireExternalSyncLock } from '@/lib/external-sync-locks'
import {
  DEFAULT_EXTERNAL_SYNC_COURSE_BATCH_LIMIT,
  DEFAULT_EXTERNAL_SYNC_COURSE_COOLDOWN_MS,
  DEFAULT_EXTERNAL_SYNC_DAILY_COURSE_CAP,
  DEFAULT_EXTERNAL_SYNC_LOCK_TTL_MS,
  DEFAULT_EXTERNAL_SYNC_USER_BATCH_LIMIT,
  EXTERNAL_CANVAS_SYNC_MODE,
  EXTERNAL_SYNC_GLOBAL_LOCK_KEY,
  evaluateExternalCanvasSyncQueueGuard,
  getPositiveIntegerEnv,
  type QueueGuardJob,
} from '@/lib/external-sync-queue'

export const runtime = 'nodejs'
export const maxDuration = 20

interface UserSettingsRow {
  user_id: string
  canvas_api_url: string | null
  canvas_access_token: string | null
  updated_at?: string | null
}

interface SyncedCourseRow {
  id: string
  code: string
  name: string
  canvas_instance_url: string | null
  canvas_course_id: number | null
}

function validateCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) return false

  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'Service database client unavailable.' }, { status: 503 })
  }

  const owner = `external-sync:${crypto.randomUUID()}`
  const lockTtlMs = getPositiveIntegerEnv('EXTERNAL_SYNC_LOCK_TTL_MS', DEFAULT_EXTERNAL_SYNC_LOCK_TTL_MS)
  const lockAcquired = await tryAcquireExternalSyncLock({
    lockKey: EXTERNAL_SYNC_GLOBAL_LOCK_KEY,
    owner,
    ttlMs: lockTtlMs,
  })

  if (!lockAcquired) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'sync_already_running',
    })
  }

  const userLimit = getPositiveIntegerEnv('EXTERNAL_SYNC_USER_BATCH_LIMIT', DEFAULT_EXTERNAL_SYNC_USER_BATCH_LIMIT)
  const courseLimit = getPositiveIntegerEnv('EXTERNAL_SYNC_COURSE_BATCH_LIMIT', DEFAULT_EXTERNAL_SYNC_COURSE_BATCH_LIMIT)
  const dailyCap = getPositiveIntegerEnv('EXTERNAL_SYNC_DAILY_COURSE_CAP', DEFAULT_EXTERNAL_SYNC_DAILY_COURSE_CAP)
  const courseCooldownMs = getPositiveIntegerEnv('EXTERNAL_SYNC_COURSE_COOLDOWN_MS', DEFAULT_EXTERNAL_SYNC_COURSE_COOLDOWN_MS)

  const { data: settingsRows, error: settingsError } = await supabase
    .from('user_settings')
    .select('user_id, canvas_api_url, canvas_access_token, updated_at')
    .not('canvas_api_url', 'is', null)
    .not('canvas_access_token', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(userLimit)

  if (settingsError) {
    console.error('[cron/external-sync] settings lookup failed', {
      code: settingsError.code,
      message: settingsError.message,
    })
    return NextResponse.json({ ok: false, error: 'Could not load Canvas-connected users.' }, { status: 500 })
  }

  const stats = {
    usersScanned: 0,
    coursesChecked: 0,
    jobsQueued: 0,
    skipped: {
      noSyncedCourses: 0,
      notInCanvasList: 0,
      activeDuplicate: 0,
      cooldown: 0,
      dailyUserCap: 0,
      queueCreateFailed: 0,
      canvasFetchFailed: 0,
    },
    queuedJobIds: [] as string[],
  }

  for (const row of (settingsRows ?? []) as UserSettingsRow[]) {
    if (stats.jobsQueued >= courseLimit) break
    if (!row.user_id || !row.canvas_api_url || !row.canvas_access_token) continue
    stats.usersScanned += 1

    let normalizedCanvasUrl: string
    try {
      normalizedCanvasUrl = normalizeCanvasUrl(row.canvas_api_url)
    } catch {
      stats.skipped.canvasFetchFailed += 1
      continue
    }
    let canvasCourses: CanvasCourse[] = []
    try {
      canvasCourses = await getCourses({
        url: normalizedCanvasUrl,
        token: row.canvas_access_token,
      })
    } catch (error) {
      stats.skipped.canvasFetchFailed += 1
      console.warn('[cron/external-sync] Canvas course list fetch failed', {
        userId: row.user_id,
        message: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    const canvasCourseIds = new Set(canvasCourses.map((course) => course.id))
    const { data: courseRows, error: courseError } = await supabase
      .from('courses')
      .select('id, code, name, canvas_instance_url, canvas_course_id')
      .eq('user_id', row.user_id)
      .eq('canvas_instance_url', normalizedCanvasUrl)
      .not('canvas_course_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50)

    if (courseError) {
      console.error('[cron/external-sync] synced course lookup failed', {
        userId: row.user_id,
        code: courseError.code,
        message: courseError.message,
      })
      continue
    }

    const syncedCourses = ((courseRows ?? []) as SyncedCourseRow[])
      .filter((course) => typeof course.canvas_course_id === 'number')

    if (syncedCourses.length === 0) {
      stats.skipped.noSyncedCourses += 1
      continue
    }

    const recentJobs = await loadRecentCanvasSyncJobs(row.user_id)

    for (const course of syncedCourses) {
      if (stats.jobsQueued >= courseLimit) break
      const canvasCourseId = course.canvas_course_id
      if (typeof canvasCourseId !== 'number') continue
      stats.coursesChecked += 1

      if (!canvasCourseIds.has(canvasCourseId)) {
        stats.skipped.notInCanvasList += 1
        continue
      }

      const guard = evaluateExternalCanvasSyncQueueGuard(recentJobs, {
        canvasCourseId,
        cooldownMs: courseCooldownMs,
        dailyUserCap: dailyCap,
      })

      if (!guard.allowed) {
        if (guard.reason === 'active_duplicate') stats.skipped.activeDuplicate += 1
        else if (guard.reason === 'cooldown') stats.skipped.cooldown += 1
        else stats.skipped.dailyUserCap += 1
        continue
      }

      const job = await createQueuedJobAsService(
        row.user_id,
        'canvas_sync',
        `Checking Canvas: ${course.name}`,
        {
          canvasUrl: normalizedCanvasUrl,
          courseIds: [canvasCourseId],
          courseNames: [course.name],
          courseCount: 1,
          courseRecordId: course.id,
          mode: EXTERNAL_CANVAS_SYNC_MODE,
          queuedBy: 'cron-job.org',
        },
      )

      if (!job) {
        stats.skipped.queueCreateFailed += 1
        continue
      }

      stats.jobsQueued += 1
      stats.queuedJobIds.push(job.id)
      recentJobs.unshift(toQueueGuardJob(job))
    }
  }

  console.info('[cron/external-sync] scan complete', stats)

  return NextResponse.json({
    ok: true,
    scanned: stats,
  })
}

async function loadRecentCanvasSyncJobs(userId: string): Promise<QueueGuardJob[]> {
  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) return []

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('queued_jobs')
    .select('type, status, payload, result, created_at')
    .eq('user_id', userId)
    .eq('type', 'canvas_sync')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error || !data) return []

  return (data as Record<string, unknown>[]).map((row) => ({
    type: row.type as QueueGuardJob['type'],
    status: row.status as QueueGuardJob['status'],
    createdAt: row.created_at as string,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    result: (row.result as Record<string, unknown> | null) ?? null,
  }))
}

function toQueueGuardJob(job: QueuedJob): QueueGuardJob {
  return {
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    payload: job.payload,
    result: job.result,
  }
}
