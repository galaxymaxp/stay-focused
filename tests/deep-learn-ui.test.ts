import assert from 'node:assert/strict'
import test from 'node:test'
import { getDeepLearnResourceUiState } from '../lib/deep-learn-ui'
import type { DeepLearnNote } from '../lib/types'

test('resources without a note default to Deep Learn as the primary action', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', null)

  assert.equal(state.status, 'not_started')
  assert.equal(state.statusLabel, 'No note yet')
  assert.equal(state.primaryLabel, 'Deep Learn this')
  assert.equal(state.quizReady, false)
  assert.match(state.summary, /exact terms/i)
})

test('ready notes surface quiz-ready state and note-first actions', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', createNote({
    status: 'ready',
    quizReady: true,
    overview: 'Preserves the official terms and keeps the distinctions ready for quiz.',
  }))

  assert.equal(state.status, 'ready')
  assert.equal(state.statusLabel, 'Ready')
  assert.equal(state.primaryLabel, 'Open Deep Learn note')
  assert.equal(state.quizReady, true)
  assert.match(state.detail, /quiz generation/i)
})

test('failed notes shift the action to retry', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', createNote({
    status: 'failed',
    errorMessage: 'Source grounding stayed too weak to trust a generated note.',
  }))

  assert.equal(state.status, 'failed')
  assert.equal(state.primaryLabel, 'Retry Deep Learn')
  assert.match(state.summary, /too weak/i)
})

test('unavailable note loading is distinct from having no note yet', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', null, {
    notesAvailability: 'unavailable',
    unavailableMessage: 'Saved Deep Learn notes are unavailable because the deep_learn_notes table is missing in this environment.',
  })

  assert.equal(state.status, 'unavailable')
  assert.equal(state.statusLabel, 'Unavailable')
  assert.equal(state.primaryLabel, 'View reader fallback')
  assert.match(state.summary, /deep_learn_notes table/i)
})

test('blocked resources suppress the generate affordance and show the blocked reason', () => {
  const state = getDeepLearnResourceUiState('module-1', 'resource-1', null, {
    readiness: {
      state: 'blocked',
      canonicalResourceId: null,
      blockedReason: 'no_source_path',
      canGenerate: false,
      summary: 'Deep Learn is blocked because no fetchable source path is stored for this item.',
      detail: 'The synced resource record does not currently include a Canvas API URL, file URL, or resolvable target.',
    },
  })

  assert.equal(state.status, 'blocked')
  assert.equal(state.statusLabel, 'Blocked')
  assert.equal(state.primaryLabel, 'View reader fallback')
  assert.match(state.detail, /resolvable target/i)
})

function createNote(overrides: Partial<DeepLearnNote> = {}): DeepLearnNote {
  return {
    id: 'note-1',
    userId: 'user-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    resourceId: 'resource-1',
    status: 'pending',
    title: 'Deep Learn note',
    overview: 'Deep Learn is preparing the note.',
    sections: [],
    noteBody: '',
    coreTerms: [],
    keyFacts: [],
    distinctions: [],
    likelyQuizPoints: [],
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
    promptVersion: 'v1',
    errorMessage: null,
    createdAt: '2026-04-12T00:00:00.000Z',
    updatedAt: '2026-04-12T00:00:00.000Z',
    generatedAt: '2026-04-12T00:00:00.000Z',
    ...overrides,
  }
}
