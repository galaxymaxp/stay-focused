import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildDeepLearnNoteRecord } from '../lib/deep-learn'
import { buildDeepLearnSheetContent, getDeepLearnSheetReadiness } from '../lib/study-outputs/sheets'
import type { DeepLearnNote, StudyOutput } from '../lib/types'
import { StudyOutputSheetPage } from '../components/StudyOutputSheetPage'

test('study sheet generation builds compact grounded sections', () => {
  const note = createNote()

  const sheet = buildDeepLearnSheetContent(note, 'study_sheet')

  assert.equal(sheet.version, 'study-sheet-v1')
  assert.equal(sheet.mode, 'study_sheet')
  assert.ok(sheet.keyTerms.length > 0)
  assert.ok(sheet.highYieldFacts.length > 0)
  assert.ok(sheet.confusingConcepts.length > 0)
  assert.ok(sheet.likelyExamTraps.length > 0)
  assert.match(sheet.summary, /printable/i)
  assert.equal(sheet.supplementalSectionTitle, null)
})

test('cram sheet generation stays tighter than study sheet', () => {
  const note = createNote()

  const studySheet = buildDeepLearnSheetContent(note, 'study_sheet')
  const cramSheet = buildDeepLearnSheetContent(note, 'cram_sheet')

  assert.equal(cramSheet.mode, 'cram_sheet')
  assert.ok(cramSheet.keyTerms.length <= studySheet.keyTerms.length)
  assert.ok(cramSheet.highYieldFacts.length <= studySheet.highYieldFacts.length)
  assert.ok(cramSheet.likelyExamTraps.length <= studySheet.likelyExamTraps.length)
  assert.match(cramSheet.summary, /cram sheet/i)
})

test('pending and failed Deep Learn packs are blocked from sheet generation', () => {
  const pending = getDeepLearnSheetReadiness(createNote({ status: 'pending' }), 'study_sheet')
  const failed = getDeepLearnSheetReadiness(createNote({ status: 'failed' }), 'cram_sheet')

  assert.equal(pending.ok, false)
  assert.equal(pending.reason, 'pending')
  assert.equal(failed.ok, false)
  assert.equal(failed.reason, 'failed')
})

test('metadata-only source grounding is rejected before sheet generation', () => {
  const blocked = getDeepLearnSheetReadiness(createNote({
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'metadata_only',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: 'Only file labels were stored.',
      warning: null,
      charCount: 92,
    },
  }), 'cram_sheet')

  assert.equal(blocked.ok, false)
  assert.equal(blocked.reason, 'metadata_only')
})

test('sheet output rendering keeps printable and mobile-friendly structure', () => {
  const content = buildDeepLearnSheetContent(createNote(), 'cram_sheet')
  const output: StudyOutput = {
    id: 'output-1',
    userId: 'user-1',
    courseId: 'course-1',
    moduleId: 'module-1',
    resourceId: 'resource-1',
    sourceKind: 'deep_learn_note',
    sourceNoteId: 'note-1',
    sourceTaskId: null,
    outputKind: 'cram_sheet',
    status: 'ready',
    title: content.title,
    summary: content.summary,
    content,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    generatedAt: '2026-05-09T00:00:00.000Z',
  }

  const markup = renderToStaticMarkup(createElement(StudyOutputSheetPage, {
    output,
    courseLabel: 'Physics',
    moduleTitle: 'Unit 3',
  }))

  assert.match(markup, /reviewer-print-hide/)
  assert.match(markup, /reviewer-print-only/)
  assert.match(markup, /study-sheet-grid/)
  assert.match(markup, /study-sheet-term-grid/)
  assert.match(markup, /cram-sheet-shell/)
})

test('sheet outputs do not leak metadata or debug labels', () => {
  const sheet = buildDeepLearnSheetContent(createNote(), 'study_sheet')
  const joined = JSON.stringify(sheet).toLowerCase()

  assert.equal(joined.includes('debug'), false)
  assert.equal(joined.includes('metadata only'), false)
  assert.equal(joined.includes('file id'), false)
  assert.equal(joined.includes('uuid'), false)
})

test('definition-style security content is not misclassified as formulas', () => {
  const sheet = buildDeepLearnSheetContent(createNote({
    title: 'IT Security exam prep pack',
    overview: 'Definitions, attacker types, malware symptoms, and security domains.',
    sections: [
      {
        heading: 'Definitions',
        body: [
          'InfoSec = processes and tools to protect sensitive business info.',
          'Vulnerability = flaw or weakness in hardware/software.',
          'Breach = a successful exploit of a vulnerability.',
          'Increase in CPU usage; decrease in speed; crashes are common malware symptoms.',
        ].join(' '),
      },
    ],
    noteBody: '',
    answerBank: [
      {
        cue: 'InfoSec',
        kind: 'term_definition',
        answer: { exact: 'InfoSec = processes and tools to protect sensitive business information.', examSafe: 'Processes and tools used to protect sensitive business information.', simplified: null },
        compactAnswer: { exact: 'InfoSec = processes and tools to protect sensitive business information.', examSafe: 'Protects sensitive business information.', simplified: null },
        importance: 'high',
        sortKey: null,
        distractors: [],
        supportingContext: 'InfoSec = processes and tools to protect sensitive business information.',
      },
      {
        cue: 'Vulnerability',
        kind: 'term_definition',
        answer: { exact: 'Vulnerability = flaw or weakness in hardware/software.', examSafe: 'A flaw or weakness in hardware or software.', simplified: null },
        compactAnswer: { exact: 'Vulnerability = flaw or weakness in hardware/software.', examSafe: 'A flaw or weakness in hardware or software.', simplified: null },
        importance: 'high',
        sortKey: null,
        distractors: [],
      },
    ],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [],
    cautionNotes: [],
  }), 'study_sheet')

  assert.equal(sheet.formulas.length, 0)
  assert.equal(sheet.supplementalSectionTitle, 'Key definitions')
  assert.ok(sheet.supplementalSectionItems.some((item) => /InfoSec/i.test(item.cue)))
  assert.doesNotMatch(sheet.summary, /\b0 formulas\b|\b\d+ formulas\b/i)
})

test('sheet formulas preserve readable expressions when real formulas exist', () => {
  const sheet = buildDeepLearnSheetContent(createNote(), 'study_sheet')

  assert.ok(sheet.formulas.some((item) => /density = mass \/ volume/i.test(item.expression)))
  assert.doesNotMatch(JSON.stringify(sheet.formulas), /4\/3sin\^2/i)
})

function createNote(overrides: Partial<DeepLearnNote> = {}): DeepLearnNote {
  return buildDeepLearnNoteRecord({
    id: 'note-1',
    userId: 'user-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    resourceId: 'resource-1',
    status: 'ready',
    title: 'Physics exam prep pack',
    overview: 'Focus on the compact formulas, quick definitions, and traps that usually cost points.',
    sections: [
      {
        heading: 'Core equations',
        body: 'Density = mass / volume. Acceleration = change in velocity / time. Resistive errors usually come from mixing scalar and vector quantities.',
      },
      {
        heading: 'High-yield reminders',
        body: 'Momentum is mass times velocity. Weight is force due to gravity, not the same as mass.',
      },
    ],
    noteBody: '',
    answerBank: [
      {
        cue: 'Density',
        kind: 'fact',
        answer: { exact: 'density = mass / volume', examSafe: 'Density equals mass divided by volume.', simplified: 'Mass divided by volume.' },
        compactAnswer: { exact: 'density = mass / volume', examSafe: 'Mass divided by volume.', simplified: null },
        importance: 'high',
        sortKey: null,
        distractors: [],
        reviewText: 'density = mass / volume',
        draftExplanation: 'Use this when converting between size, mass, and matter packed into a space.',
        sourceSnippet: null,
        linkedDraftSectionId: 'core-equations',
        supportingContext: 'Density = mass / volume.',
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
      {
        cue: 'Momentum',
        kind: 'fact',
        answer: { exact: null, examSafe: 'Momentum is the product of mass and velocity.', simplified: 'Mass times velocity.' },
        compactAnswer: { exact: null, examSafe: 'Mass times velocity.', simplified: null },
        importance: 'high',
        sortKey: null,
        distractors: [],
        reviewText: 'Momentum is mass times velocity.',
        draftExplanation: 'Questions often test whether you remember the vector direction of momentum.',
        sourceSnippet: null,
        linkedDraftSectionId: 'high-yield-reminders',
        supportingContext: 'Momentum = mass x velocity.',
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    identificationItems: [
      {
        prompt: 'Mass divided by volume',
        kind: 'fact',
        answer: { exact: null, examSafe: 'Density', simplified: null },
        importance: 'high',
        distractors: [],
        reviewText: 'Density',
        draftExplanation: 'This is a direct formula recall item.',
        sourceSnippet: null,
        linkedDraftSectionId: 'core-equations',
        supportingContext: 'Density = mass / volume.',
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    distinctions: [
      {
        conceptA: 'Mass',
        conceptB: 'Weight',
        difference: 'Mass measures the amount of matter, while weight is the gravitational force acting on that mass.',
        confusionNote: 'Students lose points when they treat mass and weight as interchangeable.',
        reviewText: 'Mass vs weight',
        draftExplanation: null,
        sourceSnippet: null,
        linkedDraftSectionId: 'high-yield-reminders',
        supportingContext: null,
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    likelyQuizTargets: [
      {
        target: 'Density conversions',
        reason: 'Exams often test whether the formula is rearranged correctly before plugging values in.',
        importance: 'high',
        reviewText: 'Density conversions',
        draftExplanation: null,
        sourceSnippet: null,
        linkedDraftSectionId: 'core-equations',
        supportingContext: null,
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
    cautionNotes: ['Do not confuse weight with mass when the problem changes planets or gravity.'],
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 1800,
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
