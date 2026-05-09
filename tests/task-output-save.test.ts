import assert from 'node:assert/strict'
import test from 'node:test'
import { validateStudyOutputSaveInput } from '../lib/study-output-validation'
import type { StudyOutputTaskOutputContent } from '../lib/types'

test('task output save validation requires sourceTaskId', () => {
  const failure = validateStudyOutputSaveInput({
    sourceKind: 'task',
    sourceNoteId: null,
    sourceTaskId: null,
    outputKind: 'task_output',
    title: 'Draft output',
    content: createTaskOutputContent(),
  })

  assert.equal(failure?.diagnosticCode, 'missing_source_task_id')
})

test('task output save validation rejects empty titles', () => {
  const failure = validateStudyOutputSaveInput({
    sourceKind: 'task',
    sourceNoteId: null,
    sourceTaskId: 'task-1',
    outputKind: 'task_output',
    title: '   ',
    content: createTaskOutputContent(),
  })

  assert.equal(failure?.diagnosticCode, 'missing_title')
})

test('task output save validation accepts complete task-output payloads', () => {
  const failure = validateStudyOutputSaveInput({
    sourceKind: 'task',
    sourceNoteId: null,
    sourceTaskId: 'task-1',
    outputKind: 'task_output',
    title: 'Draft output',
    content: createTaskOutputContent(),
  })

  assert.equal(failure, null)
})

function createTaskOutputContent(): StudyOutputTaskOutputContent {
  return {
    version: 'task-output-v1',
    sourceTaskId: 'task-1',
    taskTitle: 'Case Brief',
    preset: 'report',
    outputType: 'pdf',
    previewMode: 'rich_text',
    title: 'Case Brief Output',
    summary: 'Grounded task output.',
    previewContent: 'Preview',
    stylesheet: null,
    script: null,
    requirementSummary: 'Use the task instructions.',
    requirements: ['Follow the rubric'],
    selectedContext: ['Selected source text'],
    groundingStatus: 'grounded',
    groundingNote: 'Grounded in readable task/source text.',
    limitationNote: null,
    warnings: [],
    exports: [],
    revisionHistory: [],
  }
}
