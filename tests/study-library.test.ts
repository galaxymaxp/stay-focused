import assert from 'node:assert/strict'
import test from 'node:test'
import { getLibrarySubtitle, toStudyLibraryItem } from '../lib/study-library'
import type { DraftShelfItem } from '../lib/types'

test('study output reviewers appear as learning items in Study Library', () => {
  const courseNames = new Map([
    ['course-1', { id: 'course-1', name: 'Evidence', code: 'LAW-204' }],
  ])

  const item = toStudyLibraryItem(createShelfItem(), courseNames)

  assert.equal(item.kind, 'learning')
  assert.equal(item.entryKind, 'study_output')
  assert.equal(item.subtitle, 'Reviewer')
  assert.equal(item.courseTitle, 'Evidence')
  assert.equal(item.href, '/library/output-1')
})

test('reviewer shelf subtitle is stable for study outputs', () => {
  assert.equal(getLibrarySubtitle(createShelfItem()), 'Reviewer')
})

test('quiz pack shelf subtitle is stable for study outputs', () => {
  assert.equal(getLibrarySubtitle(createShelfItem({ studyOutputKind: 'quiz_pack' })), 'Quiz pack')
})

function createShelfItem(overrides: Partial<DraftShelfItem> = {}): DraftShelfItem {
  return {
    id: 'output-1',
    entryKind: 'study_output',
    userId: 'user-1',
    courseId: 'course-1',
    canonicalSourceId: 'study_output:output-1',
    title: 'Evidence Reviewer',
    draftType: null,
    status: 'ready',
    sourceType: 'module_resource',
    sourceTitle: 'Evidence pack',
    tokenCount: null,
    updatedAt: '2026-05-09T00:00:00.000Z',
    createdAt: '2026-05-09T00:00:00.000Z',
    sourceModuleId: 'module-1',
    sourceResourceId: 'resource-1',
    moduleTitle: 'Week 6',
    quizReady: false,
    summary: 'Printable reviewer built from the saved Deep Learn pack.',
    studyOutputKind: 'reviewer',
    sourceNoteId: 'note-1',
    ...overrides,
  }
}
