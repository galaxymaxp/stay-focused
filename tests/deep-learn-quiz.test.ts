import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDeepLearnNoteRecord, computeDeepLearnQuizReady } from '../lib/deep-learn'
import { buildDeepLearnQuizItems, isDeepLearnQuizReady, MIN_DEEP_LEARN_QUIZ_ITEM_COUNT } from '../lib/deep-learn-quiz'
import type { DeepLearnNote, DeepLearnWordingSet } from '../lib/types'

test('deep learn quiz builder turns answer-first packs into quiz-ready coverage', () => {
  const note = createNote()
  const items = buildDeepLearnQuizItems(note)

  assert.ok(items.length >= MIN_DEEP_LEARN_QUIZ_ITEM_COUNT)
  assert.ok(items.some((item) => item.answer === 'Failure to exercise reasonable care.'))
  assert.ok(items.some((item) => /Negligence/i.test(item.prompt)))
  assert.equal(isDeepLearnQuizReady(note), true)
  assert.equal(computeDeepLearnQuizReady({
    answerBank: note.answerBank,
    identificationItems: note.identificationItems,
    distinctions: note.distinctions,
    likelyQuizTargets: note.likelyQuizTargets,
  }), true)
})

test('thin packs stay below the quiz-ready threshold', () => {
  const note = createNote({
    answerBank: [
      {
        cue: 'Jurisdiction',
        kind: 'fact',
        answer: wording('The authority of a court to hear and decide a case.'),
        compactAnswer: wording('The authority of a court to hear and decide a case.'),
        importance: 'high',
        sortKey: null,
        distractors: ['A rule for filing taxes.'],
      },
    ],
    identificationItems: [
      {
        prompt: 'Jurisdiction',
        kind: 'fact',
        answer: wording('The authority of a court to hear and decide a case.'),
        importance: 'high',
        distractors: ['A rule for filing taxes.'],
      },
    ],
    distinctions: [],
    likelyQuizTargets: [],
  })

  assert.ok(buildDeepLearnQuizItems(note).length < MIN_DEEP_LEARN_QUIZ_ITEM_COUNT)
  assert.equal(isDeepLearnQuizReady(note), false)
  assert.equal(computeDeepLearnQuizReady({
    answerBank: note.answerBank,
    identificationItems: note.identificationItems,
    distinctions: note.distinctions,
    likelyQuizTargets: note.likelyQuizTargets,
  }), false)
})

function createNote(overrides: Partial<DeepLearnNote> = {}): DeepLearnNote {
  return buildDeepLearnNoteRecord({
    id: 'note-1',
    userId: 'user-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    resourceId: 'resource-1',
    status: 'ready',
    title: 'Tort Law Exam Prep Pack',
    overview: 'Covers answer-ready tort terms, distinctions, and likely quiz targets.',
    sections: [
      {
        heading: 'Support note',
        body: 'Negligence, strict liability, duty, and breach stay compact here because the goal is recall, not a mini textbook.',
      },
    ],
    noteBody: 'Support note\nNegligence, strict liability, duty, and breach stay compact here because the goal is recall, not a mini textbook.',
    answerBank: [
      {
        cue: 'Negligence',
        kind: 'term_definition',
        answer: wording('Failure to exercise reasonable care.'),
        compactAnswer: wording('Failure to exercise reasonable care.'),
        importance: 'high',
        sortKey: null,
        distractors: [
          'Liability without proving fault.',
          'Intentional harmful or offensive contact.',
          'The legal obligation to act for another person.',
        ],
      },
      {
        cue: 'Strict liability',
        kind: 'term_definition',
        answer: wording('Liability that can attach without proving negligence.'),
        compactAnswer: wording('Liability without proving negligence.'),
        importance: 'high',
        sortKey: null,
        distractors: [
          'Failure to exercise reasonable care.',
          'A duty to warn every potential plaintiff.',
          'The breach element in negligence.',
        ],
      },
      {
        cue: 'Duty of care',
        kind: 'term_definition',
        answer: wording('A legal obligation to conform to a standard of reasonable care.'),
        compactAnswer: wording('A legal obligation to use reasonable care.'),
        importance: 'high',
        sortKey: null,
        distractors: [
          'Automatic liability for dangerous activity.',
          'A defense that bars all recovery.',
          'The damages element only.',
        ],
      },
      {
        cue: 'Breach',
        kind: 'term_definition',
        answer: wording('Failure to meet the required standard of care.'),
        compactAnswer: wording('Failure to meet the required standard of care.'),
        importance: 'medium',
        sortKey: null,
        distractors: [
          'The injury suffered by the plaintiff.',
          'The court’s authority to hear the case.',
          'Automatic liability without fault.',
        ],
      },
    ],
    identificationItems: [
      {
        prompt: 'Which tort concept means failure to exercise reasonable care?',
        kind: 'term_definition',
        answer: wording('Negligence'),
        importance: 'high',
        distractors: ['Strict liability', 'Duty of care', 'Breach'],
      },
      {
        prompt: 'Which concept can apply without proving negligence?',
        kind: 'term_definition',
        answer: wording('Strict liability'),
        importance: 'high',
        distractors: ['Negligence', 'Duty of care', 'Battery'],
      },
      {
        prompt: 'Which concept refers to the legal obligation to use reasonable care?',
        kind: 'term_definition',
        answer: wording('Duty of care'),
        importance: 'medium',
        distractors: ['Damages', 'Breach', 'Causation'],
      },
    ],
    distinctions: [
      {
        conceptA: 'Negligence',
        conceptB: 'Strict liability',
        difference: 'Negligence turns on unreasonable conduct, while strict liability can attach even if reasonable care was used.',
        confusionNote: 'Do not confuse failure to use care with liability that attaches without proving fault.',
      },
    ],
    likelyQuizTargets: [
      {
        target: 'Negligence vs strict liability',
        reason: 'This pair is a common compare-and-distinguish exam target.',
        importance: 'high',
      },
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
    promptVersion: 'v2-exam-prep',
    errorMessage: null,
    createdAt: '2026-04-12T00:00:00.000Z',
    updatedAt: '2026-04-12T00:00:00.000Z',
    generatedAt: '2026-04-12T00:00:00.000Z',
    ...overrides,
  })
}

function wording(examSafe: string): DeepLearnWordingSet {
  return {
    exact: null,
    examSafe,
    simplified: null,
  }
}
