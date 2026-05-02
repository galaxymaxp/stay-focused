'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAuthenticatedSupabaseServerClient, getAuthenticatedUserServer } from '@/lib/auth-server'
import { resolveCanvasConfig, type CanvasConfig } from '@/lib/canvas'
import { adaptModuleResourceRow } from '@/lib/module-resource-row'
import {
  createQueuedJob,
  createQueuedJobAsService,
  getUserQueuedJobs,
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
import { DeepLearnGenerationBlockedError, generateDeepLearnNoteForResource } from '@/lib/deep-learn-generation'
import {
  DEEP_LEARN_PROMPT_VERSION,
  buildDeepLearnNoteBody,
  computeDeepLearnQuizReady,
} from '@/lib/deep-learn'
import { classifyDeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { saveDeepLearnNote } from '@/lib/deep-learn-store'
import { buildDeepLearnNoteHref } from '@/lib/stay-focused-links'
import { buildTaskDraftRequestPayload, type TaskDraftContext, type TaskDraftResponse } from '@/lib/do-now'
import { createNotification } from '@/lib/notifications-server'
import { saveDraftFromTaskOutput } from '@/actions/drafts'
import { type PdfOcrPage, type PdfOcrResult } from '@/lib/extraction/pdf-ocr'
import { getSourceOcrProvider } from '@/lib/extraction/source-ocr-provider'
import {
  buildMergedOcrResult,
  buildMergedOcrText,
  buildOcrResumeState,
  mergeOcrPageArrays,
} from '@/lib/source-ocr-resume'
import {
  buildOcrCompletedUpdate,
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
  countFailedSourceOcrJobs,
  countRunningSourceOcrJobs,
  findActiveSourceOcrJob,
  findRecentFailedSourceOcrJob,
  findStaleRunningSourceOcrJobs,
  getSourceOcrJobResourceId,
} from '@/lib/source-ocr-queue'
import { canAutoRunSourceOcr, canRunManualSourceOcr, getSourceOcrConfig } from '@/lib/source-ocr-config'
import type { ModuleResource } from '@/lib/types'

export interface QueueJobResult {
  jobId: string
  job?: QueuedJob
  error?: string
}

export interface AutoSourceOcrJobInput {
  userId: string
  moduleId: string
  courseId: string | null
  resource: ModuleResource
  manualRetry?: boolean
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

  const STALE_ERROR = 'Text extraction stalled. Retry extraction.'
  const now = new Date().toISOString()

  for (const job of staleJobs) {
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
  if (runningRows && runningRows.length > 0) return

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
// Queue: Do Now (task draft) generation
// ---------------------------------------------------------------------------

export async function queueDoGenerationAction(input: {
  taskId: string
  moduleId: string
  context: TaskDraftContext
}): Promise<QueueJobResult> {
  const user = await getAuthenticatedUserServer()
  if (!user) return { jobId: '', error: 'Not authenticated.' }

  const taskTitle = input.context.taskTitle
  const activeDuplicate =
    await findActiveJob(user.id, 'task_output', 'taskId', input.taskId)
    ?? await findActiveJob(user.id, 'do_generation', 'taskId', input.taskId)
  if (activeDuplicate) return { jobId: activeDuplicate.id, job: activeDuplicate }

  const job = await createQueuedJob(
    user.id,
    'task_output',
    `Generating task output: ${taskTitle}`,
    {
      taskId: input.taskId,
      moduleId: input.moduleId,
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
    })
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
    const workspace = await getModuleWorkspace(input.moduleId)
    if (!workspace) {
      await fail('Module not found.')
      return
    }

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 20 })

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

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 40 })

    const linkedTask = workspace.tasks.find((t) =>
      t.title.trim().toLowerCase() === resource.title.trim().toLowerCase()
    ) ?? null

    let generated
    try {
      generated = await generateDeepLearnNoteForResource({
        resource,
        storedResource,
        courseName,
        module: workspace.module,
        linkedTask,
      })
    } catch (err) {
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
    })
    revalidateLearnQueuePaths(workspace.module.id, workspace.module.courseId ?? input.courseId ?? null, canonicalResourceId)

    await createNotification({
      userId: input.userId,
      type: 'queue_completed',
      title: 'Study pack ready',
      body: `Your study pack for "${resource.title}" is ready.`,
      href: resultHref,
      severity: 'success',
      metadata: { jobId: input.jobId, dedupeKey: `learn:${canonicalResourceId}` },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during Deep Learn generation.'
    console.error('[queue-jobs] processLearnGenerationJob failed', { jobId: input.jobId, message })
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
}) {
  await markQueuedJobRunning(input.jobId, 8)
  const supabase = createSupabaseServiceRoleClient() ?? await createAuthenticatedSupabaseServerClient()
  if (!supabase) {
    await markQueuedJobFailed(input.jobId, 'Database connection is unavailable.')
    return
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
    const buffer = await downloadStoredPdfForOcr(sourceUrl, getOptionalCanvasConfig())
    const ocr = await providerAdapter.run({
      buffer,
      filename: resource.title || 'scanned-pdf.pdf',
      pageCount: resource.pageCount ?? null,
      maxPages: ocrConfig.provider === 'openai' ? ocrConfig.openaiMaxPages : undefined,
      ...(isResuming ? { pagesToProcess: resume.pagesToProcess } : {}),
      onPageStart: async ({ pageNumber, pagesProcessed, totalPages }) => {
        const pageCount = resource?.pageCount ?? totalPages
        const totalProcessed = totalTransferredCount(resume.previousPages, pagesProcessed)
        await supabase
          .from('module_resources')
          .update(buildOcrPageProgressUpdate({
            resource: resource as ModuleResource,
            pages: persistedPages,
            provider: 'openai:running',
            totalPagesInDocument: pageCount,
            now: new Date().toISOString(),
          }))
          .eq('id', input.resourceId)
        await updateQueuedJobStatus(input.jobId, 'running', {
          progress: calculateSourceOcrProgress(totalProcessed, pageCount),
          result: {
            resourceId: input.resourceId,
            moduleId: input.moduleId,
            resourceTitle: input.resourceTitle,
            pageCount,
            currentPage: pageNumber,
            pagesProcessed: totalProcessed,
            statusMessage: `Scanning page ${pageNumber} of ${pageCount}`,
          },
        })
      },
      onPageResult: async ({ page, pagesProcessed, totalPages }) => {
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

    const mergedPages = isResuming
      ? mergeOcrPageArrays(resume.previousPages, ocr.pages)
      : ocr.pages
    const mergedText = isResuming ? buildMergedOcrText(mergedPages) : (ocr.status === 'completed' ? ocr.text : '')
    const finalOcr: PdfOcrResult = isResuming
      ? buildMergedOcrResult(ocr, mergedPages, mergedText)
      : ocr

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
    await processNextPendingSourceOcrJobForUser(input.userId)
  }
}

// ---------------------------------------------------------------------------
// Internal: run Do Now AI and persist result
// ---------------------------------------------------------------------------

async function processDoGenerationJob(input: {
  jobId: string
  userId: string
  moduleId: string
  taskId: string
  context: TaskDraftContext
}) {
  await markQueuedJobRunning(input.jobId, 10)

  try {
    const apiPayload = buildTaskDraftRequestPayload(input.context)

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 20 })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3000'

    const resp = await fetch(`${baseUrl}/api/do-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    })

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 80 })

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as { error?: string }
      const message = body.error ?? `Task output returned ${resp.status}.`
      await markQueuedJobFailed(input.jobId, message)
      await notifyTaskOutputFailed(input.userId, input.jobId, input.taskId, input.moduleId, input.context.taskTitle, message)
      return
    }

    const data = await resp.json() as { ok: boolean; draft?: unknown; error?: string }

    if (!data.ok || !data.draft) {
      const message = data.error ?? 'Task output returned an empty draft.'
      await markQueuedJobFailed(input.jobId, message)
      await notifyTaskOutputFailed(input.userId, input.jobId, input.taskId, input.moduleId, input.context.taskTitle, message)
      return
    }

    const saved = await saveDraftFromTaskOutput({
      context: input.context,
      draft: data.draft as TaskDraftResponse,
    })
    const resultHref = `/library/${saved.draftId}`

    await markQueuedJobCompleted(input.jobId, {
      taskId: input.taskId,
      moduleId: input.moduleId,
      taskTitle: input.context.taskTitle,
      href: resultHref,
      draftId: saved.draftId,
      draft: data.draft as Record<string, unknown>,
    })

    await createNotification({
      userId: input.userId,
      type: 'queue_completed',
      title: 'Task output ready',
      body: `Your task output for "${input.context.taskTitle}" is ready.`,
      href: resultHref,
      severity: 'success',
      metadata: { jobId: input.jobId, jobType: 'task_output', taskId: input.taskId, dedupeKey: `task:${input.taskId}` },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during Do Now generation.'
    console.error('[queue-jobs] processDoGenerationJob failed', { jobId: input.jobId, message })
    await markQueuedJobFailed(input.jobId, message)

    await createNotification({
      userId: input.userId,
      type: 'queue_failed',
      title: 'Task output failed',
      body: message,
      href: `/modules/${input.moduleId}/do?task=${encodeURIComponent(input.taskId)}`,
      severity: 'error',
      metadata: { jobId: input.jobId, jobType: 'task_output', taskId: input.taskId, dedupeKey: `task-fail:${input.jobId}` },
    })
  }
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
    href: `/modules/${moduleId}/do?task=${encodeURIComponent(taskId)}`,
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
    throw new Error('Canvas auth is required to OCR this PDF. Check CANVAS_API_URL and CANVAS_API_TOKEN, or open the original file.')
  }
  if (response.status === 404) throw new Error('The stored PDF no longer resolves. Open the original file.')
  throw new Error(`The stored PDF request failed with HTTP ${response.status}.`)
}

function resolveStoredUrlForOcr(url: string, canvasConfig: CanvasConfig | null) {
  try {
    return new URL(url).toString()
  } catch {
    if (!canvasConfig) throw new Error('This stored source URL is relative, but no Canvas base URL is configured for OCR.')
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

function getOptionalCanvasConfig() {
  const hasEnvConfig = Boolean((process.env.CANVAS_API_URL ?? process.env.CANVAS_API_BASE_URL)?.trim() && process.env.CANVAS_API_TOKEN?.trim())
  if (!hasEnvConfig) return null
  try {
    return resolveCanvasConfig()
  } catch {
    return null
  }
}
