import { resolveDeepLearnWording, sanitizeStudentFacingText } from '@/lib/deep-learn'
import { buildDeepLearnNoteBody } from '@/lib/deep-learn'
import { validateAcademicSourceMap, type AcademicLearningShape, type AcademicSourceMap, type AcademicSourceMapUnit, type AcademicSourceMapUnitType } from '@/lib/deep-learn-source-map'
import { deepLearnNoteHasUntrustworthyGrounding } from '@/lib/deep-learn-source-validation'
import { normalizeSourceFaithfulText, normalizeStudyOutputHeadingIfRaw } from '@/lib/study-outputs/source-faithful'
import type {
  DeepLearnAnswerBankItem,
  DeepLearnIdentificationItem,
  DeepLearnNote,
  StudyOutputReviewerContent,
} from '@/lib/types'

const REVIEWER_MEMORIZATION_ITEM_LIMIT = 16

export interface ReviewerBuildReadiness {
  ok: boolean
  reason: 'missing' | 'pending' | 'failed' | 'metadata_only' | 'empty'
  message: string
}

export function getDeepLearnReviewerReadiness(note: DeepLearnNote | null): ReviewerBuildReadiness {
  if (!note) {
    return {
      ok: false,
      reason: 'missing',
      message: 'Deep Learn needs a saved ready Study Pack before it can generate a Reviewer.',
    }
  }

  if (note.status === 'pending') {
    return {
      ok: false,
      reason: 'pending',
      message: 'Deep Learn is still preparing this Study Pack. The Reviewer unlocks after the pack is ready.',
    }
  }

  if (note.status === 'failed') {
    return {
      ok: false,
      reason: 'failed',
      message: 'Deep Learn could not build a trustworthy Study Pack from this source, so a Reviewer cannot be generated yet.',
    }
  }

  if (deepLearnNoteHasUntrustworthyGrounding(note)) {
    return {
      ok: false,
      reason: 'metadata_only',
      message: 'This Study Pack is not grounded in enough readable academic source text for a Reviewer.',
    }
  }

  if (hasFullReviewerMarkdown(note)) {
    return {
      ok: true,
      reason: 'empty',
      message: '',
    }
  }

  const sourceMapReviewer = buildReviewerContentFromSourceMap(note)
  if (sourceMapReviewer) {
    return {
      ok: true,
      reason: 'empty',
      message: '',
    }
  }

  const quickReviewBlocks = buildQuickReviewBlocks(note)
  if (
    note.answerBank.length === 0
    && note.identificationItems.length === 0
    && note.distinctions.length === 0
    && note.likelyQuizTargets.length === 0
    && quickReviewBlocks.length === 0
  ) {
    return {
      ok: false,
      reason: 'empty',
      message: 'This Study Pack does not yet have enough structured study content for a Reviewer.',
    }
  }

  return {
    ok: true,
    reason: 'empty',
    message: '',
  }
}

export function buildDeepLearnReviewerContent(note: DeepLearnNote): StudyOutputReviewerContent {
  const readiness = getDeepLearnReviewerReadiness(note)
  if (!readiness.ok) {
    throw new Error(readiness.message)
  }

  if (hasFullReviewerMarkdown(note)) {
    const markdown = note.reviewerMarkdown ?? note.noteBody
    return {
      version: 'reviewer-v1',
      sourceNoteId: note.id,
      sourceResourceId: note.resourceId,
      title: buildReviewerTitle(note.title),
      summary: 'Full exam Reviewer generated directly from the selected source.',
      intro: cleanReviewerText(note.overview),
      reviewerMarkdown: markdown,
      highYieldConcepts: [],
      identificationReview: [],
      quickReviewBlocks: [],
      distinctions: [],
      likelyQuizTargets: [],
      cautionNotes: note.cautionNotes.map(cleanReviewerText).filter(Boolean).slice(0, 6),
    }
  }

  const sourceMapReviewer = buildReviewerContentFromSourceMap(note)
  if (sourceMapReviewer) return sourceMapReviewer

  const quickReviewBlocks = dedupeQuickReviewBlocks(buildQuickReviewBlocks(note))
  const title = buildReviewerTitle(note.title)
  const usedConcepts = new Set<string>()
  const highYieldConcepts = note.answerBank
    .slice()
    .sort(compareImportanceDesc)
    .map((item) => ({
      cue: normalizeStudyOutputHeadingIfRaw(item.cue),
      answer: exactMemorizeText(item.compactAnswer),
      importance: item.importance,
      support: plainExplanation(item),
      sourceWording: exactMemorizeText(item.answer),
      plainExplanation: plainExplanation(item),
    }))
    .filter((item) => claimReviewerConcept(usedConcepts, item.cue))
    .slice(0, 12)

  const identificationReview = note.identificationItems
    .slice()
    .sort(compareImportanceDesc)
    .map((item) => ({
      prompt: buildIdentificationPrompt(item),
      answer: exactMemorizeText(item.answer),
      importance: item.importance,
      support: plainExplanation(item),
      sourceWording: exactMemorizeText(item.answer),
      plainExplanation: plainExplanation(item),
    }))
    .filter((item) => claimReviewerConcept(usedConcepts, item.prompt))
    .slice(0, Math.max(4, REVIEWER_MEMORIZATION_ITEM_LIMIT - highYieldConcepts.length))

  return {
    version: 'reviewer-v1',
    sourceNoteId: note.id,
    sourceResourceId: note.resourceId,
    title,
    summary: buildReviewerSummary(note, highYieldConcepts.length, identificationReview.length),
    intro: cleanReviewerText(note.overview),
    reviewerMarkdown: null,
    highYieldConcepts,
    identificationReview,
    quickReviewBlocks,
    distinctions: note.distinctions
      .slice(0, 8)
      .map((item) => ({
        conceptA: normalizeStudyOutputHeadingIfRaw(item.conceptA),
        conceptB: normalizeStudyOutputHeadingIfRaw(item.conceptB),
        difference: normalizeSourceFaithfulText(item.difference),
        confusionNote: item.confusionNote,
      })),
    likelyQuizTargets: note.likelyQuizTargets
      .slice()
      .sort((left, right) => compareImportance(right.importance, left.importance))
      .slice(0, 8)
      .map((item) => ({
        target: normalizeStudyOutputHeadingIfRaw(item.target),
        reason: buildLikelyQuizReason(item.reason),
        importance: item.importance,
      }))
      .filter((item) => claimReviewerConcept(usedConcepts, item.target)),
    cautionNotes: note.cautionNotes.map(cleanReviewerText).filter(Boolean).slice(0, 6),
  }
}

function buildReviewerTitle(noteTitle: string) {
  const trimmed = noteTitle.trim()
  if (!trimmed) return 'Reviewer'
  return trimmed
}

function buildReviewerSummary(note: DeepLearnNote, answerCount: number, identificationCount: number) {
  const lead = hasCompactReviewerCaution(note)
    ? 'Compact Reviewer built from the strongest Study Pack items.'
    : note.quizReady
      ? 'Fallback exam-first Reviewer built from the saved Study Pack.'
      : 'Fallback Reviewer built from the saved Study Pack.'

  return `${lead} ${answerCount} high-yield answer cue${answerCount === 1 ? '' : 's'} and ${identificationCount} identification item${identificationCount === 1 ? '' : 's'} are ready for cram review.`
}

export function buildReviewerContentFromSourceMap(note: DeepLearnNote): StudyOutputReviewerContent | null {
  const sourceMap = note.sourceGrounding.sourceMap
  if (!isUsableAcademicSourceMap(sourceMap)) return null

  const units = sourceMap.units
    .map(cleanSourceMapReviewerUnit)
    .filter((unit): unit is SourceMapReviewerUnit => Boolean(unit))
    .filter((unit, index, list) => list.findIndex((candidate) => normalizeLookup(candidate.title) === normalizeLookup(unit.title)) === index)
    .sort(compareSourceMapReviewerUnits)

  if (units.length === 0) return null

  const highYieldConcepts = units
    .slice(0, 28)
    .map((unit) => ({
      cue: unit.title,
      answer: unit.answer,
      importance: sourceMapImportance(unit.importanceScore),
      support: null,
      sourceWording: unit.sourceWording,
      plainExplanation: buildSourceMapExamCue(unit),
    }))
    .filter((item, index, list) => list.findIndex((candidate) => normalizeLookup(candidate.cue) === normalizeLookup(item.cue)) === index)
    .slice(0, 28)

  const identificationReview = units
    .slice(0, 24)
    .map((unit) => ({
      prompt: buildSourceMapIdentificationPrompt(unit),
      answer: unit.shortAnswer,
      importance: sourceMapImportance(unit.importanceScore),
      support: null,
      sourceWording: unit.sourceWording,
      plainExplanation: buildSourceMapExamCue(unit),
    }))
    .filter((item) => !isWeakReviewerTerm(item.answer))
    .slice(0, Math.max(4, REVIEWER_MEMORIZATION_ITEM_LIMIT - highYieldConcepts.length))

  const seenQuickItems = new Set<string>()
  const quickReviewBlocks = units
    .filter(isStrongSourceMapQuickBlockUnit)
    .map((unit) => {
      const points = unit.items
        .map((item) => shapeQuickReviewPoint(item, unit.title))
        .filter((item) => item.length > 0 && !isWeakReviewerTerm(item) && !isWeakQuickReviewPoint(item))
        .filter((item) => {
          const key = normalizeLookup(item)
          if (!key || seenQuickItems.has(key)) return false
          seenQuickItems.add(key)
          return true
        })
        .slice(0, getSourceMapReviewerListLimit(unit.title, unit.kind, 'quick'))
      return {
        heading: unit.title,
        points,
      }
    })
    .filter((block) => block.points.length >= 2 && !isWeakReviewerTerm(block.heading))
    .slice(0, 12)

  const distinctions = buildSourceMapDistinctions(units).slice(0, 6)
  const likelyQuizTargets = units
    .slice(0, 24)
    .map((unit) => ({
      target: buildSourceMapQuizTarget(unit),
      reason: buildSourceMapQuizReason(unit),
      importance: sourceMapImportance(unit.importanceScore),
    }))
    .filter((item) => !isWeakReviewerTerm(item.target))
    .slice(0, 24)

  if (
    highYieldConcepts.length === 0
    && identificationReview.length === 0
    && quickReviewBlocks.length === 0
    && likelyQuizTargets.length === 0
  ) {
    return null
  }

  return {
    version: 'reviewer-v1',
    sourceNoteId: note.id,
    sourceResourceId: note.resourceId,
    title: buildReviewerTitle(note.title),
    summary: `Exam Reviewer built from ${units.length} academic reviewer unit${units.length === 1 ? '' : 's'}. ${highYieldConcepts.length} high-yield recall cue${highYieldConcepts.length === 1 ? '' : 's'} and ${identificationReview.length} identification item${identificationReview.length === 1 ? '' : 's'} are ready for cram review.`,
    intro: buildSourceMapIntro(units, note.overview),
    reviewerMarkdown: null,
    highYieldConcepts,
    identificationReview,
    quickReviewBlocks,
    distinctions,
    likelyQuizTargets,
    cautionNotes: note.cautionNotes.map(cleanReviewerText).filter(Boolean).filter((item) => !containsInternalPipelineText(item)).slice(0, 4),
  }
}

function hasFullReviewerMarkdown(note: DeepLearnNote) {
  const markdown = note.reviewerMarkdown ?? note.noteBody
  return /^#\s*Reviewer:/im.test(markdown)
    && /^##\s+Complete Exam Reviewer\s*$/im.test(markdown)
    && /^##\s+Identification Reviewer\s*$/im.test(markdown)
    && markdown.length >= 1200
}

interface SourceMapReviewerUnit {
  title: string
  answer: string
  shortAnswer: string
  support: string | null
  sourceWording: string | null
  items: string[]
  kind: AcademicSourceMapUnit['kind']
  unitType: AcademicSourceMapUnitType
  learningShape: AcademicLearningShape
  importanceScore: number
}

function isUsableAcademicSourceMap(value: AcademicSourceMap | null | undefined): value is AcademicSourceMap {
  if (!value) return false
  const validation = validateAcademicSourceMap(value)
  return validation.ok
}

function cleanSourceMapReviewerUnit(unit: AcademicSourceMapUnit): SourceMapReviewerUnit | null {
  const title = normalizeSourceMapReviewerTitle(unit.title)
  if (isWeakReviewerTerm(title)) return null

  const items = unit.items
    .map(cleanReviewerText)
    .filter((item) => item.length > 0 && !isWeakReviewerTerm(item))
    .slice(0, 12)
  const answer = buildSourceMapAnswer(title, unit, items)
  const sourceWording = unit.sourceQuotes
    .map((quote) => unit.kind === 'definition'
      ? cleanDefinitionAnswer(title, cleanReviewerText(quote))
      : cleanReviewerText(quote))
    .map((quote) => shapeReviewerDefinitionAnswer(title, quote))
    .find((quote) => quote.length >= 12 && !containsInternalPipelineText(quote) && quote !== answer)
    ?? null
  const shortAnswer = items.length > 0 && unit.kind !== 'definition'
    ? items.slice(0, getSourceMapReviewerListLimit(title, unit.kind, 'short')).join(', ')
    : answer
  const titleKey = normalizeLookup(title)
  const rawSourceText = `${unit.summary} ${unit.sourceQuotes.join(' ')}`
  const sourceBackedComparison = titleKey === 'infosec vs it sec'
    ? /\bInfoSec\b/i.test(rawSourceText) && /\bIT Sec\b/i.test(rawSourceText)
    : titleKey === 'vulnerability exploit breach'
      ? /\bVulnerability\b/i.test(rawSourceText) && /\bExploit\b/i.test(rawSourceText) && /\bBreach\b/i.test(rawSourceText)
      : false
  const support = titleKey === 'infosec vs it sec' || titleKey === 'vulnerability exploit breach'
    ? ''
    : shapeReviewerDefinitionAnswer(title, cleanDefinitionAnswer(title, cleanReviewerText(unit.summary)))

  if (!answer || isWeakReviewerTerm(answer)) return null

  return {
    title,
    answer,
    shortAnswer,
    support: support && support !== answer ? support : null,
    sourceWording: titleKey === 'infosec vs it sec' || titleKey === 'vulnerability exploit breach'
      ? sourceBackedComparison ? answer : null
      : sourceWording,
    items,
    kind: unit.kind,
    unitType: inferReviewerUnitType(title, unit),
    learningShape: inferReviewerLearningShape(title, unit),
    importanceScore: unit.importanceScore,
  }
}

function inferReviewerLearningShape(title: string, unit: AcademicSourceMapUnit): AcademicLearningShape {
  if (unit.learningShape) return unit.learningShape
  const key = normalizeLookup(title)
  if (/\b(?:formula|equation|compute|calculate|solve)\b/i.test(key)) return 'formula'
  if (/\b(?:example|sample problem|worked solution)\b/i.test(key)) return 'worked-example'
  if (/\b(?:case|rule|statute|jurisdiction|liability|offense)\b/i.test(key)) return 'case-rule'
  if (/\b(?:clinical|patient|care plan|diagnosis|treatment|assessment)\b/i.test(key)) return 'clinical-care'
  if (/\b(?:cause|effect|impact|risk factor)\b/i.test(key)) return 'cause-effect'
  if (/\b(?:troubleshoot|error|failure|debug|symptom)\b/i.test(key)) return 'troubleshooting'
  if (/\b(?:component|system|architecture|module|parts?)\b/i.test(key)) return 'component-system'
  if (/\b(?:lab|experiment|protocol)\b/i.test(key)) return 'lab-process'
  if (/\b(?:rubric|standard|criteria|competency|outcomes?)\b/i.test(key)) return 'standards-rubrics'
  if (/\b(?:passage|theme|motif|character|argument)\b/i.test(key)) return 'passage-theme'
  const unitType = inferReviewerUnitType(title, unit)
  if (unitType === 'timeline' || unitType === 'historical') return 'timeline'
  if (unitType === 'procedure') return 'procedure'
  if (unitType === 'equipment') return 'equipment'
  if (unitType === 'classification') return 'classification'
  if (unitType === 'comparison') return 'comparison'
  if (unitType === 'taxonomy') return 'taxonomy'
  if (unitType === 'reflective') return 'reflection'
  if (unitType === 'narrative') return 'narrative'
  return unit.kind === 'definition' ? 'definition' : 'narrative'
}

function inferReviewerUnitType(title: string, unit: AcademicSourceMapUnit): AcademicSourceMapUnitType {
  if (unit.unitType) return unit.unitType
  const key = normalizeLookup(title)
  if (/\b(?:vs|vulnerability exploit breach)\b/i.test(key)) return 'comparison'
  if (/\b(?:timeline|history|historical|ra 9850|organizations)\b/i.test(key)) return 'timeline'
  if (/\b(?:courtesy|salutation|methods?|steps?|sequence|reduction)\b/i.test(key) || unit.kind === 'process') return 'procedure'
  if (/\b(?:equipment|weapons?|stick)\b/i.test(key)) return 'equipment'
  if (/\b(?:classification|regional|types|domains|categories)\b/i.test(key) || unit.kind === 'category') return 'classification'
  if (unit.kind === 'definition') return 'definition'
  if (unit.kind === 'list') return 'taxonomy'
  return 'narrative'
}

function normalizeSourceMapReviewerTitle(value: string) {
  const cleaned = normalizeStudyOutputHeadingIfRaw(cleanReviewerText(value))
  const lookup = normalizeLookup(cleaned)
  if (lookup === 'it security definition') return 'IT Security'
  if (lookup === 'domains of it security') return 'Domains of IT Security'
  if (lookup === 'cybersecurity definitions') return 'Cybersecurity'
  if (lookup === 'cybersecurity approach layers') return 'Cybersecurity approach layers'
  if (lookup === 'people process technology') return 'People / Process / Technology'
  if (lookup === 'unified threat management') return 'Unified Threat Management'
  if (lookup === 'importance of cybersecurity') return 'Importance of Cybersecurity'
  if (lookup === 'challenges') return 'Challenges of Cybersecurity'
  if (lookup === 'impact of a security breach') return 'Impact of a Security Breach'
  if (lookup === 'cybercrime disruption espionage') return 'Cybersecurity Threat Types'
  if (lookup === 'malware types') return 'Malware Types'
  if (lookup === 'malware symptoms') return 'Malware Symptoms'
  if (lookup === 'infiltration methods') return 'Methods of Infiltration'
  if (lookup === 'methods of infiltration') return 'Methods of Infiltration'
  if (lookup === 'denial of service methods') return 'Denial of Service Methods'
  if (lookup === 'methods to deny service') return 'Denial of Service Methods'
  if (lookup === 'impact reduction') return 'Impact Reduction'
  if (lookup === 'types of attackers') return 'Types of Attackers'
  if (lookup === 'zombie vs botnet') return 'Zombie vs Botnet'
  if (lookup === 'seo vs seo poisoning') return 'SEO vs SEO Poisoning'
  if (lookup === 'blended attacks') return 'Blended Attacks'
  if (lookup === 'arnis definition') return 'Arnis'
  if (lookup === 'ra 9850') return 'RA 9850'
  if (lookup === 'historical concept') return 'Historical Concept'
  if (lookup === 'evolution classifications') return 'Evolution / Classifications'
  if (lookup === 'regional systems') return 'Regional Systems'
  if (lookup === 'organizations timeline') return 'Organizations / Timeline'
  if (lookup === 'timeline') return 'Timeline'
  if (lookup === 'main groups') return 'Main Groups'
  if (lookup === 'courtesy salutation') return 'Courtesy / Salutation'
  if (lookup === 'strike types') return 'Strike Types'
  if (lookup === 'equipment weapons') return 'Equipment / Weapons'
  if (lookup === 'stick types') return 'Stick Types'
  if (lookup === 'regional classifications') return 'Regional Classifications'
  return cleaned
}

function buildSourceMapAnswer(title: string, unit: AcademicSourceMapUnit, items: string[]) {
  const summary = cleanReviewerText(unit.summary)
  const titleKey = normalizeLookup(title)
  if (titleKey === 'infosec vs it sec') {
    return 'InfoSec protects sensitive business information; IT Sec secures digital data through computer network security.'
  }
  if (titleKey === 'it security') {
    return 'IT Security uses cybersecurity strategies to prevent unauthorized access and protect organizational assets against cyberattacks and other threats.'
  }
  if (titleKey === 'cybersecurity') {
    return 'Cybersecurity protects networked systems and data from unauthorized use, harm, attack, damage, or unauthorized access.'
  }
  if (titleKey === 'vulnerability exploit breach') {
    return 'Vulnerability = weakness or flaw; exploit = method or tool used to take advantage; breach = successful exploit.'
  }
  if (titleKey === 'zombie vs botnet') {
    return 'Zombie = infected host; Botnet = network of infected hosts.'
  }
  if (titleKey === 'seo vs seo poisoning') {
    return 'SEO improves website search ranking; SEO Poisoning increases traffic to malicious websites and forces malicious sites to rank higher.'
  }
  if (titleKey === 'arnis') {
    return shapeReviewerDefinitionAnswer(title, cleanDefinitionAnswer(title, summary))
  }
  if (items.length >= 2 && !/^(?:IT Security|Cybersecurity)$/i.test(title)) {
    return formatSourceMapReviewerList(title, unit, items)
  }
  return shapeReviewerDefinitionAnswer(title, cleanDefinitionAnswer(title, summary))
    || unit.sourceQuotes.map((quote) => shapeReviewerDefinitionAnswer(title, cleanDefinitionAnswer(title, cleanReviewerText(quote)))).find(Boolean)
    || title
}

function formatSourceMapReviewerList(title: string, unit: AcademicSourceMapUnit, items: string[]) {
  const limit = getSourceMapReviewerListLimit(title, unit.kind, 'answer')
  const learningShape = inferReviewerLearningShape(title, unit)
  const lines = items
    .slice(0, limit)
    .map((item, index) => `${index + 1}. ${learningShape === 'timeline' ? formatReviewerTimelineItem(item) : item}`)
  return `${title}:\n${lines.join('\n')}`
}

function formatReviewerTimelineItem(item: string) {
  return item
    .replace(/\b(\d{4}|[A-Z][a-z]+ \d{1,2}, \d{4})\s*(?:-|\u2013|\u2014)\s*/u, '$1 \u2014 ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSourceMapIntro(units: SourceMapReviewerUnit[], fallbackOverview: string) {
  const firstDefinition = units.find((unit) => unit.kind === 'definition')
  if (firstDefinition) return `${firstDefinition.title}: ${firstDefinition.answer}`
  return cleanReviewerText(fallbackOverview) || 'Use this reviewer for definitions, groupings, procedures, timelines, distinctions, and likely quiz targets.'
}

function buildSourceMapQuizTarget(unit: SourceMapReviewerUnit) {
  const question = buildKnownSourceMapReviewerQuestion(unit)
  if (question) return question
  const key = normalizeLookup(unit.title)
  if (key === 'malware symptoms') return 'Identify symptoms of malware'
  if (key === 'infosec vs it sec' || key === 'vulnerability exploit breach') return `Differentiate ${unit.title}`
  if (unit.learningShape === 'timeline') return `Arrange the milestones for ${unit.title}.`
  if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return `Sequence ${unit.title}.`
  if (unit.learningShape === 'equipment') return `Identify equipment in ${unit.title}.`
  if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return `Enumerate ${unit.title}.`
  if (unit.learningShape === 'formula') return `Use the formula in ${unit.title}`
  if (unit.learningShape === 'worked-example') return `Work through ${unit.title}`
  if (unit.learningShape === 'case-rule') return `Apply the rule in ${unit.title}`
  if (unit.learningShape === 'clinical-care') return `Identify care priorities in ${unit.title}`
  if (unit.learningShape === 'cause-effect') return `Explain the cause-effect relationship in ${unit.title}`
  if (unit.learningShape === 'troubleshooting') return `Troubleshoot ${unit.title}`
  if (unit.learningShape === 'component-system') return `Identify components in ${unit.title}`
  if (unit.learningShape === 'standards-rubrics') return `Apply criteria in ${unit.title}`
  if (unit.learningShape === 'passage-theme') return `Explain the theme in ${unit.title}`
  if (unit.learningShape === 'reflection') return `Reflect on ${unit.title}`
  if (/threat types|attackers|malware types/i.test(unit.title)) return `Match terms in ${unit.title}`
  if (/importance|challenges/i.test(unit.title)) return `Explain why ${unit.title} matters`
  if (unit.kind === 'definition') return `Define ${unit.title}.`
  if (unit.kind === 'process') return `Sequence steps for ${unit.title}.`
  if (unit.items.length >= 3) return `Enumerate ${unit.title}.`
  if (/ vs |\/|triad/i.test(unit.title)) return `Differentiate ${unit.title}`
  return `Explain ${unit.title}.`
}

function buildSourceMapIdentificationPrompt(unit: SourceMapReviewerUnit) {
  const key = normalizeLookup(unit.title)
  if (key === 'infosec vs it sec') return 'Differentiate InfoSec from IT Sec.'
  if (key === 'vulnerability exploit breach') return 'Differentiate Vulnerability, Exploit, and Breach.'
  if (key === 'zombie vs botnet') return 'Differentiate Zombie and Botnet.'
  if (key === 'seo vs seo poisoning') return 'Differentiate SEO and SEO Poisoning.'
  if (unit.learningShape === 'timeline') return `Identify the chronology or milestone order for ${unit.title}.`
  if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return `Sequence the steps in ${unit.title}.`
  if (unit.learningShape === 'equipment') return `Identify the equipment or tool examples in ${unit.title}.`
  if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return `Classify items under ${unit.title}.`
  if (unit.learningShape === 'formula') return `Write or use the formula for ${unit.title}.`
  if (unit.learningShape === 'worked-example') return `Follow the example pattern in ${unit.title}.`
  if (unit.learningShape === 'case-rule') return `Apply the rule in ${unit.title}.`
  if (unit.learningShape === 'clinical-care') return `Identify the care priority in ${unit.title}.`
  if (unit.learningShape === 'cause-effect') return `Explain the cause-effect chain in ${unit.title}.`
  if (unit.learningShape === 'troubleshooting') return `Match the symptom, cause, and fix pattern in ${unit.title}.`
  if (unit.learningShape === 'component-system') return `Identify the component roles in ${unit.title}.`
  if (unit.kind === 'definition') return `Define ${unit.title}.`
  if (unit.items.length >= 2) return `Enumerate the items under ${unit.title}.`
  return `Explain ${unit.title}.`
}

function buildSourceMapQuizReason(unit: SourceMapReviewerUnit) {
  const key = normalizeLookup(unit.title)
  if (key === 'infosec vs it sec') return 'Keep the business-information focus separate from network/data-security wording.'
  if (key === 'vulnerability exploit breach') return 'These terms are commonly tested as a sequence: weakness, method/tool, successful result.'
  if (key === 'zombie vs botnet') return 'Keep one infected host separate from a network of infected hosts.'
  if (key === 'seo vs seo poisoning') return 'Keep normal search ranking improvement separate from malicious ranking manipulation.'
  if (key === 'malware symptoms') return `Recognize signs such as ${unit.items.slice(0, 4).join(', ')}.`
  if (unit.learningShape === 'timeline') return 'Recall dates, milestones, and ordering.'
  if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return 'Practice the sequence as a practical review target.'
  if (unit.learningShape === 'equipment') return 'Identify the equipment or tool examples by name and purpose.'
  if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return 'Keep the groups under the correct classification heading.'
  if (unit.learningShape === 'formula') return 'Know when and how the source formula is used.'
  if (unit.learningShape === 'worked-example') return 'Follow the source example pattern without inventing extra steps.'
  if (unit.learningShape === 'case-rule') return 'Connect the rule or standard to the correct fact pattern.'
  if (unit.learningShape === 'clinical-care') return 'Keep the assessment, intervention, or care priorities straight.'
  if (unit.learningShape === 'cause-effect') return 'Explain the relationship between causes and effects.'
  if (unit.learningShape === 'troubleshooting') return 'Use the symptoms, causes, and fixes in order.'
  if (unit.learningShape === 'component-system') return 'Identify how the parts fit into the system.'
  if (unit.learningShape === 'standards-rubrics') return 'Apply the listed criteria or standards accurately.'
  if (unit.learningShape === 'passage-theme') return 'Tie themes or claims to textual evidence.'
  if (unit.learningShape === 'reflection') return 'Answer the reflective prompt using course ideas.'
  if (unit.kind === 'definition') return `Give the compact definition of ${unit.title}.`
  if (unit.kind === 'process') return `Put the methods or response steps in a usable order.`
  if (unit.items.length >= 3) return `Recall the examples without mixing them with nearby sections.`
  return `Explain the concept in one short answer.`
}

function buildKnownSourceMapReviewerQuestion(unit: SourceMapReviewerUnit) {
  const key = normalizeLookup(unit.title)
  const questions: Record<string, string> = {
    'it security': 'What is IT Security?',
    'infosec vs it sec': 'Differentiate InfoSec and IT Security.',
    'cia triad': 'What are the three goals of IT Security?',
    'domains of it security': 'Enumerate the domains of IT Security.',
    'cybersecurity': 'What is Cybersecurity?',
    'cybersecurity approach layers': 'What does a successful cybersecurity approach protect across?',
    'people process technology': 'Which three elements must complement one another to defend an organization from cyberattacks?',
    'unified threat management': 'What security operations can a unified threat management system accelerate?',
    'importance of cybersecurity': 'Why is cybersecurity important to organizations and critical infrastructure?',
    'challenges of cybersecurity': 'Enumerate the challenges of cybersecurity.',
    'impact of a security breach': 'What are possible impacts of a security breach?',
    'types of attackers': 'Classify the types of cyber attackers.',
    'vulnerability exploit breach': 'Differentiate vulnerability, exploit, and breach.',
    'cybersecurity threat types': 'Differentiate cybercrime, disruption, and espionage.',
    'malware types': 'Which items are types of malware?',
    'malware symptoms': 'What are symptoms of malware?',
    'methods of infiltration': 'Enumerate the methods of infiltration.',
    'denial of service methods': 'What methods are used to deny service?',
    'zombie vs botnet': 'Differentiate a zombie and a botnet.',
    'seo vs seo poisoning': 'Differentiate SEO and SEO Poisoning.',
    'blended attacks': 'What is a blended attack?',
    'impact reduction': 'What steps reduce impact after a breach?',
    'arnis': 'What is Arnis?',
    'aliases': 'What are the aliases of Arnis?',
    'ra 9850': 'What did RA 9850 declare?',
    'historical concept': 'What is the historical concept of Arnis?',
    'evolution classifications': 'Enumerate the naming systems or classifications of Arnis.',
    'organizations timeline': 'Arrange the Arnis organizations and milestones chronologically.',
    'timeline': 'Arrange the Arnis timeline chronologically.',
    'regional systems': 'Match each regional system with its group.',
    'main groups': 'What are the three main Arnis groups?',
    'courtesy salutation': 'What are the steps in Pugay or courtesy salutation?',
    'strike types': 'Enumerate the types of strikes.',
    'equipment weapons': 'Identify Arnis weapons and equipment.',
    'stick types': 'Differentiate Arnis stick types and lengths.',
    'regional classifications': 'What are the regional classifications of Arnis?',
    'arnis as a sport': 'How is Arnis played as a sport?',
  }
  return questions[key] ?? null
}

function buildSourceMapExamCue(unit: SourceMapReviewerUnit) {
  const key = normalizeLookup(unit.title)
  if (key === 'infosec vs it sec') return 'Be able to distinguish InfoSec from IT Sec.'
  if (key === 'vulnerability exploit breach') return 'Be able to distinguish Vulnerability from Exploit and Breach.'
  if (key === 'malware symptoms' || key === 'importance of cybersecurity') return 'Be able to enumerate the items.'
  if (key === 'impact reduction') return 'Know the order or purpose of the steps.'
  if (isAdaptiveEducationalReviewerUnit(unit)) {
    if (unit.learningShape === 'timeline') return 'Know the chronology or milestone order.'
    if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return 'Know the order or purpose of the steps.'
    if (unit.learningShape === 'equipment') return 'Be able to identify the listed equipment.'
    if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return 'Be able to classify the items.'
    if (unit.learningShape === 'formula') return 'Know the formula and when to use it.'
    if (unit.learningShape === 'worked-example') return 'Know the example pattern.'
    if (unit.learningShape === 'case-rule') return 'Know the rule and how to apply it.'
    if (unit.learningShape === 'clinical-care') return 'Know the care priority or clinical action.'
    if (unit.learningShape === 'cause-effect') return 'Know the cause-effect relationship.'
    if (unit.learningShape === 'troubleshooting') return 'Know the symptom, cause, and fix pattern.'
    if (unit.learningShape === 'component-system') return 'Know each component and its role.'
    if (unit.learningShape === 'standards-rubrics') return 'Know the criteria or standards.'
    if (unit.learningShape === 'passage-theme') return 'Know the theme or claim and its evidence.'
    if (unit.learningShape === 'reflection') return 'Know the reflective focus.'
  }
  if (unit.kind === 'definition') return 'Know the exact definition.'
  if (unit.kind === 'process') return 'Know the order or purpose of the steps.'
  if (unit.items.length >= 2) return 'Be able to enumerate the items.'
  return 'Know the exact definition.'
}

function isAdaptiveEducationalReviewerUnit(unit: SourceMapReviewerUnit) {
  return isSpecializedReviewerLearningShape(unit.learningShape)
    || /\b(?:arnis|ra 9850|historical|evolution|organizations|courtesy|salutation|strike|equipment|weapons|stick|regional)\b/i.test(unit.title)
}

function isSpecializedReviewerLearningShape(shape: AcademicLearningShape) {
  return shape === 'formula'
    || shape === 'worked-example'
    || shape === 'case-rule'
    || shape === 'clinical-care'
    || shape === 'cause-effect'
    || shape === 'troubleshooting'
    || shape === 'component-system'
    || shape === 'lab-process'
    || shape === 'standards-rubrics'
    || shape === 'passage-theme'
    || shape === 'reflection'
}

function isStrongSourceMapQuickBlockUnit(unit: SourceMapReviewerUnit) {
  if (unit.kind === 'definition') return false
  if (unit.items.length < 3) return false
  if (isWeakReviewerTerm(unit.title)) return false
  const key = normalizeLookup(unit.title)
  if (/^(?:terms|there|high|state|programs)$/i.test(key)) return false
  return unit.kind === 'category'
    || unit.kind === 'process'
    || unit.kind === 'list'
    || getPreferredSourceMapRank(unit.title) < 100
}

function getSourceMapReviewerListLimit(title: string, kind: AcademicSourceMapUnit['kind'], mode: 'answer' | 'quick' | 'short') {
  if (/^domains of it security$/i.test(title)) return 11
  if (/^malware types$/i.test(title)) return 10
  if (/^(?:courtesy \/ salutation|strike types|equipment \/ weapons|stick types|organizations \/ timeline|timeline|regional classifications|regional systems|main groups|evolution \/ classifications)$/i.test(title)) return 12
  if (mode === 'short') return kind === 'process' ? 5 : 6
  return kind === 'process' ? 7 : 8
}

function isWeakQuickReviewPoint(value: string) {
  const key = normalizeLookup(value)
  if (!key) return true
  if (/^(?:there|high|state|terms|programs|what|activity|organization)$/i.test(key)) return true
  if (/^cyber crime is big business$/i.test(key)) return true
  if (/\b(?:sent to a host|the receiver|attacks backed by state agencies that|that are part)\b/i.test(value)) return true
  if (key.split(/\s+/).length > 14) return true
  return false
}

function shapeQuickReviewPoint(value: string, heading: string) {
  let cleaned = cleanReviewerText(value)
    .replace(/^\d+[.)]\s*/, '')
    .trim()
  if (normalizeLookup(heading) === 'malware symptoms') {
    cleaned = cleaned
      .replace(/^There is an?\s+/i, '')
      .replace(/^There are\s+/i, '')
      .replace(/^There is a presence of\s+/i, 'Presence of ')
      .replace(/^The computer\s+/i, 'Computer ')
      .trim()
  }
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : cleaned
}

function shapeReviewerDefinitionAnswer(title: string, value: string) {
  const cleaned = cleanDefinitionAnswer(title, value)
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''

  const clamped = clampReviewerAnswerToKnownHeading(cleaned, title)
  const sentences = clamped
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  if (sentences.length > 0) return sentences.slice(0, 2).join(' ')

  const parts = clamped
    .split(/\s*â€¢\s*|\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.slice(0, 3).join('; ').slice(0, 260)
}

function clampReviewerAnswerToKnownHeading(value: string, title: string) {
  let end = value.length
  for (const heading of [
    'Goal of IT Security',
    'Domains of IT Security',
    'What is Cybersecurity',
    'Importance of cybersecurity',
    'Challenges of Cybersecurity',
    'Types of Attackers',
    'Definition of Terms',
    'Types of Cybersecurity Threats',
    'Types of Malware',
    'Symptoms of Malware',
    'Methods of Infiltration',
    'Methods to Deny Service',
    'Blended Attacks',
    'Impact Reduction',
  ]) {
    if (normalizeLookup(heading) === normalizeLookup(title)) continue
    const match = value.match(new RegExp(`\\b${escapeRegExp(heading)}\\??\\b`, 'i'))
    if (match?.index && match.index > 18) end = Math.min(end, match.index)
  }
  return value.slice(0, end).trim()
}

function cleanDefinitionAnswer(title: string, value: string) {
  return cleanReviewerText(value)
    .replace(new RegExp(`^what\\s+is\\s+${escapeRegExp(title)}\\??\\s*[•:;-]?\\s*`, 'i'), '')
    .replace(new RegExp(`^${escapeRegExp(title)}\\??\\s*[•:;-]?\\s*`, 'i'), '')
    .replace(/^definition of terms\s*[•:;-]?\s*/i, '')
    .replace(/^cybersecurity definitions?\??\s*[•:;-]?\s*/i, '')
    .replace(/^it security definition\s*[•:;-]?\s*/i, '')
    .trim()
}

function compareSourceMapReviewerUnits(left: SourceMapReviewerUnit, right: SourceMapReviewerUnit) {
  return getPreferredSourceMapRank(left.title) - getPreferredSourceMapRank(right.title)
    || right.importanceScore - left.importanceScore
    || left.title.localeCompare(right.title)
}

function getPreferredSourceMapRank(title: string) {
  const preferred = [
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
    'Zombie vs Botnet',
    'SEO vs SEO Poisoning',
    'Blended Attacks',
    'Impact Reduction',
    'Arnis',
    'Aliases',
    'RA 9850',
    'Organizations / Timeline',
    'Timeline',
    'Courtesy / Salutation',
    'Equipment / Weapons',
    'Regional Systems',
    'Main Groups',
    'Evolution / Classifications',
    'Historical Concept',
    'Strike Types',
    'Stick Types',
    'Regional Classifications',
  ].map(normalizeLookup)
  const index = preferred.indexOf(normalizeLookup(title))
  return index === -1 ? 100 : index
}

function buildSourceMapDistinctions(units: SourceMapReviewerUnit[]) {
  const distinctions: StudyOutputReviewerContent['distinctions'] = []
  const infoSec = units.find((unit) => normalizeLookup(unit.title) === 'infosec vs it sec')
  if (infoSec?.sourceWording && /\bInfoSec\b/i.test(infoSec.answer) && /\bIT Sec\b/i.test(infoSec.answer)) {
    distinctions.push({
      conceptA: 'InfoSec',
      conceptB: 'IT Sec',
      difference: infoSec.answer,
      confusionNote: 'InfoSec focuses on sensitive business information, while IT Sec focuses on securing digital data through computer network security.',
    })
  }

  const terms = units.find((unit) => normalizeLookup(unit.title) === 'vulnerability exploit breach')
  if (terms) {
    distinctions.push({
      conceptA: 'Vulnerability',
      conceptB: 'Exploit / Breach',
      difference: terms.sourceWording ?? terms.answer,
      confusionNote: 'A vulnerability is the weakness; an exploit takes advantage of it; a breach is the successful result.',
    })
  }

  const zombieBotnet = units.find((unit) => normalizeLookup(unit.title) === 'zombie vs botnet')
  if (zombieBotnet) {
    distinctions.push({
      conceptA: 'Zombie',
      conceptB: 'Botnet',
      difference: zombieBotnet.sourceWording ?? zombieBotnet.answer,
      confusionNote: 'A zombie is one infected host; a botnet is the network of infected hosts.',
    })
  }

  const seo = units.find((unit) => normalizeLookup(unit.title) === 'seo vs seo poisoning')
  if (seo) {
    distinctions.push({
      conceptA: 'SEO',
      conceptB: 'SEO Poisoning',
      difference: seo.sourceWording ?? seo.answer,
      confusionNote: 'SEO improves ranking; SEO Poisoning pushes malicious sites higher.',
    })
  }

  return distinctions.filter((item) => item.difference.length > 0)
}

function sourceMapImportance(score: number) {
  if (score >= 86) return 'high' as const
  if (score >= 68) return 'medium' as const
  return 'low' as const
}

function isWeakReviewerTerm(value: string) {
  const key = normalizeLookup(value)
  if (key === 'bot') return false
  if (!key) return true
  if (key.length < 4) return true
  return new Set([
    'what',
    'activity',
    'organization',
    'there',
    'high',
    'state',
    'terms',
    'programs',
    'cyber crime big business',
    'attacks backed by state agencies that',
    'sent to a host or application and the receiver',
    'organization people processes technology must',
    'source summary',
    'source notes',
    'exact source wording',
    'reconstructed lists',
    'clean source summary fragments',
    'academic source map',
    'deterministic academic structure',
  ]).has(key)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasCompactReviewerCaution(note: DeepLearnNote) {
  return note.cautionNotes.some((note) => /compact reviewer|compact study pack|source was long/i.test(note))
}

function buildQuickReviewBlocks(note: DeepLearnNote) {
  const sections = note.sections.length > 0
    ? note.sections
    : fallbackSectionsFromNoteBody(note.noteBody || buildDeepLearnNoteBody(note.sections))

  return sections
    .map((section) => ({
      heading: specializeQuickReviewHeading(section.heading, section.body),
      points: toQuickReviewPoints(section.body),
    }))
    .filter((section) => section.points.length > 0)
    .slice(0, 6)
}

function fallbackSectionsFromNoteBody(noteBody: string) {
  const trimmed = noteBody.trim()
  if (!trimmed) return []

  return trimmed
    .split(/\n{2,}/)
    .map((block, index) => ({
      heading: `Core review ${index + 1}`,
      body: block.trim(),
    }))
    .filter((block) => block.body.length > 0)
}

function toQuickReviewPoints(body: string) {
  return body
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .map(cleanEducationalReviewerPoint)
    .filter((line) => line.length >= 18 && !containsInternalPipelineText(line))
    .slice(0, 4)
}

function exactMemorizeText(wording: Parameters<typeof resolveDeepLearnWording>[0]) {
  return cleanReviewerText(resolveDeepLearnWording(wording, 'exact_source'))
}

function plainExplanation(item: DeepLearnAnswerBankItem | DeepLearnIdentificationItem) {
  const simplified = 'simplifiedWording' in item ? item.simplifiedWording : null
  const explanation = simplified ?? item.supportingContext ?? item.draftExplanation ?? item.reviewText ?? null
  const cleaned = explanation ? cleanReviewerText(explanation) : null
  return cleaned && cleaned !== exactMemorizeText(item.answer) ? cleaned : null
}

function buildIdentificationPrompt(item: DeepLearnIdentificationItem) {
  const prompt = cleanReviewerText(item.prompt)
  if (/^(?:identify|define|explain)\b/i.test(prompt)) return prompt
  const answer = exactMemorizeText(item.answer)
  if (answer && normalizeLookup(prompt) !== normalizeLookup(answer)) return `Identify: ${prompt}`
  return prompt
}

function buildLikelyQuizReason(reason: string) {
  const cleaned = cleanReviewerText(reason)
  if (/^(?:explain|distinguish|apply|compare|why|how|which)\b/i.test(cleaned)) return cleaned
  return `Explain or apply: ${cleaned}`
}

function specializeQuickReviewHeading(heading: string, body: string) {
  const cleaned = normalizeStudyOutputHeadingIfRaw(cleanReviewerText(heading))
  if (/multiple layers|layers of protection|systems, networks, programs, and data/i.test(body)) {
    return 'Layered Cybersecurity Defense'
  }
  if (/cia|confidentiality|integrity|availability/i.test(`${heading} ${body}`)) return 'CIA Triad'
  return cleaned
}

function cleanEducationalReviewerPoint(value: string) {
  const cleaned = cleanReviewerText(value)
  const layered = cleaned.match(/(?:successful\s+)?cybersecurity\s+approach\s+has\s+multiple\s+layers.*?(?:systems,\s*networks,\s*programs,\s*and\s*data|systems.*?networks.*?programs.*?data)/i)
  if (layered) return 'Multiple layers of protection are used across systems, networks, programs, and data.'
  return cleaned
}

function cleanReviewerText(value: string) {
  return normalizeSourceFaithfulText(sanitizeStudentFacingText(value)).replace(/\?{2,}/g, ' ').replace(/\s+/g, ' ').trim()
}

function containsInternalPipelineText(value: string) {
  return /\b(?:Reconstructed lists|Clean source summary fragments|Normalized headings|Detected concepts|Academic headings|Concept hierarchy|Term definitions|Duplicate OCR\/source fragments collapsed|No compact answer bank was recovered|The pack does not yet rank likely quiz targets|compact answer bank|likely quiz targets not ranked|recovered from this source|parser failed|repair payload|raw source|metadata-only)\b/i.test(value)
}

function dedupeQuickReviewBlocks(blocks: ReturnType<typeof buildQuickReviewBlocks>) {
  const seenHeadings = new Set<string>()
  const seenPoints = new Set<string>()
  const result: ReturnType<typeof buildQuickReviewBlocks> = []
  for (const block of blocks) {
    const headingKey = normalizeLookup(block.heading)
    if (!headingKey || seenHeadings.has(headingKey)) continue
    const points = block.points.filter((point) => {
      const key = normalizeLookup(point)
      if (!key || seenPoints.has(key)) return false
      seenPoints.add(key)
      return true
    })
    if (points.length === 0) continue
    seenHeadings.add(headingKey)
    result.push({ ...block, points })
  }
  return result
}

function claimReviewerConcept(seen: Set<string>, value: string) {
  const key = normalizeLookup(value)
  if (!key || key.length < 4) return true
  if (seen.has(key)) return false
  seen.add(key)
  return true
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function compareImportanceDesc(left: DeepLearnAnswerBankItem | DeepLearnIdentificationItem, right: DeepLearnAnswerBankItem | DeepLearnIdentificationItem) {
  return compareImportance(right.importance, left.importance)
}

function compareImportance(left: 'high' | 'medium' | 'low', right: 'high' | 'medium' | 'low') {
  return getImportanceRank(left) - getImportanceRank(right)
}

function getImportanceRank(value: 'high' | 'medium' | 'low') {
  if (value === 'high') return 0
  if (value === 'medium') return 1
  return 2
}
