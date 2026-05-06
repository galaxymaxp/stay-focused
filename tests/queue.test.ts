import assert from 'node:assert/strict'
import test from 'node:test'
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
import { groupQueueJobsForPanel } from '../lib/queue-view'
import { buildCanvasSyncCompletionResult } from '../lib/canvas-sync-queue'
import type { QueuedJob } from '../lib/queue'
import {
  EXTERNAL_CANVAS_SYNC_MODE,
  evaluateDailyCostQueueGuard,
  evaluateExternalCanvasSyncQueueGuard,
} from '../lib/external-sync-queue'
import { evaluateResourceTextPreservation } from '../lib/canvas-resource-preservation'

test('source OCR queue helpers format labels and page progress', () => {
  assert.equal(buildSourceOcrQueueTitle('1-Data Organization.pdf'), 'Preparing scanned PDF: 1-Data Organization.pdf')
  assert.equal(buildSourceOcrStatusMessage({ queued: true, pageCount: 51 }), 'Scanned PDF is queued for text extraction.')
  assert.equal(buildSourceOcrStatusMessage({ currentPage: 20, pagesProcessed: 19, pageCount: 51 }), 'Scanning page 20 of 51')
  assert.equal(buildSourceOcrStatusMessage({ pagesProcessed: 8, pageCount: 51 }), 'Scanning page 8 of 51')
  assert.equal(buildSourceOcrStatusMessage({}), 'Extracting readable text from scanned PDF')
  assert.equal(calculateSourceOcrProgress(8, 51), 16)
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
