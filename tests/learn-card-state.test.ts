import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildLearnGenerationQueueState,
  buildSavedLegacyPackState,
  cleanStudyPackQueueError,
  findSavedLegacyStudyPack,
  isSavedLegacyStudyPackForModule,
  shouldTrustCompletedLearnQueueJob,
} from '../lib/learn-card-state'
import type { QueuedJob } from '../lib/queue'
import type { DraftShelfItem } from '../lib/types'

test('current-user library empty plus extracted source does not create a saved study pack state', () => {
  const sourceOnlyMetadata = {
    extraction_status: 'extracted',
    extracted_char_count: 2400,
    metadata: {
      fullTextAvailable: true,
      storedTextLength: 2400,
      capability: 'supported',
      quality: 'strong',
    },
  }

  const match = findSavedLegacyStudyPack([], {
    courseId: 'course-current',
    resourceId: 'resource-current',
    canonicalSourceId: 'resource-current',
  })

  assert.ok(sourceOnlyMetadata)
  assert.equal(match, null)
  assert.equal(buildSavedLegacyPackState(match), null)
})

test('old-user or old-course draft does not count for the current Learn card', () => {
  const oldDraft = createDraftShelfItem({
    id: 'old-draft',
    userId: 'old-user',
    courseId: 'old-course',
    sourceModuleId: 'module-current',
    sourceResourceId: 'resource-current',
    canonicalSourceId: 'module_resource:resource-current',
  })

  const scopedDrafts = [oldDraft].filter((draft) => isSavedLegacyStudyPackForModule(draft, 'module-current', 'course-current'))
  const match = findSavedLegacyStudyPack(scopedDrafts, {
    courseId: 'course-current',
    resourceId: 'resource-current',
    canonicalSourceId: 'resource-current',
  })

  assert.equal(match, null)
})

test('valid current-user draft by source_resource_id shows study pack ready', () => {
  const draft = createDraftShelfItem({
    id: 'draft-current',
    userId: 'user-current',
    courseId: 'course-current',
    sourceModuleId: 'module-current',
    sourceResourceId: 'resource-current',
    canonicalSourceId: 'module_resource:resource-current',
  })

  const scopedDrafts = [draft].filter((item) => isSavedLegacyStudyPackForModule(item, 'module-current', 'course-current'))
  const match = findSavedLegacyStudyPack(scopedDrafts, {
    courseId: 'course-current',
    resourceId: 'resource-current',
    canonicalSourceId: 'resource-current',
  })
  const state = buildSavedLegacyPackState(match)

  assert.equal(state?.status, 'ready')
  assert.equal(state?.summary, 'Study pack ready.')
  assert.equal(state?.primaryLabel, 'Open study pack')
  assert.equal(state?.href, '/library/draft-current')
})

test('valid current-user draft by canonical source id shows study pack ready', () => {
  const draft = createDraftShelfItem({
    id: 'draft-canonical',
    userId: 'user-current',
    courseId: 'course-current',
    sourceModuleId: 'module-current',
    sourceResourceId: null,
    canonicalSourceId: 'resource:resource-current',
  })

  const scopedDrafts = [draft].filter((item) => isSavedLegacyStudyPackForModule(item, 'module-current', 'course-current'))
  const match = findSavedLegacyStudyPack(scopedDrafts, {
    courseId: 'course-current',
    resourceId: 'resource-current',
    canonicalSourceId: 'resource-current',
  })

  assert.equal(buildSavedLegacyPackState(match)?.href, '/library/draft-canonical')
})

test('after draft deletion or stale queue completion, card returns to generation state', () => {
  const matchAfterDeletion = findSavedLegacyStudyPack([], {
    courseId: 'course-current',
    resourceId: 'resource-current',
    canonicalSourceId: 'resource-current',
  })

  assert.equal(matchAfterDeletion, null)
  assert.equal(shouldTrustCompletedLearnQueueJob(Boolean(matchAfterDeletion)), false)
})

test('failed or non-resource draft does not count as a saved study pack', () => {
  const failedDraft = createDraftShelfItem({
    status: 'failed',
    sourceResourceId: 'resource-current',
  })
  const taskDraft = createDraftShelfItem({
    sourceType: 'task',
    sourceResourceId: 'resource-current',
  })

  assert.equal(isSavedLegacyStudyPackForModule(failedDraft, 'module-current', 'course-current'), false)
  assert.equal(isSavedLegacyStudyPackForModule(taskDraft, 'module-current', 'course-current'), false)
})

test('failed Deep Learn attempt stays separate from readable source readiness copy', () => {
  const state = buildLearnGenerationQueueState(createJob({
    id: 'learn-failed',
    status: 'failed',
    error: 'Provider returned malformed structured output.',
    completedAt: '2026-05-14T08:00:00.000Z',
  }), {
    hasSavedPack: false,
  })

  assert.equal(state?.status, 'failed')
  assert.equal(state?.primaryLabel, 'Regenerate Study Pack')
  assert.equal(state?.error, 'Provider returned malformed structured output.')
  assert.notEqual(state?.summary, 'Failed')
})

test('successful retry supersedes an older failed Deep Learn queue item', () => {
  const staleFailed = createJob({
    id: 'learn-old-failed',
    status: 'failed',
    error: 'The compact study pack still exceeded the model response size limit.',
    completedAt: '2026-05-14T08:00:00.000Z',
  })

  const state = buildLearnGenerationQueueState(staleFailed, {
    hasSavedPack: true,
    savedPackUpdatedAt: '2026-05-14T08:05:00.000Z',
  })

  assert.equal(state, null)
})

test('new generation queue item is not blocked by an old failed attempt', () => {
  const state = buildLearnGenerationQueueState(createJob({
    id: 'learn-new-pending',
    status: 'pending',
    createdAt: '2026-05-14T08:10:00.000Z',
  }), {
    hasSavedPack: false,
  })

  assert.equal(state?.status, 'pending')
  assert.equal(state?.summary, 'Added to queue.')
})

test('old one-pass too-large wording is not returned for queue errors', () => {
  const message = cleanStudyPackQueueError('max_output_tokens')

  assert.match(message, /compact study pack still exceeded/i)
  assert.doesNotMatch(message, /finish in one pass|Regenerate a shorter version/i)
})

test('Learn page does not turn source readiness label into Failed for study-pack failures', () => {
  const source = readFileSync('app/modules/[id]/learn/page.tsx', 'utf8')

  assert.doesNotMatch(source, /queuedDeepLearn\?\.status === 'failed'\) return 'Failed'/)
  assert.match(source, /queuedDeepLearn\?\.status === 'pending' \|\| queuedDeepLearn\?\.status === 'ready'/)
})

function createDraftShelfItem(overrides: Partial<DraftShelfItem> = {}): DraftShelfItem {
  return {
    id: 'draft-1',
    entryKind: 'draft',
    userId: 'user-current',
    courseId: 'course-current',
    canonicalSourceId: 'module_resource:resource-current',
    title: 'Saved Study Pack',
    draftType: 'study_notes',
    status: 'ready',
    sourceType: 'module_resource',
    sourceTitle: 'Source',
    tokenCount: null,
    updatedAt: '2026-04-29T00:00:00.000Z',
    createdAt: '2026-04-29T00:00:00.000Z',
    sourceModuleId: 'module-current',
    sourceResourceId: 'resource-current',
    moduleTitle: 'Module',
    quizReady: false,
    summary: null,
    ...overrides,
  }
}

function createJob(input: {
  id: string
  status: QueuedJob['status']
  error?: string | null
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
}): QueuedJob {
  return {
    id: input.id,
    userId: 'user-current',
    type: 'learn_generation',
    title: 'Generating study pack: Source',
    status: input.status,
    progress: input.status === 'running' ? 55 : 0,
    payload: {
      resourceId: 'resource-current',
      resourceTitle: 'Source',
    },
    result: null,
    error: input.error ?? null,
    attempts: 0,
    maxAttempts: 3,
    createdAt: input.createdAt ?? '2026-05-14T08:00:00.000Z',
    updatedAt: input.updatedAt ?? input.createdAt ?? '2026-05-14T08:00:00.000Z',
    startedAt: null,
    completedAt: input.completedAt ?? null,
    dismissedAt: null,
    cancelRequestedAt: null,
    canceledAt: null,
  }
}
