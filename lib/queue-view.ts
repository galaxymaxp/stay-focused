import type { QueuedJob } from '@/lib/queue'

export interface QueueJobGroups {
  activeJobs: QueuedJob[]
  failedJobs: QueuedJob[]
  canceledJobs: QueuedJob[]
  completedJobs: QueuedJob[]
}

export function groupQueueJobsForPanel(jobs: QueuedJob[], completedLimit = 5): QueueJobGroups {
  const supersededFailedJobIds = new Set(
    jobs
      .filter((job) => job.status === 'failed' && job.type === 'learn_generation')
      .filter((job) => isSupersededLearnFailure(job, jobs))
      .map((job) => job.id),
  )

  return {
    activeJobs: jobs.filter((job) => job.status === 'pending' || job.status === 'running'),
    failedJobs: jobs.filter((job) => job.status === 'failed' && !supersededFailedJobIds.has(job.id)),
    canceledJobs: jobs.filter((job) => job.status === 'cancelled'),
    completedJobs: jobs.filter((job) => job.status === 'completed').slice(0, completedLimit),
  }
}

function isSupersededLearnFailure(job: QueuedJob, jobs: QueuedJob[]) {
  const resourceId = getJobResourceId(job)
  if (!resourceId) return false
  const jobTime = Date.parse(job.completedAt ?? job.updatedAt ?? job.createdAt)
  if (!Number.isFinite(jobTime)) return false
  return jobs.some((candidate) => {
    if (candidate.id === job.id || candidate.type !== 'learn_generation' || candidate.status !== 'completed') return false
    if (getJobResourceId(candidate) !== resourceId) return false
    const candidateTime = Date.parse(candidate.completedAt ?? candidate.updatedAt ?? candidate.createdAt)
    if (!Number.isFinite(candidateTime) || candidateTime < jobTime) return false
    return getString(candidate.result, 'qualityMode') === 'classic-markdown-reviewer'
      || getString(candidate.result, 'generatorVersion') === 'classic_markdown_reviewer_v1'
      || Boolean(getString(candidate.result, 'reviewerMarkdownLength'))
  })
}

function getJobResourceId(job: QueuedJob) {
  return getString(job.result, 'resourceId') ?? getString(job.payload, 'resourceId')
}

function getString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
