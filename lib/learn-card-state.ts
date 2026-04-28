import { buildStudyLibraryDetailHref, type DraftShelfItem } from '@/lib/types'

export interface LearnCardSavedPackState {
  status: 'ready'
  summary: 'Study pack ready.'
  primaryLabel: 'Open study pack'
  href: string
  error: null
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
