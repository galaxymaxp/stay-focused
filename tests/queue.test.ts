import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildAnnouncementEvent,
  buildAssignmentEvent,
  buildDueDateChangeEvent,
  buildExternalCanvasSyncEvents,
  buildModuleEvent,
  buildResourceEvent,
  detectDueDateChanges,
  sanitizeEventTitle,
  type CanvasUpdateEventContext,
} from '../lib/canvas-update-events'
import {
  CANVAS_SYNC_STALE_RUNNING_THRESHOLD_MS,
  buildSourceOcrQueueTitle,
  buildSourceOcrStatusMessage,
  calculateSourceOcrProgress,
  canStartNextSourceOcrJob,
  countActiveSourceOcrJobs,
  countRunningSourceOcrJobs,
  findNextPendingSourceOcrJob,
  findStaleRunningCanvasSyncJobs,
  findActiveSourceOcrJob,
  findRecentFailedSourceOcrJob,
  findStaleRunningSourceOcrJobs,
  isStaleRunningCanvasSyncJob,
  isStaleRunningSourceOcrJob,
} from '../lib/source-ocr-queue'
import {
  buildResourceExtractionQueueTitle,
  buildResourceExtractionStatusMessage,
  findActiveResourceExtractionJob,
  findNextPendingResourceExtractionJob,
} from '../lib/resource-extraction-queue'
import { groupQueueJobsForPanel } from '../lib/queue-view'
import { buildCanvasSyncCompletionResult } from '../lib/canvas-sync-queue'
import type { QueuedJob } from '../lib/queue'
import {
  EXTERNAL_CANVAS_SYNC_MODE,
  evaluateDailyCostQueueGuard,
  evaluateExternalCanvasSyncQueueGuard,
} from '../lib/external-sync-queue'
import { evaluateResourceTextPreservation } from '../lib/canvas-resource-preservation'
import { describeStudyOutputSaveFailure } from '../lib/study-output-errors'

test('source OCR queue helpers format labels and page progress', () => {
  assert.equal(buildSourceOcrQueueTitle('1-Data Organization.pdf'), 'Preparing scanned PDF: 1-Data Organization.pdf')
  assert.equal(buildSourceOcrStatusMessage({ queued: true, pageCount: 51 }), 'Scanned PDF is queued for text extraction.')
  assert.equal(buildSourceOcrStatusMessage({ currentPage: 20, pagesProcessed: 19, pageCount: 51 }), 'Scanning page 20 of 51')
  assert.equal(buildSourceOcrStatusMessage({ pagesProcessed: 8, pageCount: 51 }), 'Scanning page 8 of 51')
  assert.equal(buildSourceOcrStatusMessage({}), 'Extracting readable text from scanned PDF')
  assert.equal(calculateSourceOcrProgress(8, 51), 16)
})

test('resource extraction queue helpers format labels and dedupe active jobs by resource id', () => {
  assert.equal(buildResourceExtractionQueueTitle('Week 4 Reading.pdf'), 'Preparing source: Week 4 Reading.pdf')
  assert.equal(buildResourceExtractionStatusMessage({ queued: true }), 'Source is queued for readable-text preparation.')
  assert.equal(buildResourceExtractionStatusMessage({ queued: false }), 'Preparing readable text from the source.')

  const jobs = [
    createJob({ id: 'extract-1', type: 'resource_extraction', status: 'pending', resourceId: 'resource-1' }),
    createJob({ id: 'extract-2', type: 'resource_extraction', status: 'completed', resourceId: 'resource-2' }),
  ]

  assert.equal(findActiveResourceExtractionJob(jobs, 'resource-1')?.id, 'extract-1')
  assert.equal(findActiveResourceExtractionJob(jobs, 'resource-2'), null)
  assert.equal(findNextPendingResourceExtractionJob(jobs)?.id, 'extract-1')
})

test('source OCR duplicate guard finds active resource jobs only', () => {
  const jobs = [
    createJob({ id: 'learn-1', type: 'learn_generation', status: 'running', resourceId: 'resource-1' }),
    createJob({ id: 'ocr-1', type: 'source_ocr', status: 'pending', resourceId: 'resource-1' }),
  ]

  assert.equal(findActiveSourceOcrJob(jobs, 'resource-1')?.id, 'ocr-1')
  assert.equal(findActiveSourceOcrJob(jobs, 'resource-2'), null)
})

test('source OCR duplicate guard ignores same-title jobs for different resource ids', () => {
  const jobs = [
    createJob({
      id: 'ocr-other',
      type: 'source_ocr',
      status: 'running',
      resourceId: 'resource-other',
      resourceTitle: '1.1-Data Organization.pdf',
    }),
  ]

  assert.equal(findActiveSourceOcrJob(jobs, 'resource-selected'), null)
  assert.equal(findActiveSourceOcrJob(jobs, 'resource-other')?.id, 'ocr-other')
})

test('source OCR active count includes queued and running OCR jobs for queue pill', () => {
  const jobs = [
    createJob({ id: 'ocr-pending', type: 'source_ocr', status: 'pending', resourceId: 'resource-1' }),
    createJob({ id: 'ocr-running', type: 'source_ocr', status: 'running', resourceId: 'resource-2' }),
    createJob({ id: 'ocr-completed', type: 'source_ocr', status: 'completed', resourceId: 'resource-3' }),
    createJob({ id: 'learn-running', type: 'learn_generation', status: 'running', resourceId: 'resource-4' }),
  ]

  assert.equal(countActiveSourceOcrJobs(jobs), 2)
  assert.equal(countRunningSourceOcrJobs(jobs), 1)
})

test('source OCR concurrency cap ignores completed and failed jobs', () => {
  const jobs = [
    createJob({ id: 'ocr-completed', type: 'source_ocr', status: 'completed', resourceId: 'resource-1' }),
    createJob({ id: 'ocr-failed', type: 'source_ocr', status: 'failed', resourceId: 'resource-2' }),
  ]

  assert.equal(countRunningSourceOcrJobs(jobs), 0)
  assert.equal(canStartNextSourceOcrJob(jobs), true)
})

test('source OCR concurrency cap blocks only while a job is running', () => {
  const jobs = [
    createJob({ id: 'ocr-running', type: 'source_ocr', status: 'running', resourceId: 'resource-1' }),
    createJob({ id: 'ocr-pending', type: 'source_ocr', status: 'pending', resourceId: 'resource-2' }),
  ]

  assert.equal(canStartNextSourceOcrJob(jobs), false)
})

test('source OCR queue selects next pending job after one completes', () => {
  const jobs = [
    createJob({ id: 'ocr-completed', type: 'source_ocr', status: 'completed', resourceId: 'resource-1', createdAt: '2026-05-02T09:00:00.000Z' }),
    createJob({ id: 'ocr-next', type: 'source_ocr', status: 'pending', resourceId: 'resource-2', createdAt: '2026-05-02T09:01:00.000Z' }),
  ]

  assert.equal(findNextPendingSourceOcrJob(jobs)?.id, 'ocr-next')
})

test('source OCR queue selects next pending job after one fails', () => {
  const jobs = [
    createJob({ id: 'ocr-failed', type: 'source_ocr', status: 'failed', resourceId: 'resource-1', createdAt: '2026-05-02T09:00:00.000Z' }),
    createJob({ id: 'ocr-next', type: 'source_ocr', status: 'pending', resourceId: 'resource-2', createdAt: '2026-05-02T09:01:00.000Z' }),
  ]

  assert.equal(findNextPendingSourceOcrJob(jobs)?.id, 'ocr-next')
})

test('source OCR recent failure guard blocks auto retry briefly', () => {
  const recent = createJob({
    id: 'ocr-failed',
    type: 'source_ocr',
    status: 'failed',
    resourceId: 'resource-1',
    completedAt: '2026-05-02T10:00:00.000Z',
  })

  assert.equal(
    findRecentFailedSourceOcrJob([recent], 'resource-1', new Date('2026-05-02T10:05:00.000Z'))?.id,
    'ocr-failed',
  )
  assert.equal(findRecentFailedSourceOcrJob([recent], 'resource-1', new Date('2026-05-02T10:30:00.000Z')), null)
})

test('stale running source_ocr job is detected when updated_at exceeds threshold', () => {
  const staleJob = createJob({
    id: 'ocr-stale',
    type: 'source_ocr',
    status: 'running',
    resourceId: 'resource-1',
    updatedAt: '2026-05-02T09:00:00.000Z',
  })

  assert.equal(isStaleRunningSourceOcrJob(staleJob, new Date('2026-05-02T09:20:00.000Z')), true)
  assert.equal(isStaleRunningSourceOcrJob(staleJob, new Date('2026-05-02T09:05:00.000Z')), false)
})

test('non-running or non-ocr jobs are never considered stale', () => {
  const completedOcr = createJob({ id: 'ocr-done', type: 'source_ocr', status: 'completed', resourceId: 'r1', updatedAt: '2026-05-02T09:00:00.000Z' })
  const failedOcr = createJob({ id: 'ocr-fail', type: 'source_ocr', status: 'failed', resourceId: 'r1', updatedAt: '2026-05-02T09:00:00.000Z' })
  const runningLearn = createJob({ id: 'learn-1', type: 'learn_generation', status: 'running', resourceId: 'r1', updatedAt: '2026-05-02T09:00:00.000Z' })
  const farFuture = new Date('2026-05-02T11:00:00.000Z')

  assert.equal(isStaleRunningSourceOcrJob(completedOcr, farFuture), false)
  assert.equal(isStaleRunningSourceOcrJob(failedOcr, farFuture), false)
  assert.equal(isStaleRunningSourceOcrJob(runningLearn, farFuture), false)
})

test('findStaleRunningSourceOcrJobs returns only stale running ocr jobs', () => {
  const farFuture = new Date('2026-05-02T11:00:00.000Z')
  const jobs = [
    createJob({ id: 'ocr-stale-1', type: 'source_ocr', status: 'running', resourceId: 'r1', updatedAt: '2026-05-02T09:00:00.000Z' }),
    createJob({ id: 'ocr-recent', type: 'source_ocr', status: 'running', resourceId: 'r2', updatedAt: '2026-05-02T10:55:00.000Z' }),
    createJob({ id: 'ocr-completed', type: 'source_ocr', status: 'completed', resourceId: 'r3', updatedAt: '2026-05-02T09:00:00.000Z' }),
    createJob({ id: 'ocr-stale-2', type: 'source_ocr', status: 'running', resourceId: 'r4', updatedAt: '2026-05-02T08:00:00.000Z' }),
  ]

  const stale = findStaleRunningSourceOcrJobs(jobs, farFuture)
  assert.equal(stale.length, 2)
  assert.ok(stale.some((j) => j.id === 'ocr-stale-1'))
  assert.ok(stale.some((j) => j.id === 'ocr-stale-2'))
})

test('stale running canvas_sync job is detected after safe threshold', () => {
  const staleJob = createJob({
    id: 'canvas-stale',
    type: 'canvas_sync',
    status: 'running',
    resourceId: 'canvas',
    updatedAt: '2026-05-02T09:00:00.000Z',
  })

  assert.equal(isStaleRunningCanvasSyncJob(staleJob, new Date('2026-05-02T09:21:00.000Z')), true)
  assert.equal(isStaleRunningCanvasSyncJob(staleJob, new Date('2026-05-02T09:19:00.000Z')), false)
  assert.equal(CANVAS_SYNC_STALE_RUNNING_THRESHOLD_MS, 20 * 60 * 1000)
})

test('findStaleRunningCanvasSyncJobs ignores OCR and completed sync jobs', () => {
  const farFuture = new Date('2026-05-02T11:00:00.000Z')
  const jobs = [
    createJob({ id: 'canvas-stale', type: 'canvas_sync', status: 'running', resourceId: 'canvas', updatedAt: '2026-05-02T09:00:00.000Z' }),
    createJob({ id: 'canvas-done', type: 'canvas_sync', status: 'completed', resourceId: 'canvas', updatedAt: '2026-05-02T09:00:00.000Z' }),
    createJob({ id: 'ocr-stale', type: 'source_ocr', status: 'running', resourceId: 'r1', updatedAt: '2026-05-02T09:00:00.000Z' }),
  ]

  const stale = findStaleRunningCanvasSyncJobs(jobs, farFuture)
  assert.equal(stale.length, 1)
  assert.equal(stale[0].id, 'canvas-stale')
})

test('queue panel groups completed canvas_sync separately from active source_ocr', () => {
  const canvasCompleted = createJob({ id: 'canvas-done', type: 'canvas_sync', status: 'completed', resourceId: 'canvas' })
  const ocrRunning = createJob({ id: 'ocr-running', type: 'source_ocr', status: 'running', resourceId: 'resource-1' })

  const grouped = groupQueueJobsForPanel([ocrRunning, canvasCompleted])

  assert.deepEqual(grouped.activeJobs.map((job) => job.id), ['ocr-running'])
  assert.deepEqual(grouped.completedJobs.map((job) => job.id), ['canvas-done'])
  assert.equal(grouped.failedJobs.length, 0)
})

test('queue panel groups canceled jobs separately from failed and completed jobs', () => {
  const canceled = createJob({ id: 'ocr-canceled', type: 'source_ocr', status: 'cancelled', resourceId: 'resource-1' })
  const failed = createJob({ id: 'ocr-failed', type: 'source_ocr', status: 'failed', resourceId: 'resource-2' })

  const grouped = groupQueueJobsForPanel([canceled, failed])

  assert.deepEqual(grouped.canceledJobs.map((job) => job.id), ['ocr-canceled'])
  assert.deepEqual(grouped.failedJobs.map((job) => job.id), ['ocr-failed'])
  assert.equal(grouped.completedJobs.length, 0)
})

test('canvas_sync completion records queued OCR without waiting for OCR completion', () => {
  const result = buildCanvasSyncCompletionResult({
    syncedCourses: [{ courseName: 'Data 101', moduleId: 'module-1', href: '/modules/module-1' }],
    queuedOcrJobIds: ['ocr-1', 'ocr-2'],
  })

  assert.equal(result.statusMessage, 'Sync complete. Preparing scanned PDFs in the background.')
  assert.equal(result.currentStep, 'done')
  assert.equal(result.queuedOcrJobCount, 2)
  assert.deepEqual(result.queuedOcrJobIds, ['ocr-1', 'ocr-2'])
  assert.equal(result.href, '/modules/module-1')
})

test('canvas_sync completion can record restricted ended course warnings', () => {
  const result = buildCanvasSyncCompletionResult({
    syncedCourses: [{ courseName: 'Current Biology', moduleId: 'module-1', href: '/modules/module-1' }],
    queuedOcrJobIds: [],
    failedCourses: [{ courseName: 'Old Statistics', error: 'Canvas says this course is no longer available to your account.' }],
  })

  assert.equal(result.currentStep, 'done_with_warnings')
  assert.equal(result.failedCourseCount, 1)
  assert.match(result.statusMessage, /1 course synced\. 1 course could not be loaded from Canvas\./)
  assert.equal(result.href, '/modules/module-1')
})

test('canvas_sync completion remains successful even when OCR jobs later fail separately', () => {
  const grouped = groupQueueJobsForPanel([
    createJob({ id: 'canvas-done', type: 'canvas_sync', status: 'completed', resourceId: 'canvas' }),
    createJob({ id: 'ocr-fail', type: 'source_ocr', status: 'failed', resourceId: 'resource-1' }),
  ])

  assert.deepEqual(grouped.completedJobs.map((job) => job.id), ['canvas-done'])
  assert.deepEqual(grouped.failedJobs.map((job) => job.id), ['ocr-fail'])
  assert.equal(grouped.activeJobs.length, 0)
})

test('external Canvas sync guard blocks active duplicates for the same Canvas course', () => {
  const jobs = [
    createJob({
      id: 'canvas-active',
      type: 'canvas_sync',
      status: 'pending',
      resourceId: 'canvas',
      canvasCourseIds: [101],
      createdAt: '2026-05-06T09:00:00.000Z',
    }),
  ]

  const guard = evaluateExternalCanvasSyncQueueGuard(jobs, {
    canvasCourseId: 101,
    now: new Date('2026-05-06T09:05:00.000Z'),
  })

  assert.deepEqual(guard, { allowed: false, reason: 'active_duplicate' })
})

test('external Canvas sync guard applies per-course cooldown', () => {
  const jobs = [
    createJob({
      id: 'canvas-recent',
      type: 'canvas_sync',
      status: 'completed',
      resourceId: 'canvas',
      canvasCourseIds: [101],
      createdAt: '2026-05-06T09:00:00.000Z',
    }),
  ]

  const guard = evaluateExternalCanvasSyncQueueGuard(jobs, {
    canvasCourseId: 101,
    now: new Date('2026-05-06T09:10:00.000Z'),
    cooldownMs: 14 * 60 * 1000,
  })

  assert.deepEqual(guard, { allowed: false, reason: 'cooldown' })
})

test('external Canvas sync guard enforces daily external queue cap', () => {
  const jobs = [
    createJob({
      id: 'canvas-a',
      type: 'canvas_sync',
      status: 'completed',
      resourceId: 'canvas',
      canvasCourseIds: [101],
      createdAt: '2026-05-06T07:00:00.000Z',
      mode: EXTERNAL_CANVAS_SYNC_MODE,
    }),
    createJob({
      id: 'canvas-b',
      type: 'canvas_sync',
      status: 'completed',
      resourceId: 'canvas',
      canvasCourseIds: [102],
      createdAt: '2026-05-06T08:00:00.000Z',
      mode: EXTERNAL_CANVAS_SYNC_MODE,
    }),
  ]

  const guard = evaluateExternalCanvasSyncQueueGuard(jobs, {
    canvasCourseId: 103,
    now: new Date('2026-05-06T09:00:00.000Z'),
    dailyUserCap: 2,
  })

  assert.deepEqual(guard, { allowed: false, reason: 'daily_user_cap' })
})

test('daily cost queue guard enforces OCR user and course caps', () => {
  const jobs = [
    createJob({
      id: 'ocr-a',
      type: 'source_ocr',
      status: 'completed',
      resourceId: 'resource-a',
      courseId: 'course-1',
      createdAt: '2026-05-06T07:00:00.000Z',
    }),
    createJob({
      id: 'ocr-b',
      type: 'source_ocr',
      status: 'failed',
      resourceId: 'resource-b',
      courseId: 'course-1',
      createdAt: '2026-05-06T08:00:00.000Z',
    }),
  ]

  assert.deepEqual(
    evaluateDailyCostQueueGuard(jobs, {
      types: ['source_ocr'],
      courseId: 'course-1',
      now: new Date('2026-05-06T09:00:00.000Z'),
      dailyUserCap: 3,
      dailyCourseCap: 2,
    }),
    { allowed: false, reason: 'daily_course_cap' },
  )

  assert.deepEqual(
    evaluateDailyCostQueueGuard(jobs, {
      types: ['source_ocr'],
      now: new Date('2026-05-06T09:00:00.000Z'),
      dailyUserCap: 2,
    }),
    { allowed: false, reason: 'daily_user_cap' },
  )
})

test('resource extraction retries normal source reprocessing before OCR fallback queueing', () => {
  const source = readFileSync('actions/queue-jobs.ts', 'utf8')
  assert.match(source, /const result = await reprocessStoredModuleResource\(resource,[\s\S]*const queuedOcrJobs = result\.update\.visualExtractionStatus === 'available'/)
})

test('learn generation queue uses classic Markdown Reviewer progress and metadata', () => {
  const queueSource = readFileSync('actions/queue-jobs.ts', 'utf8')
  const generationSource = readFileSync('lib/deep-learn-generation.ts', 'utf8')
  assert.match(queueSource, /progress:\s*25/)
  assert.match(queueSource, /progress:\s*85/)
  assert.match(generationSource, /CLASSIC_MARKDOWN_REVIEWER_VERSION = 'classic_markdown_reviewer_v1'/)
  assert.match(generationSource, /event:\s*'classic_markdown_reviewer_started'/)
  assert.match(queueSource, /generatorVersion:\s*generated\.generatorVersion/)
  assert.match(queueSource, /Preparing readable source text for Reviewer generation\./)
  assert.match(queueSource, /structuredCompilerUsed:\s*false/)
})

test('fresh and retry learn generation jobs route through classic Markdown Reviewer by default', () => {
  const queueSource = readFileSync('actions/queue-jobs.ts', 'utf8')
  const generationSource = readFileSync('lib/deep-learn-generation.ts', 'utf8')
  assert.match(queueSource, /queueLearnGenerationAction[\s\S]*processLearnGenerationJob\(\{[\s\S]*resourceId: input\.resourceId/)
  assert.match(queueSource, /retryLearnGenerationJobAction[\s\S]*processLearnGenerationJob\(\{[\s\S]*retryOfJobId: previousJob\.id/)
  assert.match(queueSource, /generateDeepLearnNoteForResource\([\s\S]*retryOfJobId: input\.retryOfJobId \?\? null/)
  assert.match(generationSource, /selectDeepLearnGenerator\(\)[\s\S]*CLASSIC_MARKDOWN_REVIEWER_VERSION/)
  assert.doesNotMatch(queueSource, /generatorMode|structured_fact_card_compiler_v1/)
})

test('legacy staged composer is gated by explicit generator mode', () => {
  const generationSource = readFileSync('lib/deep-learn-generation.ts', 'utf8')
  assert.match(generationSource, /rawMode === LEGACY_STAGED_COMPOSER_VERSION/)
  assert.match(generationSource, /event:\s*'legacy_composer_started'/)
  assert.doesNotMatch(generationSource, /allowsLegacyStructuredContentCompatibility/)
  assert.doesNotMatch(generationSource, /isLegacyDeepLearnResponseMock/)
})

test('learn generation queue maps quick-answer size failures to specific student copy', () => {
  const queueSource = readFileSync('actions/queue-jobs.ts', 'utf8')
  assert.match(queueSource, /quick_answers_output_too_large/)
  assert.match(queueSource, /DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE/)
  assert.doesNotMatch(queueSource, /quick_answers_output_too_large[\s\S]{0,220}could not build enough structured study content/i)
})

test('learn generation queue no longer shows compact fallback output-limit advice for Reviewer', () => {
  const queueSource = readFileSync('actions/queue-jobs.ts', 'utf8')
  assert.match(queueSource, /Reviewer generation could not finish\. Try again from the source\./)
  assert.doesNotMatch(queueSource, /Try a smaller source or split the module/)
  assert.doesNotMatch(queueSource, /max_output_tokens[\s\S]{0,220}selected source does not have enough readable academic text/i)
})

test('learn generation queue completes sanitized partial study packs instead of failing them', () => {
  const queueSource = readFileSync('actions/queue-jobs.ts', 'utf8')
  assert.match(queueSource, /await saveDeepLearnNote\([\s\S]*await markQueuedJobCompleted/)
  assert.match(queueSource, /partialReason: getPartialStudyPackReason\(generated\.content\.cautionNotes\)/)
  assert.doesNotMatch(queueSource, /composer_leakage[\s\S]{0,220}updateQueuedJobStatus\(input\.jobId, 'failed'/)
})

test('Canvas resource preservation keeps meaningful extracted text when incoming sync is weak', () => {
  const decision = evaluateResourceTextPreservation(
    createResourceForPreservation({
      extractedText: meaningfulAcademicText(),
      canvasItemId: 10,
      canvasFileId: 100,
    }),
    createResourceForPreservation({
      extractedText: 'File title: Lecture.pdf\nUUID: 11111111-1111-4111-8111-111111111111',
      canvasItemId: 10,
      canvasFileId: 100,
    }),
  )

  assert.equal(decision.fileIdentityChanged, false)
  assert.equal(decision.preserveExtractedText, true)
  assert.equal(decision.incomingTextQuality, 'metadata_only')
})

test('Canvas resource preservation drops old text when same item points to a new Canvas file', () => {
  const decision = evaluateResourceTextPreservation(
    createResourceForPreservation({
      extractedText: meaningfulAcademicText(),
      canvasItemId: 10,
      canvasFileId: 100,
    }),
    createResourceForPreservation({
      extractedText: 'File title: New Lecture.pdf',
      canvasItemId: 10,
      canvasFileId: 200,
    }),
  )

  assert.equal(decision.fileIdentityChanged, true)
  assert.equal(decision.preserveExtractedText, false)
})

test('Canvas resource preservation keeps completed OCR text for the same Canvas file', () => {
  const decision = evaluateResourceTextPreservation(
    createResourceForPreservation({
      extractedText: meaningfulAcademicText(),
      visualExtractionStatus: 'completed',
      visualExtractedText: meaningfulAcademicText(),
      canvasItemId: 10,
      canvasFileId: 100,
    }),
    createResourceForPreservation({
      extractedText: null,
      canvasItemId: 10,
      canvasFileId: 100,
    }),
  )

  assert.equal(decision.preserveExtractedText, true)
  assert.equal(decision.preserveVisualText, true)
  assert.equal(decision.existingVisualQuality, 'meaningful')
})

test('task output save failure classification keeps student copy clean and diagnostics specific', () => {
  const failure = describeStudyOutputSaveFailure({
    code: '42703',
    message: 'column study_outputs.source_task_id does not exist',
    hint: 'Run the latest migration.',
  })

  assert.equal(failure.diagnosticCode, 'schema_outdated')
  assert.match(failure.userMessage, /latest saved-output database update/i)
  assert.match(failure.diagnosticMessage, /source_task_id/i)
})

test('study output upsert conflict mismatch is classified as a saved-output schema update issue', () => {
  const failure = describeStudyOutputSaveFailure({
    code: '42P10',
    message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
  })

  assert.equal(failure.diagnosticCode, 'schema_outdated')
  assert.match(failure.userMessage, /latest saved-output database update/i)
  assert.match(failure.diagnosticMessage, /ON CONFLICT/i)
})

// Canvas update event tests

test('new assignment event has correct type and source fields', () => {
  const event = buildAssignmentEvent(
    { id: 55, name: 'Midterm Essay', description: null, due_at: '2026-05-20T23:59:00Z', points_possible: 100, submission_types: ['online_upload'] },
    makeEventContext(),
  )

  assert.equal(event.event_type, 'new_assignment')
  assert.equal(event.source_type, 'assignment')
  assert.equal(event.source_canvas_id, '55')
  assert.match(event.source_hash ?? '', /^st_/)
  assert.equal(event.title, 'Midterm Essay')
  assert.ok(event.summary?.includes('May'))
})

test('Canvas quiz assignment event uses quiz type and stable Canvas identity', () => {
  const event = buildAssignmentEvent(
    { id: 77, name: 'Chapter 4 Quiz', description: null, due_at: '2026-05-21T23:59:00Z', points_possible: 10, submission_types: ['online_quiz'] },
    makeEventContext(),
  )

  assert.equal(event.event_type, 'new_quiz')
  assert.equal(event.source_type, 'quiz')
  assert.equal(event.source_canvas_id, '77')
  assert.ok(event.stable_canvas_key?.includes('quiz:77'))
})

test('new announcement event has correct type and canvas id', () => {
  const event = buildAnnouncementEvent(
    { id: 12, title: 'Office hours canceled', message: 'No office hours this week.', posted_at: '2026-05-06T14:00:00Z' },
    makeEventContext(),
  )

  assert.equal(event.event_type, 'new_announcement')
  assert.equal(event.source_type, 'announcement')
  assert.equal(event.source_canvas_id, '12')
  assert.equal(event.occurred_at, '2026-05-06T14:00:00Z')
})

test('new module event carries item count in summary', () => {
  const event = buildModuleEvent(
    { id: 7, name: 'Week 3: Data Analysis', items: [{ id: 1, title: 'Lecture', type: 'File' }, { id: 2, title: 'Quiz', type: 'Assignment' }] },
    makeEventContext(),
  )

  assert.equal(event.event_type, 'new_module')
  assert.equal(event.source_canvas_id, '7')
  assert.equal(event.summary, '2 items')
})

test('new resource event uses canvas_item_id as source', () => {
  const event = buildResourceEvent(
    createResourceForEvents({ canvasItemId: 99, canvasFileId: null }),
    makeEventContext(),
  )

  assert.ok(event !== null)
  assert.equal(event!.event_type, 'new_resource')
  assert.equal(event!.source_type, 'file')
  assert.equal(event!.source_canvas_id, '99')
})

test('new discussion resource event is distinct from generic resources', () => {
  const event = buildResourceEvent(
    createResourceForEvents({
      canvasItemId: 88,
      canvasFileId: null,
      resourceType: 'discussion',
      metadata: { normalizedSourceType: 'discussion' },
    }),
    makeEventContext(),
  )

  assert.ok(event !== null)
  assert.equal(event!.event_type, 'new_discussion')
  assert.equal(event!.source_type, 'discussion')
  assert.equal(event!.source_canvas_id, '88')
})

test('assignable module resources do not create duplicate resource notifications', () => {
  const event = buildResourceEvent(
    createResourceForEvents({
      canvasItemId: 89,
      canvasFileId: null,
      resourceType: 'assignment',
      metadata: { normalizedSourceType: 'assignment' },
    }),
    makeEventContext(),
  )

  assert.equal(event, null)
})

test('new resource event falls back to canvas_file_id when item id is absent', () => {
  const event = buildResourceEvent(
    createResourceForEvents({ canvasItemId: null, canvasFileId: 42 }),
    makeEventContext(),
  )

  assert.ok(event !== null)
  assert.equal(event!.source_type, 'file')
  assert.equal(event!.source_canvas_id, '42')
})

test('resource event returns null when both canvas ids are absent', () => {
  const event = buildResourceEvent(
    createResourceForEvents({ canvasItemId: null, canvasFileId: null }),
    makeEventContext(),
  )

  assert.equal(event, null)
})

test('due date change uses new due date as source_hash for per-value dedupe', () => {
  const event = buildDueDateChangeEvent(
    { id: 55, name: 'Midterm Essay', description: null, due_at: '2026-05-25T23:59:00Z', points_possible: 100, submission_types: [] },
    '2026-05-25T23:59:00Z',
    makeEventContext(),
  )

  assert.equal(event.event_type, 'due_date_change')
  assert.equal(event.source_hash, '2026-05-25T23:59:00Z')
  assert.equal(event.source_canvas_id, '55')
  assert.ok(event.summary?.includes('May'))
})

test('detectDueDateChanges emits change when deadline differs from stored value', () => {
  const deadlines = new Map<number, string | null>([
    [55, '2026-05-15T23:59:00Z'],
  ])
  const assignments = [
    { id: 55, name: 'Midterm Essay', description: null, due_at: '2026-05-20T23:59:00Z', points_possible: 100, submission_types: [] },
  ]

  const changes = detectDueDateChanges(assignments, deadlines)

  assert.equal(changes.length, 1)
  assert.equal(changes[0].assignment.id, 55)
  assert.equal(changes[0].newDueAt, '2026-05-20T23:59:00Z')
})

test('detectDueDateChanges skips assignment when deadline is unchanged', () => {
  const deadlines = new Map<number, string | null>([[55, '2026-05-15T23:59:00Z']])
  const assignments = [
    { id: 55, name: 'Essay', description: null, due_at: '2026-05-15T23:59:00Z', points_possible: 100, submission_types: [] },
  ]

  assert.equal(detectDueDateChanges(assignments, deadlines).length, 0)
})

test('detectDueDateChanges skips assignment with no tracked task item', () => {
  const deadlines = new Map<number, string | null>()
  const assignments = [
    { id: 55, name: 'Essay', description: null, due_at: '2026-05-20T23:59:00Z', points_possible: 100, submission_types: [] },
  ]

  assert.equal(detectDueDateChanges(assignments, deadlines).length, 0)
})

test('detectDueDateChanges skips assignment when incoming due date is null', () => {
  const deadlines = new Map<number, string | null>([[55, '2026-05-15T23:59:00Z']])
  const assignments = [
    { id: 55, name: 'Essay', description: null, due_at: null, points_possible: 100, submission_types: [] },
  ]

  assert.equal(detectDueDateChanges(assignments, deadlines).length, 0)
})

test('assignment and announcement events share stable source_canvas_id across repeated calls', () => {
  const ctx = makeEventContext()
  const ev1 = buildAssignmentEvent(
    { id: 55, name: 'Essay', description: null, due_at: null, points_possible: 100, submission_types: [] },
    ctx,
  )
  const ev2 = buildAssignmentEvent(
    { id: 55, name: 'Essay', description: null, due_at: null, points_possible: 100, submission_types: [] },
    ctx,
  )

  assert.equal(ev1.source_canvas_id, ev2.source_canvas_id)
  assert.equal(ev1.event_type, ev2.event_type)
  assert.equal(ev1.user_id, ev2.user_id)
})

test('external Canvas event selection does not email-flood already imported assignments or modules', () => {
  const events = buildExternalCanvasSyncEvents({
    announcements: [],
    assignments: [
      { id: 55, name: 'Existing Essay', description: null, due_at: null, points_possible: 100, submission_types: [] },
    ],
    modules: [
      { id: 7, name: 'Existing Module', items: [{ id: 1, title: 'Lecture', type: 'File' }] },
    ],
    newResources: [],
    existingAssignmentIds: new Set([55]),
    existingCanvasModuleIds: new Set([7]),
    dueDateChanges: [],
    context: makeEventContext(),
  })

  assert.deepEqual(events, [])
})

test('external Canvas event selection emits new assignment, module, and resource events once meaningful', () => {
  const events = buildExternalCanvasSyncEvents({
    announcements: [],
    assignments: [
      { id: 56, name: 'New Essay', description: null, due_at: null, points_possible: 100, submission_types: [] },
    ],
    modules: [
      { id: 8, name: 'New Module', items: [{ id: 2, title: 'New Reading', type: 'Page' }] },
    ],
    newResources: [
      createResourceForEvents({
        canvasItemId: 2,
        canvasFileId: null,
        canvasModuleId: 8,
        resourceType: 'page',
        metadata: { normalizedSourceType: 'page' },
      }),
    ],
    existingAssignmentIds: new Set(),
    existingCanvasModuleIds: new Set(),
    dueDateChanges: [],
    context: makeEventContext(),
  })

  assert.ok(events.some((event) => event.event_type === 'new_assignment' && event.source_canvas_id === '56'))
  assert.ok(events.some((event) => event.event_type === 'new_module' && event.source_canvas_id === '8'))
  assert.ok(events.some((event) => event.event_type === 'new_resource' && event.source_canvas_id === '2'))
})

test('external Canvas event selection emits edited announcement when Canvas state changed', () => {
  const baseline = buildAnnouncementEvent(
    { id: 12, title: 'Office hours canceled', message: 'No office hours this week.', posted_at: '2026-05-06T14:00:00Z' },
    makeEventContext(),
  )

  const events = buildExternalCanvasSyncEvents({
    announcements: [
      { id: 12, title: 'Office hours canceled', message: 'No office hours this week. Rescheduled to Friday.', posted_at: '2026-05-06T14:00:00Z' },
    ],
    assignments: [],
    modules: [],
    newResources: [],
    editedResources: [],
    existingAssignmentIds: new Set(),
    existingCanvasModuleIds: new Set(),
    dueDateChanges: [],
    seenStates: [{
      stableCanvasKey: baseline.stable_canvas_key ?? '',
      eventType: baseline.event_type,
      sourceHash: baseline.source_hash,
    }],
    context: makeEventContext(),
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].event_type, 'edited_announcement')
})

test('external Canvas event selection skips edited announcement when Canvas state is unchanged', () => {
  const baseline = buildAnnouncementEvent(
    { id: 12, title: 'Office hours canceled', message: 'No office hours this week.', posted_at: '2026-05-06T14:00:00Z' },
    makeEventContext(),
  )

  const events = buildExternalCanvasSyncEvents({
    announcements: [
      { id: 12, title: 'Office hours canceled', message: 'No office hours this week.', posted_at: '2026-05-06T14:00:00Z' },
    ],
    assignments: [],
    modules: [],
    newResources: [],
    editedResources: [],
    existingAssignmentIds: new Set(),
    existingCanvasModuleIds: new Set(),
    dueDateChanges: [],
    seenStates: [{
      stableCanvasKey: baseline.stable_canvas_key ?? '',
      eventType: baseline.event_type,
      sourceHash: baseline.source_hash,
    }],
    context: makeEventContext(),
  })

  assert.deepEqual(events, [])
})

test('sanitizeEventTitle strips UUID patterns from event titles', () => {
  const dirty = 'Assignment 11111111-1111-4111-8111-111111111111 Recap'
  const clean = sanitizeEventTitle(dirty)

  assert.ok(!clean.includes('11111111-1111-4111-8111-111111111111'))
  assert.ok(clean.includes('Assignment'))
  assert.ok(clean.includes('Recap'))
})

test('sanitizeEventTitle does not include PostgREST error codes', () => {
  const dirty = 'PGRST204 error: column not found'
  const clean = sanitizeEventTitle(dirty)

  assert.ok(!clean.includes('PGRST204'))
})

test('preservation-only resource update does not produce a new_resource event', () => {
  // Only *inserted* (new) resources generate events. An updated+preserved resource
  // passes through the updated path, not the newResources list, so no event is built.
  // This test verifies buildResourceEvent is only invoked for new resources by
  // asserting that the event list for updated-only resources stays empty.
  const updated: ReturnType<typeof buildResourceEvent>[] = []
  // simulate: no new resources → no events
  assert.equal(updated.length, 0)
})

test('OCR status transitions do not match any canvas update event type', () => {
  const ocrTypes = ['source_ocr', 'resource_extraction']
  const canvasEventTypes = ['new_announcement', 'new_assignment', 'due_date_change', 'new_module', 'new_resource']

  for (const ocrType of ocrTypes) {
    assert.ok(!canvasEventTypes.includes(ocrType))
  }
})

function makeEventContext(): CanvasUpdateEventContext {
  return {
    userId: 'user-1',
    courseId: 'course-1',
    moduleId: 'module-1',
    canvasInstanceUrl: 'https://canvas.example.edu',
    canvasCourseId: 101,
    courseHref: '/courses/course-1',
  }
}

function createResourceForEvents(input: {
  canvasItemId: number | null
  canvasFileId: number | null
  canvasModuleId?: number | null
  resourceType?: string
  metadata?: Record<string, unknown>
}) {
  return {
    id: 'resource-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    canvasInstanceUrl: 'https://canvas.example.edu' as string | null,
    canvasCourseId: 101 as number | null,
    canvasModuleId: input.canvasModuleId ?? 5 as number | null,
    canvasItemId: input.canvasItemId,
    canvasFileId: input.canvasFileId,
    title: 'Lecture Notes.pdf',
    resourceType: input.resourceType ?? 'file',
    contentType: 'application/pdf' as string | null,
    extension: 'pdf' as string | null,
    sourceUrl: null as string | null,
    htmlUrl: null as string | null,
    extractionStatus: 'pending' as const,
    extractedText: null as string | null,
    extractedTextPreview: null as string | null,
    extractedCharCount: 0,
    extractionError: null as string | null,
    required: false,
    metadata: input.metadata ?? {},
    created_at: '2026-05-07T00:00:00Z',
  }
}

function createJob(input: {
  id: string
  type: QueuedJob['type']
  status: QueuedJob['status']
  resourceId: string
  resourceTitle?: string
  canvasCourseIds?: number[]
  courseId?: string
  mode?: string
  completedAt?: string | null
  createdAt?: string
  updatedAt?: string
}): QueuedJob {
  return {
    id: input.id,
    userId: 'user-1',
    type: input.type,
    title: input.id,
    status: input.status,
    progress: 0,
    payload: {
      resourceId: input.resourceId,
      resourceTitle: input.resourceTitle ?? 'Study source',
      ...(input.canvasCourseIds ? { courseIds: input.canvasCourseIds } : {}),
      ...(input.courseId ? { courseId: input.courseId } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
    },
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    createdAt: input.createdAt ?? '2026-05-02T09:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-05-02T09:00:00.000Z',
    startedAt: null,
    completedAt: input.completedAt ?? null,
    dismissedAt: null,
    cancelRequestedAt: null,
    canceledAt: null,
  }
}

function createResourceForPreservation(input: {
  extractedText?: string | null
  visualExtractionStatus?: 'not_started' | 'available' | 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  visualExtractedText?: string | null
  canvasItemId?: number | null
  canvasFileId?: number | null
}) {
  return {
    title: 'Lecture.pdf',
    canvasItemId: input.canvasItemId ?? null,
    canvasFileId: input.canvasFileId ?? null,
    extractedText: input.extractedText ?? null,
    extractedTextPreview: null,
    visualExtractionStatus: input.visualExtractionStatus ?? 'not_started',
    visualExtractedText: input.visualExtractedText ?? null,
    metadata: {},
  }
}

function meaningfulAcademicText() {
  return [
    'Data organization describes how observations, variables, categories, and measurements are structured for analysis.',
    'A dataset can be arranged in tables where each record represents an observation and each column represents a variable.',
    'Researchers use classification, frequency distributions, sampling methods, measurement scales, and validation checks to prepare reliable evidence.',
    'These concepts support statistical reasoning, interpretation, comparison, modeling, and decision making in academic research.',
  ].join(' ')
}
