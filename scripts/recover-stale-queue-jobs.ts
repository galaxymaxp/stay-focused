import fs from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adaptModuleResourceRow } from '../lib/module-resource-row'
import {
  CANVAS_SYNC_STALE_RUNNING_THRESHOLD_MS,
  SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS,
  findStaleRunningCanvasSyncJobs,
  findStaleRunningSourceOcrJobs,
  getSourceOcrJobResourceId,
} from '../lib/source-ocr-queue'
import { buildOcrFailedUpdate } from '../lib/source-ocr-updates'
import type { QueuedJob } from '../lib/queue'

interface ParsedArgs {
  apply: boolean
  userId: string | null
  limit: number
}

interface RecoverySummary {
  apply: boolean
  staleCanvasSyncJobs: Array<Record<string, unknown>>
  staleSourceOcrJobs: Array<Record<string, unknown>>
  updatedJobIds: string[]
  errors: Array<Record<string, unknown>>
}

const CANVAS_SYNC_STALE_MESSAGE = 'Sync took too long. Some extraction may continue in the queue.'
const SOURCE_OCR_STALE_MESSAGE = 'Preparing this PDF took too long. Retry extraction.'

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return

  const contents = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    apply: false,
    userId: null,
    limit: 100,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--apply') {
      args.apply = true
      continue
    }

    if (value === '--user-id') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a value after --user-id')
      args.userId = nextValue
      index += 1
      continue
    }

    if (value === '--limit') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a numeric value after --limit')
      const parsed = Number.parseInt(nextValue, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --limit value: ${nextValue}`)
      args.limit = parsed
      index += 1
      continue
    }

    if (value === '--help' || value === '-h') {
      printUsage()
      process.exit(0)
    }

    throw new Error(`Unknown argument: ${value}`)
  }

  return args
}

function printUsage() {
  console.log(`Usage: npx tsx scripts/recover-stale-queue-jobs.ts [--apply] [--user-id uuid] [--limit 100]

Dry run by default. With --apply, marks stale running canvas_sync and source_ocr jobs as recovered.
This script does not delete resources, extracted text, or visual OCR text.`)
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Refusing to recover queue jobs without service-role access.')
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function loadRunningJobs(
  supabase: SupabaseClient,
  type: 'canvas_sync' | 'source_ocr',
  args: ParsedArgs,
) {
  let query = supabase
    .from('queued_jobs')
    .select('*')
    .eq('type', type)
    .eq('status', 'running')
    .order('updated_at', { ascending: true })
    .limit(args.limit)

  if (args.userId) query = query.eq('user_id', args.userId)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load ${type} jobs: ${error.message}`)
  return (data ?? []).map(rowToQueuedJob)
}

async function main() {
  loadEnvFile()
  const args = parseArgs(process.argv.slice(2))
  const supabase = createSupabaseClient()
  const now = new Date()

  const runningCanvasSyncJobs = await loadRunningJobs(supabase, 'canvas_sync', args)
  const runningSourceOcrJobs = await loadRunningJobs(supabase, 'source_ocr', args)
  const staleCanvasSyncJobs = findStaleRunningCanvasSyncJobs(runningCanvasSyncJobs, now)
  const staleSourceOcrJobs = findStaleRunningSourceOcrJobs(runningSourceOcrJobs, now)

  const summary: RecoverySummary = {
    apply: args.apply,
    staleCanvasSyncJobs: staleCanvasSyncJobs.map((job) => describeJob(job, CANVAS_SYNC_STALE_RUNNING_THRESHOLD_MS)),
    staleSourceOcrJobs: staleSourceOcrJobs.map((job) => ({
      ...describeJob(job, SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS),
      resourceId: getSourceOcrJobResourceId(job),
    })),
    updatedJobIds: [],
    errors: [],
  }

  if (args.apply) {
    for (const job of staleCanvasSyncJobs) {
      try {
        await recoverCanvasSyncJob(supabase, job)
        summary.updatedJobIds.push(job.id)
      } catch (error) {
        summary.errors.push({ jobId: job.id, type: job.type, error: getErrorMessage(error) })
      }
    }

    for (const job of staleSourceOcrJobs) {
      try {
        await recoverSourceOcrJob(supabase, job)
        summary.updatedJobIds.push(job.id)
      } catch (error) {
        summary.errors.push({ jobId: job.id, type: job.type, error: getErrorMessage(error) })
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

async function recoverCanvasSyncJob(supabase: SupabaseClient, job: QueuedJob) {
  const importedCourses = await findImportedCanvasCoursesForJob(supabase, job)
  const importedCourseIds = importedCourses.map((course) => course.id)
  const importedCourseNames = importedCourses.map((course) => course.name)
  const completedAt = new Date().toISOString()

  if (importedCourses.length > 0) {
    const { error } = await supabase
      .from('queued_jobs')
      .update({
        status: 'completed',
        progress: 100,
        completed_at: completedAt,
        result: {
          ...(job.result ?? {}),
          courseCount: importedCourses.length,
          courseNames: importedCourseNames,
          courseIds: importedCourseIds,
          href: importedCourseIds[0] ? `/courses/${importedCourseIds[0]}` : '/courses',
          statusMessage: CANVAS_SYNC_STALE_MESSAGE,
          currentStep: 'done',
          recoveredFromStaleSync: true,
        },
      })
      .eq('id', job.id)

    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('queued_jobs')
    .update({
      status: 'failed',
      error: CANVAS_SYNC_STALE_MESSAGE,
      completed_at: completedAt,
    })
    .eq('id', job.id)

  if (error) throw error
}

async function recoverSourceOcrJob(supabase: SupabaseClient, job: QueuedJob) {
  const completedAt = new Date().toISOString()
  const { error } = await supabase
    .from('queued_jobs')
    .update({
      status: 'failed',
      error: SOURCE_OCR_STALE_MESSAGE,
      completed_at: completedAt,
    })
    .eq('id', job.id)

  if (error) throw error

  const resourceId = getSourceOcrJobResourceId(job)
  if (!resourceId) return

  const { data: resourceData, error: resourceError } = await supabase
    .from('module_resources')
    .select('*')
    .eq('id', resourceId)
    .maybeSingle()

  if (resourceError) throw resourceError
  if (!resourceData) return

  const resource = adaptModuleResourceRow(resourceData as Record<string, unknown>)
  if (resource.visualExtractionStatus !== 'running' && resource.visualExtractionStatus !== 'queued') return

  const update = buildOcrFailedUpdate({
    resource,
    message: SOURCE_OCR_STALE_MESSAGE,
    now: completedAt,
  })

  const { error: updateError } = await supabase
    .from('module_resources')
    .update(update)
    .eq('id', resourceId)

  if (updateError) throw updateError

  if (update.visual_extraction_status === 'completed' && update.extracted_char_count >= 120) {
    const completedResult = {
      resourceId,
      moduleId: getStringFromJobField(job, 'moduleId') ?? resource.moduleId,
      resourceTitle: resource.title,
      pageCount: update.page_count ?? resource.pageCount ?? null,
      pagesProcessed: update.pages_processed,
      charCount: update.extracted_char_count,
      statusMessage: 'Partially scanned. Enough readable text is available for Deep Learn.',
      href: `/modules/${resource.moduleId}/learn?resource=${encodeURIComponent(resourceId)}`,
      recoveredFromStaleOcr: true,
    }

    const { error: completeError } = await supabase
      .from('queued_jobs')
      .update({
        status: 'completed',
        progress: 100,
        result: completedResult,
        error: null,
        completed_at: completedAt,
      })
      .eq('id', job.id)

    if (completeError) throw completeError
  }
}

async function findImportedCanvasCoursesForJob(supabase: SupabaseClient, job: QueuedJob) {
  const canvasCourseIds = getNumberArrayFromJobPayload(job, 'courseIds')
  if (canvasCourseIds.length === 0) return [] as Array<{ id: string; name: string }>

  let query = supabase
    .from('courses')
    .select('id,name')
    .eq('user_id', job.userId)
    .in('canvas_course_id', canvasCourseIds)

  const canvasUrl = getStringFromJobPayload(job, 'canvasUrl')
  if (canvasUrl) query = query.eq('canvas_instance_url', canvasUrl)

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; name: string }>).filter((course) => course.id && course.name)
}

function describeJob(job: QueuedJob, thresholdMs: number) {
  const updatedAtMs = new Date(job.updatedAt).getTime()
  const ageMinutes = Number.isFinite(updatedAtMs)
    ? Math.round((Date.now() - updatedAtMs) / 60000)
    : null

  return {
    id: job.id,
    userId: job.userId,
    type: job.type,
    title: job.title,
    progress: job.progress,
    updatedAt: job.updatedAt,
    ageMinutes,
    thresholdMinutes: Math.round(thresholdMs / 60000),
    statusMessage: getString(job.result, 'statusMessage'),
  }
}

function rowToQueuedJob(row: Record<string, unknown>): QueuedJob {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as QueuedJob['type'],
    title: row.title as string,
    status: row.status as QueuedJob['status'],
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

function getNumberArrayFromJobPayload(job: QueuedJob, key: string) {
  const value = job.payload?.[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
}

function getStringFromJobPayload(job: QueuedJob, key: string) {
  return getString(job.payload, key)
}

function getStringFromJobField(job: QueuedJob, key: string) {
  return getString(job.result, key) ?? getString(job.payload, key)
}

function getString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
