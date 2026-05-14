'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAuthenticatedSupabaseServerClient, getAuthenticatedUserServer } from '@/lib/auth-server'
import type { CanvasConfig } from '@/lib/canvas'
import { CANVAS_RECONNECT_MESSAGE, resolveStoredCanvasConfigForUserResource as sharedResolveStoredCanvasConfigForUserResource } from '@/lib/canvas-user-config'
import { adaptModuleResourceRow } from '@/lib/module-resource-row'
import {
  createQueuedJob,
  createQueuedJobAsService,
  getQueuedJobById,
  getUserQueuedJobs,
  isQueuedJobCancelled,
  markQueuedJobCancelled,
  markQueuedJobCompleted,
  markQueuedJobFailed,
  markQueuedJobRunning,
  updateQueuedJobStatus,
  type QueuedJob,
} from '@/lib/queue'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'
import {
  buildLearnExperience,
  extractCourseName,
  getModuleWorkspace,
  resolveLearnResourceSelection,
} from '@/lib/module-workspace'
import { DeepLearnGenerationBlockedError, DeepLearnGenerationIncompleteError, generateDeepLearnNoteForResource } from '@/lib/deep-learn-generation'
import {
  DEEP_LEARN_PROMPT_VERSION,
  buildDeepLearnNoteBody,
  computeDeepLearnQuizReady,
} from '@/lib/deep-learn'
import { classifyDeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { saveDeepLearnNote } from '@/lib/deep-learn-store'
import { buildDeepLearnNoteHref } from '@/lib/stay-focused-links'
import { buildTaskDraftContextText, type TaskDraftContext } from '@/lib/do-now'
import { createNotification } from '@/lib/notifications-server'
import { saveTaskOutputStudyOutputAction } from '@/actions/study-outputs'
import { StudyOutputSaveError } from '@/lib/study-output-errors'
import { buildTaskOutputRequest, isTaskOutputApiResponse } from '@/lib/task-output'
import { type PdfOcrPage, type PdfOcrResult } from '@/lib/extraction/pdf-ocr'
import { getSourceOcrProvider } from '@/lib/extraction/source-ocr-provider'
import { reprocessStoredModuleResource } from '@/lib/module-resource-reprocess'
import {
  buildMergedOcrResult,
  buildMergedOcrText,
  buildOcrResumeState,
  mergeOcrPageArrays,
} from '@/lib/source-ocr-resume'
import {
  buildOcrCompletedUpdate,
  buildOcrCanceledUpdate,
  buildOcrFailedUpdate,
  buildOcrPageProgressUpdate,
  buildOcrProcessingUpdate,
  buildOcrQueuedUpdate,
  isOcrAlreadyCompleted,
  isOcrAlreadyRunning,
  isScannedPdfOcrCandidate,
} from '@/lib/source-ocr-updates'
import {
  buildSourceOcrQueueTitle,
  buildSourceOcrStatusMessage,
  calculateSourceOcrProgress,
  canStartNextSourceOcrJob,
  countFailedSourceOcrJobs,
  countRunningSourceOcrJobs,
  findActiveSourceOcrJob,
  findNextPendingSourceOcrJob,
  findRecentFailedSourceOcrJob,
  findStaleRunningCanvasSyncJobs,
  findStaleRunningSourceOcrJobs,
  getSourceOcrJobResourceId,
} from '@/lib/source-ocr-queue'
import {
  RESOURCE_EXTRACTION_JOB_TYPE,
  buildResourceExtractionQueueTitle,
  buildResourceExtractionStatusMessage,
  canStartNextResourceExtractionJob,
  findActiveResourceExtractionJob,
  findNextPendingResourceExtractionJob,
} from '@/lib/resource-extraction-queue'
import {
  DEFAULT_OCR_DAILY_COURSE_CAP,
  DEFAULT_OCR_DAILY_USER_CAP,
  DEFAULT_OPENAI_DAILY_COURSE_CAP,
  DEFAULT_OPENAI_DAILY_USER_CAP,
  evaluateDailyCostQueueGuard,
  getPositiveIntegerEnv,
} from '@/lib/external-sync-queue'
import { canAutoRunSourceOcr, canRunManualSourceOcr, getOcrMaxPagesForProvider, getSourceOcrConfig } from '@/lib/source-ocr-config'
import type { ModuleResource } from '@/lib/types'
import { isProcessableReadableSource, normalizeSourceProcessingResult } from '@/lib/source-processing'
import { getModuleResourceQualityInfo } from '@/lib/module-resource-quality'

export interface QueueJobResult {
  jobId: string
  job?: QueuedJob
  error?: string
}

export interface ResourceExtractionWorkerStats {
  jobsChecked: number
  jobsStarted: number
  jobsCompleted: number
  jobsFailed: number
  jobsSkipped: number
  warnings: string[]
}

export interface AutoSourceOcrJobInput {
  userId: string
  moduleId: string
  courseId: string | null
  resource: ModuleResource
  manualRetry?: boolean
}

interface AutoResourceExtractionJobInput {
  userId: string
  moduleId: string
  courseId: string | null
  resource: ModuleResource
}

interface QueueContinuationOptions {
  continueQueue?: boolean
}

interface ResourceExtractionProcessingOptions extends QueueContinuationOptions {
  autoStartSourceOcr?: boolean
}

interface ResourceExtractionProcessResult {
  started: boolean
  status: 'completed' | 'failed' | 'cancelled' | 'skipped'
}

// ---------------------------------------------------------------------------
// Queue: Deep Learn generation
// ---------------------------------------------------------------------------

export async function queueLearnGenerationAction(input: {
  moduleId: string
  resourceId: string
  courseId?: string | null
  resourceTitle: string
}): Promise<QueueJobResult> {
  const user = await getAuthenticatedUserServer()
  if (!user) return { jobId: '', error: 'Not authenticated.' }

  const activeDuplicate = await findActiveJob(user.id, 'learn_generation', 'resourceId', input.resourceId)
  if (activeDuplicate) return { jobId: activeDuplicate.id, job: activeDuplicate }

  const costGuardJobs = await getUserQueuedJobs(user.id, { type: ['learn_generation'], limit: 100 })
  const costGuard = evaluateDailyCostQueueGuard(costGuardJobs, {
    types: ['learn_generation'],
    courseId: input.courseId ?? null,
    dailyUserCap: getPositiveIntegerEnv('OPENAI_MAX_JOBS_PER_USER_PER_DAY', DEFAULT_OPENAI_DAILY_USER_CAP),
    dailyCourseCap: getPositiveIntegerEnv('OPENAI_MAX_JOBS_PER_COURSE_PER_DAY', DEFAULT_OPENAI_DAILY_COURSE_CAP),
  })
  if (!costGuard.allowed) {
    return {
      jobId: '',
      error: costGuard.reason === 'daily_course_cap'
        ? 'This course has reached today\'s study generation limit. Try again tomorrow.'
        : 'Today\'s study generation limit has been reached. Try again tomorrow.',
    }
  }

  const job = await createQueuedJob(
    user.id,
    'learn_generation',
    `Generating study pack: ${input.resourceTitle}`,
    {
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      courseId: input.courseId ?? null,
      resourceTitle: input.resourceTitle,
    },
  )

  if (!job) return { jobId: '', error: 'Failed to create queue job.' }

  after(async () => {
    await processLearnGenerationJob({
      jobId: job.id,
      userId: user.id,
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      courseId: input.courseId ?? null,
    })
    revalidatePath(`/modules/${input.moduleId}/learn`)
  })

  return { jobId: job.id, job }
}

// ---------------------------------------------------------------------------
// Queue: rendered-page OCR for scanned PDFs
// ---------------------------------------------------------------------------

export async function queueSourceOcrAction(input: {
  moduleId: string
  resourceId: string
  courseId?: string | null
  resourceTitle: string
  manualRetry?: boolean
}): Promise<QueueJobResult> {
  const user = await getAuthenticatedUserServer()
  if (!user) return { jobId: '', error: 'Not authenticated.' }

  const existingJobs = await getUserQueuedJobs(user.id, { type: 'source_ocr', limit: 50 })
  const hasRunningSourceOcrJob = countRunningSourceOcrJobs(existingJobs) > 0
  const ocrConfig = getSourceOcrConfig()
  if (!canRunManualSourceOcr(ocrConfig)) {
    return {
      jobId: '',
      error: 'This PDF needs visual text extraction before Deep Learn.',
    }
  }
  const activeDuplicate = existingJobs.find((job) => {
    const payloadResourceId = typeof job.payload?.resourceId === 'string' ? job.payload.resourceId : null
    const resultResourceId = typeof job.result?.resourceId === 'string' ? job.result.resourceId : null
    return (job.status === 'pending' || job.status === 'running')
      && (payloadResourceId === input.resourceId || resultResourceId === input.resourceId)
  }) ?? null
  if (activeDuplicate) return { jobId: activeDuplicate.id, job: activeDuplicate }

  if (!input.manualRetry) {
    const recentFailure = findRecentFailedSourceOcrJob(existingJobs, input.resourceId)
    if (recentFailure) {
      return {
        jobId: '',
        error: 'Visual extraction failed recently. Try OCR again or open the original source.',
      }
    }
  }

  if (countFailedSourceOcrJobs(existingJobs, input.resourceId) > ocrConfig.maxRetriesPerResource) {
    return {
      jobId: '',
      error: 'Visual extraction has already failed for this PDF. Open the original source or change the OCR provider before retrying.',
    }
  }

  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) return { jobId: '', error: 'Database connection is unavailable.' }

  const resource = await getOwnedModuleResource(supabase, input.resourceId, user.id)
  if (!resource) return { jobId: '', error: 'You do not have access to this source.' }

  if (isOcrAlreadyCompleted(resource)) {
    return { jobId: '', error: 'Readable OCR text is already available for this PDF.' }
  }

  if (isOcrAlreadyRunning(resource)) {
    return { jobId: '', error: 'Scanned PDF preparation is already queued or running.' }
  }

  if (!isScannedPdfOcrCandidate(resource) && !input.manualRetry) {
    return { jobId: '', error: 'OCR is only available for scanned PDFs with no selectable text.' }
  }

  const job = await createSourceOcrQueueJob({
    userId: user.id,
    moduleId: input.moduleId,
    courseId: input.courseId ?? resource.courseId ?? null,
    resource,
    manualRetry: input.manualRetry,
    useServiceRole: false,
  })

  if (!job) return { jobId: '', error: 'Failed to create OCR queue job.' }

  await supabase
    .from('module_resources')
    .update(buildOcrQueuedUpdate({ resource, now: new Date().toISOString() }))
    .eq('id', resource.id)

  if (!hasRunningSourceOcrJob) {
    after(async () => {
      await processSourceOcrJob({
        jobId: job.id,
        userId: user.id,
        moduleId: input.moduleId,
        resourceId: input.resourceId,
        courseId: input.courseId ?? resource.courseId ?? null,
        resourceTitle: input.resourceTitle,
      })
      revalidateLearnQueuePaths(input.moduleId, input.courseId ?? resource.courseId ?? null, input.resourceId)
    })
  }

  return { jobId: job.id, job }
}

export async function autoEnqueueSourceOcrJobs(input: {
  userId: string
  moduleId: string
  courseId: string | null
  resources: ModuleResource[]
}): Promise<QueuedJob[]> {
  const candidates = input.resources.filter((resource) => isScannedPdfOcrCandidate(resource))
  if (candidates.length === 0) return []
  const ocrConfig = getSourceOcrConfig()

  if (!canAutoRunSourceOcr(ocrConfig) || ocrConfig.maxJobsPerSync <= 0) {
    for (const resource of candidates) {
      logAutoOcrDecision('skip_auto_disabled', {
        ...buildAutoOcrDiagnosticBase(resource),
        ocrProvider: ocrConfig.provider,
        openaiAutoRun: ocrConfig.openaiAutoRun,
        maxJobsPerSync: ocrConfig.maxJobsPerSync,
      })
    }
    return []
  }

  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) {
    console.error('[source-ocr:auto-enqueue] service role client unavailable', {
      userId: input.userId,
      moduleId: input.moduleId,
      candidateCount: candidates.length,
    })
    return []
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('user_id', input.userId)
    .eq('type', 'source_ocr')
    .order('created_at', { ascending: false })
    .limit(150)

  if (existingError) {
    console.error('[source-ocr:auto-enqueue] queued_jobs lookup failed', {
      userId: input.userId,
      moduleId: input.moduleId,
      code: getErrorField(existingError, 'code'),
      message: getErrorField(existingError, 'message'),
    })
    return []
  }

  const existingJobs = ((existingRows ?? []) as Record<string, unknown>[]).map(rowToQueuedJobForAutoOcr)
  const jobs: QueuedJob[] = []
  const dailyUserCap = getPositiveIntegerEnv('OCR_MAX_JOBS_PER_USER_PER_DAY', DEFAULT_OCR_DAILY_USER_CAP)
  const dailyCourseCap = getPositiveIntegerEnv('OCR_MAX_JOBS_PER_COURSE_PER_DAY', DEFAULT_OCR_DAILY_COURSE_CAP)

  let queuedThisSync = 0
  for (const resource of candidates) {
    if (queuedThisSync >= ocrConfig.maxJobsPerSync) {
      logAutoOcrDecision('skip_sync_job_limit', {
        ...buildAutoOcrDiagnosticBase(resource),
        maxJobsPerSync: ocrConfig.maxJobsPerSync,
      })
      continue
    }

    const diagnosticBase = buildAutoOcrDiagnosticBase(resource)
    if (findActiveSourceOcrJob(existingJobs, resource.id)) {
      logAutoOcrDecision('skip_active_duplicate', diagnosticBase)
      continue
    }

    if (countFailedSourceOcrJobs(existingJobs, resource.id) > ocrConfig.maxRetriesPerResource) {
      logAutoOcrDecision('skip_retry_limit', {
        ...diagnosticBase,
        maxRetriesPerResource: ocrConfig.maxRetriesPerResource,
      })
      continue
    }

    if (findRecentFailedSourceOcrJob(existingJobs, resource.id)) {
      logAutoOcrDecision('skip_recent_failure', diagnosticBase)
      continue
    }

    const dailyGuard = evaluateDailyCostQueueGuard(existingJobs, {
      types: ['source_ocr'],
      courseId: input.courseId ?? resource.courseId ?? null,
      dailyUserCap,
      dailyCourseCap,
    })

    if (!dailyGuard.allowed) {
      logAutoOcrDecision(dailyGuard.reason === 'daily_user_cap' ? 'skip_daily_user_limit' : 'skip_daily_course_limit', {
        ...diagnosticBase,
        dailyUserCap,
        dailyCourseCap,
      })
      continue
    }

    const job = await createSourceOcrQueueJob({
      userId: input.userId,
      moduleId: input.moduleId,
      courseId: input.courseId ?? resource.courseId ?? null,
      resource,
      useServiceRole: true,
    })

    if (!job) {
      logAutoOcrDecision('queue_create_failed', diagnosticBase)
      continue
    }

    const update = buildOcrQueuedUpdate({ resource, now: new Date().toISOString() })
    const { error: updateError } = await supabase
      .from('module_resources')
      .update(update)
      .eq('id', resource.id)

    if (updateError) {
      console.error('[source-ocr:auto-enqueue] resource queued-state update failed', {
        ...diagnosticBase,
        jobId: job.id,
        jobStatus: job.status,
        code: getErrorField(updateError, 'code'),
        message: getErrorField(updateError, 'message'),
      })
    }

    jobs.push(job)
    queuedThisSync += 1
    existingJobs.unshift(job)
    logAutoOcrDecision('queued', { ...diagnosticBase, ocrQueueJobId: job.id, ocrQueueJobStatus: job.status })
  }

  return jobs
}

export async function queueResourceExtractionJobs(input: {
  userId: string
  moduleId: string
  courseId: string | null
  resources: ModuleResource[]
}): Promise<QueuedJob[]> {
  const candidates = input.resources.filter(shouldQueueResourceExtraction)
  if (candidates.length === 0) return []

  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) {
    console.error('[resource-extraction] service role client unavailable', {
      userId: input.userId,
      moduleId: input.moduleId,
      candidateCount: candidates.length,
    })
    return []
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('user_id', input.userId)
    .eq('type', RESOURCE_EXTRACTION_JOB_TYPE)
    .order('created_at', { ascending: false })
    .limit(150)

  if (existingError) {
    console.error('[resource-extraction] queued_jobs lookup failed', {
      userId: input.userId,
      moduleId: input.moduleId,
      code: getErrorField(existingError, 'code'),
      message: getErrorField(existingError, 'message'),
    })
    return []
  }

  const existingJobs = ((existingRows ?? []) as Record<string, unknown>[]).map(rowToQueuedJobForAutoOcr)
  const jobs: QueuedJob[] = []

  for (const resource of candidates) {
    if (findActiveResourceExtractionJob(existingJobs, resource.id)) {
      continue
    }

    const job = await createResourceExtractionQueueJob({
      userId: input.userId,
      moduleId: input.moduleId,
      courseId: input.courseId ?? resource.courseId ?? null,
      resource,
      useServiceRole: true,
    })

    if (!job) continue

    const { error: updateError } = await supabase
      .from('module_resources')
      .update(buildResourceExtractionQueuedUpdate(resource, new Date().toISOString()))
      .eq('id', resource.id)

    if (updateError) {
      console.error('[resource-extraction] resource queued-state update failed', {
        resourceId: resource.id,
        jobId: job.id,
        code: getErrorField(updateError, 'code'),
        message: getErrorField(updateError, 'message'),
      })
    }

    jobs.push(job)
    existingJobs.unshift(job)
  }

  return jobs
}

// ---------------------------------------------------------------------------
// Stale-running source_ocr recovery
// ---------------------------------------------------------------------------

export async function recoverStaleSourceOcrJobs(userId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) return

  const { data, error } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'source_ocr')
    .eq('status', 'running')

  if (error || !data || data.length === 0) return

  const jobs = (data as Record<string, unknown>[]).map(rowToQueuedJobForAutoOcr)
  const staleJobs = findStaleRunningSourceOcrJobs(jobs)
  if (staleJobs.length === 0) return

  const STALE_ERROR = 'Preparing this PDF took too long. Retry extraction.'
  const now = new Date().toISOString()

  for (const job of staleJobs) {
    console.warn('[queue-recovery] stale source_ocr job recovered', {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      updatedAt: job.updatedAt,
      resourceId: getSourceOcrJobResourceId(job),
    })
    await markQueuedJobFailed(job.id, STALE_ERROR)

    const resourceId = getSourceOcrJobResourceId(job)
    if (!resourceId) continue

    const { data: resourceData } = await supabase
      .from('module_resources')
      .select('*')
      .eq('id', resourceId)
      .maybeSingle()

    if (!resourceData) continue

    const resource = adaptModuleResourceRow(resourceData as Record<string, unknown>)
    if (resource.visualExtractionStatus !== 'running' && resource.visualExtractionStatus !== 'queued') continue

    const update = buildOcrFailedUpdate({ resource, message: STALE_ERROR, now })
    await supabase
      .from('module_resources')
      .update(update)
      .eq('id', resourceId)

    if (update.visual_extraction_status === 'completed' && update.extracted_char_count >= 120) {
      await markQueuedJobCompleted(job.id, {
        resourceId,
        moduleId: getStringFromJobField(job, 'moduleId') ?? resource.moduleId,
        resourceTitle: resource.title,
        pageCount: update.page_count ?? resource.pageCount ?? null,
        pagesProcessed: update.pages_processed,
        charCount: update.extracted_char_count,
        statusMessage: 'Partially scanned. Enough readable text is available for Deep Learn.',
        href: `/modules/${resource.moduleId}/learn?resource=${encodeURIComponent(resourceId)}`,
      })
    }

    const moduleId = getStringFromJobField(job, 'moduleId') ?? resource.moduleId
    revalidateLearnQueuePaths(moduleId, resource.courseId ?? null, resourceId)
  }
}

export async function recoverStaleCanvasSyncJobs(userId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) return

  const { data, error } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'canvas_sync')
    .eq('status', 'running')

  if (error || !data || data.length === 0) return

  const jobs = (data as Record<string, unknown>[]).map(rowToQueuedJobForAutoOcr)
  const staleJobs = findStaleRunningCanvasSyncJobs(jobs)
  if (staleJobs.length === 0) return

  const staleMessage = 'Sync took too long. Some extraction may continue in the queue.'

  for (const job of staleJobs) {
    const importedCourses = await findImportedCanvasCoursesForJob(supabase, userId, job)
    const importedCourseIds = importedCourses.map((course) => course.id)
    const importedCourseNames = importedCourses.map((course) => course.name)

    console.warn('[queue-recovery] stale canvas_sync job recovered', {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      updatedAt: job.updatedAt,
      currentStep: getStringFromJobField(job, 'currentStep'),
      importedCourseCount: importedCourses.length,
      recoveryStatus: importedCourses.length > 0 ? 'completed_with_warning' : 'failed',
    })

    if (importedCourses.length > 0) {
      await markQueuedJobCompleted(job.id, {
        ...(job.result ?? {}),
        courseCount: importedCourses.length,
        courseNames: importedCourseNames,
        courseIds: importedCourseIds,
        href: importedCourseIds[0] ? `/courses/${importedCourseIds[0]}` : '/courses',
        statusMessage: staleMessage,
        currentStep: 'done',
        recoveredFromStaleSync: true,
      })
    } else {
      await markQueuedJobFailed(job.id, staleMessage)
    }

    revalidatePath('/')
    revalidatePath('/home')
    revalidatePath('/canvas')
    revalidatePath('/courses')
    revalidatePath('/learn')
    for (const courseId of importedCourseIds) {
      revalidatePath(`/courses/${courseId}`)
    }
  }
}

export async function processNextPendingSourceOcrJobForUser(userId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) return

  const { data: runningRows } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'source_ocr')
    .eq('status', 'running')
    .limit(1)
  const runningJobs = ((runningRows ?? []) as Record<string, unknown>[]).map(rowToQueuedJobForAutoOcr)
  if (!canStartNextSourceOcrJob(runningJobs)) return

  const { data, error } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'source_ocr')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (error || !data || data.length === 0) return
  const job = rowToQueuedJobForAutoOcr((data as Record<string, unknown>[])[0])
  if (!findNextPendingSourceOcrJob([job])) return
  const resourceId = getSourceOcrJobResourceId(job)
  const moduleId = getStringFromJobField(job, 'moduleId')
  if (!resourceId || !moduleId) return

  await processSourceOcrJob({
    jobId: job.id,
    userId,
    moduleId,
    resourceId,
    courseId: getStringFromJobField(job, 'courseId'),
    resourceTitle: getStringFromJobField(job, 'resourceTitle') ?? 'Study source',
  })
}

export async function processNextPendingResourceExtractionJobForUser(userId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) return

  const { data: runningRows } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('type', RESOURCE_EXTRACTION_JOB_TYPE)
    .eq('status', 'running')
    .limit(1)
  const runningJobs = ((runningRows ?? []) as Record<string, unknown>[]).map(rowToQueuedJobForAutoOcr)
  if (!canStartNextResourceExtractionJob(runningJobs)) return

  const { data, error } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('type', RESOURCE_EXTRACTION_JOB_TYPE)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (error || !data || data.length === 0) return
  const job = rowToQueuedJobForAutoOcr((data as Record<string, unknown>[])[0])
  if (!findNextPendingResourceExtractionJob([job])) return
  const resourceId = getStringFromJobField(job, 'resourceId')
  const moduleId = getStringFromJobField(job, 'moduleId')
  if (!resourceId || !moduleId) return

  await processResourceExtractionJob({
    jobId: job.id,
    userId,
    moduleId,
    resourceId,
    courseId: getStringFromJobField(job, 'courseId'),
    resourceTitle: getStringFromJobField(job, 'resourceTitle') ?? 'Study source',
  })
}

export async function processPendingResourceExtractionJobs(limit: number): Promise<ResourceExtractionWorkerStats> {
  const stats: ResourceExtractionWorkerStats = {
    jobsChecked: 0,
    jobsStarted: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    jobsSkipped: 0,
    warnings: [],
  }

  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 0), 6)
  if (boundedLimit < 1) return stats

  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) {
    stats.warnings.push('Service database client unavailable.')
    return stats
  }

  const candidateLimit = Math.min(Math.max(boundedLimit * 4, boundedLimit), 24)
  const { data, error } = await supabase
    .from('queued_jobs')
    .select('*')
    .eq('type', RESOURCE_EXTRACTION_JOB_TYPE)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(candidateLimit)

  if (error) {
    stats.warnings.push('Could not load pending resource preparation jobs.')
    return stats
  }

  const pendingJobs = ((data ?? []) as Record<string, unknown>[]).map(rowToQueuedJobForAutoOcr)
  stats.jobsChecked = pendingJobs.length
  const blockedUsers = new Set<string>()

  for (const job of pendingJobs) {
    if (stats.jobsStarted >= boundedLimit) break

    const resourceId = getStringFromJobField(job, 'resourceId')
    const moduleId = getStringFromJobField(job, 'moduleId')
    if (!resourceId || !moduleId) {
      stats.jobsSkipped += 1
      stats.warnings.push(`Skipped malformed resource_extraction job ${job.id}.`)
      continue
    }

    if (blockedUsers.has(job.userId)) {
      stats.jobsSkipped += 1
      continue
    }

    const { data: runningRows, error: runningError } = await supabase
      .from('queued_jobs')
      .select('id')
      .eq('user_id', job.userId)
      .eq('type', RESOURCE_EXTRACTION_JOB_TYPE)
      .eq('status', 'running')
      .limit(1)

    if (runningError) {
      stats.jobsSkipped += 1
      stats.warnings.push(`Could not inspect active resource preparation jobs for user ${job.userId}.`)
      continue
    }

    if ((runningRows?.length ?? 0) > 0) {
      blockedUsers.add(job.userId)
      stats.jobsSkipped += 1
      continue
    }

    blockedUsers.add(job.userId)
    const outcome = await processResourceExtractionJob({
      jobId: job.id,
      userId: job.userId,
      moduleId,
      resourceId,
      courseId: getStringFromJobField(job, 'courseId'),
      resourceTitle: getStringFromJobField(job, 'resourceTitle') ?? 'Study source',
    }, {
      continueQueue: false,
      autoStartSourceOcr: false,
    })

    if (!outcome.started) {
      stats.jobsSkipped += 1
      continue
    }

    stats.jobsStarted += 1
    if (outcome.status === 'completed') stats.jobsCompleted += 1
    else if (outcome.status === 'failed') stats.jobsFailed += 1
    else stats.jobsSkipped += 1
  }

  return stats
}

export async function applyQueueCancellationEffects(userId: string, jobId: string): Promise<void> {
  const job = await getQueuedJobById(jobId)
  if (!job || job.userId !== userId) return

  if (job.type === RESOURCE_EXTRACTION_JOB_TYPE) {
    const resourceId = getStringFromJobField(job, 'resourceId')
    if (!resourceId) return
    const supabase = createSupabaseServiceRoleClient()
    if (!supabase) return

    const { data } = await supabase
      .from('module_resources')
      .select('*')
      .eq('id', resourceId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!data) return
    const resource = adaptModuleResourceRow(data as Record<string, unknown>)
    if (resource.extractionStatus === 'processing') {
      await supabase
        .from('module_resources')
        .update({
          extraction_status: 'pending',
          extraction_error: 'Source preparation was canceled.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', resourceId)
        .eq('user_id', userId)
    }

    const moduleId = getStringFromJobField(job, 'moduleId') ?? resource.moduleId
    revalidateLearnQueuePaths(moduleId, resource.courseId ?? null, resourceId)
    return
  }

  if (job.type === 'source_ocr') {
    const resourceId = getSourceOcrJobResourceId(job)
    if (!resourceId) return
    const supabase = createSupabaseServiceRoleClient()
    if (!supabase) return

    const { data } = await supabase
      .from('module_resources')
      .select('*')
      .eq('id', resourceId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!data) return
    const resource = adaptModuleResourceRow(data as Record<string, unknown>)
    await supabase
      .from('module_resources')
      .update(buildOcrCanceledUpdate({ resource, now: new Date().toISOString() }))
      .eq('id', resourceId)
      .eq('user_id', userId)

    const moduleId = getStringFromJobField(job, 'moduleId') ?? resource.moduleId
    revalidateLearnQueuePaths(moduleId, resource.courseId ?? null, resourceId)
  }
}

function totalTransferredCount(previousPages: PdfOcrPage[], newPagesProcessed: number) {
  const prevCompleted = previousPages.filter((p) => p.status === 'completed').length
  return prevCompleted + newPagesProcessed
}

function getStringFromJobField(job: QueuedJob, key: string) {
  const fromResult = job.result?.[key]
  const fromPayload = job.payload?.[key]
  const value = fromResult ?? fromPayload
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNumberArrayFromJobPayload(job: QueuedJob, key: string) {
  const value = job.payload?.[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
}

function getStringFromJobPayload(job: QueuedJob, key: string) {
  const value = job.payload?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function findImportedCanvasCoursesForJob(
  supabase: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>,
  userId: string,
  job: QueuedJob,
) {
  const canvasCourseIds = getNumberArrayFromJobPayload(job, 'courseIds')
  if (canvasCourseIds.length === 0) return []

  let query = supabase
    .from('courses')
    .select('id,name')
    .eq('user_id', userId)
    .in('canvas_course_id', canvasCourseIds)

  const canvasUrl = getStringFromJobPayload(job, 'canvasUrl')
  if (canvasUrl) query = query.eq('canvas_instance_url', canvasUrl)

  const { data, error } = await query
  if (error || !data) {
    console.error('[queue-recovery] imported Canvas course lookup failed', {
      jobId: job.id,
      userId,
      courseIds: canvasCourseIds,
      error: error ? getErrorField(error, 'message') : null,
    })
    return []
  }

  return (data as Array<{ id: string; name: string }>).filter((course) => course.id && course.name)
}

function applyOcrUpdateToResource(resource: ModuleResource, update: Partial<{
  extraction_status: ModuleResource['extractionStatus']
  extracted_text: string | null
  extracted_text_preview: string | null
  extracted_char_count: number
  extraction_error: string | null
  visual_extraction_status: ModuleResource['visualExtractionStatus']
  visual_extracted_text: string | null
  visual_extraction_error: string | null
  page_count: number | null
  pages_processed: number
  extraction_provider: string | null
  metadata: Record<string, unknown>
}>): ModuleResource {
  return {
    ...resource,
    extractionStatus: update.extraction_status ?? resource.extractionStatus,
    extractedText: update.extracted_text !== undefined ? update.extracted_text : resource.extractedText,
    extractedTextPreview: update.extracted_text_preview !== undefined ? update.extracted_text_preview : resource.extractedTextPreview,
    extractedCharCount: update.extracted_char_count ?? resource.extractedCharCount,
    extractionError: update.extraction_error !== undefined ? update.extraction_error : resource.extractionError,
    visualExtractionStatus: update.visual_extraction_status ?? resource.visualExtractionStatus,
    visualExtractedText: update.visual_extracted_text !== undefined ? update.visual_extracted_text : resource.visualExtractedText,
    visualExtractionError: update.visual_extraction_error !== undefined ? update.visual_extraction_error : resource.visualExtractionError,
    pageCount: update.page_count !== undefined ? update.page_count : resource.pageCount,
    pagesProcessed: update.pages_processed ?? resource.pagesProcessed,
    extractionProvider: update.extraction_provider !== undefined ? update.extraction_provider : resource.extractionProvider,
    metadata: update.metadata ?? resource.metadata,
  }
}

// ---------------------------------------------------------------------------
// Queue: task draft generation
// ---------------------------------------------------------------------------

export async function queueDoGenerationAction(input: {
  taskId: string
  moduleId: string
  context: TaskDraftContext
  preset: 'report' | 'presentation' | 'reviewer' | 'webpage' | 'documentation'
  outputType: 'docx' | 'pdf' | 'ppt' | 'html' | 'css' | 'js'
}): Promise<QueueJobResult> {
  const user = await getAuthenticatedUserServer()
  if (!user) return { jobId: '', error: 'Not authenticated.' }

  const taskTitle = input.context.taskTitle
  const activeDuplicate =
    await findActiveJob(user.id, 'task_output', 'taskId', input.taskId)
    ?? await findActiveJob(user.id, 'do_generation', 'taskId', input.taskId)
  if (activeDuplicate) return { jobId: activeDuplicate.id, job: activeDuplicate }

  const costGuardJobs = await getUserQueuedJobs(user.id, { type: ['task_output', 'do_generation'], limit: 100 })
  const costGuard = evaluateDailyCostQueueGuard(costGuardJobs, {
    types: ['task_output', 'do_generation'],
    courseId: input.context.courseId ?? null,
    dailyUserCap: getPositiveIntegerEnv('OPENAI_MAX_JOBS_PER_USER_PER_DAY', DEFAULT_OPENAI_DAILY_USER_CAP),
    dailyCourseCap: getPositiveIntegerEnv('OPENAI_MAX_JOBS_PER_COURSE_PER_DAY', DEFAULT_OPENAI_DAILY_COURSE_CAP),
  })
  if (!costGuard.allowed) {
    return {
      jobId: '',
      error: costGuard.reason === 'daily_course_cap'
        ? 'This course has reached today\'s task generation limit. Try again tomorrow.'
        : 'Today\'s task generation limit has been reached. Try again tomorrow.',
    }
  }

  const job = await createQueuedJob(
    user.id,
    'task_output',
    `Generating task output: ${taskTitle}`,
    {
      taskId: input.taskId,
      moduleId: input.moduleId,
      preset: input.preset,
      outputType: input.outputType,
      context: input.context as unknown as Record<string, unknown>,
    },
  )

  if (!job) return { jobId: '', error: 'Failed to create queue job.' }

  after(async () => {
    await processDoGenerationJob({
      jobId: job.id,
      userId: user.id,
      moduleId: input.moduleId,
      taskId: input.taskId,
      context: input.context,
      preset: input.preset,
      outputType: input.outputType,
    })
    revalidatePath(`/modules/${input.moduleId}/tasks`)
    revalidatePath(`/modules/${input.moduleId}/do`)
  })

  return { jobId: job.id, job }
}

// ---------------------------------------------------------------------------
// Internal: run deep-learn AI and persist result
// ---------------------------------------------------------------------------

async function processLearnGenerationJob(input: {
  jobId: string
  userId: string
  moduleId: string
  resourceId: string
  courseId: string | null
}) {
  await markQueuedJobRunning(input.jobId, 10)

  async function canceled() {
    if (!await isQueuedJobCancelled(input.jobId)) return false
    await markQueuedJobCancelled(input.jobId)
    revalidateLearnQueuePaths(input.moduleId, input.courseId ?? null, input.resourceId)
    return true
  }

  async function fail(message: string, href?: string | null) {
    await markQueuedJobFailed(input.jobId, message)
    await createNotification({
      userId: input.userId,
      type: 'queue_failed',
      title: 'Study pack failed',
      body: message,
      href: href ?? (input.courseId ? `/modules/${input.moduleId}/learn` : undefined),
      severity: 'error',
      metadata: { jobId: input.jobId, jobType: 'learn_generation', resourceId: input.resourceId, dedupeKey: `learn-fail:${input.jobId}` },
    })
  }

  try {
    if (await canceled()) return
    const workspace = await getModuleWorkspace(input.moduleId)
    if (!workspace) {
      await fail('Module not found.')
      return
    }

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 20 })
    if (await canceled()) return

    const courseName = extractCourseName(workspace.module.raw_content)
    const experience = buildLearnExperience(workspace.module, {
      taskCount: workspace.tasks.length,
      deadlineCount: workspace.deadlines.length,
      resources: workspace.resources,
      resourceStudyStates: workspace.resourceStudyStates,
    })
    const selection = resolveLearnResourceSelection(experience, workspace.resources, input.resourceId)

    if (!selection) {
      await fail('Resource not found in module.')
      return
    }

    const { resource, storedResource, canonicalResourceId } = selection
    const readiness = classifyDeepLearnResourceReadiness({ resource, storedResource, canonicalResourceId })

    if (!storedResource || !canonicalResourceId || !readiness.canGenerate) {
      await fail(readiness.detail ?? 'Resource not ready for Deep Learn.', `/modules/${workspace.module.id}/learn?resource=${encodeURIComponent(input.resourceId)}`)
      return
    }

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 30 })
    if (await canceled()) return

    await saveDeepLearnNote({
      moduleId: workspace.module.id,
      courseId: workspace.module.courseId ?? input.courseId ?? null,
      resourceId: canonicalResourceId,
      status: 'pending',
      title: resource.title,
      overview: 'Deep Learn is preparing the study pack.',
      sections: [],
      noteBody: '',
      answerBank: [],
      identificationItems: [],
      distinctions: [],
      likelyQuizTargets: [],
      cautionNotes: [],
      sourceGrounding: {
        sourceType: null,
        extractionQuality: null,
        groundingStrategy: 'insufficient',
        usedAiFallback: false,
        qualityReason: null,
        warning: null,
        charCount: 0,
      },
      quizReady: false,
      promptVersion: DEEP_LEARN_PROMPT_VERSION,
      errorMessage: null,
    })

    await updateQueuedJobStatus(input.jobId, 'running', {
      progress: 25,
      result: {
        resourceId: canonicalResourceId,
        moduleId: workspace.module.id,
        resourceTitle: resource.title,
        statusMessage: 'Compacting readable source text for staged Deep Learn generation.',
      },
    })
    if (await canceled()) return

    const linkedTask = workspace.tasks.find((t) =>
      t.title.trim().toLowerCase() === resource.title.trim().toLowerCase()
    ) ?? null

    let generated
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let latestProgress = 25
    let latestStatusMessage = 'Compacting readable source text for staged Deep Learn generation.'
    try {
      heartbeat = setInterval(() => {
        void updateQueuedJobStatus(input.jobId, 'running', {
          progress: latestProgress,
          result: {
            resourceId: canonicalResourceId,
            moduleId: workspace.module.id,
            resourceTitle: resource.title,
            statusMessage: latestStatusMessage,
          },
        })
      }, 25000)
      generated = await generateDeepLearnNoteForResource({
        resource,
        storedResource,
        courseName,
        module: workspace.module,
        linkedTask,
      }, {
        onProgress: async (update) => {
          latestProgress = update.progress
          latestStatusMessage = update.statusMessage
          await updateQueuedJobStatus(input.jobId, 'running', {
            progress: update.progress,
            result: {
              resourceId: canonicalResourceId,
              moduleId: workspace.module.id,
              resourceTitle: resource.title,
              statusMessage: update.statusMessage,
              compactFallbackUsed: update.compactFallbackUsed ?? false,
            },
          })
        },
      })
      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = null
      }
      if (await canceled()) return
    } catch (err) {
      if (heartbeat) clearInterval(heartbeat)
      if (err instanceof DeepLearnGenerationBlockedError) {
        await fail(err.message, `/modules/${workspace.module.id}/learn?resource=${encodeURIComponent(canonicalResourceId)}`)
        await saveDeepLearnNote({
          moduleId: workspace.module.id,
          courseId: workspace.module.courseId ?? input.courseId ?? null,
          resourceId: canonicalResourceId,
          status: 'failed',
          title: resource.title,
          overview: '',
          sections: [],
          noteBody: '',
          answerBank: [],
          identificationItems: [],
          distinctions: [],
          likelyQuizTargets: [],
          cautionNotes: [],
          sourceGrounding: {
            sourceType: null,
            extractionQuality: null,
            groundingStrategy: 'insufficient',
            usedAiFallback: false,
            qualityReason: null,
            warning: null,
            charCount: 0,
          },
          quizReady: false,
          promptVersion: DEEP_LEARN_PROMPT_VERSION,
          errorMessage: err.message,
        })
        return
      }
      throw err
    }

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 85 })
    if (await canceled()) return

    const noteBody = buildDeepLearnNoteBody(generated.content.sections)
    const quizReady = computeDeepLearnQuizReady(generated.content)

    await saveDeepLearnNote({
      moduleId: workspace.module.id,
      courseId: workspace.module.courseId ?? input.courseId ?? null,
      resourceId: canonicalResourceId,
      status: 'ready',
      title: resource.title,
      overview: generated.content.overview,
      sections: generated.content.sections,
      noteBody,
      answerBank: generated.content.answerBank,
      identificationItems: generated.content.identificationItems,
      distinctions: generated.content.distinctions,
      likelyQuizTargets: generated.content.likelyQuizTargets,
      cautionNotes: generated.content.cautionNotes,
      sourceGrounding: generated.sourceGrounding,
      quizReady,
      promptVersion: DEEP_LEARN_PROMPT_VERSION,
      errorMessage: null,
    })

    const resultHref = buildDeepLearnNoteHref(workspace.module.id, canonicalResourceId)

    await markQueuedJobCompleted(input.jobId, {
      resourceId: canonicalResourceId,
      moduleId: workspace.module.id,
      resourceTitle: resource.title,
      href: resultHref,
      statusMessage: generated.compactFallbackUsed
        ? 'Compact study pack ready.'
        : 'Study pack ready.',
      compactFallbackUsed: generated.compactFallbackUsed,
    })
    revalidateLearnQueuePaths(workspace.module.id, workspace.module.courseId ?? input.courseId ?? null, canonicalResourceId)

    await createNotification({
      userId: input.userId,
      type: 'queue_completed',
      title: 'Study pack ready',
      body: generated.compactFallbackUsed
        ? `Your study pack for "${resource.title}" is ready. Stay Focused generated a compact version because the source was long.`
        : `Your study pack for "${resource.title}" is ready.`,
      href: resultHref,
      severity: 'success',
      metadata: { jobId: input.jobId, dedupeKey: `learn:${canonicalResourceId}` },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during Deep Learn generation.'
    console.error('[queue-jobs] processLearnGenerationJob failed', {
      jobId: input.jobId,
      message,
      incompleteReason: err instanceof DeepLearnGenerationIncompleteError ? err.reason : null,
    })
    await markQueuedJobFailed(input.jobId, message)
    revalidateLearnQueuePaths(input.moduleId, input.courseId ?? null, input.resourceId)

    await createNotification({
      userId: input.userId,
      type: 'queue_failed',
      title: 'Study pack failed',
      body: message,
      severity: 'error',
      metadata: { jobId: input.jobId, dedupeKey: `learn-fail:${input.jobId}` },
    })
  }
}

function revalidateLearnQueuePaths(moduleId: string, courseId: string | null, resourceId?: string | null) {
  revalidatePath('/')
  revalidatePath('/home')
  revalidatePath('/learn')
  revalidatePath('/courses')
  revalidatePath('/library')
  if (courseId) revalidatePath(`/courses/${courseId}`)
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath(`/modules/${moduleId}/learn`)
  revalidatePath(`/modules/${moduleId}/review`)
  revalidatePath(`/modules/${moduleId}/quiz`)
  if (resourceId) {
    revalidatePath(`/modules/${moduleId}/learn/resources/${encodeURIComponent(resourceId)}`)
    revalidatePath(`/modules/${moduleId}/learn/notes/${encodeURIComponent(resourceId)}`)
  }
}

export async function processSourceOcrJob(input: {
  jobId: string
  userId: string
  moduleId: string
  resourceId: string
  courseId: string | null
  resourceTitle: string
}, options: QueueContinuationOptions = {}) {
  await markQueuedJobRunning(input.jobId, 8)
  const supabase = createSupabaseServiceRoleClient() ?? await createAuthenticatedSupabaseServerClient()
  if (!supabase) {
    await markQueuedJobFailed(input.jobId, 'Database connection is unavailable.')
    return
  }

  const cancel = async (resource: ModuleResource | null) => {
    if (!await isQueuedJobCancelled(input.jobId)) return false
    await markQueuedJobCancelled(input.jobId)
    if (resource) {
      await supabase
        .from('module_resources')
        .update(buildOcrCanceledUpdate({ resource, now: new Date().toISOString() }))
        .eq('id', resource.id)
    }
    revalidateLearnQueuePaths(input.moduleId, input.courseId, input.resourceId)
    return true
  }

  const fail = async (resource: ModuleResource | null, message: string, metadata?: Record<string, unknown>, provider?: string | null) => {
    if (resource) {
      const update = buildOcrFailedUpdate({ resource, message, ocrMetadata: metadata ?? {}, provider: provider ?? null, now: new Date().toISOString() })
      await supabase
        .from('module_resources')
        .update(update)
        .eq('id', resource.id)

      if (update.visual_extraction_status === 'completed' && update.extracted_char_count >= 120) {
        await markQueuedJobCompleted(input.jobId, {
          resourceId: resource.id,
          moduleId: input.moduleId,
          resourceTitle: resource.title,
          pageCount: update.page_count ?? resource.pageCount ?? null,
          pagesProcessed: update.pages_processed,
          charCount: update.extracted_char_count,
          statusMessage: 'Partially scanned. Enough readable text is available for Deep Learn.',
          href: `/modules/${input.moduleId}/learn?resource=${encodeURIComponent(resource.id)}`,
        })
        revalidateLearnQueuePaths(input.moduleId, input.courseId, input.resourceId)
        return
      }
    }
    await markQueuedJobFailed(input.jobId, message)
    revalidateLearnQueuePaths(input.moduleId, input.courseId, input.resourceId)
    await createNotification({
      userId: input.userId,
      type: 'queue_failed',
      title: 'Scanned PDF preparation failed',
      body: message,
      href: `/modules/${input.moduleId}/learn?resource=${encodeURIComponent(input.resourceId)}`,
      severity: 'error',
      metadata: { jobId: input.jobId, jobType: 'source_ocr', resourceId: input.resourceId, dedupeKey: `source-ocr-fail:${input.jobId}` },
    })
  }

  let resource: ModuleResource | null = null
  try {
    if (await cancel(null)) return
    resource = await getOwnedModuleResource(supabase, input.resourceId, input.userId)
    if (!resource) {
      await fail(null, 'You do not have access to this source.')
      return
    }

    if (isOcrAlreadyCompleted(resource)) {
      await markQueuedJobCompleted(input.jobId, {
        resourceId: resource.id,
        moduleId: input.moduleId,
        resourceTitle: resource.title,
        pageCount: resource.pageCount ?? null,
        pagesProcessed: resource.pagesProcessed ?? resource.pageCount ?? null,
        statusMessage: 'Readable text is already available.',
        href: `/modules/${input.moduleId}/learn?resource=${encodeURIComponent(resource.id)}`,
      })
      return
    }

    if (await cancel(resource)) return

    await supabase
      .from('module_resources')
      .update(buildOcrProcessingUpdate({ resource, now: new Date().toISOString() }))
      .eq('id', resource.id)

    await updateQueuedJobStatus(input.jobId, 'running', {
      progress: 8,
      result: {
        resourceId: resource.id,
        moduleId: input.moduleId,
        resourceTitle: resource.title,
        pageCount: resource.pageCount ?? null,
        pagesProcessed: 0,
        statusMessage: buildSourceOcrStatusMessage({ pageCount: resource.pageCount ?? null }),
      },
    })
    revalidateLearnQueuePaths(input.moduleId, input.courseId, resource.id)
    if (await cancel(resource)) return

    const sourceUrl = resource.sourceUrl ?? resource.htmlUrl
    if (!sourceUrl) {
      await fail(resource, 'No downloadable PDF source is stored for this item. Open the original file.')
      return
    }

    const resume = buildOcrResumeState(resource)
    const isResuming = resume.pagesToProcess.length > 0
    const prevCompletedCount = resume.previousCompletedCount
    let persistedPages = resume.previousPages

    const ocrConfig = getSourceOcrConfig()
    if (!canRunManualSourceOcr(ocrConfig)) {
      await fail(resource, 'This PDF needs visual text extraction before Deep Learn.', {
        pdfOcr: {
          status: 'skipped',
          provider: ocrConfig.provider,
          error: 'OCR provider is disabled.',
          completedAt: new Date().toISOString(),
        },
      }, ocrConfig.provider)
      return
    }

    const providerAdapter = getSourceOcrProvider(ocrConfig.provider)
    const runningProviderLabel = `${ocrConfig.provider}:running`
    if (await cancel(resource)) return
    const canvasConfig = await resolveStoredCanvasConfigForUserResource(input.userId, resource)
    const buffer = await downloadStoredPdfForOcr(sourceUrl, canvasConfig)
    if (await cancel(resource)) return
    const ocr = await providerAdapter.run({
      buffer,
      filename: resource.title || 'scanned-pdf.pdf',
      pageCount: resource.pageCount ?? null,
      maxPages: getOcrMaxPagesForProvider(ocrConfig),
      ...(isResuming ? { pagesToProcess: resume.pagesToProcess } : {}),
      shouldContinue: async () => !await isQueuedJobCancelled(input.jobId),
      onPageStart: async ({ pageNumber, pagesProcessed, totalPages }) => {
        if (await cancel(resource)) throw new Error('OCR canceled.')
        const pageCount = resource?.pageCount ?? totalPages
        const totalProcessed = totalTransferredCount(resume.previousPages, pagesProcessed)
        await supabase
          .from('module_resources')
          .update(buildOcrPageProgressUpdate({
            resource: resource as ModuleResource,
            pages: persistedPages,
            provider: runningProviderLabel,
            totalPagesInDocument: pageCount,
            now: new Date().toISOString(),
          }))
          .eq('id', input.resourceId)
        await updateQueuedJobStatus(input.jobId, 'running', {
          progress: Math.max(calculateSourceOcrProgress(totalProcessed, pageCount), calculateSourceOcrProgress(totalProcessed + 0.25, pageCount)),
          result: {
            resourceId: input.resourceId,
            moduleId: input.moduleId,
            resourceTitle: input.resourceTitle,
            pageCount,
            currentPage: pageNumber,
            pagesProcessed: totalProcessed,
            statusMessage: buildSourceOcrStatusMessage({ currentPage: pageNumber, pagesProcessed: totalProcessed, pageCount }),
          },
        })
      },
      onPageResult: async ({ page, pagesProcessed, totalPages }) => {
        if (await cancel(resource)) throw new Error('OCR canceled.')
        const pageCount = resource?.pageCount ?? totalPages
        const totalProcessed = prevCompletedCount + pagesProcessed
        persistedPages = mergeOcrPageArrays(persistedPages, [page])
        const progressUpdate = buildOcrPageProgressUpdate({
          resource: resource as ModuleResource,
          pages: persistedPages,
          provider: page.provider,
          totalPagesInDocument: pageCount,
          now: new Date().toISOString(),
        })
        await supabase
          .from('module_resources')
          .update(progressUpdate)
          .eq('id', input.resourceId)
        resource = applyOcrUpdateToResource(resource as ModuleResource, progressUpdate)
        await updateQueuedJobStatus(input.jobId, 'running', {
          progress: calculateSourceOcrProgress(totalProcessed, pageCount),
          result: {
            resourceId: input.resourceId,
            moduleId: input.moduleId,
            resourceTitle: input.resourceTitle,
            pageCount,
            pagesProcessed: totalTransferredCount(resume.previousPages, pagesProcessed),
            statusMessage: buildSourceOcrStatusMessage({ pagesProcessed: totalTransferredCount(resume.previousPages, pagesProcessed), pageCount }),
          },
        })
      },
    })

    if (await cancel(resource)) return

    const mergedPages = isResuming
      ? mergeOcrPageArrays(resume.previousPages, ocr.pages)
      : ocr.pages
    const mergedText = isResuming ? buildMergedOcrText(mergedPages) : (ocr.status === 'completed' ? ocr.text : '')
    const finalOcr: PdfOcrResult = isResuming
      ? buildMergedOcrResult(ocr, mergedPages, mergedText)
      : ocr

    if (finalOcr.status === 'failed' && /OCR canceled/i.test(finalOcr.error ?? '')) {
      await cancel(resource)
      return
    }

    if (finalOcr.status !== 'completed') {
      await fail(resource, finalOcr.error ?? 'OCR failed. Open the original file.', finalOcr.metadata, finalOcr.provider)
      return
    }

    const update = buildOcrCompletedUpdate({ resource, ocr: finalOcr, now: new Date().toISOString() })
    const { error: updateError } = await supabase
      .from('module_resources')
      .update(update)
      .eq('id', resource.id)

    if (updateError) throw new Error(updateError.message)

    if (update.visual_extraction_status !== 'completed' || update.extracted_char_count < 120) {
      const message = update.visual_extraction_error ?? 'Visual extraction finished, but did not find enough usable study text. Try OCR again or open the original source.'
      await markQueuedJobFailed(input.jobId, message)
      revalidateLearnQueuePaths(input.moduleId, input.courseId, resource.id)
      return
    }

    await markQueuedJobCompleted(input.jobId, {
      resourceId: resource.id,
      moduleId: input.moduleId,
      resourceTitle: resource.title,
      pageCount: resource.pageCount ?? null,
      pagesProcessed: update.pages_processed,
      charCount: update.extracted_char_count,
      statusMessage: 'Scanned PDF prepared with readable text.',
      href: `/modules/${input.moduleId}/learn?resource=${encodeURIComponent(resource.id)}`,
    })
    revalidateLearnQueuePaths(input.moduleId, input.courseId, resource.id)
    await createNotification({
      userId: input.userId,
      type: 'queue_completed',
      title: 'Scanned PDF prepared',
      body: `Readable text is ready for "${resource.title}".`,
      href: `/modules/${input.moduleId}/learn?resource=${encodeURIComponent(resource.id)}`,
      severity: 'success',
      metadata: { jobId: input.jobId, jobType: 'source_ocr', resourceId: resource.id, dedupeKey: `source-ocr:${resource.id}` },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OCR failed. Open the original file.'
    console.error('[queue-jobs] processSourceOcrJob failed', { jobId: input.jobId, message })
    await fail(resource, message)
  } finally {
    if (options.continueQueue !== false) {
      await processNextPendingSourceOcrJobForUser(input.userId)
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: run task draft AI and persist result
// ---------------------------------------------------------------------------

async function processDoGenerationJob(input: {
  jobId: string
  userId: string
  moduleId: string
  taskId: string
  context: TaskDraftContext
  preset: 'report' | 'presentation' | 'reviewer' | 'webpage' | 'documentation'
  outputType: 'docx' | 'pdf' | 'ppt' | 'html' | 'css' | 'js'
}) {
  await markQueuedJobRunning(input.jobId, 10)

  async function canceled() {
    if (!await isQueuedJobCancelled(input.jobId)) return false
    await markQueuedJobCancelled(input.jobId)
    return true
  }

  try {
    if (await canceled()) return
    const groundedContext = await resolveGroundedTaskOutputContext(input.moduleId, input.taskId, input.context)
    const apiPayload = buildTaskOutputRequest(groundedContext, {
      preset: input.preset,
      outputType: input.outputType,
    })

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 20 })
    if (await canceled()) return

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3000'

    const resp = await fetch(`${baseUrl}/api/task-output`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    })

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 80 })
    if (await canceled()) return

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as { error?: string }
      const message = body.error ?? `Task output returned ${resp.status}.`
      await markQueuedJobFailed(input.jobId, message)
      await notifyTaskOutputFailed(input.userId, input.jobId, input.taskId, input.moduleId, groundedContext.taskTitle, message)
      return
    }

    const data = await resp.json() as { ok: boolean; output?: unknown; error?: string }
    if (await canceled()) return

    if (!data.ok || !isTaskOutputApiResponse(data)) {
      const message = data.error ?? 'Task output returned an empty preview.'
      await markQueuedJobFailed(input.jobId, message)
      await notifyTaskOutputFailed(input.userId, input.jobId, input.taskId, input.moduleId, groundedContext.taskTitle, message)
      return
    }

    const saved = await saveTaskOutputStudyOutputAction({
      taskId: input.taskId,
      moduleId: input.moduleId,
      courseId: groundedContext.courseId ?? null,
      taskTitle: groundedContext.taskTitle,
      preset: input.preset,
      outputType: input.outputType,
      content: data.output,
    })
    const resultHref = saved.href

    await markQueuedJobCompleted(input.jobId, {
      taskId: input.taskId,
      moduleId: input.moduleId,
      taskTitle: groundedContext.taskTitle,
      href: resultHref,
      outputId: saved.id,
      output: data.output,
      preset: input.preset,
      outputType: input.outputType,
    })

    await createNotification({
      userId: input.userId,
      type: 'queue_completed',
      title: 'Task output ready',
      body: `Your task output for "${groundedContext.taskTitle}" is ready.`,
      href: resultHref,
      severity: 'success',
      metadata: { jobId: input.jobId, jobType: 'task_output', taskId: input.taskId, dedupeKey: `task:${input.taskId}` },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during task output generation.'
    const diagnostic = err instanceof StudyOutputSaveError
      ? {
          diagnosticCode: err.diagnosticCode,
          diagnosticMessage: err.diagnosticMessage,
        }
      : null
    console.error('[queue-jobs] processDoGenerationJob failed', {
      jobId: input.jobId,
      message,
      diagnostic,
    })
    await updateQueuedJobStatus(input.jobId, 'failed', {
      error: message,
      completedAt: new Date().toISOString(),
      result: {
        taskId: input.taskId,
        moduleId: input.moduleId,
        taskTitle: input.context.taskTitle,
        failureCode: diagnostic?.diagnosticCode ?? 'unknown',
        internalDiagnostic: diagnostic?.diagnosticMessage ?? message,
      },
    })

    await createNotification({
      userId: input.userId,
      type: 'queue_failed',
      title: 'Task output failed',
      body: message,
      href: `/modules/${input.moduleId}/tasks?task=${encodeURIComponent(input.taskId)}`,
      severity: 'error',
      metadata: { jobId: input.jobId, jobType: 'task_output', taskId: input.taskId, dedupeKey: `task-fail:${input.jobId}` },
    })
  }
}

async function resolveGroundedTaskOutputContext(
  moduleId: string,
  taskId: string,
  context: TaskDraftContext,
): Promise<TaskDraftContext> {
  const workspace = await getModuleWorkspace(moduleId).catch(() => null)
  if (!workspace) return context

  const task = workspace.tasks.find((candidate) => candidate.id === taskId) ?? null
  const taskTitle = task?.title ?? context.taskTitle
  const taskDetails = task?.details?.trim() || context.taskDetails
  const relatedResources = selectTaskOutputRelatedResources(taskTitle, workspace.resources)
  const relatedContext = relatedResources
    .map(formatTaskOutputResourceContext)
    .filter((value): value is string => Boolean(value))

  if (relatedContext.length === 0 && !taskDetails) return context

  const resourceSnippet = buildTaskDraftContextText([
    context.resourceSnippet,
    ...relatedContext,
  ].filter(Boolean).join('\n\n'), 6000)
  const sourceText = buildTaskDraftContextText([
    taskDetails ? `Assignment prompt:\n${taskDetails}` : null,
    ...relatedContext,
  ].filter(Boolean).join('\n\n'), 9000)
  const primaryResource = relatedResources[0] ?? null

  return {
    ...context,
    taskTitle,
    taskDetails,
    deadline: task?.deadline ?? context.deadline,
    priority: task?.priority ?? context.priority,
    courseId: context.courseId ?? workspace.module.courseId ?? null,
    moduleTitle: context.moduleTitle ?? workspace.module.title,
    resourceSnippet: resourceSnippet ?? context.resourceSnippet,
    sourceText: sourceText ?? context.sourceText,
    sourceTitle: primaryResource?.title ?? context.sourceTitle,
    sourceType: primaryResource?.resourceType ?? context.sourceType,
    sourceHref: primaryResource ? getResourceOriginalFileHrefForTaskContext(primaryResource) ?? context.sourceHref : context.sourceHref,
    sourceNote: relatedContext.length > 0
      ? 'Related module source text was resolved from the same Canvas module for grounded task output.'
      : context.sourceNote,
  }
}

function selectTaskOutputRelatedResources(taskTitle: string, resources: ModuleResource[]) {
  const taskKey = normalizeTaskOutputLookup(taskTitle)
  const taskTokens = new Set(taskKey.split(' ').filter((token) => token.length >= 2))
  const scored = resources
    .map((resource, index) => {
      const quality = getModuleResourceQualityInfo(resource)
      const text = quality.meaningfulText || quality.normalizedText || resource.extractedText?.trim() || resource.extractedTextPreview?.trim() || ''
      if (!text.trim()) return null
      const titleKey = normalizeTaskOutputLookup(resource.title)
      const titleTokens = titleKey.split(' ').filter((token) => token.length >= 2)
      const overlap = titleTokens.filter((token) => taskTokens.has(token)).length
      const exactish = titleKey && (taskKey.includes(titleKey) || titleKey.includes(taskKey)) ? 8 : 0
      const moduleMarker = titleTokens.some((token) => /^m\d+$/.test(token) && taskTokens.has(token)) ? 5 : 0
      const acquireKnowledgeBoost = /\bacquire\b|\bknowledge\b|\bnew knowledge\b/i.test(resource.title) ? 2 : 0
      const pageBoost = /page/i.test(resource.resourceType) ? 2 : 0
      const score = exactish + moduleMarker + overlap + acquireKnowledgeBoost + pageBoost + Math.max(0, 3 - index / 10)
      return { resource, textLength: text.length, score }
    })
    .filter((entry): entry is { resource: ModuleResource; textLength: number; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score || right.textLength - left.textLength)

  return scored.slice(0, 4).map((entry) => entry.resource)
}

function formatTaskOutputResourceContext(resource: ModuleResource) {
  const quality = getModuleResourceQualityInfo(resource)
  const text = buildTaskDraftContextText(
    quality.meaningfulText || quality.normalizedText || resource.extractedText || resource.extractedTextPreview,
    2200,
  )
  if (!text) return null
  return `Related Canvas source: ${resource.title}\n${text}`
}

function getResourceOriginalFileHrefForTaskContext(resource: ModuleResource) {
  return resource.sourceUrl ?? resource.htmlUrl ?? null
}

function normalizeTaskOutputLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function notifyTaskOutputFailed(
  userId: string,
  jobId: string,
  taskId: string,
  moduleId: string,
  taskTitle: string,
  message: string,
) {
  await createNotification({
    userId,
    type: 'queue_failed',
    title: 'Task output failed',
    body: `${taskTitle}: ${message}`,
    href: `/modules/${moduleId}/tasks?task=${encodeURIComponent(taskId)}`,
    severity: 'error',
    metadata: { jobId, jobType: 'task_output', taskId, dedupeKey: `task-fail:${jobId}` },
  })
}

async function findActiveJob(
  userId: string,
  type: QueuedJob['type'],
  payloadKey: string,
  payloadValue: string,
) {
  const jobs = await getUserQueuedJobs(userId, { status: ['pending', 'running'], type, limit: 50 })
  return jobs.find((job) => job.payload?.[payloadKey] === payloadValue || job.result?.[payloadKey] === payloadValue) ?? null
}

async function getOwnedModuleResource(
  supabase: NonNullable<Awaited<ReturnType<typeof createAuthenticatedSupabaseServerClient>>> | NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>,
  resourceId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from('module_resources')
    .select('*, courses!inner(id, user_id)')
    .eq('id', resourceId)
    .eq('courses.user_id', userId)
    .maybeSingle()

  if (error || !data) return null
  return adaptModuleResourceRow(data as Record<string, unknown>)
}

async function createSourceOcrQueueJob(input: AutoSourceOcrJobInput & { useServiceRole: boolean }) {
  const payload = {
    moduleId: input.moduleId,
    resourceId: input.resource.id,
    courseId: input.courseId ?? input.resource.courseId ?? null,
    resourceTitle: input.resource.title,
    pageCount: input.resource.pageCount ?? null,
    manualRetry: Boolean(input.manualRetry),
  }

  return input.useServiceRole
    ? createQueuedJobAsService(input.userId, 'source_ocr', buildSourceOcrQueueTitle(input.resource.title), payload)
    : createQueuedJob(input.userId, 'source_ocr', buildSourceOcrQueueTitle(input.resource.title), payload)
}

async function createResourceExtractionQueueJob(input: AutoResourceExtractionJobInput & { useServiceRole: boolean }) {
  const payload = {
    moduleId: input.moduleId,
    resourceId: input.resource.id,
    courseId: input.courseId ?? input.resource.courseId ?? null,
    resourceTitle: input.resource.title,
  }

  return input.useServiceRole
    ? createQueuedJobAsService(input.userId, RESOURCE_EXTRACTION_JOB_TYPE, buildResourceExtractionQueueTitle(input.resource.title), payload)
    : createQueuedJob(input.userId, RESOURCE_EXTRACTION_JOB_TYPE, buildResourceExtractionQueueTitle(input.resource.title), payload)
}

function rowToQueuedJobForAutoOcr(row: Record<string, unknown>): QueuedJob {
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
    cancelRequestedAt: (row.cancel_requested_at as string | null) ?? null,
    canceledAt: (row.canceled_at as string | null) ?? null,
  }
}

function buildAutoOcrDiagnosticBase(resource: ModuleResource) {
  const readiness = classifyDeepLearnResourceReadiness({
    resource: {
      id: resource.id,
      title: resource.title,
      originalTitle: resource.title,
      type: resource.resourceType,
      contentType: resource.contentType,
      extension: resource.extension,
      required: resource.required,
      moduleName: '',
      category: 'resource',
      kind: 'study_file',
      lane: 'learn',
      sourceUrl: resource.sourceUrl,
      htmlUrl: resource.htmlUrl,
      extractionStatus: resource.extractionStatus,
      extractedText: resource.extractedText,
      extractedTextPreview: resource.extractedTextPreview,
      extractedCharCount: resource.extractedCharCount,
      extractionError: resource.extractionError,
      visualExtractionStatus: resource.visualExtractionStatus,
      visualExtractedText: resource.visualExtractedText,
      visualExtractionError: resource.visualExtractionError,
      pageCount: resource.pageCount,
      pagesProcessed: resource.pagesProcessed,
      extractionProvider: resource.extractionProvider,
      metadata: resource.metadata,
    },
    storedResource: resource,
    canonicalResourceId: resource.id,
  })

  return {
    resourceId: resource.id,
    title: resource.title,
    extractionStatus: resource.extractionStatus,
    visualExtractionStatus: resource.visualExtractionStatus ?? null,
    extractedTextLength: resource.extractedText?.length ?? 0,
    visualExtractedTextLength: resource.visualExtractedText?.length ?? 0,
    extractedCharCount: resource.extractedCharCount,
    pageCount: resource.pageCount ?? null,
    ocrQueueJobId: null,
    ocrQueueJobStatus: null,
    readinessResult: readiness.state,
    readinessCanGenerate: readiness.canGenerate,
  }
}

function shouldQueueResourceExtraction(resource: ModuleResource) {
  if (!isProcessableReadableSource(resource)) return false
  if (resource.extractionStatus === 'completed' || resource.extractionStatus === 'extracted' || resource.extractionStatus === 'unsupported') {
    return false
  }
  if (resource.extractionStatus === 'processing') return false
  if (resource.visualExtractionStatus === 'queued' || resource.visualExtractionStatus === 'running') return false
  return true
}

function buildResourceExtractionQueuedUpdate(resource: ModuleResource, now: string) {
  return {
    extraction_status: resource.extractionStatus === 'completed' || resource.extractionStatus === 'extracted'
      ? resource.extractionStatus
      : 'pending',
    extraction_error: 'Source is queued for readable-text preparation.',
    updated_at: now,
  }
}

async function processResourceExtractionJob(input: {
  jobId: string
  userId: string
  moduleId: string
  resourceId: string
  courseId: string | null
  resourceTitle: string
}, options: ResourceExtractionProcessingOptions = {}): Promise<ResourceExtractionProcessResult> {
  const started = await markQueuedJobRunning(input.jobId, 8)
  if (!started) return { started: false, status: 'skipped' }

  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) {
    await markQueuedJobFailed(input.jobId, 'Database connection is unavailable.')
    return { started: true, status: 'failed' }
  }
  const supabaseClient = supabase

  async function cancel(resource: ModuleResource | null) {
    if (!await isQueuedJobCancelled(input.jobId)) return false
    await markQueuedJobCancelled(input.jobId)
    if (resource) {
      await supabaseClient
        .from('module_resources')
        .update({
          extraction_status: 'pending',
          extraction_error: 'Source preparation was canceled.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', resource.id)
      revalidateLearnQueuePaths(input.moduleId, input.courseId, resource.id)
    }
    return true
  }

  let resource: ModuleResource | null = null

  try {
    resource = await getOwnedModuleResource(supabaseClient, input.resourceId, input.userId)
    if (!resource) {
      await markQueuedJobFailed(input.jobId, 'You do not have access to this source.')
      return { started: true, status: 'failed' }
    }

    if (!shouldQueueResourceExtraction(resource)) {
      await markQueuedJobCompleted(input.jobId, {
        resourceId: resource.id,
        moduleId: input.moduleId,
        resourceTitle: resource.title,
        statusMessage: 'Readable text is already available.',
        href: `/modules/${input.moduleId}/learn?resource=${encodeURIComponent(resource.id)}`,
      })
      return { started: true, status: 'completed' }
    }

    if (await cancel(resource)) return { started: true, status: 'cancelled' }

    await supabaseClient
      .from('module_resources')
      .update({
        extraction_status: 'processing',
        extraction_error: 'Preparing readable text from the source.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', resource.id)

    await updateQueuedJobStatus(input.jobId, 'running', {
      progress: 18,
      result: {
        resourceId: resource.id,
        moduleId: input.moduleId,
        resourceTitle: resource.title,
        statusMessage: buildResourceExtractionStatusMessage({ queued: false }),
      },
    })
    revalidateLearnQueuePaths(input.moduleId, input.courseId, resource.id)

    if (await cancel(resource)) return { started: true, status: 'cancelled' }

    const canvasConfig = await resolveStoredCanvasConfigForUserResource(input.userId, resource)
    const result = await reprocessStoredModuleResource(resource, {
      triggeredBy: 'learn',
      ...(canvasConfig ? { canvasConfig } : {}),
    })
    const normalized = normalizeSourceProcessingResult({
      resource,
      extractionStatus: result.update.extractionStatus,
      extractedText: result.update.extractedText,
      extractedTextPreview: result.update.extractedTextPreview,
      extractedCharCount: result.update.extractedCharCount,
      extractionError: result.update.extractionError,
      metadata: result.update.metadata,
    })

    const updatePayload = {
      extraction_status: normalized.extractionStatus,
      extracted_text: normalized.extractedText,
      extracted_text_preview: normalized.extractedTextPreview,
      extracted_char_count: normalized.extractedCharCount,
      extraction_error: normalized.extractionError,
      visual_extraction_status: result.update.visualExtractionStatus,
      visual_extracted_text: result.update.visualExtractedText,
      visual_extraction_error: result.update.visualExtractionError,
      page_count: result.update.pageCount,
      pages_processed: result.update.pagesProcessed,
      extraction_provider: result.update.extractionProvider,
      metadata: normalized.metadata,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError, data: updatedRow } = await supabaseClient
      .from('module_resources')
      .update(updatePayload)
      .eq('id', resource.id)
      .select('*')
      .single()

    if (updateError || !updatedRow) {
      throw new Error(updateError?.message ?? 'Failed to persist prepared source.')
    }

    const updatedResource = adaptModuleResourceRow(updatedRow as Record<string, unknown>)
    if (await cancel(updatedResource)) return { started: true, status: 'cancelled' }

    if (normalized.outcome === 'ready') {
      await markQueuedJobCompleted(input.jobId, {
        resourceId: updatedResource.id,
        moduleId: input.moduleId,
        resourceTitle: updatedResource.title,
        charCount: normalized.extractedCharCount,
        statusMessage: 'Readable text is ready.',
        href: `/modules/${input.moduleId}/learn?resource=${encodeURIComponent(updatedResource.id)}`,
      })
      revalidateLearnQueuePaths(input.moduleId, input.courseId, updatedResource.id)
      return { started: true, status: 'completed' }
    }

    const queuedOcrJobs = result.update.visualExtractionStatus === 'available'
      ? await autoEnqueueSourceOcrJobs({
          userId: input.userId,
          moduleId: input.moduleId,
          courseId: input.courseId ?? updatedResource.courseId ?? null,
          resources: [updatedResource],
        })
      : []

    if (queuedOcrJobs.length > 0) {
      await markQueuedJobCompleted(input.jobId, {
        resourceId: updatedResource.id,
        moduleId: input.moduleId,
        resourceTitle: updatedResource.title,
        queuedOcrJobIds: queuedOcrJobs.map((job) => job.id),
        statusMessage: 'Source prepared. Scanning image-based PDF next.',
        href: `/modules/${input.moduleId}/learn?resource=${encodeURIComponent(updatedResource.id)}`,
      })
      revalidateLearnQueuePaths(input.moduleId, input.courseId, updatedResource.id)
      if (options.autoStartSourceOcr !== false) {
        await processNextPendingSourceOcrJobForUser(input.userId)
      }
      return { started: true, status: 'completed' }
    }

    const failureMessage = normalized.extractionError?.trim()
      || (result.update.visualExtractionStatus === 'available'
        ? 'This PDF needs visual text extraction before Deep Learn.'
        : 'Could not extract enough readable text from this source.')
    await markQueuedJobFailed(input.jobId, failureMessage)
    revalidateLearnQueuePaths(input.moduleId, input.courseId, updatedResource.id)
    return { started: true, status: 'failed' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Source preparation failed.'
    console.error('[queue-jobs] processResourceExtractionJob failed', { jobId: input.jobId, message })
    await markQueuedJobFailed(input.jobId, message)
    if (resource) {
      await supabaseClient
        .from('module_resources')
        .update({
          extraction_status: 'failed',
          extraction_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resource.id)
      revalidateLearnQueuePaths(input.moduleId, input.courseId, resource.id)
    }
    return { started: true, status: 'failed' }
  } finally {
    if (options.continueQueue !== false) {
      await processNextPendingResourceExtractionJobForUser(input.userId)
    }
  }
}

function logAutoOcrDecision(reason: string, fields: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production') return
  console.info('[source-ocr:auto-enqueue]', {
    ...fields,
    autoEnqueueReason: reason,
  })
}

function getErrorField(error: unknown, key: 'code' | 'message' | 'details' | 'hint') {
  const value = (error as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' ? value : null
}

async function downloadStoredPdfForOcr(url: string, canvasConfig: CanvasConfig | null) {
  const resolvedUrl = await resolveStoredBinaryUrlForOcr(url, canvasConfig)
  const response = await fetchStoredSourceForOcr(resolvedUrl, canvasConfig)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const buffer = Buffer.from(await response.arrayBuffer())

  if (!contentType.includes('pdf') && !buffer.subarray(0, 5).toString('utf8').startsWith('%PDF-')) {
    throw new Error('The stored source did not return a PDF file. Open the original file.')
  }

  return buffer
}

async function resolveStoredBinaryUrlForOcr(url: string, canvasConfig: CanvasConfig | null) {
  const absoluteUrl = resolveStoredUrlForOcr(url, canvasConfig)
  const parsed = new URL(absoluteUrl)
  const normalizedPathname = parsed.pathname.replace(/\/$/, '')

  if (/\/api\/v1\/(?:courses\/\d+\/)?files\/\d+$/i.test(normalizedPathname)) {
    const response = await fetchStoredSourceForOcr(absoluteUrl, canvasConfig)
    const file = await response.json().catch(() => null) as { url?: string | null } | null
    if (!file?.url) throw new Error('The stored Canvas file endpoint no longer returns a downloadable URL.')
    return file.url
  }

  if (/\/courses\/\d+\/files\/\d+$/i.test(normalizedPathname)) {
    parsed.pathname = `${normalizedPathname}/download`
    return parsed.toString()
  }

  return absoluteUrl
}

async function fetchStoredSourceForOcr(url: string, canvasConfig: CanvasConfig | null) {
  const absoluteUrl = resolveStoredUrlForOcr(url, canvasConfig)
  const response = await fetch(absoluteUrl, {
    headers: buildStoredSourceHeadersForOcr(absoluteUrl, canvasConfig),
    next: { revalidate: 0 },
  })

  if (response.ok) return response
  if (response.status === 401 || response.status === 403) {
    throw new Error(CANVAS_RECONNECT_MESSAGE)
  }
  if (response.status === 404) throw new Error('The stored PDF no longer resolves. Open the original file.')
  throw new Error(`The stored PDF request failed with HTTP ${response.status}.`)
}

function resolveStoredUrlForOcr(url: string, canvasConfig: CanvasConfig | null) {
  try {
    return new URL(url).toString()
  } catch {
    if (!canvasConfig) throw new Error(CANVAS_RECONNECT_MESSAGE)
    return new URL(url, `${canvasConfig.url}/`).toString()
  }
}

function buildStoredSourceHeadersForOcr(url: string, canvasConfig: CanvasConfig | null) {
  if (!canvasConfig) return undefined
  const targetHost = new URL(url).host
  const canvasHost = new URL(`${canvasConfig.url}/`).host
  if (targetHost !== canvasHost) return undefined
  return { Authorization: `Bearer ${canvasConfig.token}` }
}

async function resolveStoredCanvasConfigForUserResource(userId: string, resource: ModuleResource) {
  return sharedResolveStoredCanvasConfigForUserResource(userId, {
    canvasInstanceUrl: resource.canvasInstanceUrl,
  })
}
