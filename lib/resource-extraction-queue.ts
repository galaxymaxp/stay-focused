import type { QueuedJob } from '@/lib/queue'

export const RESOURCE_EXTRACTION_JOB_TYPE = 'resource_extraction' as const

export function buildResourceExtractionQueueTitle(resourceTitle: string) {
  return `Preparing source: ${resourceTitle.trim() || 'Study source'}`
}

export function buildResourceExtractionStatusMessage(input: {
  queued?: boolean
}) {
  if (input.queued) return 'Source is queued for readable-text preparation.'
  return 'Preparing readable text from the source.'
}

export function findActiveResourceExtractionJob(jobs: QueuedJob[], resourceId: string) {
  return jobs.find((job) => {
    if (job.type !== RESOURCE_EXTRACTION_JOB_TYPE) return false
    const payloadResourceId = typeof job.payload?.resourceId === 'string' ? job.payload.resourceId : null
    const resultResourceId = typeof job.result?.resourceId === 'string' ? job.result.resourceId : null
    return (job.status === 'pending' || job.status === 'running')
      && (payloadResourceId === resourceId || resultResourceId === resourceId)
  }) ?? null
}

export function countRunningResourceExtractionJobs(jobs: QueuedJob[]) {
  return jobs.filter((job) => job.type === RESOURCE_EXTRACTION_JOB_TYPE && job.status === 'running').length
}

export function canStartNextResourceExtractionJob(jobs: QueuedJob[]) {
  return countRunningResourceExtractionJobs(jobs) === 0
}

