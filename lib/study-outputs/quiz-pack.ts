import { deepLearnNoteHasUntrustworthyGrounding } from '@/lib/deep-learn-source-validation'
import { validateAcademicSourceMap, type AcademicSourceMapUnit } from '@/lib/deep-learn-source-map'
import { buildDeepLearnQuizItems, MIN_DEEP_LEARN_QUIZ_ITEM_COUNT } from '@/lib/deep-learn-quiz'
import { buildStudyNoteQuestionCountOptions } from '@/lib/study-note-quiz'
import { buildReviewerContentFromSourceMap } from '@/lib/study-outputs/reviewer'
import { normalizeSourceFaithfulText, normalizeStudyOutputHeadingIfRaw } from '@/lib/study-outputs/source-faithful'
import type {
  DeepLearnNote,
  StudyOutputQuizPackContent,
  StudyOutputQuizPackItem,
  StudyOutputQuizItemType,
} from '@/lib/types'

const MAX_QUIZ_PACK_ITEMS = 15
const MAX_SOURCE_MAP_IDENTIFICATION_ITEMS = 11
const MAX_SOURCE_MAP_MCQ_ITEMS = 4
const HIGH_CONFIDENCE_THRESHOLD = 0.84
const MAX_MCQ_ANSWER_CHARS = 96

export interface QuizPackBuildReadiness {
  ok: boolean
  reason: 'missing' | 'pending' | 'failed' | 'metadata_only' | 'empty'
  message: string
}

export interface NormalizedQuizSourceUnit {
  sourceUnitId: string
  title: string
  normalizedQuestionStem: string
  normalizedAnswer: string
  aliases: string[]
  sourceExcerpt: string
  sourceHeading: string
  sourceType: AcademicSourceMapUnit['kind']
  confidence: number
  keywords: string[]
}

export function getDeepLearnQuizPackReadiness(note: DeepLearnNote | null): QuizPackBuildReadiness {
  if (!note) {
    return {
      ok: false,
      reason: 'missing',
      message: 'Deep Learn needs a saved ready Study Pack before it can start a Quiz.',
    }
  }

  if (note.status === 'pending') {
    return {
      ok: false,
      reason: 'pending',
      message: 'Deep Learn is still preparing this Study Pack. The Quiz unlocks after the pack is ready.',
    }
  }

  if (note.status === 'failed') {
    return {
      ok: false,
      reason: 'failed',
      message: 'Deep Learn could not build a trustworthy Study Pack from this source, so a Quiz cannot be made yet.',
    }
  }

  if (deepLearnNoteHasUntrustworthyGrounding(note)) {
    return {
      ok: false,
      reason: 'metadata_only',
      message: 'This Study Pack is not grounded in enough readable academic source text for a Quiz.',
    }
  }

  const items = buildQuizPackItems(note)
  if (items.length < MIN_DEEP_LEARN_QUIZ_ITEM_COUNT) {
    return {
      ok: false,
      reason: 'empty',
      message: 'This Study Pack does not yet have enough academic source content for a useful Quiz.',
    }
  }

  return {
    ok: true,
    reason: 'empty',
    message: '',
  }
}

export function buildDeepLearnQuizPackContent(note: DeepLearnNote): StudyOutputQuizPackContent {
  const readiness = getDeepLearnQuizPackReadiness(note)
  if (!readiness.ok) {
    throw new Error(readiness.message)
  }

  const items = buildQuizPackItems(note)

  return {
    version: 'quiz-pack-v1',
    sourceNoteId: note.id,
    sourceResourceId: note.resourceId,
    title: buildQuizPackTitle(note.title),
    summary: buildQuizPackSummary(note, items.length),
    intro: note.overview,
    items,
    questionCountOptions: buildStudyNoteQuestionCountOptions(items.length),
    answerRevealLabel: 'Reveal answer',
    selfReviewLabel: 'Mark correct',
  }
}

export function buildQuizPackItems(note: DeepLearnNote): StudyOutputQuizPackItem[] {
  const sourceMapItems = buildSourceMapQuizPackItems(note)
  if (sourceMapItems.length > 0 || note.sourceGrounding.sourceMap) {
    return sourceMapItems.slice(0, MAX_QUIZ_PACK_ITEMS)
  }

  const baseItems = buildDeepLearnQuizItems(note).map((item): StudyOutputQuizPackItem => ({
    id: item.id,
    type: mapQuizStyleToOutputType(item.style),
    prompt: item.prompt,
    answer: item.answer,
    choices: item.choices,
    explanation: item.explanation,
    sourceLabel: item.sourceLabel,
    sourceWording: item.sourceWording ?? null,
    sourceBasis: item.sourceBasis ?? item.sourceWording ?? item.explanation,
    matchingPrompt: null,
    matchingAnswer: null,
    truthValue: item.style === 'multiple_choice' && item.choices.length === 2 && isTrueFalseChoices(item.choices)
      ? normalizeLookup(item.answer) === 'true'
      : null,
    sourceUnitId: null,
    sourceExcerpt: item.sourceBasis ?? item.sourceWording ?? null,
    confidence: null,
    generationMethod: 'legacy_study_pack',
  }))

  return uniqueBy(
    baseItems,
    (item) => `${normalizeLookup(item.prompt)}::${normalizeLookup(item.answer)}::${item.type}`,
  ).slice(0, MAX_QUIZ_PACK_ITEMS)
}

export function buildNormalizedQuizSourceUnits(note: DeepLearnNote): NormalizedQuizSourceUnit[] {
  const sourceMap = note.sourceGrounding.sourceMap
  if (!sourceMap || !validateAcademicSourceMap(sourceMap).ok) return []

  const reviewer = buildReviewerContentFromSourceMap(note)
  if (!reviewer) return []

  const reviewerAnswers = new Map(
    reviewer.highYieldConcepts.map((item) => [
      normalizeLookup(item.cue),
      {
        answer: cleanQuizText(item.answer),
        sourceWording: cleanQuizText(item.sourceWording ?? item.answer),
      },
    ]),
  )

  return sourceMap.units
    .map((unit): NormalizedQuizSourceUnit | null => {
      const title = normalizeQuizSourceTitle(unit.title)
      const titleKey = normalizeLookup(title)
      const reviewerAnswer = reviewerAnswers.get(titleKey)
      const sourceExcerpt = cleanQuizText(unit.sourceQuotes[0] ?? reviewerAnswer?.sourceWording ?? unit.summary)
      const normalizedAnswer = cleanQuizAnswer(title, reviewerAnswer?.answer ?? buildAnswerFromSourceMapUnit(title, unit))
      const aliases = uniqueStrings(unit.items.map(cleanQuizText).filter((item) => item.length > 0 && !isWeakQuizText(item)))
      const keywords = uniqueStrings([
        ...title.split(/\s+/),
        ...aliases.flatMap((item) => item.split(/\s+/)),
      ])
        .map((item) => item.replace(/[^A-Za-z0-9-]/g, '').trim())
        .filter((item) => item.length >= 3)
        .slice(0, 12)

      if (!title || !normalizedAnswer || !sourceExcerpt) return null
      if (isWeakQuizText(title) || isWeakQuizText(normalizedAnswer) || containsQuizGarbage(`${title} ${normalizedAnswer} ${sourceExcerpt}`)) return null
      if (unit.confidence < 0.72) return null

      return {
        sourceUnitId: unit.id,
        title,
        normalizedQuestionStem: buildNormalizedQuestionStem(title, unit.kind),
        normalizedAnswer,
        aliases,
        sourceExcerpt,
        sourceHeading: title,
        sourceType: unit.kind,
        confidence: unit.confidence,
        keywords,
      }
    })
    .filter((unit): unit is NormalizedQuizSourceUnit => Boolean(unit))
    .filter((unit, index, list) => list.findIndex((candidate) => normalizeLookup(candidate.title) === normalizeLookup(unit.title)) === index)
    .sort(compareQuizSourceUnits)
}

function buildQuizPackTitle(noteTitle: string) {
  const trimmed = noteTitle.trim()
  if (!trimmed) return 'Deep Learn Quiz'
  if (/\bquiz\b/i.test(trimmed)) return trimmed.replace(/\bquiz pack\b/i, 'Quiz')
  if (/\bexam prep pack\b/i.test(trimmed)) return trimmed.replace(/\bexam prep pack\b/i, 'Quiz')
  if (/\breviewer\b/i.test(trimmed)) return trimmed.replace(/\breviewer\b/i, 'Quiz')
  return `${trimmed} Quiz`
}

function buildQuizPackSummary(note: DeepLearnNote, itemCount: number) {
  const lane = note.sourceGrounding.sourceMap
    ? 'Quiz built from the saved Source Map and Reviewer.'
    : note.quizReady
      ? 'Deterministic quiz built from the saved Study Pack.'
      : 'Compact quiz built from the saved Study Pack.'
  return `${lane} ${itemCount} grounded question${itemCount === 1 ? '' : 's'} are ready for self-review.`
}

function mapQuizStyleToOutputType(style: 'multiple_choice' | 'identification' | 'short_answer'): StudyOutputQuizItemType {
  if (style === 'multiple_choice') return 'multiple_choice'
  if (style === 'identification') return 'identification'
  return 'identification'
}

function isTrueFalseChoices(choices: string[]) {
  const normalized = choices.map((choice) => normalizeLookup(choice)).sort()
  return normalized.length === 2 && normalized[0] === 'false' && normalized[1] === 'true'
}

function buildSourceMapQuizPackItems(note: DeepLearnNote): StudyOutputQuizPackItem[] {
  const units = buildNormalizedQuizSourceUnits(note)
  if (units.length === 0) return []

  const identificationItems = units
    .slice(0, MAX_SOURCE_MAP_IDENTIFICATION_ITEMS)
    .map((unit, index): StudyOutputQuizPackItem => ({
      id: `${note.resourceId}-source-map-identification-${index}`,
      type: 'identification',
      prompt: buildIdentificationQuestion(unit),
      answer: unit.normalizedAnswer,
      choices: [],
      explanation: buildSourceMapExplanation(unit),
      sourceLabel: note.title,
      sourceWording: unit.sourceExcerpt,
      sourceBasis: unit.sourceExcerpt,
      matchingPrompt: null,
      matchingAnswer: null,
      truthValue: null,
      sourceUnitId: unit.sourceUnitId,
      sourceExcerpt: unit.sourceExcerpt,
      confidence: unit.confidence,
      generationMethod: 'source_map_identification',
    }))

  const mcqItems = units
    .filter(isSafeMultipleChoiceSourceUnit)
    .map((unit, index): StudyOutputQuizPackItem | null => {
      const distractors = deriveSafeDistractors(unit, units)
      if (distractors.length < 3) return null
      const answer = buildMultipleChoiceAnswer(unit)
      const choices = sortChoices([answer, ...distractors.slice(0, 3)])

      return {
        id: `${note.resourceId}-source-map-mcq-${index}`,
        type: 'multiple_choice',
        prompt: buildMultipleChoiceQuestion(unit),
        answer,
        choices,
        explanation: buildSourceMapExplanation(unit),
        sourceLabel: note.title,
        sourceWording: unit.sourceExcerpt,
        sourceBasis: unit.sourceExcerpt,
        matchingPrompt: null,
        matchingAnswer: null,
        truthValue: null,
        sourceUnitId: unit.sourceUnitId,
        sourceExcerpt: unit.sourceExcerpt,
        confidence: unit.confidence,
        generationMethod: 'source_map_mcq',
      }
    })
    .filter((item): item is StudyOutputQuizPackItem => item !== null)
    .slice(0, MAX_SOURCE_MAP_MCQ_ITEMS)

  return uniqueBy(
    [...mcqItems, ...identificationItems],
    (item) => `${normalizeLookup(item.prompt)}::${normalizeLookup(item.answer)}::${item.type}`,
  )
}

function buildAnswerFromSourceMapUnit(title: string, unit: AcademicSourceMapUnit) {
  const items = unit.items.map(cleanQuizText).filter(Boolean)
  if (items.length >= 2 && unit.kind !== 'definition') return items.join(', ')

  const summary = cleanQuizText(unit.summary)
  if (summary && normalizeLookup(summary) !== normalizeLookup(title)) return summary

  return cleanQuizText(unit.sourceQuotes[0] ?? title)
}

function buildNormalizedQuestionStem(title: string, kind: AcademicSourceMapUnit['kind']) {
  if (kind === 'definition') return `Define ${title}.`
  if (kind === 'process') return `Identify the steps or methods in ${title}.`
  if (kind === 'list' || kind === 'category') return `Identify the items in ${title}.`
  return `Identify ${title}.`
}

function buildIdentificationQuestion(unit: NormalizedQuizSourceUnit) {
  if (unit.sourceType === 'definition') return `Define ${unit.title}.`
  if (unit.sourceType === 'process') return `Identify the methods or steps in ${unit.title}.`
  if (unit.aliases.length >= 2) return `Identify the complete list for ${unit.title}.`

  const variants = ['What is', 'Define', 'Identify']
  const variant = variants[Math.abs(hashText(unit.title)) % variants.length]
  if (variant === 'What is') return `What is ${unit.title}?`
  if (variant === 'Define') return `Define ${unit.title}.`
  return `Identify ${unit.title}.`
}

function buildMultipleChoiceQuestion(unit: NormalizedQuizSourceUnit) {
  if (usesListMembershipMcq(unit)) {
    return `Which category includes ${unit.aliases.slice(0, 2).join(' and ')}?`
  }
  if (unit.sourceType === 'definition') return `Which answer best defines ${unit.title}?`
  return `Which answer best matches ${unit.title}?`
}

function buildSourceMapExplanation(unit: NormalizedQuizSourceUnit) {
  if (unit.sourceType === 'definition') return `Use the course definition for ${unit.title}.`
  if (unit.sourceType === 'process') return `Use the listed methods or response steps for ${unit.title}.`
  if (unit.aliases.length >= 2) return `Use the complete list tied to ${unit.title}.`
  return `Use the grounded course wording for ${unit.title}.`
}

function isSafeMultipleChoiceSourceUnit(unit: NormalizedQuizSourceUnit) {
  if (unit.confidence < HIGH_CONFIDENCE_THRESHOLD) return false
  if (usesListMembershipMcq(unit)) return isConciseQuizAnswer(unit.title)
  if (unit.sourceType !== 'definition' && unit.sourceType !== 'concept') return false
  if (!isConciseQuizAnswer(unit.normalizedAnswer)) return false
  if (unit.normalizedAnswer.includes(';')) return false
  if (containsQuizGarbage(`${unit.title} ${unit.normalizedAnswer} ${unit.sourceExcerpt}`)) return false
  return true
}

function deriveSafeDistractors(unit: NormalizedQuizSourceUnit, units: NormalizedQuizSourceUnit[]) {
  if (usesListMembershipMcq(unit)) {
    return uniqueStrings(
      units
        .filter((candidate) => candidate.sourceUnitId !== unit.sourceUnitId)
        .filter((candidate) => usesListMembershipMcq(candidate))
        .map((candidate) => candidate.title)
        .filter(isConciseQuizAnswer)
        .filter((candidate) => normalizeLookup(candidate) !== normalizeLookup(unit.title))
        .filter((candidate) => !areAnswersTooSimilar(candidate, unit.title))
        .filter((candidate) => !containsQuizGarbage(candidate)),
    ).slice(0, 3)
  }

  return uniqueStrings(
    units
      .filter((candidate) => candidate.sourceUnitId !== unit.sourceUnitId)
      .filter((candidate) => candidate.sourceType === unit.sourceType)
      .filter((candidate) => candidate.confidence >= HIGH_CONFIDENCE_THRESHOLD)
      .map((candidate) => candidate.normalizedAnswer)
      .filter(isConciseQuizAnswer)
      .filter((candidate) => normalizeLookup(candidate) !== normalizeLookup(unit.normalizedAnswer))
      .filter((candidate) => !areAnswersTooSimilar(candidate, unit.normalizedAnswer))
      .filter((candidate) => !containsQuizGarbage(candidate)),
  ).slice(0, 3)
}

function buildMultipleChoiceAnswer(unit: NormalizedQuizSourceUnit) {
  return usesListMembershipMcq(unit) ? unit.title : unit.normalizedAnswer
}

function usesListMembershipMcq(unit: NormalizedQuizSourceUnit) {
  return (unit.sourceType === 'category' || unit.sourceType === 'list' || unit.sourceType === 'process')
    && unit.aliases.length >= 2
}

function cleanQuizAnswer(title: string, value: string) {
  const cleaned = cleanQuizText(value)
    .replace(new RegExp(`^${escapeRegExp(title)}\\s+(?:includes|key list|steps)\\s*:?\\s*`, 'i'), '')
    .replace(/\s*Source wording:\s*/gi, ' ')
    .trim()
  return cleaned
}

function cleanQuizText(value: string) {
  return normalizeSourceFaithfulText(value)
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'([{.:;-]+|[\s"'.,;:)\]}]+$/g, '')
    .trim()
}

function isConciseQuizAnswer(value: string) {
  const cleaned = cleanQuizText(value)
  if (cleaned.length < 3 || cleaned.length > MAX_MCQ_ANSWER_CHARS) return false
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length > 13) return false
  if ((cleaned.match(/,/g) ?? []).length >= 2) return false
  return true
}

function isWeakQuizText(value: string) {
  const key = normalizeLookup(value)
  if (key === 'bot') return false
  if (!key || key.length < 3) return true
  if (/^(?:what|there|high|state|terms|programs|activity|organization|source summary|exact source wording|reconstructed lists|clean source summary fragments)$/i.test(key)) return true
  if (/\b(?:uuid|debug|metadata|file title|quality note|extraction|ocr confidence|grounding strategy)\b/i.test(value)) return true
  if (/\b(?:there is|there are|sent to a host|the receiver|attacks backed by state agencies that)\b/i.test(value)) return true
  const alphaChars = value.replace(/[^A-Za-z]/g, '').length
  const totalChars = value.replace(/\s/g, '').length
  return totalChars > 0 && alphaChars / totalChars < 0.42
}

function containsQuizGarbage(value: string) {
  return /\b(?:according to the source|answer-ready fact|compact answer unit|preserved for direct recall|source summary|exact source wording|reconstructed lists|clean source summary fragments|normalized headings|detected concepts|duplicate ocr|ocr garbage|metadata|uuid|debug|file title|quality notes?)\b/i.test(value)
}

function areAnswersTooSimilar(left: string, right: string) {
  const leftKey = normalizeLookup(left)
  const rightKey = normalizeLookup(right)
  if (!leftKey || !rightKey) return true
  return leftKey.includes(rightKey) || rightKey.includes(leftKey)
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeQuizSourceTitle(value: string) {
  const cleaned = normalizeStudyOutputHeadingIfRaw(cleanQuizText(value))
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
  if (lookup === 'blended attacks') return 'Blended Attacks'
  return cleaned
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string) {
  const seen = new Set<string>()
  const output: T[] = []

  for (const value of values) {
    const key = getKey(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(value)
  }

  return output
}

function uniqueStrings(values: string[]) {
  return uniqueBy(values, normalizeLookup)
}

function sortChoices(choices: string[]) {
  return [...choices].sort((left, right) => left.localeCompare(right))
}

function compareQuizSourceUnits(left: NormalizedQuizSourceUnit, right: NormalizedQuizSourceUnit) {
  return getPreferredQuizSourceRank(left.title) - getPreferredQuizSourceRank(right.title)
    || right.confidence - left.confidence
    || left.title.localeCompare(right.title)
}

function getPreferredQuizSourceRank(title: string) {
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

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return hash
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
