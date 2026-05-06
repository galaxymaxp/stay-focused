import type { QueuedJobType } from '@/lib/queue'

export const EXTERNAL_CANVAS_SYNC_MODE = 'external_cron'
export const EXTERNAL_SYNC_GLOBAL_LOCK_KEY = 'external-canvas-sync'

export const DEFAULT_EXTERNAL_SYNC_USER_BATCH_LIMIT = 5
export const DEFAULT_EXTERNAL_SYNC_COURSE_BATCH_LIMIT = 3
export const DEFAULT_EXTERNAL_SYNC_LOCK_TTL_MS = 12 * 60 * 1000
export const DEFAULT_EXTERNAL_SYNC_COURSE_COOLDOWN_MS = 14 * 60 * 1000
export const DEFAULT_EXTERNAL_SYNC_DAILY_COURSE_CAP = 24
export const DEFAULT_OCR_DAILY_USER_CAP = 8
export const DEFAULT_OCR_DAILY_COURSE_CAP = 4
export const DEFAULT_OPENAI_DAILY_USER_CAP = 20
export const DEFAULT_OPENAI_DAILY_COURSE_CAP = 10

export type ExternalSyncSkipReason =
  | 'active_duplicate'
  | 'cooldown'
  | 'daily_user_cap'

export interface QueueGuardJob {
  type: QueuedJobType
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  payload: Record<string, unknown> | null
  result?: Record<string, unknown> | null
}

export interface ExternalCanvasSyncGuardOptions {
  canvasCourseId: number
  now?: Date
  cooldownMs?: number
  dailyUserCap?: number
}

export function evaluateExternalCanvasSyncQueueGuard(
  jobs: QueueGuardJob[],
  options: ExternalCanvasSyncGuardOptions,
): { allowed: true } | { allowed: false; reason: ExternalSyncSkipReason } {
  const now = options.now ?? new Date()
  const cooldownMs = options.cooldownMs ?? DEFAULT_EXTERNAL_SYNC_COURSE_COOLDOWN_MS
  const dailyUserCap = options.dailyUserCap ?? DEFAULT_EXTERNAL_SYNC_DAILY_COURSE_CAP
  const dayCutoff = now.getTime() - 24 * 60 * 60 * 1000
  const cooldownCutoff = now.getTime() - cooldownMs

  let dailyExternalSyncCount = 0

  for (const job of jobs) {
    if (job.type !== 'canvas_sync') continue
    const createdAt = Date.parse(job.createdAt)
    if (!Number.isFinite(createdAt)) continue

    const isSameCourse = jobIncludesCanvasCourseId(job, options.canvasCourseId)
    if ((job.status === 'pending' || job.status === 'running') && isSameCourse) {
      return { allowed: false, reason: 'active_duplicate' }
    }

    if (createdAt >= cooldownCutoff && isSameCourse) {
      return { allowed: false, reason: 'cooldown' }
    }

    if (createdAt >= dayCutoff && getString(job.payload, 'mode') === EXTERNAL_CANVAS_SYNC_MODE) {
      dailyExternalSyncCount += 1
    }
  }

  if (dailyExternalSyncCount >= dailyUserCap) {
    return { allowed: false, reason: 'daily_user_cap' }
  }

  return { allowed: true }
}

export function evaluateDailyCostQueueGuard(
  jobs: QueueGuardJob[],
  options: {
    types: QueuedJobType[]
    courseId?: string | null
    now?: Date
    dailyUserCap?: number
    dailyCourseCap?: number
  },
): { allowed: true } | { allowed: false; reason: 'daily_user_cap' | 'daily_course_cap' } {
  const now = options.now ?? new Date()
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000
  const typeSet = new Set(options.types)
  let userCount = 0
  let courseCount = 0

  for (const job of jobs) {
    if (!typeSet.has(job.type)) continue
    const createdAt = Date.parse(job.createdAt)
    if (!Number.isFinite(createdAt) || createdAt < cutoff) continue
    userCount += 1

    if (options.courseId && getString(job.payload, 'courseId') === options.courseId) {
      courseCount += 1
    }
  }

  if (options.dailyUserCap !== undefined && userCount >= options.dailyUserCap) {
    return { allowed: false, reason: 'daily_user_cap' }
  }

  if (options.courseId && options.dailyCourseCap !== undefined && courseCount >= options.dailyCourseCap) {
    return { allowed: false, reason: 'daily_course_cap' }
  }

  return { allowed: true }
}

export function getPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getNonNegativeIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function jobIncludesCanvasCourseId(job: QueueGuardJob, canvasCourseId: number) {
  const courseIds = Array.isArray(job.payload?.courseIds)
    ? job.payload.courseIds
    : Array.isArray(job.result?.courseIds)
    ? job.result.courseIds
    : []

  return courseIds.some((value) => {
    if (typeof value === 'number') return value === canvasCourseId
    if (typeof value === 'string') return Number.parseInt(value, 10) === canvasCourseId
    return false
  })
}

function getString(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
