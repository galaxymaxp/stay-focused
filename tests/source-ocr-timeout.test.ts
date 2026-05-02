import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PER_PAGE_OCR_TIMEOUT_MS,
} from '../lib/extraction/pdf-ocr'
import { DEFAULT_OPENAI_OCR_MAX_PAGES } from '../lib/source-ocr-config'
import {
  isStaleRunningSourceOcrJob,
  SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS,
} from '../lib/source-ocr-queue'
import type { QueuedJob } from '../lib/queue'

test('PER_PAGE_OCR_TIMEOUT_MS is exported and reasonable', () => {
  assert.equal(typeof PER_PAGE_OCR_TIMEOUT_MS, 'number')
  assert.ok(PER_PAGE_OCR_TIMEOUT_MS >= 10_000, 'timeout should be at least 10 seconds')
  assert.ok(PER_PAGE_OCR_TIMEOUT_MS <= 120_000, 'timeout should be at most 2 minutes per page')
})

test('SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS is exported and longer than max OCR runtime', () => {
  const maxPagesPerRun = DEFAULT_OPENAI_OCR_MAX_PAGES
  const maxRuntimeMs = maxPagesPerRun * PER_PAGE_OCR_TIMEOUT_MS
  assert.ok(
    SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS > maxRuntimeMs,
    `stale threshold (${SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS}ms) should exceed max OCR runtime (${maxRuntimeMs}ms for ${maxPagesPerRun} pages × ${PER_PAGE_OCR_TIMEOUT_MS}ms)`,
  )
})

test('stale running job detection uses updatedAt as heartbeat proxy', () => {
  const runningJob = createOcrJob({ status: 'running', updatedAtOffset: -16 * 60 * 1000 })
  const freshJob = createOcrJob({ status: 'running', updatedAtOffset: -2 * 60 * 1000 })
  const pendingJob = createOcrJob({ status: 'pending', updatedAtOffset: -60 * 60 * 1000 })
  const now = new Date()

  assert.equal(isStaleRunningSourceOcrJob(runningJob, now), true, 'job with old updatedAt should be stale')
  assert.equal(isStaleRunningSourceOcrJob(freshJob, now), false, 'recently updated running job is not stale')
  assert.equal(isStaleRunningSourceOcrJob(pendingJob, now), false, 'pending jobs are never stale-running')
})

test('stale detection custom threshold works correctly', () => {
  const job = createOcrJob({ status: 'running', updatedAtOffset: -6 * 60 * 1000 })
  const now = new Date()

  assert.equal(isStaleRunningSourceOcrJob(job, now, 5 * 60 * 1000), true, 'exceeds 5 min threshold')
  assert.equal(isStaleRunningSourceOcrJob(job, now, 10 * 60 * 1000), false, 'does not exceed 10 min threshold')
})

function createOcrJob(input: {
  status: QueuedJob['status']
  updatedAtOffset: number
}): QueuedJob {
  const updatedAt = new Date(Date.now() + input.updatedAtOffset).toISOString()
  return {
    id: 'ocr-test',
    userId: 'user-1',
    type: 'source_ocr',
    title: 'Preparing scanned PDF: Test.pdf',
    status: input.status,
    progress: 37,
    payload: { resourceId: 'resource-1', moduleId: 'module-1', pageCount: 51 },
    result: { resourceId: 'resource-1', pagesProcessed: 19, pageCount: 51, statusMessage: 'Scanning page 19 of 51' },
    error: null,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    updatedAt,
    startedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    completedAt: null,
    dismissedAt: null,
  }
}
