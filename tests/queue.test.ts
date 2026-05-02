import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CANVAS_SYNC_STALE_RUNNING_THRESHOLD_MS,
  buildSourceOcrQueueTitle,
  buildSourceOcrStatusMessage,
  calculateSourceOcrProgress,
  countActiveSourceOcrJobs,
  countRunningSourceOcrJobs,
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

test('source OCR queue helpers format labels and page progress', () => {
  assert.equal(buildSourceOcrQueueTitle('1-Data Organization.pdf'), 'Preparing scanned PDF: 1-Data Organization.pdf')
  assert.equal(buildSourceOcrStatusMessage({ queued: true, pageCount: 51 }), 'Scanned PDF is queued for text extraction.')
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

function createJob(input: {
  id: string
  type: QueuedJob['type']
  status: QueuedJob['status']
  resourceId: string
  resourceTitle?: string
  completedAt?: string | null
  updatedAt?: string
}): QueuedJob {
  return {
    id: input.id,
    userId: 'user-1',
    type: input.type,
    title: input.id,
    status: input.status,
    progress: 0,
    payload: { resourceId: input.resourceId, resourceTitle: input.resourceTitle ?? 'Study source' },
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    createdAt: '2026-05-02T09:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-05-02T09:00:00.000Z',
    startedAt: null,
    completedAt: input.completedAt ?? null,
    dismissedAt: null,
  }
}
