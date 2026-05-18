import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildDeepLearnNoteRecord } from '../lib/deep-learn'
import { buildAcademicSourceMap } from '../lib/deep-learn-source-map'
import { buildDeepLearnReviewerContent, buildReviewerContentFromSourceMap, getDeepLearnReviewerReadiness } from '../lib/study-outputs/reviewer'
import { StudyOutputReviewerPage } from '../components/StudyOutputReviewerPage'
import type { DeepLearnNote, StudyOutput } from '../lib/types'

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

test('simple reviewer Markdown renders directly without structured fallback sections', () => {
  const markdown = [
    '# IT Security Reviewer',
    '',
    'Confidentiality, integrity, and availability are core goals.',
    '',
    '## Practice',
    '1. Define confidentiality.',
  ].join('\n')
  const reviewer = buildDeepLearnReviewerContent(createNote({
    reviewerMarkdown: markdown,
    noteBody: markdown,
    answerBank: [],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [],
  }))
  const markup = renderToStaticMarkup(createElement(StudyOutputReviewerPage, {
    output: createReviewerOutput(reviewer),
    courseLabel: null,
    moduleTitle: null,
  }))

  assert.equal(reviewer.reviewerMarkdown, markdown)
  assert.match(markup, /IT Security Reviewer/)
  assert.doesNotMatch(markup, /Key Answers|Likely quiz targets|No compact answer bank|reviewer-grid/i)
})

test('simple reviewer Markdown renders answer keys and choices as readable lists', () => {
  const markdown = [
    '# IT Security Reviewer',
    '',
    '1. What is the CIA triad? A. Confidentiality, Integrity, Availability B. Speed, Storage, Access C. Malware, Botnet, Virus D. Cloud, Mobile, IoT',
    '',
    '## Answer Key',
    '    1. A - CIA means Confidentiality, Integrity, and Availability.',
  ].join('\n')
  const reviewer = buildDeepLearnReviewerContent(createNote({
    reviewerMarkdown: markdown,
    noteBody: markdown,
    answerBank: [],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [],
  }))
  const markup = renderToStaticMarkup(createElement(StudyOutputReviewerPage, {
    output: createReviewerOutput(reviewer),
    courseLabel: null,
    moduleTitle: null,
  }))

  assert.match(markup, /<ol/)
  assert.match(markup, /Confidentiality, Integrity, Availability/)
  assert.match(markup, /CIA means Confidentiality/)
  assert.doesNotMatch(markup, /<pre|<code/)
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

test('compact fallback reviewer is clearly labeled while hiding empty modes', () => {
  const reviewer = buildDeepLearnReviewerContent(createNote({
    distinctions: [],
    cautionNotes: ['Generated as a compact reviewer because the source was long.'],
  }))

  assert.match(reviewer.summary, /Compact Reviewer/i)
  assert.equal(reviewer.distinctions.length, 0)
  assert.ok(reviewer.highYieldConcepts.length > 0)
  assert.ok(reviewer.identificationReview.length > 0)
  assert.ok(reviewer.likelyQuizTargets.length > 0)
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

test('reviewer strips pipeline labels and reconstructs educational quick-review language', () => {
  const reviewer = buildDeepLearnReviewerContent(createNote({
    overview: 'Clean source summary fragments: Cybersecurity protects systems.',
    sections: [
      {
        heading: 'Source Summary',
        body: [
          'Reconstructed lists:',
          'A successful cybersecurity approach has multiple layers of protection spread across systems, networks, programs, and data.',
          'Detected concepts: confidentiality integrity availability.',
        ].join('\n'),
      },
    ],
    cautionNotes: ['Normalized headings: use cleaner review labels.'],
  }))

  assert.equal(reviewer.quickReviewBlocks[0]?.heading, 'Layered Cybersecurity Defense')
  assert.ok(reviewer.quickReviewBlocks[0]?.points.includes('Multiple layers of protection are used across systems, networks, programs, and data.'))
  assert.doesNotMatch(JSON.stringify(reviewer), /Reconstructed lists|Detected concepts|Clean source summary fragments|Normalized headings/)
})

test('reviewer keeps modes specialized and semantically deduped', () => {
  const reviewer = buildDeepLearnReviewerContent(createNote({
    likelyQuizTargets: [
      {
        target: 'Subject matter jurisdiction',
        reason: 'Recall court authority.',
        importance: 'high',
        reviewText: 'Subject matter jurisdiction',
        draftExplanation: null,
        sourceSnippet: null,
        linkedDraftSectionId: null,
        supportingContext: null,
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
      {
        target: 'Complete diversity',
        reason: 'Standard exam trigger for diversity jurisdiction.',
        importance: 'high',
        reviewText: 'Complete diversity',
        draftExplanation: null,
        sourceSnippet: null,
        linkedDraftSectionId: null,
        supportingContext: null,
        compareContext: null,
        simplifiedWording: null,
        confusionNotes: [],
        relatedConcepts: [],
      },
    ],
  }))

  assert.match(reviewer.identificationReview[0]?.prompt ?? '', /^Identify:/)
  assert.doesNotMatch(JSON.stringify(reviewer.likelyQuizTargets), /Subject matter jurisdiction/)
  assert.match(reviewer.likelyQuizTargets[0]?.reason ?? '', /^Explain or apply:/)
})

test('Source Map reviewer adapter produces expected IT Security concepts', () => {
  const note = createNoteWithSourceMap(IT_SECURITY_SOURCE)
  const reviewer = buildDeepLearnReviewerContent(note)
  const rendered = JSON.stringify(reviewer)

  assert.match(reviewer.summary, /Exam Reviewer/)
  for (const expected of [
    'IT Security',
    'InfoSec vs IT Sec',
    'CIA Triad',
    'Domains of IT Security',
    'Cybersecurity',
    'Cybersecurity approach layers',
    'People / Process / Technology',
    'Unified Threat Management',
    'Importance of Cybersecurity',
    'Challenges of Cybersecurity',
    'Impact of a Security Breach',
    'Types of Attackers',
    'Vulnerability / Exploit / Breach',
    'Cybersecurity Threat Types',
    'Malware Types',
    'Malware Symptoms',
    'Methods of Infiltration',
    'Denial of Service Methods',
    'Blended Attacks',
    'Impact Reduction',
  ]) {
    assert.match(rendered, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing ${expected}`)
  }

  assert.ok(reviewer.identificationReview.every((item) => /^(Define|Differentiate|Enumerate|Classify|Identify|Sequence|Arrange)\b/.test(item.prompt)))
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^(Define|Explain|Enumerate|Differentiate|Distinguish|Apply|Classify|Identify|Sequence)\b/.test(item.target)))
  assert.ok(reviewer.distinctions.some((item) => /InfoSec/i.test(item.conceptA) && /IT Sec/i.test(item.conceptB)))
  assert.ok(reviewer.distinctions.some((item) => /Vulnerability/i.test(item.conceptA) && /Exploit/i.test(item.conceptB)))
})

test('Source Map reviewer keeps IT Security answers inside concept boundaries', () => {
  const note = createNoteWithSourceMap(IT_SECURITY_SOURCE)
  const reviewer = buildDeepLearnReviewerContent(note)

  const answerFor = (cue: string) => {
    const match = reviewer.highYieldConcepts.find((item) => item.cue === cue)
    assert.ok(match, `missing ${cue}`)
    return [match.answer, match.sourceWording, match.support, match.plainExplanation].filter(Boolean).join(' ')
  }

  assert.doesNotMatch(answerFor('IT Security'), /Goal of IT Security/i)
  assert.doesNotMatch(answerFor('InfoSec vs IT Sec'), /Goal of IT Security|Domains of IT Security|Endpoint Security|Cloud Security|Application Security|Cybersecurity definitions/i)
  assert.doesNotMatch(answerFor('Domains of IT Security'), /What is Cybersecurity|Protection of networked systems/i)
  assert.doesNotMatch(answerFor('Vulnerability / Exploit / Breach'), /Types of Cybersecurity Threats|Cybercrime|Disruption|Espionage/i)
})

test('Source Map reviewer preserves complete IT Security lists and shaped high-yield answers', () => {
  const reviewer = buildDeepLearnReviewerContent(createNoteWithSourceMap(IT_SECURITY_SOURCE))
  const highYieldFor = (cue: string) => {
    const match = reviewer.highYieldConcepts.find((item) => item.cue === cue)
    assert.ok(match, `missing high-yield cue ${cue}`)
    return match.answer
  }
  const quickBlockFor = (heading: string) => {
    const match = reviewer.quickReviewBlocks.find((block) => block.heading === heading)
    assert.ok(match, `missing quick block ${heading}`)
    return match.points
  }

  const domainsAnswer = highYieldFor('Domains of IT Security')
  for (const item of ['Network Security', 'Internet Security', 'Endpoint Security', 'Cloud Security', 'Application Security', 'Information Security', 'Operational Security', 'Mobile Security', 'IoT Security', 'User Education', 'Cyber Security']) {
  assert.match(domainsAnswer, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(domainsAnswer, /Domains of IT Security:\n1\. Network Security/)
  assert.deepEqual(quickBlockFor('Domains of IT Security'), [
    'Network Security',
    'Internet Security',
    'Endpoint Security',
    'Cloud Security',
    'Application Security',
    'Information Security',
    'Operational Security',
    'Mobile Security',
    'IoT Security',
    'User Education',
    'Cyber Security',
  ])

  const malwareAnswer = highYieldFor('Malware Types')
  for (const item of ['Spyware', 'Adware', 'Bot', 'Rootkit', 'Scareware', 'Ransomware', 'Virus', 'Trojan Horse', 'Worm', 'MiTM']) {
    assert.match(malwareAnswer, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(highYieldFor('CIA Triad'), /CIA Triad:\n1\. Confidentiality\n2\. Integrity\n3\. Availability/)
  assert.deepEqual(quickBlockFor('Malware Types'), ['Spyware', 'Adware', 'Bot', 'Rootkit', 'Scareware', 'Ransomware', 'Virus', 'Trojan Horse', 'Worm', 'MiTM'])

  const itSecurityAnswer = highYieldFor('IT Security')
  assert.match(itSecurityAnswer, /^IT Security uses cybersecurity strategies/)
  assert.doesNotMatch(itSecurityAnswer, /InfoSec|processes and tools/i)

  const cybersecurityAnswer = highYieldFor('Cybersecurity')
  assert.match(cybersecurityAnswer, /unauthorized access\.$/)
  assert.doesNotMatch(cybersecurityAnswer, /\b(?:u|architect)$/)
})

test('Academic Source Map quality gate rejects weak IT Security fragment units', () => {
  const sourceMap = buildAcademicSourceMap([
    IT_SECURITY_SOURCE,
    'Attacks backed by state agencies that are part of a broader espionage activity.',
    'Cyber Crime - big business',
    'There - There are unknown processes running',
    'High - speed Internet',
    'State - sponsored Hackers',
    'Sent to a host or application and the receiver - unable to handle it',
  ].join('\n'))
  const titles = sourceMap.units.map((unit) => unit.title)
  const renderedUnits = JSON.stringify(sourceMap.units)

  for (const weak of [
    'There',
    'High',
    'State',
    'Cyber Crime',
    'Attacks Backed By State Agencies That',
    'Sent To A Host Or Application And The Receiver',
  ]) {
    assert.ok(titles.every((title) => title !== weak), `weak unit survived: ${weak}`)
  }
  assert.doesNotMatch(renderedUnits, /Cyber Crime: big business|Attacks Backed By State Agencies That|Sent To A Host Or Application And The Receiver/i)
})

test('Academic Source Map splits inline heading runs before CIA/domain text', () => {
  const sourceMap = buildAcademicSourceMap(
    'What is IT Security • InfoSec - processes and tools designed to protect sensitive business information • IT Sec - securing digital data through computer network security Goal of IT Security 1. Confidentiality 2. Integrity 3. Availability Domains of IT Security 1. Network Security 2. Internet Security',
  )
  const infoSec = sourceMap.units.find((unit) => unit.title === 'InfoSec vs IT Sec')

  assert.ok(infoSec)
  assert.doesNotMatch(`${infoSec.summary} ${infoSec.sourceQuotes.join(' ')}`, /Goal of IT Security|Confidentiality|Domains of IT Security/i)
})

test('Source Map reviewer removes repeated memorize labels and varies quiz prompts', () => {
  const note = createNoteWithSourceMap(IT_SECURITY_SOURCE)
  const reviewer = buildDeepLearnReviewerContent(note)
  const markup = renderToStaticMarkup(createElement(StudyOutputReviewerPage, {
    output: createReviewerOutput(reviewer),
    courseLabel: null,
    moduleTitle: null,
  }))

  assert.doesNotMatch(markup, /Memorize:/)
  assert.doesNotMatch(markup, /Understand:/)
  assert.match(markup, /Definition:|Key list:|Exam cue:/)
  const examCues = reviewer.highYieldConcepts.map((item) => item.plainExplanation ?? '')
  assert.ok(examCues.every((cue) => /^(Know the exact definition|Be able to enumerate|Be able to distinguish|Be able to classify|Be able to identify|Know the chronology|Know the order or purpose|Know the cause-effect relationship|Explain the cause-effect relationship)/.test(cue)))
  assert.doesNotMatch(examCues.join(' '), /InfoSec -|Goal of IT Security|There is|State-sponsored|Cyber Crime|Source Notes|Insiders Employees And Ex/i)

  const promptVerbs = new Set(
    reviewer.likelyQuizTargets
      .map((item) => item.target.split(/\s+/)[0])
      .filter(Boolean),
  )
  assert.ok(promptVerbs.size >= 4)
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^What\b/.test(item.target)))
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^Differentiate\b/.test(item.target)))
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^Which\b/.test(item.target)))
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^Enumerate\b/.test(item.target)))
})

test('Source Map reviewer quick-answer blocks exclude weak orphan units', () => {
  const reviewer = buildDeepLearnReviewerContent(createNoteWithSourceMap(IT_SECURITY_SOURCE))
  const rendered = JSON.stringify(reviewer.quickReviewBlocks)

  assert.doesNotMatch(rendered, /"There"|"High"|"State"|"Terms"|"Programs"|Cyber Crime: big business|Attacks Backed By State Agencies That|Sent To A Host Or Application And The Receiver|"cue":"Understand The"|"cue":"Insiders Employees And Ex"/i)
  assert.ok(reviewer.quickReviewBlocks.every((block) => block.points.length >= 2))
  assert.ok(reviewer.quickReviewBlocks.some((block) => block.heading === 'Domains of IT Security'))
  assert.ok(reviewer.quickReviewBlocks.some((block) => block.heading === 'Methods of Infiltration'))
})

test('Adaptive Source Map detects PATHFit Arnis styles and preserves procedural groups', () => {
  const sourceMap = buildAcademicSourceMap(PATHFIT_ARNIS_SOURCE)
  const titles = sourceMap.units.map((unit) => unit.title)

  assert.equal(sourceMap.validation.ok, true)
  assert.equal(sourceMap.sourceStyle, 'procedural')
  assert.ok(sourceMap.secondaryStyles?.includes('classification-heavy'))
  assert.ok(sourceMap.secondaryStyles?.includes('timeline-heavy'))

  for (const expected of [
    'Arnis definition',
    'Aliases',
    'RA 9850',
    'Historical concept',
    'Evolution / Classifications',
    'Organizations / Timeline',
    'Regional Systems',
    'Main Groups',
    'Courtesy / Salutation',
    'Strike Types',
    'Equipment / Weapons',
    'Stick Types',
    'Regional Classifications',
  ]) {
    assert.ok(titles.includes(expected), `missing ${expected}`)
  }

  const salutation = sourceMap.units.find((unit) => unit.title === 'Courtesy / Salutation')
  assert.ok(salutation)
  assert.equal(salutation.unitType, 'procedure')
  assert.deepEqual(salutation.items.slice(0, 5), ['Attention stance', 'Ready stance', 'Bow', 'Salute', 'Return to ready stance'])

  const timeline = sourceMap.units.find((unit) => unit.title === 'Organizations / Timeline')
  assert.ok(timeline)
  assert.equal(timeline.unitType, 'timeline')
  assert.ok(timeline.items.includes('WEKAF'))

  const equipment = sourceMap.units.find((unit) => unit.title === 'Equipment / Weapons')
  assert.ok(equipment)
  assert.equal(equipment.unitType, 'equipment')
  assert.ok(equipment.items.includes('Bangkaw'))
})

test('Source Map reviewer adapts PATHFit Arnis prompts by procedural and timeline style', () => {
  const reviewer = buildDeepLearnReviewerContent(createNoteWithSourceMap(PATHFIT_ARNIS_SOURCE, {
    title: 'PATHFit Arnis Reviewer',
    overview: 'Arnis history, classifications, procedures, and equipment.',
  }))
  const rendered = JSON.stringify(reviewer)

  assert.match(rendered, /Arnis|Courtesy \/ Salutation|Organizations \/ Timeline|Equipment \/ Weapons/)
  assert.ok(reviewer.likelyQuizTargets.some((item) => item.target === 'What are the steps in Pugay or courtesy salutation?'))
  assert.ok(reviewer.likelyQuizTargets.some((item) => item.target === 'Arrange the Arnis organizations and milestones chronologically.'))
  assert.ok(reviewer.likelyQuizTargets.some((item) => item.target === 'Identify Arnis weapons and equipment.'))
  assert.ok(reviewer.likelyQuizTargets.some((item) => item.target === 'What are the regional classifications of Arnis?'))
  assert.ok(reviewer.highYieldConcepts.some((item) => item.cue === 'Courtesy / Salutation' && /Attention stance|Return to ready stance/.test(item.answer)))
  assert.doesNotMatch(rendered, /What is Historical Concept\?/i)
})


test('Source Map reviewer filters weak key terms and internal labels', () => {
  const sourceMap = buildAcademicSourceMap(IT_SECURITY_SOURCE)
  sourceMap.units.unshift(
    {
      id: 'weak-what',
      title: 'What',
      kind: 'concept',
      summary: 'What',
      items: [],
      sourceQuotes: ['What'],
      importanceScore: 100,
      confidence: 0.9,
    },
    {
      id: 'weak-organization',
      title: 'organization people processes technology must',
      kind: 'concept',
      summary: 'organization people processes technology must',
      items: ['source summary', 'exact source wording'],
      sourceQuotes: ['Clean source summary fragments: reconstructed lists'],
      importanceScore: 99,
      confidence: 0.9,
    },
    {
      id: 'internal-label',
      title: 'Reconstructed lists',
      kind: 'list',
      summary: 'Clean source summary fragments',
      items: ['activity', 'organization'],
      sourceQuotes: ['Reconstructed lists: Clean source summary fragments'],
      importanceScore: 98,
      confidence: 0.9,
    },
  )

  const reviewer = buildDeepLearnReviewerContent(createNote({
    sourceGrounding: {
      ...createNote().sourceGrounding,
      sourceMap,
    },
  }))
  const reviewerKeys = [
    ...reviewer.highYieldConcepts.map((item) => item.cue),
    ...reviewer.identificationReview.map((item) => item.answer),
    ...reviewer.quickReviewBlocks.flatMap((block) => [block.heading, ...block.points]),
    ...reviewer.likelyQuizTargets.map((item) => item.target),
  ]
  const rendered = JSON.stringify(reviewer)

  assert.ok(reviewerKeys.every((key) => key !== 'What'))
  assert.ok(reviewerKeys.every((key) => key !== 'activity'))
  assert.ok(reviewerKeys.every((key) => key !== 'organization'))
  assert.ok(reviewerKeys.every((key) => key !== 'organization people processes technology must'))
  assert.doesNotMatch(rendered, /source summary|exact source wording|reconstructed lists|clean source summary fragments/i)
})

test('weak Source Map does not unlock exam reviewer sections', () => {
  const sourceMap = buildAcademicSourceMap('What is IT Security • A set of cyber security strategies that prevent unauthorized access.')
  const note = createNote({
    sourceGrounding: {
      ...createNote().sourceGrounding,
      sourceMap,
    },
  })
  const reviewer = buildDeepLearnReviewerContent(note)
  const output = createReviewerOutput(reviewer)
  const markup = renderToStaticMarkup(createElement(StudyOutputReviewerPage, {
    output,
    courseLabel: null,
    moduleTitle: null,
  }))

  assert.equal(sourceMap.validation.ok, false)
  assert.equal(buildReviewerContentFromSourceMap(note), null)
  assert.match(markup, /High-yield first/)
  assert.match(markup, /Quick-answer blocks/)
  assert.doesNotMatch(markup, /Exam Reviewer built from/i)
})

test('fixture-level reviewer QA keeps IT Security and Arnis exam rich without raw fragments', () => {
  const itReviewer = buildDeepLearnReviewerContent(createNoteWithSourceMap(IT_SECURITY_SOURCE))
  const arnisReviewer = buildDeepLearnReviewerContent(createNoteWithSourceMap(PATHFIT_ARNIS_SOURCE, {
    title: 'PATHFit Arnis Reviewer',
    overview: 'Arnis history, classifications, procedures, and equipment.',
  }))
  const rendered = JSON.stringify([itReviewer, arnisReviewer])

  assert.ok(itReviewer.highYieldConcepts.length >= 16)
  assert.ok(itReviewer.likelyQuizTargets.length >= 12)
  assert.ok(arnisReviewer.highYieldConcepts.length >= 10)
  assert.ok(arnisReviewer.likelyQuizTargets.length >= 8)
  assert.ok(arnisReviewer.highYieldConcepts.some((item) => item.cue === 'Organizations / Timeline' && /WEKAF/.test(item.answer)))
  assert.ok(arnisReviewer.highYieldConcepts.some((item) => item.cue === 'Organizations / Timeline' && /Doce Pares/.test(item.answer)))
  assert.ok(arnisReviewer.highYieldConcepts.some((item) => item.cue === 'Regional Systems' && /KALIRONGAN|PANANANDATA/.test(item.answer)))
  assert.ok(arnisReviewer.highYieldConcepts.some((item) => item.cue === 'Main Groups' && /Northern Style|Central Style|Southern Style/.test(item.answer)))
  assert.ok(arnisReviewer.highYieldConcepts.some((item) => item.cue === 'Regional Classifications' && /Luzon|Visayans|Mindanao/.test(item.answer)))
  assert.ok(arnisReviewer.highYieldConcepts.some((item) => item.cue === 'Equipment / Weapons' && /Baston|Daga|Bangkaw/.test(item.answer)))
  assert.doesNotMatch(rendered, /Source Notes|metadata|debug|\?\?\?\?|other threats InfoSec|"cue":"Understand The"|"cue":"Insiders Employees And Ex"/i)
  assert.doesNotMatch(rendered, /source-backed|source wording|source chronology|grouped concepts|extracted concepts|compact grounding|exact source passage|using the source wording|Explain the source-backed concept|\bclassifies\b|\bpreserves\b/i)
  assert.doesNotMatch(rendered, /\b(?:u|architect)\b[".]/i)
})

test('legacy blob reviewer still works when Source Map is missing', () => {
  const reviewer = buildDeepLearnReviewerContent(createNote())

  assert.match(reviewer.summary, /Fallback .*Study Pack/i)
  assert.ok(reviewer.highYieldConcepts.length > 0)
  assert.equal(buildReviewerContentFromSourceMap(createNote()), null)
})

test('Source Map reviewer shapes broad academic units by learning shape instead of discipline hint', () => {
  const note = createNote({
    title: 'Mixed academic reviewer',
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

  const reviewer = buildDeepLearnReviewerContent(note)
  const targets = reviewer.likelyQuizTargets.map((item) => item.target)
  const cues = reviewer.highYieldConcepts.map((item) => item.plainExplanation).join(' ')

  assert.ok(targets.some((target) => /Apply the rule in Case Rule Liability/.test(target)))
  assert.ok(targets.some((target) => /Troubleshoot Troubleshooting Process/.test(target)))
  assert.ok(targets.some((target) => /Use the formula in Area Formula/.test(target)))
  assert.match(cues, /Know the rule and how to apply it/)
  assert.match(cues, /Know the symptom, cause, and fix pattern/)
})

test('Source Map reviewer renders generic relation-derived units without IT or Arnis leakage', () => {
  const sourceText = [
    'Revenue recognition is the process of recording income when performance obligations are satisfied.',
    'Financial statements include income statement, balance sheet, cash flow statement, and statement of changes in equity.',
    'Audit procedure 1. Inspect documents 2. Confirm balances 3. Recalculate totals 4. Report findings.',
    'Gross profit formula: Gross profit = sales - cost of goods sold.',
  ].join('\n')
  const reviewer = buildDeepLearnReviewerContent(createNoteWithSourceMap(sourceText, {
    title: 'Accounting Reviewer',
    overview: 'Accounting definitions, lists, procedures, and formulas.',
  }))
  const rendered = JSON.stringify(reviewer)

  assert.match(rendered, /Revenue Recognition|Financial Statements|Audit Procedure|Gross Profit/i)
  assert.doesNotMatch(rendered, /IT Security|Cybersecurity|Arnis|Bangkaw|WEKAF|Doce Pares/i)
  assert.ok(reviewer.highYieldConcepts.every((item) => item.sourceWording || item.answer))
})

function createNoteWithSourceMap(sourceText: string, overrides: Partial<DeepLearnNote> = {}) {
  return createNote({
    title: overrides.title ?? 'Intro to IT Security Reviewer',
    overview: overrides.overview ?? 'Definitions, domains, threats, malware, and response concepts for IT security.',
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: sourceText.length,
      sourceMap: buildAcademicSourceMap(sourceText),
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

function createReviewerOutput(content: ReturnType<typeof buildDeepLearnReviewerContent>): StudyOutput {
  return {
    id: 'output-1',
    userId: 'user-1',
    courseId: 'course-1',
    moduleId: 'module-1',
    resourceId: 'resource-1',
    sourceKind: 'deep_learn_note',
    sourceNoteId: 'note-1',
    sourceTaskId: null,
    outputKind: 'reviewer',
    status: 'ready',
    title: content.title,
    summary: content.summary,
    content,
    generatedAt: '2026-05-15T00:00:00.000Z',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  }
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
  'Courtesy and Salutation 1. Attention stance 2. Ready stance 3. Bow 4. Salute 5. Return to ready stance',
  'Strike Types â€¢ Forehand strike â€¢ Backhand strike â€¢ Thrust â€¢ Diagonal strike â€¢ Horizontal strike â€¢ Vertical strike',
  'Equipment and Weapons â€¢ Baston - training stick â€¢ Daga - dagger â€¢ Bolo - bladed weapon â€¢ Espada y Daga - sword and dagger â€¢ Bangkaw - six-foot pole',
  'Stick Types â€¢ Solo Baston â€¢ Doble Baston â€¢ Sibat â€¢ Bangkaw',
  'Regional Classifications â€¢ Luzon styles â€¢ Visayans classifications â€¢ Mindanao systems',
  'Stick Types Baston / Olisi / Yantok - 24 to 28 inches; Largo mano yantok - 28 to 36 inches; Dulo y Dulo - 4 to 7 inches; Solo Baston; Doble Baston; Sibat; Bangkaw',
].join('\n')

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
