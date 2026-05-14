import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDeepLearnNoteRecord } from '../lib/deep-learn'
import { buildDeepLearnReviewerContent, getDeepLearnReviewerReadiness } from '../lib/study-outputs/reviewer'
import type { DeepLearnNote } from '../lib/types'

test('ready Deep Learn pack can build a reviewer output', () => {
  const note = createNote()

  const reviewer = buildDeepLearnReviewerContent(note)

  assert.equal(reviewer.version, 'reviewer-v1')
  assert.equal(reviewer.sourceNoteId, note.id)
  assert.equal(reviewer.title, note.title)
  assert.ok(reviewer.highYieldConcepts.length > 0)
  assert.ok(reviewer.identificationReview.length > 0)
  assert.ok(reviewer.quickReviewBlocks.length > 0)
  assert.ok(reviewer.likelyQuizTargets.length > 0)
})

test('pending and failed Deep Learn packs are blocked from reviewer generation', () => {
  const pending = getDeepLearnReviewerReadiness(createNote({ status: 'pending' }))
  const failed = getDeepLearnReviewerReadiness(createNote({ status: 'failed' }))

  assert.equal(pending.ok, false)
  assert.equal(pending.reason, 'pending')
  assert.equal(failed.ok, false)
  assert.equal(failed.reason, 'failed')
})

test('metadata-only grounded Deep Learn packs are rejected', () => {
  const blocked = getDeepLearnReviewerReadiness(createNote({
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'metadata_only',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: 'Only metadata was stored.',
      warning: null,
      charCount: 88,
    },
  }))

  assert.equal(blocked.ok, false)
  assert.equal(blocked.reason, 'metadata_only')
})

test('reviewer structure stays exam-oriented and limited', () => {
  const reviewer = buildDeepLearnReviewerContent(createNote())

  assert.match(reviewer.summary, /Study Pack/i)
  assert.equal(reviewer.quickReviewBlocks[0]?.heading, 'Core doctrines')
  assert.ok(reviewer.quickReviewBlocks.every((block) => block.points.length > 0 && block.points.length <= 4))
  assert.ok(reviewer.highYieldConcepts.length + reviewer.identificationReview.length <= 16)
  assert.ok(reviewer.highYieldConcepts[0]?.cue)
  assert.ok(reviewer.identificationReview[0]?.prompt)
})

test('reviewer uses source wording as memorize layer and normalizes raw labels', () => {
  const reviewer = buildDeepLearnReviewerContent(createNote({
    sections: [
      {
        heading: 'cybersecurity-definitions',
        body: 'Vulnerability means weaknesses or flaws in the hardware or software.',
      },
    ],
    answerBank: [
      {
        cue: 'Vulnerability -> definition',
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
        distractors: [],
        supportingContext: 'A vulnerability is the weakness that an exploit can target.',
      },
    ],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [],
    cautionNotes: [],
  }))

  assert.equal(reviewer.highYieldConcepts[0]?.cue, 'Vulnerability')
  assert.equal(reviewer.highYieldConcepts[0]?.sourceWording, 'Weaknesses or flaws in the hardware or software.')
  assert.match(reviewer.highYieldConcepts[0]?.plainExplanation ?? '', /exploit can target/i)
  assert.equal(reviewer.quickReviewBlocks[0]?.heading, 'Cybersecurity Definitions')
  assert.doesNotMatch(JSON.stringify(reviewer), /-> definition|cybersecurity-definitions/i)
})

function createNote(overrides: Partial<DeepLearnNote> = {}): DeepLearnNote {
  return buildDeepLearnNoteRecord({
    id: 'note-1',
    userId: 'user-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    resourceId: 'resource-1',
    status: 'ready',
    title: 'Civil procedure exam prep pack',
    overview: 'Focus on the high-yield doctrines, direct recall items, and confusable distinctions.',
    sections: [
      {
        heading: 'Core doctrines',
        body: 'Subject matter jurisdiction controls whether the court can hear the case. Personal jurisdiction controls whether the defendant can be bound. Venue controls where the case should proceed.',
      },
      {
        heading: 'Fast recall',
        body: 'Diversity jurisdiction needs complete diversity and the amount-in-controversy threshold. Supplemental jurisdiction can cover related state claims when the anchor claim is valid.',
      },
    ],
    noteBody: '',
    answerBank: [
      {
        cue: 'Subject matter jurisdiction',
        kind: 'term_definition',
        answer: { exact: null, examSafe: 'The court’s authority to hear the type of case.', simplified: null },
        compactAnswer: { exact: null, examSafe: 'Authority to hear the case type.', simplified: null },
        importance: 'high',
        sortKey: null,
        distractors: [],
        reviewText: 'Authority to hear the case type.',
        draftExplanation: 'This doctrine answers whether the forum has power over the claim category.',
        sourceSnippet: null,
        linkedDraftSectionId: 'core-doctrines',
        supportingContext: 'Distinguish court power from party-based jurisdiction.',
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
      {
        cue: 'Venue',
        kind: 'term_definition',
        answer: { exact: null, examSafe: 'The proper geographic place for the lawsuit.', simplified: null },
        compactAnswer: { exact: null, examSafe: 'Proper place for the lawsuit.', simplified: null },
        importance: 'medium',
        sortKey: null,
        distractors: [],
        reviewText: 'Proper place for the lawsuit.',
        draftExplanation: 'Venue asks where the case should be litigated once jurisdiction exists.',
        sourceSnippet: null,
        linkedDraftSectionId: 'core-doctrines',
        supportingContext: 'Do not confuse venue with subject matter jurisdiction.',
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    identificationItems: [
      {
        prompt: 'Authority to hear the case type',
        kind: 'term_definition',
        answer: { exact: null, examSafe: 'Subject matter jurisdiction', simplified: null },
        importance: 'high',
        distractors: [],
        reviewText: 'Subject matter jurisdiction',
        draftExplanation: 'The court must have power over the category of claim before anything else matters.',
        sourceSnippet: null,
        linkedDraftSectionId: 'core-doctrines',
        supportingContext: 'Power over the claim category.',
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    distinctions: [
      {
        conceptA: 'Subject matter jurisdiction',
        conceptB: 'Venue',
        difference: 'Subject matter jurisdiction asks whether the court can hear the claim type, while venue asks which geographic forum is proper.',
        confusionNote: 'Students often treat venue defects as if they destroy court power.',
        reviewText: 'Court power vs proper place.',
        draftExplanation: null,
        sourceSnippet: null,
        linkedDraftSectionId: 'core-doctrines',
        supportingContext: null,
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    likelyQuizTargets: [
      {
        target: 'Complete diversity',
        reason: 'This is a standard exam trigger for diversity jurisdiction questions.',
        importance: 'high',
        reviewText: 'Complete diversity',
        draftExplanation: null,
        sourceSnippet: null,
        linkedDraftSectionId: 'fast-recall',
        supportingContext: null,
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    cautionNotes: ['Check whether the question is asking about court power, party power, or forum location.'],
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 1450,
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
