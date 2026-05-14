import { resolveDeepLearnWording, sanitizeStudentFacingText } from '@/lib/deep-learn'
import { buildDeepLearnNoteBody } from '@/lib/deep-learn'
import { validateAcademicSourceMap, type AcademicSourceMap, type AcademicSourceMapUnit } from '@/lib/deep-learn-source-map'
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
      support: unit.support,
      sourceWording: unit.sourceWording,
      plainExplanation: unit.support,
    }))
    .filter((item, index, list) => list.findIndex((candidate) => normalizeLookup(candidate.cue) === normalizeLookup(item.cue)) === index)
    .slice(0, 16)

  const identificationReview = units
    .slice(0, 16)
    .map((unit) => ({
      prompt: `Identify or define ${unit.title}.`,
      answer: unit.shortAnswer,
      importance: sourceMapImportance(unit.importanceScore),
      support: unit.support,
      sourceWording: unit.sourceWording,
      plainExplanation: unit.support,
    }))
    .filter((item) => !isWeakReviewerTerm(item.answer))
    .slice(0, Math.max(4, REVIEWER_MEMORIZATION_ITEM_LIMIT - highYieldConcepts.length))

  const quickReviewBlocks = units
    .filter((unit) => unit.kind !== 'definition' && unit.items.length >= 2)
    .map((unit) => ({
      heading: unit.title,
      points: unit.items
        .map((item) => cleanReviewerText(item))
        .filter((item) => item.length > 0 && !isWeakReviewerTerm(item))
        .slice(0, 8),
    }))
    .filter((block) => block.points.length > 0)
    .slice(0, 12)

  const distinctions = buildSourceMapDistinctions(units).slice(0, 6)
  const likelyQuizTargets = units
    .slice(0, 12)
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
    .find((quote) => quote.length >= 12 && !containsInternalPipelineText(quote))
    ?? null
  const shortAnswer = items.length > 0 && unit.kind !== 'definition'
    ? items.slice(0, 6).join(', ')
    : answer
  const support = cleanDefinitionAnswer(title, cleanReviewerText(unit.summary))

  if (!answer || isWeakReviewerTerm(answer)) return null

  return {
    title,
    answer,
    shortAnswer,
    support: support && support !== answer ? support : null,
    sourceWording,
    items,
    kind: unit.kind,
    importanceScore: unit.importanceScore,
  }
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
  if (lookup === 'denial of service methods') return 'Denial of Service Methods'
  if (lookup === 'impact reduction') return 'Impact Reduction'
  if (lookup === 'types of attackers') return 'Types of Attackers'
  return cleaned
}

function buildSourceMapAnswer(title: string, unit: AcademicSourceMapUnit, items: string[]) {
  const summary = cleanReviewerText(unit.summary)
  if (items.length >= 2 && !/^(?:IT Security|Cybersecurity)$/i.test(title)) {
    return `${title} includes ${items.slice(0, 8).join(', ')}.`
  }
  return cleanDefinitionAnswer(title, summary)
    || unit.sourceQuotes.map((quote) => cleanDefinitionAnswer(title, cleanReviewerText(quote))).find(Boolean)
    || title
}

function buildSourceMapIntro(units: SourceMapReviewerUnit[], fallbackOverview: string) {
  const firstDefinition = units.find((unit) => unit.kind === 'definition')
  if (firstDefinition) return `${firstDefinition.title}: ${firstDefinition.answer}`
  return cleanReviewerText(fallbackOverview) || 'Use this reviewer for source-backed definitions, lists, distinctions, and likely quiz targets.'
}

function buildSourceMapQuizTarget(unit: SourceMapReviewerUnit) {
  if (unit.kind === 'process') return `Apply ${unit.title}`
  if (unit.items.length >= 3) return `Enumerate ${unit.title}`
  if (/ vs |\/|triad/i.test(unit.title)) return `Distinguish ${unit.title}`
  return `Explain ${unit.title}`
}

function buildSourceMapQuizReason(unit: SourceMapReviewerUnit) {
  if (unit.kind === 'definition') return `Explain or define ${unit.title} using the source wording.`
  if (unit.kind === 'process') return `Apply the steps or methods listed under ${unit.title}.`
  if (unit.items.length >= 3) return `Enumerate the source-listed items: ${unit.items.slice(0, 6).join(', ')}.`
  return `Explain or apply the source-backed concept: ${unit.title}.`
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
  ].map(normalizeLookup)
  const index = preferred.indexOf(normalizeLookup(title))
  return index === -1 ? 100 : index
}

function buildSourceMapDistinctions(units: SourceMapReviewerUnit[]) {
  const distinctions: StudyOutputReviewerContent['distinctions'] = []
  const infoSec = units.find((unit) => normalizeLookup(unit.title) === 'infosec vs it sec')
  if (infoSec) {
    distinctions.push({
      conceptA: 'InfoSec',
      conceptB: 'IT Sec',
      difference: infoSec.sourceWording ?? infoSec.answer,
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
  if (!key) return true
  if (key.length < 4) return true
  return new Set([
    'what',
    'activity',
    'organization',
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
