import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { getCalendarPageState, getCoursesPageState } from '../lib/app-route-states'
import { getStudyOutputKindLabel, getUnsupportedStudyOutputMessage, isRenderableStudyOutput } from '../lib/study-output-content'
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
  assert.equal(getLibrarySubtitle(createShelfItem({ studyOutputKind: 'quiz_pack' })), 'Quiz')
})

test('task outputs appear as task items in Study Library', () => {
  const courseNames = new Map([
    ['course-1', { id: 'course-1', name: 'Evidence', code: 'LAW-204' }],
  ])

  const item = toStudyLibraryItem(createShelfItem({
    title: 'Case Digest Output',
    sourceType: 'task',
    studyOutputKind: 'task_output',
    sourceTaskId: 'task-1',
  }), courseNames)

  assert.equal(item.kind, 'task')
  assert.equal(item.subtitle, 'Activity')
  assert.equal(item.taskTitle, 'Case Digest Output')
  assert.equal(item.href, '/library/output-1')
})

test('study sheet shelf subtitle is stable for study outputs', () => {
  assert.equal(getLibrarySubtitle(createShelfItem({ studyOutputKind: 'study_sheet' })), 'Reviewer')
})

test('cram sheet shelf subtitle is stable for study outputs', () => {
  assert.equal(getLibrarySubtitle(createShelfItem({ studyOutputKind: 'cram_sheet' })), 'Reviewer')
})

test('legacy sheet and quiz database kinds map to three student-facing Deep Learn outputs', () => {
  assert.equal(getStudyOutputKindLabel('reviewer'), 'Reviewer')
  assert.equal(getStudyOutputKindLabel('study_sheet'), 'Reviewer')
  assert.equal(getStudyOutputKindLabel('cram_sheet'), 'Reviewer')
  assert.equal(getStudyOutputKindLabel('quiz_pack'), 'Quiz')
  assert.equal(getStudyOutputKindLabel('task_output'), 'Activity')
})

test('Deep Learn source card exposes only Study Pack Reviewer and Quiz actions', () => {
  const source = readFileSync('components/DeepLearnNoteView.tsx', 'utf8')
  const sourceCard = readFileSync('components/StudyResourceAccordionList.tsx', 'utf8')

  assert.match(source, /Open Study Pack/)
  assert.match(source, /MakeReviewerButton/)
  assert.match(source, /MakeQuizPackButton/)
  assert.match(sourceCard, /Generate Study Pack/)
  assert.match(sourceCard, /MakeReviewerButton/)
  assert.match(sourceCard, /MakeQuizPackButton/)
  assert.doesNotMatch(sourceCard, /<SourceSummaryBadge/)
  assert.doesNotMatch(sourceCard, /Prepare preview/)
  assert.doesNotMatch(source, /MakeStudySheetButton/)
  assert.doesNotMatch(source, /MakeCramSheetButton/)
  assert.doesNotMatch(sourceCard, /MakeStudySheetButton/)
  assert.doesNotMatch(sourceCard, /MakeCramSheetButton/)
  assert.doesNotMatch(source, /Quiz this/)
})

test('student-facing queue copy hides raw max_output_tokens diagnostics', () => {
  const queuePanel = readFileSync('components/shell/QueuePanel.tsx', 'utf8')
  const learnPage = readFileSync('app/modules/[id]/learn/page.tsx', 'utf8')

  assert.match(queuePanel, /This study output was too large to finish in one pass\. Regenerate a shorter version\./)
  assert.match(learnPage, /This study output was too large to finish in one pass\. Regenerate a shorter version\./)
})

test('unsupported study output subtype stays visible with a safe subtitle', () => {
  assert.equal(getLibrarySubtitle(createShelfItem({ studyOutputKind: 'unknown_kind' as never })), 'Unsupported output')
  assert.equal(getStudyOutputKindLabel('unknown_kind'), 'Unsupported output')
})

test('malformed saved study output reports a safe unsupported message', () => {
  const output = {
    outputKind: 'reviewer',
    content: null,
  } as unknown as { outputKind: 'reviewer'; content: never }

  assert.equal(isRenderableStudyOutput(output), false)
  assert.match(getUnsupportedStudyOutputMessage(output), /does not have a readable content payload/i)
})

test('courses route state returns empty instead of blank body when synced data has no summaries', () => {
  assert.equal(getCoursesPageState({ hasSyncedData: true, summaryCount: 0 }), 'empty')
  assert.equal(getCoursesPageState({ hasSyncedData: false, summaryCount: 0 }), 'sync_first')
  assert.equal(getCoursesPageState({ hasSyncedData: true, summaryCount: 2 }), 'ready')
})

test('calendar route state returns empty instead of blank body when there are no dated or undated tasks', () => {
  assert.equal(getCalendarPageState({ hasSyncedData: true, scheduledCount: 0, undatedTaskCount: 0 }), 'empty')
  assert.equal(getCalendarPageState({ hasSyncedData: false, scheduledCount: 0, undatedTaskCount: 0 }), 'sync_first')
  assert.equal(getCalendarPageState({ hasSyncedData: true, scheduledCount: 1, undatedTaskCount: 0 }), 'ready')
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
