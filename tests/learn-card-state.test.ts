import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSavedLegacyPackState,
  findSavedLegacyStudyPack,
  isSavedLegacyStudyPackForModule,
  shouldTrustCompletedLearnQueueJob,
} from '../lib/learn-card-state'
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
