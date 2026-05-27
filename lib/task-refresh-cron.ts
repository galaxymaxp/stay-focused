export const DEFAULT_TASK_REFRESH_USER_BATCH_LIMIT = 5
export const DEFAULT_TASK_REFRESH_COURSE_BATCH_LIMIT = 8
export const DEFAULT_TASK_REFRESH_CANVAS_FETCH_TIMEOUT_MS = 8000
export const DEFAULT_TASK_REFRESH_INTERVAL_MS = 15 * 60 * 1000
export const DEFAULT_TASK_REFRESH_TIME_BUDGET_MS = 25_000
export const TASK_REFRESH_TIME_BUDGET_SAFETY_MS = 3_000

export const MAX_TASK_REFRESH_USER_BATCH_LIMIT = 5
export const MAX_TASK_REFRESH_COURSE_BATCH_LIMIT = 8
export const MAX_TASK_REFRESH_CANVAS_FETCH_TIMEOUT_MS = 10_000
export const MAX_TASK_REFRESH_TIME_BUDGET_MS = 45_000

export interface TaskRefreshCronLimits {
  userLimit: number
  courseLimit: number
  refreshWindowMs: number
  canvasFetchTimeoutMs: number
  timeBudgetMs: number
}

export interface TaskRefreshCronSummary {
  usersChecked: number
  coursesChecked: number
  tasksChecked: number
  assignmentsChecked: number
  tasksInserted: number
  tasksUpdated: number
  tasksSkipped: number
  skipped: number
  skippedDueTimeLimit: number
  warnings: string[]
  errors: string[]
  timedOut: boolean
  partial: boolean
  timeBudgetMs: number
  elapsedMs: number
}

export function resolveTaskRefreshCronLimits(env: Pick<NodeJS.ProcessEnv, string> = process.env): TaskRefreshCronLimits {
  return {
    userLimit: getBoundedPositiveIntegerEnv(env, 'TASK_REFRESH_USER_BATCH_LIMIT', DEFAULT_TASK_REFRESH_USER_BATCH_LIMIT, MAX_TASK_REFRESH_USER_BATCH_LIMIT),
    courseLimit: getBoundedPositiveIntegerEnv(env, 'TASK_REFRESH_COURSE_BATCH_LIMIT', DEFAULT_TASK_REFRESH_COURSE_BATCH_LIMIT, MAX_TASK_REFRESH_COURSE_BATCH_LIMIT),
    refreshWindowMs: getBoundedPositiveIntegerEnv(env, 'TASK_REFRESH_MIN_INTERVAL_MS', DEFAULT_TASK_REFRESH_INTERVAL_MS),
    canvasFetchTimeoutMs: getBoundedPositiveIntegerEnv(env, 'TASK_REFRESH_CANVAS_FETCH_TIMEOUT_MS', DEFAULT_TASK_REFRESH_CANVAS_FETCH_TIMEOUT_MS, MAX_TASK_REFRESH_CANVAS_FETCH_TIMEOUT_MS),
    timeBudgetMs: getBoundedPositiveIntegerEnv(env, 'TASK_REFRESH_TIME_BUDGET_MS', DEFAULT_TASK_REFRESH_TIME_BUDGET_MS, MAX_TASK_REFRESH_TIME_BUDGET_MS),
  }
}

export function createTaskRefreshCronSummary(limits: Pick<TaskRefreshCronLimits, 'timeBudgetMs'>): TaskRefreshCronSummary {
  return {
    usersChecked: 0,
    coursesChecked: 0,
    tasksChecked: 0,
    assignmentsChecked: 0,
    tasksInserted: 0,
    tasksUpdated: 0,
    tasksSkipped: 0,
    skipped: 0,
    skippedDueTimeLimit: 0,
    warnings: [],
    errors: [],
    timedOut: false,
    partial: false,
    timeBudgetMs: limits.timeBudgetMs,
    elapsedMs: 0,
  }
}

export function getTaskRefreshElapsedMs(startedAtMs: number, nowMs = Date.now()) {
  return Math.max(0, nowMs - startedAtMs)
}

export function getTaskRefreshRemainingMs(startedAtMs: number, timeBudgetMs: number, nowMs = Date.now()) {
  return Math.max(0, timeBudgetMs - getTaskRefreshElapsedMs(startedAtMs, nowMs))
}

export function shouldStopTaskRefreshCron(input: {
  startedAtMs: number
  timeBudgetMs: number
  nowMs?: number
  minRequiredMs?: number
}) {
  const remainingMs = getTaskRefreshRemainingMs(input.startedAtMs, input.timeBudgetMs, input.nowMs)
  return remainingMs <= TASK_REFRESH_TIME_BUDGET_SAFETY_MS + Math.max(0, input.minRequiredMs ?? 0)
}

export function markTaskRefreshCronTimeLimit(input: {
  summary: TaskRefreshCronSummary
  skippedCourses?: number
  warning?: string
}) {
  input.summary.timedOut = true
  input.summary.partial = true
  input.summary.skippedDueTimeLimit += Math.max(0, input.skippedCourses ?? 0)
  const warning = input.warning ?? 'Task refresh stopped early to stay within the cron time budget.'
  if (!input.summary.warnings.includes(warning)) {
    input.summary.warnings.push(warning)
  }
}

function getBoundedPositiveIntegerEnv(
  env: Pick<NodeJS.ProcessEnv, string>,
  name: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
) {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}
