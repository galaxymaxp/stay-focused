import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDeepLearnNoteRecord } from '../lib/deep-learn'
import { buildDeepLearnQuizPackContent, buildQuizPackItems, getDeepLearnQuizPackReadiness } from '../lib/study-outputs/quiz-pack'
import type { DeepLearnNote, DeepLearnWordingSet } from '../lib/types'

test('quiz pack generation builds deterministic mixed question types from a ready Deep Learn pack', () => {
  const note = createNote()

  const first = buildDeepLearnQuizPackContent(note)
  const second = buildDeepLearnQuizPackContent(note)

  assert.equal(first.version, 'quiz-pack-v1')
  assert.deepEqual(first.items, second.items)
  assert.ok(first.items.some((item) => item.type === 'multiple_choice'))
  assert.ok(first.items.some((item) => item.type === 'identification'))
  assert.ok(first.items.some((item) => item.type === 'matching'))
  assert.ok(first.items.some((item) => item.type === 'true_false'))
  assert.ok(first.questionCountOptions.length > 0)
  assert.ok(first.items.length <= 15)
  assert.doesNotMatch(first.title, /Quiz Pack/)
})

test('blocked pending and failed notes cannot make quiz packs', () => {
  const pending = getDeepLearnQuizPackReadiness(createNote({ status: 'pending' }))
  const failed = getDeepLearnQuizPackReadiness(createNote({ status: 'failed' }))

  assert.equal(pending.ok, false)
  assert.equal(pending.reason, 'pending')
  assert.equal(failed.ok, false)
  assert.equal(failed.reason, 'failed')
})

test('quiz pack builder keeps distractor generation deterministic and grounded', () => {
  const items = buildQuizPackItems(createNote())
  const mcq = items.find((item) => item.type === 'multiple_choice')

  assert.ok(mcq)
  assert.deepEqual(mcq?.choices, [...(mcq?.choices ?? [])].sort((left, right) => left.localeCompare(right)))
  assert.ok((mcq?.choices ?? []).includes(mcq?.answer ?? ''))
})

test('metadata-only source grounding is rejected before quiz pack generation', () => {
  const blocked = getDeepLearnQuizPackReadiness(createNote({
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'metadata_only',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: 'Only metadata was stored.',
      warning: null,
      charCount: 72,
    },
  }))

  assert.equal(blocked.ok, false)
  assert.equal(blocked.reason, 'metadata_only')
})

test('quiz pack items do not leak debug or metadata labels', () => {
  const items = buildQuizPackItems(createNote())
  const combined = items.map((item) => `${item.prompt} ${item.answer} ${item.explanation}`).join(' ')

  assert.doesNotMatch(combined, /\bfile title\b/i)
  assert.doesNotMatch(combined, /\bgrounding strategy used\b/i)
  assert.doesNotMatch(combined, /\bsource type of the file\b/i)
  assert.doesNotMatch(combined, /\banswer-ready fact\b|\bcompact answer unit\b|\bpreserved for direct recall\b/i)
})

test('quiz pack definition answers preserve source wording and source basis', () => {
  const items = buildQuizPackItems(createNote({
    answerBank: [
      {
        cue: 'Vulnerability',
        kind: 'term_definition',
        answer: {
          exact: 'Weaknesses or flaws in the hardware or software.',
          examSafe: 'A vulnerability is a weakness that an exploit can target.',
          simplified: 'A weakness attackers can use.',
        },
        compactAnswer: {
          exact: 'Weaknesses or flaws in the hardware or software.',
          examSafe: 'A weakness that an exploit can target.',
          simplified: 'A weakness attackers can use.',
        },
        importance: 'high',
        sortKey: null,
        distractors: [
          'A successful exploit.',
          'A set of cyber security strategies.',
          'A malware symptom.',
        ],
        sourceSnippet: 'Weaknesses or flaws in the hardware or software.',
      },
      ...createNote().answerBank,
    ],
  }))

  const definition = items.find((item) => item.prompt === 'Define Vulnerability.')

  assert.ok(definition)
  assert.equal(definition?.answer, 'Weaknesses or flaws in the hardware or software.')
  assert.equal(definition?.sourceWording, 'Weaknesses or flaws in the hardware or software.')
  assert.match(definition?.explanation ?? '', /Source wording/)
})

function createNote(overrides: Partial<DeepLearnNote> = {}): DeepLearnNote {
  return buildDeepLearnNoteRecord({
    id: 'note-quiz-1',
    userId: 'user-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    resourceId: 'resource-1',
    status: 'ready',
    title: 'Constitutional law exam prep pack',
    overview: 'Focus on compact doctrine recall, distinctions, and likely exam triggers.',
    sections: [
      {
        heading: 'Judicial review',
        body: 'Judicial review allows courts to evaluate whether government acts comply with the constitution. It is commonly linked to Marbury v. Madison in exam settings.',
      },
    ],
    noteBody: '',
    answerBank: [
      {
        cue: 'Judicial review',
        kind: 'term_definition',
        answer: wording('The power of courts to review government acts for constitutional compliance.'),
        compactAnswer: wording('Court power to review acts for constitutional compliance.'),
        importance: 'high',
        sortKey: null,
        distractors: [
          'The power of the executive to ignore the courts.',
          'The process of amending the constitution.',
          'A legislative vote to override a veto.',
        ],
        reviewText: 'Court power to review acts for constitutional compliance.',
        draftExplanation: 'This doctrine is a standard exam definition and usually anchors foundational constitutional questions.',
        sourceSnippet: null,
        linkedDraftSectionId: 'judicial-review',
        supportingContext: 'Keep court review distinct from legislative or executive power.',
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
      {
        cue: 'Marbury v. Madison',
        kind: 'date_event',
        answer: wording('Established judicial review as a foundational constitutional doctrine.'),
        compactAnswer: wording('Established judicial review.'),
        importance: 'high',
        sortKey: '1803-01-01',
        distractors: [
          'Created the modern equal protection test.',
          'Authorized executive suspension of judicial orders.',
          'Abolished the power of judicial interpretation.',
        ],
        reviewText: 'Established judicial review.',
        draftExplanation: 'This case is often asked as the source or anchor of judicial review.',
        sourceSnippet: null,
        linkedDraftSectionId: 'judicial-review',
        supportingContext: 'Tie the doctrine to its canonical case anchor.',
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    identificationItems: [
      {
        prompt: 'The power of courts to review government acts for constitutional compliance',
        kind: 'term_definition',
        answer: wording('Judicial review'),
        importance: 'high',
        distractors: ['Bicameralism', 'Executive privilege', 'Federalism'],
        reviewText: 'Judicial review',
        draftExplanation: 'Direct recall of the doctrine name is common.',
        sourceSnippet: null,
        linkedDraftSectionId: 'judicial-review',
        supportingContext: 'Doctrine-name recall.',
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    distinctions: [
      {
        conceptA: 'Judicial review',
        conceptB: 'Executive power',
        difference: 'Judicial review is court evaluation of constitutional compliance, while executive power is the authority to enforce and administer the law.',
        confusionNote: 'Do not confuse constitutional review with law enforcement or administration.',
        reviewText: 'Court review vs executive enforcement.',
        draftExplanation: null,
        sourceSnippet: null,
        linkedDraftSectionId: 'judicial-review',
        supportingContext: null,
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    likelyQuizTargets: [
      {
        target: 'Marbury v. Madison established judicial review',
        reason: 'This is an explicit foundational exam target and direct recall item.',
        importance: 'high',
        reviewText: 'Marbury v. Madison established judicial review',
        draftExplanation: null,
        sourceSnippet: null,
        linkedDraftSectionId: 'judicial-review',
        supportingContext: null,
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    cautionNotes: [],
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 1680,
    },
    quizReady: true,
    promptVersion: 'v2-exam-prep',
    errorMessage: null,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    generatedAt: '2026-05-09T00:00:00.000Z',
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
