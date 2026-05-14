import { buildStudyLibraryDetailHref, type DraftShelfItem } from '@/lib/types'
import type { QueuedJob } from '@/lib/queue'

export interface LearnCardSavedPackState {
  status: 'ready'
  summary: 'Study pack ready.'
  primaryLabel: 'Open study pack'
  href: string
  error: null
}

export interface LearnGenerationQueueState {
  status: 'pending' | 'ready' | 'failed'
  summary: string
  primaryLabel: string
  href: string | null
  error: string | null
}

export function isSavedLegacyStudyPackForModule(draft: DraftShelfItem, moduleId: string, courseId: string | null) {
  if (draft.entryKind !== 'draft') return false
  if (draft.sourceType !== 'module_resource') return false
  if (draft.status !== 'ready') return false
  if (draft.sourceModuleId !== moduleId) return false
  if (courseId && draft.courseId !== courseId) return false
  return true
}

export function findSavedLegacyStudyPack(
  drafts: DraftShelfItem[],
  input: {
    courseId: string | null
    resourceId: string
    canonicalSourceId: string | null
  },
) {
  const canonicalIds = new Set([
    input.canonicalSourceId,
    input.resourceId,
    `resource:${input.resourceId}`,
    `module_resource:${input.resourceId}`,
  ].filter((value): value is string => Boolean(value)))

  return drafts.find((draft) => {
    if (input.courseId && draft.courseId !== input.courseId) return false
    if (draft.sourceResourceId === input.resourceId) return true
    return canonicalIds.has(draft.canonicalSourceId)
  }) ?? null
}

export function buildSavedLegacyPackState(draft: DraftShelfItem | null): LearnCardSavedPackState | null {
  if (!draft) return null
  return {
    status: 'ready',
    summary: 'Study pack ready.',
    primaryLabel: 'Open study pack',
    href: buildStudyLibraryDetailHref(draft.id),
    error: null,
  }
}

export function shouldTrustCompletedLearnQueueJob(hasSavedPack: boolean) {
  return hasSavedPack
}

export function buildLearnGenerationQueueState(
  job: QueuedJob | null,
  options: {
    hasSavedPack: boolean
    savedPackUpdatedAt?: string | null
  },
): LearnGenerationQueueState | null {
  if (!job) return null
  const href = getString(job.result, 'href')
  if (job.status === 'pending') {
    return { status: 'pending', summary: 'Added to queue.', primaryLabel: 'Added to queue', href: href ?? null, error: null }
  }
  if (job.status === 'running') {
    return {
      status: 'pending',
      summary: `Generating study pack... ${Math.max(0, Math.min(job.progress, 100))}%`,
      primaryLabel: 'Generating study pack...',
      href: href ?? null,
      error: null,
    }
  }
  if (job.status === 'completed') {
    if (!shouldTrustCompletedLearnQueueJob(options.hasSavedPack)) return null
    return { status: 'ready', summary: getString(job.result, 'statusMessage') ?? 'Study pack ready.', primaryLabel: 'Open study pack', href, error: null }
  }
  if (job.status === 'failed') {
    if (options.hasSavedPack && isQueueJobOlderThanSavedPack(job, options.savedPackUpdatedAt ?? null)) return null
    const error = cleanStudyPackQueueError(job.error)
    return { status: 'failed', summary: error, primaryLabel: 'Regenerate Study Pack', href: null, error }
  }
  return null
}

export function cleanStudyPackQueueError(error: string | null) {
  const fallback = 'Study pack failed.'
  if (!error) return fallback
  const trimmed = error.replace(/\s+/g, ' ').trim()
  if (/max_output_tokens/i.test(trimmed)) {
    return 'The model response limit was reached even after compact fallback. Try a smaller source or split the module.'
  }
  return trimmed || fallback
}

function isQueueJobOlderThanSavedPack(job: QueuedJob, savedPackUpdatedAt: string | null) {
  if (!savedPackUpdatedAt) return false
  const savedTime = Date.parse(savedPackUpdatedAt)
  if (!Number.isFinite(savedTime)) return false
  const jobTime = Date.parse(job.completedAt ?? job.updatedAt)
  if (!Number.isFinite(jobTime)) return false
  return jobTime <= savedTime
}

function getString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
