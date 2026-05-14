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

  assert.match(reviewer.summary, /Source Map Reviewer/)
  for (const expected of [
    'IT Security',
    'InfoSec vs IT Sec',
    'CIA Triad',
    'Domains of IT Security',
    'Cybersecurity',
    'Importance of Cybersecurity',
    'Challenges of Cybersecurity',
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

  assert.ok(reviewer.identificationReview.every((item) => /^Identify or define\b/.test(item.prompt)))
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^(Explain|Enumerate|Distinguish|Apply)\b/.test(item.target)))
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
  assert.doesNotMatch(answerFor('InfoSec vs IT Sec'), /Domains of IT Security|Endpoint Security|Cloud Security|Application Security|Cybersecurity definitions/i)
  assert.doesNotMatch(answerFor('Domains of IT Security'), /What is Cybersecurity|Protection of networked systems/i)
  assert.doesNotMatch(answerFor('Vulnerability / Exploit / Breach'), /Types of Cybersecurity Threats|Cybercrime|Disruption|Espionage/i)
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

  const promptVerbs = new Set(
    reviewer.likelyQuizTargets
      .map((item) => item.target.split(/\s+/)[0])
      .filter(Boolean),
  )
  assert.ok(promptVerbs.size >= 4)
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^Define\b/.test(item.target)))
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^Differentiate\b/.test(item.target)))
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^Identify\b/.test(item.target)))
  assert.ok(reviewer.likelyQuizTargets.some((item) => /^Sequence\b/.test(item.target)))
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

test('Source Map reviewer hides empty rendered sections', () => {
  const sourceMap = buildAcademicSourceMap('What is IT Security • A set of cyber security strategies that prevent unauthorized access.')
  const reviewer = buildDeepLearnReviewerContent(createNote({
    sourceGrounding: {
      ...createNote().sourceGrounding,
      sourceMap,
    },
  }))
  const output = createReviewerOutput(reviewer)
  const markup = renderToStaticMarkup(createElement(StudyOutputReviewerPage, {
    output,
    courseLabel: null,
    moduleTitle: null,
  }))

  assert.match(markup, /High-yield first/)
  assert.doesNotMatch(markup, /Quick-answer blocks/)
  assert.doesNotMatch(markup, /Distinctions/)
})

test('legacy blob reviewer still works when Source Map is missing', () => {
  const reviewer = buildDeepLearnReviewerContent(createNote())

  assert.match(reviewer.summary, /Fallback .*Study Pack/i)
  assert.ok(reviewer.highYieldConcepts.length > 0)
  assert.equal(buildReviewerContentFromSourceMap(createNote()), null)
})

function createNoteWithSourceMap(sourceText: string) {
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
      charCount: sourceText.length,
      sourceMap: buildAcademicSourceMap(sourceText),
    },
  })
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
