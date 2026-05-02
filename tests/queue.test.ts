import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSourceOcrQueueTitle,
  buildSourceOcrStatusMessage,
  calculateSourceOcrProgress,
  countActiveSourceOcrJobs,
  findActiveSourceOcrJob,
  findRecentFailedSourceOcrJob,
} from '../lib/source-ocr-queue'
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

function createJob(input: {
  id: string
  type: QueuedJob['type']
  status: QueuedJob['status']
  resourceId: string
  resourceTitle?: string
  completedAt?: string | null
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
    updatedAt: '2026-05-02T09:00:00.000Z',
    startedAt: null,
    completedAt: input.completedAt ?? null,
    dismissedAt: null,
  }
}
