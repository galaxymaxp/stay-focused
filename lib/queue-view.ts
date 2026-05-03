import type { QueuedJob } from '@/lib/queue'

export interface QueueJobGroups {
  activeJobs: QueuedJob[]
  failedJobs: QueuedJob[]
  canceledJobs: QueuedJob[]
  completedJobs: QueuedJob[]
}

export function groupQueueJobsForPanel(jobs: QueuedJob[], completedLimit = 5): QueueJobGroups {
  return {
    activeJobs: jobs.filter((job) => job.status === 'pending' || job.status === 'running'),
    failedJobs: jobs.filter((job) => job.status === 'failed'),
    canceledJobs: jobs.filter((job) => job.status === 'cancelled'),
    completedJobs: jobs.filter((job) => job.status === 'completed').slice(0, completedLimit),
  }
}
