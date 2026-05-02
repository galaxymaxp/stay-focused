import type { QueuedJob } from '@/lib/queue'

export const SOURCE_OCR_JOB_TYPE = 'source_ocr' as const
export const SOURCE_OCR_RECENT_FAILURE_WINDOW_MS = 10 * 60 * 1000

export function buildSourceOcrQueueTitle(resourceTitle: string) {
  return `Preparing scanned PDF: ${resourceTitle.trim() || 'Study source'}`
}

export function calculateSourceOcrProgress(pagesProcessed: number | null | undefined, pageCount: number | null | undefined) {
  if (!pageCount || pageCount <= 0) return pagesProcessed && pagesProcessed > 0 ? 25 : 8
  return Math.max(8, Math.min(98, Math.round(((pagesProcessed ?? 0) / pageCount) * 100)))
}

export function buildSourceOcrStatusMessage(input: {
  pagesProcessed?: number | null
  pageCount?: number | null
  queued?: boolean
}) {
  if (input.queued) return 'Scanned PDF is queued for text extraction.'
  const pageCount = input.pageCount ?? null
  const pagesProcessed = input.pagesProcessed ?? 0
  if (pageCount && pageCount > 0 && pagesProcessed > 0) {
    return `Scanning page ${Math.min(pagesProcessed, pageCount)} of ${pageCount}`
  }
  return 'Extracting readable text from scanned PDF'
}

export function getSourceOcrJobResourceId(job: Pick<QueuedJob, 'payload' | 'result'>) {
  return getString(job.result, 'resourceId') ?? getString(job.payload, 'resourceId')
}

export function findActiveSourceOcrJob(jobs: QueuedJob[], resourceId: string) {
  return jobs.find((job) => (
    job.type === SOURCE_OCR_JOB_TYPE
    && (job.status === 'pending' || job.status === 'running')
    && getSourceOcrJobResourceId(job) === resourceId
  )) ?? null
}

export function countActiveSourceOcrJobs(jobs: QueuedJob[]) {
  return jobs.filter((job) => (
    job.type === SOURCE_OCR_JOB_TYPE
    && (job.status === 'pending' || job.status === 'running')
  )).length
}

export function findRecentFailedSourceOcrJob(
  jobs: QueuedJob[],
  resourceId: string,
  now = new Date(),
  windowMs = SOURCE_OCR_RECENT_FAILURE_WINDOW_MS,
) {
  const cutoff = now.getTime() - windowMs
  return jobs.find((job) => {
    if (job.type !== SOURCE_OCR_JOB_TYPE || job.status !== 'failed') return false
    if (getSourceOcrJobResourceId(job) !== resourceId) return false
    const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : 0
    return Number.isFinite(completedAt) && completedAt >= cutoff
  }) ?? null
}

function getString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
