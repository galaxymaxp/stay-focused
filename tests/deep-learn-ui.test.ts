import assert from 'node:assert/strict'
import test from 'node:test'
import { getDeepLearnResourceUiState } from '../lib/deep-learn-ui'
import { buildDeepLearnNoteRecord } from '../lib/deep-learn'
import type { DeepLearnNote } from '../lib/types'

test('resources without a pack default to answer-first generation', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', null)

  assert.equal(state.status, 'not_started')
  assert.equal(state.statusLabel, 'Pack')
  assert.equal(state.primaryLabel, 'Generate pack')
  assert.equal(state.quizReady, false)
  assert.match(state.summary, /answer-first exam prep pack/i)
})

test('ready packs surface quiz-ready state and pack-first actions', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', createNote({
    status: 'ready',
    quizReady: true,
    overview: 'Keeps the answer bank, identification cues, and distinctions ready for quiz.',
  }))

  assert.equal(state.status, 'ready')
  assert.equal(state.statusLabel, 'Review Ready')
  assert.equal(state.primaryLabel, 'Open workspace')
  assert.equal(state.quizReady, true)
  assert.match(state.detail, /answer-bank review/i)
})

test('failed packs shift the action to rebuild', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', createNote({
    status: 'failed',
    errorMessage: 'Source grounding stayed too weak to trust a generated exam prep pack.',
  }))

  assert.equal(state.status, 'failed')
  assert.equal(state.primaryLabel, 'Generate pack')
  assert.match(state.summary, /too weak/i)
})

test('unavailable pack loading is distinct from having no pack yet', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', null, {
    notesAvailability: 'unavailable',
    unavailableMessage: 'Saved Deep Learn exam prep packs are unavailable because the deep_learn_notes table is missing in this environment.',
  })

  assert.equal(state.status, 'unavailable')
  assert.equal(state.statusLabel, 'Unavailable')
  assert.equal(state.primaryLabel, 'Open Source')
  assert.match(state.summary, /deep_learn_notes table/i)
})

test('unreadable resources suppress the generate affordance and show the source action state', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', null, {
    readiness: {
      state: 'unreadable',
      canonicalResourceId: null,
      blockedReason: 'no_source_path',
      canGenerate: false,
      shouldAttemptSourceFetch: false,
      label: 'Unreadable',
      tone: 'muted',
      summary: 'No fetchable source path is stored for this item.',
      detail: 'This item needs to be reconnected to its Canvas source before Deep Learn can save notes or quizzes.',
    },
  })

  assert.equal(state.status, 'blocked')
  assert.equal(state.statusLabel, 'Needs action')
  assert.equal(state.primaryLabel, 'Open Source')
  assert.match(state.detail, /Canvas source/i)
})

function createNote(overrides: Partial<DeepLearnNote> = {}): DeepLearnNote {
  return buildDeepLearnNoteRecord({
    id: 'note-1',
    userId: 'user-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    resourceId: 'resource-1',
    status: 'pending',
    title: 'Exam Prep Pack',
    overview: 'Deep Learn is preparing the exam prep pack.',
    sections: [],
    noteBody: '',
    answerBank: [],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [],
    cautionNotes: [],
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 1200,
    },
    quizReady: false,
    promptVersion: 'v2-exam-prep',
    errorMessage: null,
    createdAt: '2026-04-12T00:00:00.000Z',
    updatedAt: '2026-04-12T00:00:00.000Z',
    generatedAt: '2026-04-12T00:00:00.000Z',
    ...overrides,
  })
}
