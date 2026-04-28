import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { getRequiredSupabaseAuthEnv } from '@/lib/supabase-auth-config'
import { createClient } from '@supabase/supabase-js'

interface QueueQueryResult {
  data: Record<string, unknown>[] | null
  error: unknown | null
}

export type QueuedJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type QueuedJobType =
  | 'canvas_sync'
  | 'learn_generation'
  | 'do_generation'
  | 'resource_extraction'
  | 'notification_scan'

export interface QueuedJob {
  id: string
  userId: string
  type: QueuedJobType
  title: string
  status: QueuedJobStatus
  progress: number
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  attempts: number
  maxAttempts: number
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  dismissedAt: string | null
}

export interface QueuedJobFilters {
  status?: QueuedJobStatus | QueuedJobStatus[]
  type?: QueuedJobType | QueuedJobType[]
  limit?: number
}

function rowToJob(row: Record<string, unknown>): QueuedJob {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as QueuedJobType,
    title: row.title as string,
    status: row.status as QueuedJobStatus,
    progress: (row.progress as number) ?? 0,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    result: (row.result as Record<string, unknown> | null) ?? null,
    error: (row.error as string | null) ?? null,
    attempts: (row.attempts as number) ?? 0,
    maxAttempts: (row.max_attempts as number) ?? 3,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    dismissedAt: (row.dismissed_at as string | null) ?? null,
  }
}

export async function createQueuedJob(
  userId: string,
  type: QueuedJobType,
  title: string,
  payload?: Record<string, unknown>,
): Promise<QueuedJob | null> {
  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('queued_jobs')
    .insert({ user_id: userId, type, title, payload: payload ?? null })
    .select()
    .single()

  if (error) {
    console.error('[queue] createQueuedJob failed', { userId, type, error })
    return null
  }

  return rowToJob(data as Record<string, unknown>)
}

export async function getUserQueuedJobs(
  userId: string,
  filters?: QueuedJobFilters,
): Promise<QueuedJob[]> {
  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) return []

  const baseQuery = () => supabase
    .from('queued_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  let query = baseQuery().is('dismissed_at', null)

  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
    query = query.in('status', statuses)
  }

  if (filters?.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type]
    query = query.in('type', types)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  let { data, error } = await query as QueueQueryResult

  if (error && isMissingDismissedAtColumnError(error)) {
    let fallbackQuery = baseQuery()

    if (filters?.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
      fallbackQuery = fallbackQuery.in('status', statuses)
    }

    if (filters?.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type]
      fallbackQuery = fallbackQuery.in('type', types)
    }

    if (filters?.limit) {
      fallbackQuery = fallbackQuery.limit(filters.limit)
    }

    const fallbackResult = await fallbackQuery as QueueQueryResult
    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) {
    console.error('[queue] getUserQueuedJobs failed', { userId, error })
    return []
  }

  const jobs = (data as Record<string, unknown>[]).map(rowToJob)
  return enrichQueuedJobsWithResourceTitles(supabase, jobs)
}

export async function updateQueuedJobStatus(
  jobId: string,
  status: QueuedJobStatus,
  updates?: {
    progress?: number
    result?: Record<string, unknown>
    error?: string
    startedAt?: string
    completedAt?: string
  },
): Promise<boolean> {
  const supabase = getServiceRoleClient()
  if (!supabase) return false

  const patch: Record<string, unknown> = { status }
  if (updates?.progress !== undefined) patch.progress = updates.progress
  if (updates?.result !== undefined) patch.result = updates.result
  if (updates?.error !== undefined) patch.error = updates.error
  if (updates?.startedAt !== undefined) patch.started_at = updates.startedAt
  if (updates?.completedAt !== undefined) patch.completed_at = updates.completedAt

  const { error } = await supabase
    .from('queued_jobs')
    .update(patch)
    .eq('id', jobId)

  if (error) {
    console.error('[queue] updateQueuedJobStatus failed', { jobId, status, error })
    return false
  }

  return true
}

export async function markQueuedJobRunning(jobId: string, progress = 0): Promise<boolean> {
  return updateQueuedJobStatus(jobId, 'running', {
    progress,
    startedAt: new Date().toISOString(),
  })
}

export async function markQueuedJobCompleted(
  jobId: string,
  result?: Record<string, unknown>,
): Promise<boolean> {
  return updateQueuedJobStatus(jobId, 'completed', {
    progress: 100,
    result,
    completedAt: new Date().toISOString(),
  })
}

export async function markQueuedJobFailed(jobId: string, error: string): Promise<boolean> {
  return updateQueuedJobStatus(jobId, 'failed', {
    error,
    completedAt: new Date().toISOString(),
  })
}

export async function incrementJobAttempts(jobId: string): Promise<void> {
  const supabase = getServiceRoleClient()
  if (!supabase) return

  await supabase.rpc('increment_queued_job_attempts', { job_id: jobId }).maybeSingle()
}

export async function getQueuedJobById(jobId: string): Promise<QueuedJob | null> {
  const supabase = getServiceRoleClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error || !data) return null
  return rowToJob(data as Record<string, unknown>)
}

export async function dismissQueuedJob(userId: string, jobId: string): Promise<boolean> {
  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('queued_jobs')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('user_id', userId)
    .in('status', ['completed', 'failed', 'cancelled'])

  if (error) {
    console.error('[queue] dismissQueuedJob failed', { userId, jobId, error })
    return false
  }

  return true
}

export async function dismissCompletedQueuedJobs(userId: string): Promise<boolean> {
  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('queued_jobs')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'completed')
    .is('dismissed_at', null)

  if (error) {
    console.error('[queue] dismissCompletedQueuedJobs failed', { userId, error })
    return false
  }

  return true
}

async function enrichQueuedJobsWithResourceTitles(
  supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseServerClient>>,
  jobs: QueuedJob[],
): Promise<QueuedJob[]> {
  if (!supabase || jobs.length === 0) return jobs

  const resourceIds = Array.from(new Set(jobs
    .map((job) => getJobResourceId(job))
    .filter((value): value is string => Boolean(value))))

  if (resourceIds.length === 0) return jobs

  const { data, error } = await supabase
    .from('module_resources')
    .select('id,title')
    .in('id', resourceIds)

  if (error || !data) return jobs

  const titleById = new Map((data as { id: string; title: string }[]).map((row) => [row.id, row.title]))

  return jobs.map((job) => {
    if (getStringFromRecord(job.payload, 'resourceTitle') || getStringFromRecord(job.result, 'resourceTitle')) return job
    const resourceId = getJobResourceId(job)
    const resourceTitle = resourceId ? titleById.get(resourceId) : null
    if (!resourceTitle) return job
    return {
      ...job,
      payload: {
        ...(job.payload ?? {}),
        resourceTitle,
      },
    }
  })
}

function getJobResourceId(job: QueuedJob) {
  return getStringFromRecord(job.result, 'resourceId') ?? getStringFromRecord(job.payload, 'resourceId')
}

function getStringFromRecord(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isMissingDismissedAtColumnError(error: unknown) {
  const value = error as { code?: unknown; message?: unknown } | null
  const code = typeof value?.code === 'string' ? value.code : ''
  const message = typeof value?.message === 'string' ? value.message.toLowerCase() : ''
  return code === '42703'
    || code === 'PGRST204'
    || message.includes('dismissed_at')
}

export async function claimNextPendingJob(type?: QueuedJobType): Promise<QueuedJob | null> {
  const supabase = getServiceRoleClient()
  if (!supabase) return null

  let query = supabase
    .from('queued_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (type) query = query.eq('type', type)

  const { data, error } = await query

  if (error || !data || data.length === 0) return null

  const job = rowToJob((data as Record<string, unknown>[])[0])

  const claimed = await markQueuedJobRunning(job.id)
  if (!claimed) return null

  return job
}

function getServiceRoleClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceKey) {
    console.warn('[queue] SUPABASE_SERVICE_ROLE_KEY not set — using anon client for job updates')
    return null
  }

  const { supabaseUrl } = getRequiredSupabaseAuthEnv()
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
