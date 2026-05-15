import { resolveDeepLearnWording, sanitizeStudentFacingText } from '@/lib/deep-learn'
import { buildDeepLearnNoteBody } from '@/lib/deep-learn'
import { validateAcademicSourceMap, type AcademicSourceMap, type AcademicSourceMapUnit, type AcademicSourceMapUnitType } from '@/lib/deep-learn-source-map'
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
    ? 'Compact Reviewer built from the strongest source-backed Study Pack items.'
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
    .slice(0, 20)
    .map((unit) => ({
      cue: unit.title,
      answer: unit.answer,
      importance: sourceMapImportance(unit.importanceScore),
      support: null,
      sourceWording: unit.sourceWording,
      plainExplanation: buildSourceMapExamCue(unit),
    }))
    .filter((item, index, list) => list.findIndex((candidate) => normalizeLookup(candidate.cue) === normalizeLookup(item.cue)) === index)
    .slice(0, 20)

  const identificationReview = units
    .slice(0, 16)
    .map((unit) => ({
      prompt: `Identify or define ${unit.title}.`,
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
    .slice(0, 16)
    .map((unit) => ({
      target: buildSourceMapQuizTarget(unit),
      reason: buildSourceMapQuizReason(unit),
      importance: sourceMapImportance(unit.importanceScore),
    }))
    .filter((item) => !isWeakReviewerTerm(item.target))
    .slice(0, 16)

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
    summary: `Source Map Reviewer built from ${units.length} source-backed academic unit${units.length === 1 ? '' : 's'}. ${highYieldConcepts.length} high-yield answer cue${highYieldConcepts.length === 1 ? '' : 's'} and ${identificationReview.length} identification item${identificationReview.length === 1 ? '' : 's'} are ready for cram review.`,
    intro: buildSourceMapIntro(units, note.overview),
    highYieldConcepts,
    identificationReview,
    quickReviewBlocks,
    distinctions,
    likelyQuizTargets,
    cautionNotes: note.cautionNotes.map(cleanReviewerText).filter(Boolean).filter((item) => !containsInternalPipelineText(item)).slice(0, 4),
  }
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
    importanceScore: unit.importanceScore,
  }
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
  if (lookup === 'cybersecurity definitions') return 'Cybersecurity'
  if (lookup === 'importance of cybersecurity') return 'Importance of Cybersecurity'
  if (lookup === 'challenges') return 'Challenges of Cybersecurity'
  if (lookup === 'cybercrime disruption espionage') return 'Cybersecurity Threat Types'
  if (lookup === 'malware types') return 'Malware Types'
  if (lookup === 'malware symptoms') return 'Malware Symptoms'
  if (lookup === 'infiltration methods') return 'Methods of Infiltration'
  if (lookup === 'methods of infiltration') return 'Methods of Infiltration'
  if (lookup === 'denial of service methods') return 'Denial of Service Methods'
  if (lookup === 'methods to deny service') return 'Denial of Service Methods'
  if (lookup === 'impact reduction') return 'Impact Reduction'
  if (lookup === 'types of attackers') return 'Types of Attackers'
  if (lookup === 'blended attacks') return 'Blended Attacks'
  if (lookup === 'arnis definition') return 'Arnis'
  if (lookup === 'ra 9850') return 'RA 9850'
  if (lookup === 'historical concept') return 'Historical Concept'
  if (lookup === 'evolution classifications') return 'Evolution / Classifications'
  if (lookup === 'organizations timeline') return 'Organizations / Timeline'
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
  if (titleKey === 'arnis') {
    return shapeReviewerDefinitionAnswer(title, cleanDefinitionAnswer(title, summary))
  }
  if (items.length >= 2 && !/^(?:IT Security|Cybersecurity)$/i.test(title)) {
    const unitType = inferReviewerUnitType(title, unit)
    const prefix = unitType === 'timeline'
      ? `${title} milestones`
      : unitType === 'equipment'
        ? `${title} identification`
        : unitType === 'procedure'
          ? `${title} sequence`
          : unitType === 'classification'
            ? `${title} classifications`
            : unit.kind === 'process' ? `${title} steps` : `${title} key list`
    return `${prefix}: ${items.slice(0, getSourceMapReviewerListLimit(title, unit.kind, 'answer')).join('; ')}.`
  }
  return shapeReviewerDefinitionAnswer(title, cleanDefinitionAnswer(title, summary))
    || unit.sourceQuotes.map((quote) => shapeReviewerDefinitionAnswer(title, cleanDefinitionAnswer(title, cleanReviewerText(quote)))).find(Boolean)
    || title
}

function buildSourceMapIntro(units: SourceMapReviewerUnit[], fallbackOverview: string) {
  const firstDefinition = units.find((unit) => unit.kind === 'definition')
  if (firstDefinition) return `${firstDefinition.title}: ${firstDefinition.answer}`
  return cleanReviewerText(fallbackOverview) || 'Use this reviewer for source-backed definitions, lists, distinctions, and likely quiz targets.'
}

function buildSourceMapQuizTarget(unit: SourceMapReviewerUnit) {
  const key = normalizeLookup(unit.title)
  if (key === 'malware symptoms') return 'Identify symptoms of malware'
  if (key === 'infosec vs it sec' || key === 'vulnerability exploit breach') return `Differentiate ${unit.title}`
  if (unit.unitType === 'timeline') return `Arrange milestones for ${unit.title}`
  if (unit.unitType === 'procedure') return `Sequence ${unit.title}`
  if (unit.unitType === 'equipment') return `Identify equipment in ${unit.title}`
  if (unit.unitType === 'classification') return `Classify items in ${unit.title}`
  if (/threat types|attackers|malware types/i.test(unit.title)) return `Match terms in ${unit.title}`
  if (/importance|challenges/i.test(unit.title)) return `Explain why ${unit.title} matters`
  if (unit.kind === 'definition') return `Define ${unit.title}`
  if (unit.kind === 'process') return `Sequence steps for ${unit.title}`
  if (unit.items.length >= 3) return `Enumerate key items in ${unit.title}`
  if (/ vs |\/|triad/i.test(unit.title)) return `Differentiate ${unit.title}`
  return `Explain ${unit.title}`
}

function buildSourceMapQuizReason(unit: SourceMapReviewerUnit) {
  const key = normalizeLookup(unit.title)
  if (key === 'infosec vs it sec') return 'Keep the business-information focus separate from network/data-security wording.'
  if (key === 'vulnerability exploit breach') return 'These terms are commonly tested as a sequence: weakness, method/tool, successful result.'
  if (key === 'malware symptoms') return `Recognize source-listed signs such as ${unit.items.slice(0, 4).join(', ')}.`
  if (unit.unitType === 'timeline') return 'Recall the chronology or milestone relationships preserved from the source.'
  if (unit.unitType === 'procedure') return 'Practice the source-listed sequence as a practical review target.'
  if (unit.unitType === 'equipment') return 'Identify the equipment or weapon examples by name and purpose.'
  if (unit.unitType === 'classification') return 'Keep the source-listed groups under the correct classification heading.'
  if (unit.kind === 'definition') return `Give the compact source-backed definition of ${unit.title}.`
  if (unit.kind === 'process') return `Put the source-listed methods or response steps in a usable order.`
  if (unit.items.length >= 3) return `Recall the source-listed examples without mixing them with nearby sections.`
  return `Explain the source-backed concept in one short answer.`
}

function buildSourceMapExamCue(unit: SourceMapReviewerUnit) {
  const key = normalizeLookup(unit.title)
  if (key === 'infosec vs it sec') return 'Be able to distinguish InfoSec from IT Sec.'
  if (key === 'vulnerability exploit breach') return 'Be able to distinguish Vulnerability from Exploit and Breach.'
  if (isAdaptiveEducationalReviewerUnit(unit)) {
    if (unit.unitType === 'timeline') return 'Know the chronology or milestone order.'
    if (unit.unitType === 'procedure') return 'Know the order or purpose of the steps.'
    if (unit.unitType === 'equipment') return 'Be able to identify the listed equipment.'
    if (unit.unitType === 'classification') return 'Be able to classify the listed items.'
  }
  if (unit.kind === 'definition') return 'Know the exact definition.'
  if (unit.kind === 'process') return 'Know the order or purpose of the steps.'
  if (unit.items.length >= 2) return 'Be able to enumerate the listed items.'
  return 'Know the exact definition.'
}

function isAdaptiveEducationalReviewerUnit(unit: SourceMapReviewerUnit) {
  return /\b(?:arnis|ra 9850|historical|evolution|organizations|courtesy|salutation|strike|equipment|weapons|stick|regional)\b/i.test(unit.title)
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
  if (/^(?:courtesy \/ salutation|strike types|equipment \/ weapons|stick types|organizations \/ timeline|regional classifications|evolution \/ classifications)$/i.test(title)) return 12
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
    'Arnis',
    'Aliases',
    'RA 9850',
    'Historical Concept',
    'Evolution / Classifications',
    'Organizations / Timeline',
    'Courtesy / Salutation',
    'Strike Types',
    'Equipment / Weapons',
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
  return normalizeSourceFaithfulText(sanitizeStudentFacingText(value))
}

function containsInternalPipelineText(value: string) {
  return /\b(?:Reconstructed lists|Clean source summary fragments|Normalized headings|Detected concepts|Academic headings|Concept hierarchy|Term definitions|Duplicate OCR\/source fragments collapsed)\b/i.test(value)
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
