import assert from 'node:assert/strict'
import test from 'node:test'
import { computeDeepLearnQuizReady } from '../lib/deep-learn'
import { buildDeepLearnQuizItems, isDeepLearnQuizReady, MIN_DEEP_LEARN_QUIZ_ITEM_COUNT } from '../lib/deep-learn-quiz'
import type { DeepLearnNote } from '../lib/types'

test('deep learn quiz builder preserves exact terms and produces quiz-ready coverage', () => {
  const note = createNote()
  const items = buildDeepLearnQuizItems(note)

  assert.ok(items.length >= MIN_DEEP_LEARN_QUIZ_ITEM_COUNT)
  assert.equal(items[0]?.answer, 'Negligence')
  assert.match(items[0]?.prompt ?? '', /exact term/i)
  assert.equal(isDeepLearnQuizReady(note), true)
  assert.equal(computeDeepLearnQuizReady({
    coreTerms: note.coreTerms,
    keyFacts: note.keyFacts,
    distinctions: note.distinctions,
    likelyQuizPoints: note.likelyQuizPoints,
  }), true)
})

test('thin notes stay below the quiz-ready threshold', () => {
  const note = createNote({
    coreTerms: [
      {
        term: 'Jurisdiction',
        explanation: 'The authority of a court to hear and decide a case.',
        importance: 'high',
        preserveExactTerm: true,
      },
    ],
    keyFacts: ['Jurisdiction determines whether the court may act.'],
    distinctions: [],
    likelyQuizPoints: [],
  })

  assert.ok(buildDeepLearnQuizItems(note).length < MIN_DEEP_LEARN_QUIZ_ITEM_COUNT)
  assert.equal(isDeepLearnQuizReady(note), false)
  assert.equal(computeDeepLearnQuizReady({
    coreTerms: note.coreTerms,
    keyFacts: note.keyFacts,
    distinctions: note.distinctions,
    likelyQuizPoints: note.likelyQuizPoints,
  }), false)
})

function createNote(overrides: Partial<DeepLearnNote> = {}): DeepLearnNote {
  return {
    id: 'note-1',
    userId: 'user-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    resourceId: 'resource-1',
    status: 'ready',
    title: 'Tort law Deep Learn note',
    overview: 'Covers exact tort terms, the major distinctions, and facts likely to appear on an exam.',
    sections: [
      {
        heading: 'Core doctrine',
        body: 'Negligence, strict liability, and duty of care are preserved exactly because exam wording depends on them.',
      },
    ],
    noteBody: 'Core doctrine\nNegligence, strict liability, and duty of care are preserved exactly because exam wording depends on them.',
    coreTerms: [
      {
        term: 'Negligence',
        explanation: 'Failure to exercise the standard of care that a reasonably prudent person would use in similar circumstances.',
        importance: 'high',
        preserveExactTerm: true,
      },
      {
        term: 'Strict Liability',
        explanation: 'Liability that attaches without proving negligence when the rule treats the activity or product as enough.',
        importance: 'high',
        preserveExactTerm: true,
      },
      {
        term: 'Duty of Care',
        explanation: 'The legal obligation to conform to a standard of conduct for the protection of others against unreasonable risks.',
        importance: 'medium',
        preserveExactTerm: true,
      },
    ],
    keyFacts: [
      'Negligence usually requires duty, breach, causation, and damages.',
      'Strict liability does not require proof that the defendant failed to exercise reasonable care.',
    ],
    distinctions: [
      {
        conceptA: 'Negligence',
        conceptB: 'Strict Liability',
        difference: 'Negligence turns on unreasonable conduct, while strict liability can attach even when reasonable care was used.',
      },
    ],
    likelyQuizPoints: [
      'Be ready to explain why strict liability can apply without proving breach.',
    ],
    cautionNotes: [],
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 1800,
    },
    quizReady: true,
    promptVersion: 'v1',
    errorMessage: null,
    createdAt: '2026-04-12T00:00:00.000Z',
    updatedAt: '2026-04-12T00:00:00.000Z',
    generatedAt: '2026-04-12T00:00:00.000Z',
    ...overrides,
  }
}
