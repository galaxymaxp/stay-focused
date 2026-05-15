import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDeepLearnNoteRecord } from '../lib/deep-learn'
import { buildAcademicSourceMap } from '../lib/deep-learn-source-map'
import {
  buildDeepLearnQuizPackContent,
  buildNormalizedQuizSourceUnits,
  buildQuizPackItems,
  getDeepLearnQuizPackReadiness,
} from '../lib/study-outputs/quiz-pack'
import type { DeepLearnNote, DeepLearnWordingSet } from '../lib/types'

test('quiz pack generation builds deterministic Source Map MCQ true/false and identification items', () => {
  const note = createItSecuritySourceMapNote()

  const first = buildDeepLearnQuizPackContent(note)
  const second = buildDeepLearnQuizPackContent(note)

  assert.equal(first.version, 'quiz-pack-v1')
  assert.deepEqual(first.items, second.items)
  assert.ok(first.items.some((item) => item.type === 'multiple_choice'))
  assert.ok(first.items.some((item) => item.type === 'true_false'))
  assert.ok(first.items.some((item) => item.type === 'identification'))
  assert.ok(first.items.every((item) => item.type === 'multiple_choice' || item.type === 'true_false' || item.type === 'identification'))
  assert.ok(first.items.every((item) => item.sourceUnitId && item.sourceExcerpt && item.confidence && item.generationMethod))
  assert.ok(first.questionCountOptions.length > 0)
  assert.ok(first.items.length >= 20)
  assert.ok(first.items.length <= 48)
  assert.doesNotMatch(first.title, /Quiz Pack/)
  assert.doesNotMatch(JSON.stringify(first.items), /according to the source|metadata|debug|ocr garbage|Source Notes|other threats InfoSec|"prompt":"[^"]*Understand The|"prompt":"[^"]*Insiders Employees And Ex/i)
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
  const items = buildQuizPackItems(createItSecuritySourceMapNote())
  const mcq = items.find((item) => item.type === 'multiple_choice')

  assert.ok(mcq)
  assert.deepEqual(mcq?.choices, [...(mcq?.choices ?? [])].sort((left, right) => left.localeCompare(right)))
  assert.ok((mcq?.choices ?? []).includes(mcq?.answer ?? ''))
  assert.equal(new Set(mcq?.choices.map(normalizeLookup)).size, mcq?.choices.length)
  assert.equal((mcq?.choices ?? []).filter((choice) => normalizeLookup(choice) === normalizeLookup(mcq?.answer ?? '')).length, 1)
})

test('Source Map MCQs include reviewer-shaped term-definition prompts', () => {
  const items = buildQuizPackItems(createItSecuritySourceMapNote())
  const mcqs = items.filter((item) => item.type === 'multiple_choice')
  const prompts = mcqs.map((item) => item.prompt)

  assert.ok(prompts.some((prompt) => /^Which (?:statement best defines|definition matches) IT Security\?/.test(prompt)))
  assert.ok(prompts.some((prompt) => /^Which (?:statement best defines|definition matches) Cybersecurity\?/.test(prompt)))
  assert.ok(prompts.some((prompt) => prompt === 'Which description best matches InfoSec?'))

  const itSecurity = mcqs.find((item) => /IT Security/.test(item.prompt) && !/domains/i.test(item.prompt))
  assert.ok(itSecurity)
  assert.notEqual(normalizeLookup(itSecurity.answer), normalizeLookup('IT Security'))
  assert.match(itSecurity.answer, /cyber security strategies|unauthorized access|organizational assets/i)
  assert.match(itSecurity.explanation, /Correct because the source defines IT Security as/i)
})

test('Source Map MCQs ask safe category and list membership questions', () => {
  const mcqs = buildQuizPackItems(createItSecuritySourceMapNote()).filter((item) => item.type === 'multiple_choice')

  const cia = findMcq(mcqs, /Which item belongs to the CIA Triad\?/)
  assert.equal(cia.answer, 'Confidentiality')
  assert.equal(countChoicesInGroup(cia, ['Confidentiality', 'Integrity', 'Availability']), 1)

  const domains = findMcq(mcqs, /Which item belongs to the domains of IT Security\?/)
  assert.equal(domains.answer, 'Endpoint Security')
  assert.equal(countChoicesInGroup(domains, ['Network Security', 'Internet Security', 'Endpoint Security', 'Cloud Security', 'Application Security', 'Information Security', 'Operational Security', 'Mobile Security', 'IoT Security', 'User Education', 'Cyber Security']), 1)

  const malware = findMcq(mcqs, /Which item belongs to the malware types\?/)
  assert.equal(malware.answer, 'Ransomware')
  assert.equal(countChoicesInGroup(malware, ['Spyware', 'Adware', 'Bot', 'Rootkit', 'Scareware', 'Ransomware', 'Virus', 'Trojan Horse', 'Worm', 'MiTM']), 1)

  assert.ok(mcqs.some((item) => /Which item belongs to the symptoms of malware\?/.test(item.prompt)))
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
  const items = buildQuizPackItems(createItSecuritySourceMapNote())
  const combined = items.map((item) => `${item.prompt} ${item.answer} ${item.explanation}`).join(' ')

  assert.doesNotMatch(combined, /\bfile title\b/i)
  assert.doesNotMatch(combined, /\bgrounding strategy used\b/i)
  assert.doesNotMatch(combined, /\bsource type of the file\b/i)
  assert.doesNotMatch(combined, /\banswer-ready fact\b|\bcompact answer unit\b|\bpreserved for direct recall\b/i)
})

test('normalized quiz source units preserve complete Source Map lists', () => {
  const units = buildNormalizedQuizSourceUnits(createItSecuritySourceMapNote())
  const answerFor = (title: string) => {
    const unit = units.find((item) => item.title === title)
    assert.ok(unit, `missing ${title}`)
    return unit.normalizedAnswer
  }

  const domains = answerFor('Domains of IT Security')
  for (const item of ['Network Security', 'Internet Security', 'Endpoint Security', 'Cloud Security', 'Application Security', 'Information Security', 'Operational Security', 'Mobile Security', 'IoT Security', 'User Education', 'Cyber Security']) {
    assert.match(domains, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  const malware = answerFor('Malware Types')
  for (const item of ['Spyware', 'Adware', 'Bot', 'Rootkit', 'Scareware', 'Ransomware', 'Virus', 'Trojan Horse', 'Worm', 'MiTM']) {
    assert.match(malware, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('Source Map identification questions use direct course-like stems', () => {
  const items = buildQuizPackItems(createItSecuritySourceMapNote())
  const identification = items.filter((item) => item.type === 'identification')

  assert.ok(identification.length >= 5)
  assert.ok(identification.some((item) => /^Define\b/.test(item.prompt)))
  assert.ok(identification.some((item) => /^Identify\b/.test(item.prompt)))
  assert.ok(identification.some((item) => /^Enumerate the items under\b/.test(item.prompt)))
  assert.ok(identification.some((item) => /^Distinguish\b/.test(item.prompt)))
  assert.ok(identification.every((item) => !/according to the source|debug|metadata/i.test(item.prompt)))
})

test('Source Map MCQs prevent duplicate distractors and answer duplication', () => {
  const items = buildQuizPackItems(createItSecuritySourceMapNote())
  const mcqs = items.filter((item) => item.type === 'multiple_choice')

  assert.ok(mcqs.length >= 1)
  for (const item of mcqs) {
    const normalizedChoices = item.choices.map(normalizeLookup)
    assert.equal(new Set(normalizedChoices).size, item.choices.length)
    assert.equal(normalizedChoices.filter((choice) => choice === normalizeLookup(item.answer)).length, 1)
    assert.ok(item.choices.every((choice) => !/joke|none of the above|all of the above/i.test(choice)))
  }

  assert.equal(countChoicesInGroup(findMcq(mcqs, /CIA Triad/), ['Confidentiality', 'Integrity', 'Availability']), 1)
  assert.equal(countChoicesInGroup(findMcq(mcqs, /malware types/), ['Spyware', 'Adware', 'Bot', 'Rootkit', 'Scareware', 'Ransomware', 'Virus', 'Trojan Horse', 'Worm', 'MiTM']), 1)
})

test('Source Map quiz pack preserves exam density and true/false explanations', () => {
  const items = buildQuizPackItems(createItSecuritySourceMapNote())
  const types = new Set(items.map((item) => item.type))
  const prompts = items.map((item) => item.prompt)

  assert.ok(items.length >= 20)
  assert.ok(types.has('multiple_choice'))
  assert.ok(types.has('true_false'))
  assert.ok(types.has('identification'))
  assert.ok(prompts.some((prompt) => /Which item belongs to the CIA Triad/.test(prompt)))
  assert.ok(prompts.some((prompt) => /Enumerate the items under Domains of IT Security/.test(prompt)))
  assert.ok(items.some((item) => item.type === 'true_false' && /^Correct because\b/.test(item.explanation)))
  assert.doesNotMatch(JSON.stringify(items), /Source Notes|metadata|debug|\?\?\?\?|other threats InfoSec|"prompt":"[^"]*Understand The|"prompt":"[^"]*Insiders Employees And Ex/i)
})

test('Source Map MCQ explanations state exam reasons without debug wording', () => {
  const mcqs = buildQuizPackItems(createItSecuritySourceMapNote()).filter((item) => item.type === 'multiple_choice')

  assert.ok(mcqs.length >= 5)
  for (const item of mcqs) {
    assert.match(item.explanation, /^Correct because\b/)
    assert.doesNotMatch(item.explanation, /supported directly by the selected source/i)
    assert.doesNotMatch(item.explanation, /according to the source|debug|metadata|ocr/i)
  }

  const cia = findMcq(mcqs, /CIA Triad/)
  assert.match(cia.explanation, /Correct because Confidentiality belongs under CIA Triad\./)

  const malware = findMcq(mcqs, /malware types/)
  assert.match(malware.explanation, /Malware Types, not Malware Symptoms/)
})

test('Source Map quiz generation rejects weak OCR garbage units', () => {
  const sourceMap = buildAcademicSourceMap(IT_SECURITY_SOURCE)
  sourceMap.units.unshift({
    id: 'ocr-garbage',
    title: 'Sent to a host or application and the receiver',
    kind: 'concept',
    summary: 'OCR garbage 29384 ### receiver unable handle it',
    items: [],
    sourceQuotes: ['OCR garbage 29384 ### receiver unable handle it'],
    importanceScore: 100,
    confidence: 0.95,
  })
  const items = buildQuizPackItems(createItSecuritySourceMapNote({ sourceGrounding: { ...createItSecuritySourceMapNote().sourceGrounding, sourceMap } }))
  const combined = JSON.stringify(items)

  assert.doesNotMatch(combined, /Sent to a host|OCR garbage|29384|receiver unable/i)
})

test('weak Source Map blocks quiz generation instead of falling back to stale note arrays', () => {
  const note = createNote({
    sourceGrounding: {
      ...createNote().sourceGrounding,
      sourceTextQuality: 'meaningful',
      sourceMap: {
        version: 'academic-source-map-v1',
        normalizedText: 'file title: Intro to IT Security\nuuid: 123e4567-e89b-12d3-a456-426614174000',
        chunks: [],
        units: [{
          id: 'weak-source',
          title: 'File Title',
          kind: 'concept',
          summary: 'Intro to IT Security',
          items: [],
          sourceQuotes: [],
          importanceScore: 100,
          confidence: 0.95,
        }],
        duplicateFragmentsRemoved: 0,
        validation: { ok: false, reason: 'missing_quotes', unitCount: 1, quoteCount: 0 },
      },
    },
  })

  const readiness = getDeepLearnQuizPackReadiness(note)
  assert.equal(buildQuizPackItems(note).length, 0)
  assert.equal(readiness.ok, false)
  assert.equal(readiness.reason, 'empty')
})

test('IT Security reviewer Source Map flows into quiz generation', () => {
  const items = buildQuizPackItems(createItSecuritySourceMapNote())
  const combined = normalizeLookup(JSON.stringify(items))

  assert.ok(items.length >= 5)
  for (const expected of [
    'IT Security',
    'InfoSec vs IT Sec',
    'CIA Triad',
    'Domains of IT Security',
    'Cybersecurity',
    'Cybersecurity approach layers',
    'People Process Technology',
    'Unified Threat Management',
    'Impact of a Security Breach',
    'Vulnerability Exploit Breach',
    'Malware Types',
    'Malware Symptoms',
    'Methods of Infiltration',
    'Denial of Service Methods',
    'Blended Attacks',
    'Impact Reduction',
  ]) {
    assert.ok(combined.includes(normalizeLookup(expected)), `missing ${expected}`)
  }
  assert.doesNotMatch(combined, /infosec domains of it security cybersecurity definitions/i)
})

test('Adaptive Source Map quiz generation supports PATHFit Arnis sequence classification and chronology', () => {
  const note = createPathfitArnisSourceMapNote()
  const units = buildNormalizedQuizSourceUnits(note)
  const items = buildQuizPackItems(note)
  const prompts = items.map((item) => item.prompt)
  const combined = JSON.stringify(items)

  assert.ok(units.some((unit) => unit.title === 'Courtesy / Salutation' && unit.unitType === 'procedure'))
  assert.ok(units.some((unit) => unit.title === 'Organizations / Timeline' && unit.unitType === 'timeline'))
  assert.ok(units.some((unit) => unit.title === 'Equipment / Weapons' && unit.unitType === 'equipment'))
  assert.ok(units.some((unit) => unit.title === 'Regional Classifications' && unit.unitType === 'classification'))
  assert.ok(units.some((unit) => unit.title === 'Regional Systems' && unit.aliases.some((item) => /KALIRONGAN|PANANANDATA/.test(item))))
  assert.ok(units.some((unit) => unit.title === 'Main Groups' && unit.aliases.some((item) => /Northern Style|Southern Style/.test(item))))
  assert.ok(units.some((unit) => unit.title === 'Stick Types' && unit.aliases.some((item) => /24 to 28 inches/.test(item))))

  assert.ok(prompts.includes('Which organization standardized Arnis sport rules?'))
  assert.ok(prompts.includes('Arrange the Arnis milestones chronologically.'))
  assert.ok(prompts.includes('Which weapon is a six-foot pole?'))
  assert.ok(prompts.includes('Which classification belongs to the Visayans?'))
  assert.ok(items.some((item) => item.prompt === 'Sequence the steps in Courtesy / Salutation.'))
  assert.ok(items.some((item) => item.prompt === 'Classify items under Strike Types.'))

  const organization = items.find((item) => item.prompt === 'Which organization standardized Arnis sport rules?')
  assert.equal(organization?.answer, 'WEKAF')
  const weapon = items.find((item) => item.prompt === 'Which weapon is a six-foot pole?')
  assert.equal(weapon?.answer, 'Bangkaw')
  assert.doesNotMatch(combined, /What is Historical Concept\?/i)
  assert.doesNotMatch(combined, /metadata|debug|ocr garbage/i)
})

test('fixture-level Arnis quiz QA preserves timeline classification and useful distractors', () => {
  const items = buildQuizPackItems(createPathfitArnisSourceMapNote())
  const types = new Set(items.map((item) => item.type))
  const combined = JSON.stringify(items)

  assert.ok(items.length >= 18)
  assert.ok(types.has('multiple_choice'))
  assert.ok(types.has('true_false'))
  assert.ok(types.has('identification'))
  assert.ok(items.some((item) => item.prompt === 'Arrange the Arnis milestones chronologically.'))
  assert.ok(items.some((item) => item.prompt === 'Classify items under Regional Classifications.'))
  assert.ok(items.some((item) => item.prompt === 'Which weapon is a six-foot pole?' && item.answer === 'Bangkaw'))
  assert.ok(combined.includes('Doce Pares'))
  assert.ok(combined.includes('KALIRONGAN'))
  assert.ok(combined.includes('24 to 28 inches'))
  for (const item of items.filter((item) => item.type === 'multiple_choice')) {
    assert.equal(new Set(item.choices.map(normalizeLookup)).size, item.choices.length)
    assert.ok(item.choices.every((choice) => !/all of the above|none of the above|joke/i.test(choice)))
  }
  assert.doesNotMatch(combined, /Source Notes|metadata|debug|\?\?\?\?|What is Historical Concept\?/i)
})

test('Source Map quiz generation follows learning shape before discipline hint', () => {
  const note = createNote({
    title: 'Mixed academic quiz',
    overview: 'Mixed discipline examples with distinct learning shapes.',
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 820,
      sourceMap: createLearningShapeSourceMap(),
    },
  })
  const units = buildNormalizedQuizSourceUnits(note)
  const items = buildQuizPackItems(note)
  const prompts = items.map((item) => item.prompt).join(' | ')

  assert.ok(units.some((unit) => unit.title === 'Case Rule Liability' && unit.learningShape === 'case-rule'))
  assert.ok(units.some((unit) => unit.title === 'Troubleshooting Process' && unit.learningShape === 'troubleshooting'))
  assert.match(prompts, /Apply the rule in Case Rule Liability/)
  assert.match(prompts, /Troubleshoot the issue in Troubleshooting Process/)
  assert.match(prompts, /Use the formula in Area Formula/)
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

function createItSecuritySourceMapNote(overrides: Partial<DeepLearnNote> = {}): DeepLearnNote {
  return createNote({
    title: 'Intro to IT Security Reviewer',
    overview: 'Definitions, domains, threats, malware, and response concepts for IT security.',
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: IT_SECURITY_SOURCE.length,
      sourceMap: buildAcademicSourceMap(IT_SECURITY_SOURCE),
    },
    ...overrides,
  })
}

function createPathfitArnisSourceMapNote(overrides: Partial<DeepLearnNote> = {}): DeepLearnNote {
  return createNote({
    title: 'PATHFit Arnis Reviewer',
    overview: 'Arnis history, procedure, classifications, and equipment.',
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: PATHFIT_ARNIS_SOURCE.length,
      sourceMap: buildAcademicSourceMap(PATHFIT_ARNIS_SOURCE),
    },
    ...overrides,
  })
}

function createLearningShapeSourceMap() {
  const normalizedText = [
    'Case Rule Liability The court applies the statute when jurisdiction and evidence establish the offense.',
    'Troubleshooting Process 1. Identify the error 2. Isolate the component 3. Test the system 4. Document the fix.',
    'Area Formula Area equals length times width.',
    'Clinical Care Priority 1. Assess vital signs 2. Identify diagnosis 3. Plan intervention 4. Evaluate response.',
  ].join('\n')
  return {
    version: 'academic-source-map-v1' as const,
    sourceStyle: 'technical' as const,
    secondaryStyles: ['procedural' as const],
    disciplineCluster: 'health-nursing-allied-health-medicine' as const,
    secondaryDisciplineClusters: ['law-criminal-justice-criminology-public-safety' as const],
    normalizedText,
    chunks: [
      { heading: 'Case Rule Liability', text: 'The court applies the statute when jurisdiction and evidence establish the offense.', sourceQuote: 'Case Rule Liability The court applies the statute when jurisdiction and evidence establish the offense.' },
      { heading: 'Troubleshooting Process', text: 'Identify the error. Isolate the component. Test the system. Document the fix.', sourceQuote: 'Troubleshooting Process 1. Identify the error 2. Isolate the component 3. Test the system 4. Document the fix.' },
    ],
    units: [
      {
        id: 'case-rule-liability',
        title: 'Case Rule Liability',
        kind: 'concept' as const,
        unitType: 'definition' as const,
        learningShape: 'case-rule' as const,
        summary: 'The court applies the statute when jurisdiction and evidence establish the offense.',
        items: ['jurisdiction', 'evidence', 'offense'],
        sourceQuotes: ['Case Rule Liability The court applies the statute when jurisdiction and evidence establish the offense.'],
        importanceScore: 90,
        confidence: 0.92,
      },
      {
        id: 'troubleshooting-process',
        title: 'Troubleshooting Process',
        kind: 'process' as const,
        unitType: 'procedure' as const,
        learningShape: 'troubleshooting' as const,
        summary: 'Troubleshooting follows the error isolation and testing process.',
        items: ['Identify the error', 'Isolate the component', 'Test the system', 'Document the fix'],
        sourceQuotes: ['Troubleshooting Process 1. Identify the error 2. Isolate the component 3. Test the system 4. Document the fix.'],
        importanceScore: 88,
        confidence: 0.91,
      },
      {
        id: 'area-formula',
        title: 'Area Formula',
        kind: 'concept' as const,
        unitType: 'definition' as const,
        learningShape: 'formula' as const,
        summary: 'Area equals length times width.',
        items: ['length', 'width', 'multiply values'],
        sourceQuotes: ['Area Formula Area equals length times width.'],
        importanceScore: 84,
        confidence: 0.9,
      },
      {
        id: 'clinical-care-priority',
        title: 'Clinical Care Priority',
        kind: 'process' as const,
        unitType: 'procedure' as const,
        learningShape: 'clinical-care' as const,
        summary: 'Assess vital signs, identify diagnosis, plan intervention, and evaluate response.',
        items: ['Assess vital signs', 'Identify diagnosis', 'Plan intervention', 'Evaluate response'],
        sourceQuotes: ['Clinical Care Priority 1. Assess vital signs 2. Identify diagnosis 3. Plan intervention 4. Evaluate response.'],
        importanceScore: 82,
        confidence: 0.9,
      },
    ],
    duplicateFragmentsRemoved: 0,
    validation: { ok: true as const, reason: 'ok' as const, unitCount: 4, quoteCount: 4 },
  }
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findMcq(items: ReturnType<typeof buildQuizPackItems>, prompt: RegExp) {
  const item = items.find((candidate) => candidate.type === 'multiple_choice' && prompt.test(candidate.prompt))
  assert.ok(item, `missing MCQ matching ${prompt}`)
  return item
}

function countChoicesInGroup(item: ReturnType<typeof buildQuizPackItems>[number], group: string[]) {
  const groupKeys = new Set(group.map(normalizeLookup))
  return item.choices.filter((choice) => groupKeys.has(normalizeLookup(choice))).length
}

const IT_SECURITY_SOURCE = [
  'Intro to IT Security Module 1',
  'What is IT Security • A set of cyber security strategies that prevent unauthorized access • Focuses on protecting organizational assets against cyberattacks and other threats • InfoSec - processes and tools designed to protect sensitive business information • IT Sec - securing digital data through computer network security',
  'Goal of IT Security 1. Confidentiality 2. Integrity 3. Availability',
  'Domains of IT Security 1. Network Security 2. Internet Security 3. Endpoint Security 4. Cloud Security 5. Application Security 6. Information Security 7. Operational Security 8. Mobile Security 9. IoT Security 10. User Education 11. Cyber Security',
  'What is Cybersecurity all about? Cybersecurity involves multiple layers of protection spread across computers, networks, programs, and data. People, processes, and technology must complement one another. Unified threat management can accelerate detection, investigation, and remediation.',
  'Impact of a Security Breach Ruined Reputation, Vandalism, Theft, Revenue Lost, Damaged Intellectual Property',
  'What is Cybersecurity? • Protection of networked systems and data from unauthorized use or harm • Refers to techniques used to protect the integrity of an organization security architecture and safeguard its data against attack, damage, or unauthorized access',
  'Importance of cybersecurity • Increasingly sophisticated attacks • Widely available hacking tools • Compliance • Rising cost of breaches • Strategic board-level concern • Cyber crime is big business',
  'Challenges of Cybersecurity • Internet of Things • Rapidly Evolving Risks • Big and Confidential Data • Organized and State-sponsored Hacker Groups • Remote Working • High-speed Internet • BYOD',
  'Types of Attackers Insiders • Employees and ex-employees • Contract Staff • Trusted Partners Outsiders Organized Attackers • Cyber Criminals • Hacktivists • Terrorists • State-sponsored Hackers • Black hats • Grey hats • White hats Amateurs',
  'Definition of Terms • Vulnerability - Weaknesses or flaws in the hardware or software • Exploit - Method or tools used to take advantage vulnerability • Breach - Successful exploit if vulnerability',
  'Types of Cybersecurity Threats • Cybercrime - Efforts by bad actors to profit from their malicious attacks • Disruption - Attempts to disrupt operations by attacking IT and operational technology infrastructure • Espionage - Attacks backed by state agencies as part of espionage and military activity',
  'Types of Malware • Spyware • Adware • Bot • Rootkit • Scareware • Ransomware • Virus • Trojan Horse • Worm • MiTM',
  'Symptoms of Malware • There is an increase in CPU usage • There is a decrease in computer speed • The computer freezes or crashes often • There is a decrease in Web browsing speed • There are unexplainable problems with network connections • Files are modified • Files are deleted • There is a presence of unknown files, programs, or desktop icons • There are unknown processes running • Email is being sent without the user knowledge or consent',
  'Methods of Infiltration 1. Social Engineering • Pretexting • Tailgating • Phishing • Smishing • Vishing 2. Password Cracking • Brute-force • Network Sniffing • Social Engineering 3. Vulnerability Exploitation 4. Advanced Persistent Threats',
  'Methods to Deny Service • Overwhelm quantity of traffic • Send enormous quantity of data at a rate that cannot be handled • Maliciously formatted packets • Zombie - Infected Host • Botnet - Network of Infected Hosts • SEO Poisoning - Increase traffic to malicious websites',
  'Blended Attacks • Uses multiple techniques to compromise a target • Uses a hybrid of worms, Trojan horses, spyware, keyloggers, spam, and phishing schemes • DDoS combined with phishing emails',
  'Impact Reduction • Communicate the Issue • Be sincere and accountable • Provide details • Understand the cause of the breach • Ensure all systems are clean • Educate employees, partners, and customers',
].join('\n')

const PATHFIT_ARNIS_SOURCE = [
  'PATHFit Module 1 Arnis',
  'What is Arnis â€¢ Arnis is the Philippine national martial art and sport using sticks, bladed weapons, and empty-hand techniques.',
  'Aliases of Arnis â€¢ Eskrima â€¢ Kali â€¢ Garrote â€¢ Estoque',
  'Republic Act 9850 â€¢ RA 9850 declared Arnis as the national martial art and sport of the Philippines.',
  'Historical Concept â€¢ Arnis developed from indigenous fighting systems and preserved Filipino culture through practical self-defense.',
  'Evolution of Arnis â€¢ Classical Arnis â€¢ Modern Arnis â€¢ Sports Arnis â€¢ Anyo â€¢ Labanan',
  'Organizations and Timeline 1975 NARAPHIL promoted national organization 1986 ARPI supported national competitions 1989 WEKAF standardized Arnis sport rules 2010 i-ARNIS supported school-based implementation',
  'Organizations and Timeline 1970 Doce Pares Association rules were accepted by many Arnis clubs',
  'Regional Systems Pangasinan - KALIRONGAN; Tagalogs - PANANANDATA; Ilocanos - DIDYA/KABAROAN; Ibanags - PAGKALIKALI; Pampanguenos - SINAWALI; Visayans - KINAADMAN/PAGARADMAN/ESGRIMA/ESCRIMA',
  '3 Main Groups Northern Style - Arnis; Central Style - Arnis de Mano; Southern Style - Kali',
  'Stick Types Baston / Olisi / Yantok - 24 to 28 inches; Largo mano yantok - 28 to 36 inches; Dulo y Dulo - 4 to 7 inches',
  'Courtesy and Salutation 1. Attention stance 2. Ready stance 3. Bow 4. Salute 5. Return to ready stance',
  'Strike Types â€¢ Forehand strike â€¢ Backhand strike â€¢ Thrust â€¢ Diagonal strike â€¢ Horizontal strike â€¢ Vertical strike',
  'Equipment and Weapons â€¢ Baston - training stick â€¢ Daga - dagger â€¢ Bolo - bladed weapon â€¢ Espada y Daga - sword and dagger â€¢ Bangkaw - six-foot pole',
  'Stick Types â€¢ Solo Baston â€¢ Doble Baston â€¢ Sibat â€¢ Bangkaw',
  'Regional Classifications â€¢ Luzon styles â€¢ Visayans classifications â€¢ Mindanao systems',
].join('\n')
