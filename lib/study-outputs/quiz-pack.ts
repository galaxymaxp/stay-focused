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

const MAX_QUIZ_PACK_ITEMS = 18
const MAX_SOURCE_MAP_IDENTIFICATION_ITEMS = 16
const MAX_SOURCE_MAP_MCQ_ITEMS = 12
const HIGH_CONFIDENCE_THRESHOLD = 0.84
const MAX_MCQ_ANSWER_CHARS = 190

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
  conceptFamily: string
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
      const aliases = uniqueStrings(unit.items
        .map((item) => cleanListAlias(item, title))
        .filter((item) => item.length > 0 && !isWeakQuizText(item)))
      const keywords = uniqueStrings([
        ...title.split(/\s+/),
        ...aliases.flatMap((item) => item.split(/\s+/)),
      ])
        .map((item) => item.replace(/[^A-Za-z0-9-]/g, '').trim())
        .filter((item) => item.length >= 3)
        .slice(0, 12)

      if (!title || !normalizedAnswer || !sourceExcerpt) return null
      if (isWeakQuizText(title) || containsQuizGarbage(`${title} ${normalizedAnswer} ${sourceExcerpt}`)) return null
      if (isWeakQuizText(normalizedAnswer) && aliases.length < 2) return null
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
        conceptFamily: inferConceptFamily(title, unit.kind),
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
      const distractors = deriveSafeDistractorsForMultipleChoice(unit, units)
      if (distractors.length < 3) return null
      const answer = buildMultipleChoiceAnswer(unit)
      const choices = sortChoices([answer, ...distractors.slice(0, 3)])

      return {
        id: `${note.resourceId}-source-map-mcq-${index}`,
        type: 'multiple_choice',
        prompt: buildMultipleChoiceQuestion(unit),
        answer,
        choices,
        explanation: buildSourceMapExplanation(unit, answer),
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
    .sort(compareQuizItemsForCoverage)
    .reduce(selectQuizItemsForCoverage, [] as StudyOutputQuizPackItem[])
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
  if (normalizeLookup(unit.title) === 'infosec vs it sec') return 'Distinguish InfoSec from IT Sec.'
  if (normalizeLookup(unit.title) === 'vulnerability exploit breach') return 'Distinguish Vulnerability, Exploit, and Breach.'
  if (unit.sourceType === 'definition') return `Define ${unit.title}.`
  if (unit.sourceType === 'process') return `Identify the methods or steps in ${unit.title}.`
  if (unit.aliases.length >= 2) return `Enumerate the listed items under ${unit.title}.`

  const variants = ['What is', 'Define', 'Identify']
  const variant = variants[Math.abs(hashText(unit.title)) % variants.length]
  if (variant === 'What is') return `What is ${unit.title}?`
  if (variant === 'Define') return `Define ${unit.title}.`
  return `Identify the concept described: ${unit.normalizedAnswer}`
}

function buildMultipleChoiceQuestion(unit: NormalizedQuizSourceUnit) {
  if (usesListMembershipMcq(unit)) {
    return `Which item belongs to ${formatListMembershipTarget(unit.title)}?`
  }
  const key = normalizeLookup(unit.title)
  if (key === 'infosec vs it sec') return 'Which description best matches InfoSec?'
  if (unit.sourceType === 'definition') {
    return Math.abs(hashText(unit.title)) % 2 === 0
      ? `Which statement best defines ${unit.title}?`
      : `Which definition matches ${unit.title}?`
  }
  return `Which description best matches ${unit.title}?`
}

function buildSourceMapExplanation(unit: NormalizedQuizSourceUnit, answer?: string) {
  const resolvedAnswer = answer ?? unit.normalizedAnswer
  if (usesListMembershipMcq(unit)) {
    return `${resolvedAnswer} is listed under ${unit.title}; the other choices are from different source-map groups.`
  }
  if (normalizeLookup(unit.title) === 'infosec vs it sec') {
    return 'InfoSec is tied to protecting sensitive business information, while IT Sec is tied to securing digital data.'
  }
  if (normalizeLookup(unit.title) === 'vulnerability exploit breach') {
    return 'This matches the course distinction: vulnerability is the weakness, exploit is the method or tool, and breach is the successful exploit.'
  }
  if (unit.sourceType === 'definition') return `This matches the course definition of ${unit.title}.`
  if (unit.sourceType === 'process') return `Use the listed methods or response steps for ${unit.title}.`
  if (unit.aliases.length >= 2) return `Use the complete list tied to ${unit.title}.`
  return `Use the grounded course wording for ${unit.title}.`
}

function isSafeMultipleChoiceSourceUnit(unit: NormalizedQuizSourceUnit) {
  if (unit.confidence < HIGH_CONFIDENCE_THRESHOLD) return false
  if (usesListMembershipMcq(unit)) return isConciseQuizAnswer(unit.title)
  if (!isDefinitionLikeUnit(unit)) return false
  if (!isConciseQuizAnswer(unit.normalizedAnswer)) return false
  if (containsQuizGarbage(`${unit.title} ${unit.normalizedAnswer} ${unit.sourceExcerpt}`)) return false
  return true
}

function deriveSafeDistractorsForMultipleChoice(unit: NormalizedQuizSourceUnit, units: NormalizedQuizSourceUnit[]) {
  return usesListMembershipMcq(unit)
    ? deriveListMembershipDistractors(unit, units)
    : deriveDefinitionDistractors(unit, units)
}

function deriveDefinitionDistractors(unit: NormalizedQuizSourceUnit, units: NormalizedQuizSourceUnit[]) {
  return uniqueStrings(
    units
      .filter((candidate) => candidate.sourceUnitId !== unit.sourceUnitId)
      .filter((candidate) => candidate.confidence >= HIGH_CONFIDENCE_THRESHOLD)
      .filter((candidate) => candidate.conceptFamily === unit.conceptFamily || isDefinitionLikeUnit(candidate))
      .map((candidate) => candidate.normalizedAnswer)
      .filter(isConciseQuizAnswer)
      .filter((candidate) => normalizeLookup(candidate) !== normalizeLookup(unit.normalizedAnswer))
      .filter((candidate) => !areAnswersTooSimilar(candidate, unit.normalizedAnswer))
      .filter((candidate) => !containsQuizGarbage(candidate))
      .filter((candidate) => !wouldMakeDefinitionDistractorCorrect(unit, candidate)),
  ).slice(0, 3)
}

function deriveListMembershipDistractors(unit: NormalizedQuizSourceUnit, units: NormalizedQuizSourceUnit[]) {
  const answer = buildMultipleChoiceAnswer(unit)
  const answerKey = normalizeLookup(answer)
  const targetAliasKeys = new Set(unit.aliases.map(normalizeLookup))
  const sameFamily = units
    .filter((candidate) => candidate.sourceUnitId !== unit.sourceUnitId)
    .filter((candidate) => candidate.confidence >= HIGH_CONFIDENCE_THRESHOLD)
    .filter((candidate) => candidate.conceptFamily === unit.conceptFamily)
    .flatMap((candidate) => candidate.aliases)
  const adjacent = units
    .filter((candidate) => candidate.sourceUnitId !== unit.sourceUnitId)
    .filter((candidate) => candidate.confidence >= HIGH_CONFIDENCE_THRESHOLD)
    .filter((candidate) => candidate.sourceType === unit.sourceType || usesListMembershipMcq(candidate))
    .flatMap((candidate) => candidate.aliases)

  return uniqueStrings([...sameFamily, ...adjacent])
    .filter(isConciseListChoice)
    .filter((candidate) => normalizeLookup(candidate) !== answerKey)
    .filter((candidate) => !targetAliasKeys.has(normalizeLookup(candidate)))
    .filter((candidate) => !areAnswersTooSimilar(candidate, answer))
    .filter((candidate) => !containsQuizGarbage(candidate))
    .slice(0, 3)
}

function buildMultipleChoiceAnswer(unit: NormalizedQuizSourceUnit) {
  return usesListMembershipMcq(unit) ? pickRepresentativeListAnswer(unit) : unit.normalizedAnswer
}

function usesListMembershipMcq(unit: NormalizedQuizSourceUnit) {
  if (isDefinitionLikeUnit(unit)) return false
  return (unit.sourceType === 'category' || unit.sourceType === 'list' || unit.sourceType === 'process' || normalizeLookup(unit.title) === 'cia triad')
    && unit.aliases.length >= 2
}

function isDefinitionLikeUnit(unit: NormalizedQuizSourceUnit) {
  return unit.sourceType === 'definition'
    || normalizeLookup(unit.title) === 'infosec vs it sec'
    || normalizeLookup(unit.title) === 'vulnerability exploit breach'
}

function pickRepresentativeListAnswer(unit: NormalizedQuizSourceUnit) {
  const preferred = getPreferredListAnswer(unit.title)
  if (preferred) {
    const found = unit.aliases.find((item) => normalizeLookup(item) === normalizeLookup(preferred))
    if (found) return found
  }
  return unit.aliases.find(isConciseListChoice) ?? unit.aliases[0] ?? unit.title
}

function getPreferredListAnswer(title: string) {
  const key = normalizeLookup(title)
  if (key === 'cia triad') return 'Confidentiality'
  if (key === 'domains of it security') return 'Endpoint Security'
  if (key === 'malware types') return 'Ransomware'
  if (key === 'malware symptoms') return 'unknown processes'
  if (key === 'methods of infiltration') return 'Phishing'
  if (key === 'denial of service methods') return 'Botnet'
  if (key === 'blended attacks') return 'DDoS combined with phishing emails'
  if (key === 'impact reduction') return 'Communicate the Issue'
  if (key === 'vulnerability exploit breach') return 'Vulnerability - Weaknesses or flaws in the hardware or software'
  return null
}

function formatListMembershipTarget(title: string) {
  const key = normalizeLookup(title)
  if (key === 'cia triad') return 'the CIA Triad'
  if (key === 'domains of it security') return 'the domains of IT Security'
  if (key === 'malware types') return 'the malware types'
  if (key === 'malware symptoms') return 'the symptoms of malware'
  if (key === 'methods of infiltration') return 'the methods of infiltration'
  if (key === 'denial of service methods') return 'the denial of service methods'
  return title
}

function cleanQuizAnswer(title: string, value: string) {
  const cleaned = cleanQuizText(value)
    .replace(new RegExp(`^${escapeRegExp(title)}\\s+(?:includes|key list|steps)\\s*:?\\s*`, 'i'), '')
    .replace(/\s*Source wording:\s*/gi, ' ')
    .trim()
  return cleaned
}

function cleanListAlias(value: string, title: string) {
  const cleaned = cleanQuizText(value)
    .replace(/^(?:there is|there are)\s+(?:a|an)\s+/i, '')
    .replace(/^(?:there is|there are)\s+/i, '')
    .replace(/^the\s+/i, '')
    .replace(/\s+running$/i, '')
    .replace(/\s+often$/i, '')
    .replace(/\s+without the user knowledge or consent$/i, '')
    .trim()
  if (normalizeLookup(title) === 'malware symptoms') {
    return cleaned
      .replace(/^an\s+/i, '')
      .replace(/^increase in\s+/i, 'increased ')
      .replace(/^decrease in\s+/i, 'decreased ')
      .replace(/^presence of\s+/i, 'presence of ')
      .trim()
  }
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
  if (words.length > 24) return false
  return true
}

function isConciseListChoice(value: string) {
  const cleaned = cleanQuizText(value).replace(/^\d+[.)]\s*/, '')
  if (cleaned.length < 3 || cleaned.length > 82) return false
  if (cleaned.split(/\s+/).filter(Boolean).length > 9) return false
  return !containsQuizGarbage(cleaned) && !isWeakQuizText(cleaned)
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

function wouldMakeDefinitionDistractorCorrect(unit: NormalizedQuizSourceUnit, candidate: string) {
  const candidateKey = normalizeLookup(candidate)
  const titleKey = normalizeLookup(unit.title)
  if (titleKey.length >= 12 && candidateKey.includes(titleKey)) return true
  if (unit.aliases.some((alias) => normalizeLookup(alias) && candidateKey.includes(normalizeLookup(alias)))) return true
  return false
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

function inferConceptFamily(title: string, kind: AcademicSourceMapUnit['kind']) {
  const key = normalizeLookup(title)
  if (/\b(?:it security|infosec|it sec|cia triad|domains)\b/i.test(key)) return 'it-security'
  if (/\b(?:cybersecurity|threat|attacker|vulnerability|exploit|breach)\b/i.test(key)) return 'cybersecurity'
  if (/\b(?:malware|infiltration|denial|blended|impact reduction)\b/i.test(key)) return 'security-operations'
  if (kind === 'definition') return 'definitions'
  if (kind === 'process') return 'processes'
  return 'general'
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

function compareQuizItemsForCoverage(left: StudyOutputQuizPackItem, right: StudyOutputQuizPackItem) {
  const leftRank = getPreferredQuizSourceRank(getQuizItemCoverageTitle(left))
  const rightRank = getPreferredQuizSourceRank(getQuizItemCoverageTitle(right))
  return leftRank - rightRank
    || getQuizItemTypeRank(left) - getQuizItemTypeRank(right)
    || left.id.localeCompare(right.id)
}

function selectQuizItemsForCoverage(selected: StudyOutputQuizPackItem[], item: StudyOutputQuizPackItem) {
  if (selected.length >= MAX_QUIZ_PACK_ITEMS) return selected

  const title = getQuizItemCoverageTitle(item)
  const titleRank = getPreferredQuizSourceRank(title)
  const isPreferred = titleRank < 100
  const coveredItems = selected.filter((entry) => normalizeLookup(getQuizItemCoverageTitle(entry)) === normalizeLookup(title))
  const alreadyCovered = coveredItems.length > 0
  const allowsDuplicateCoverage = allowsDuplicateCoverageItem(item) && coveredItems.every((entry) => entry.type !== item.type)
  const remainingPreferredTitles = getRequiredQuizCoverageTitles()
    .filter((candidate) => !selected.some((entry) => normalizeLookup(getQuizItemCoverageTitle(entry)) === normalizeLookup(candidate)))
    .length
  const remainingSlots = MAX_QUIZ_PACK_ITEMS - selected.length

  if (alreadyCovered && !allowsDuplicateCoverage) return selected
  if (!isPreferred && remainingPreferredTitles >= remainingSlots) return selected

  selected.push(item)
  return selected
}

function allowsDuplicateCoverageItem(item: StudyOutputQuizPackItem) {
  if (item.type === 'multiple_choice' && item.prompt === 'Which description best matches InfoSec?') return true
  if (item.type === 'identification' && item.prompt === 'Distinguish InfoSec from IT Sec.') return true
  if (item.type === 'identification' && /^Define (?:IT Security|Cybersecurity)\./.test(item.prompt)) return true
  return false
}

function getQuizItemCoverageTitle(item: StudyOutputQuizPackItem) {
  const unitId = item.sourceUnitId?.replace(/-/g, ' ') ?? ''
  const sourceUnitTitle = getCoverageTitleFromSourceUnitId(item.sourceUnitId ?? '')
  if (sourceUnitTitle) return sourceUnitTitle
  const combined = `${item.prompt} ${item.answer} ${unitId}`
  return [...getRequiredQuizCoverageTitles()]
    .sort((left, right) => normalizeLookup(right).length - normalizeLookup(left).length)
    .find((title) => matchesCoverageTitle(combined, title))
    ?? item.prompt
}

function getCoverageTitleFromSourceUnitId(sourceUnitId: string) {
  const key = normalizeLookup(sourceUnitId)
  if (key === 'it security definition') return 'IT Security'
  if (key === 'infosec vs it sec') return 'InfoSec vs IT Sec'
  if (key === 'cia triad') return 'CIA Triad'
  if (key === 'domains of it security') return 'Domains of IT Security'
  if (key === 'cybersecurity definitions') return 'Cybersecurity'
  if (key === 'vulnerability exploit breach') return 'Vulnerability / Exploit / Breach'
  if (key === 'malware types') return 'Malware Types'
  if (key === 'malware symptoms') return 'Malware Symptoms'
  if (key === 'methods of infiltration') return 'Methods of Infiltration'
  if (key === 'denial of service methods') return 'Denial of Service Methods'
  if (key === 'blended attacks') return 'Blended Attacks'
  if (key === 'impact reduction') return 'Impact Reduction'
  return null
}

function getRequiredQuizCoverageTitles() {
  return [
    'IT Security',
    'InfoSec vs IT Sec',
    'CIA Triad',
    'Domains of IT Security',
    'Cybersecurity',
    'Vulnerability / Exploit / Breach',
    'Malware Types',
    'Malware Symptoms',
    'Methods of Infiltration',
    'Denial of Service Methods',
    'Blended Attacks',
    'Impact Reduction',
  ]
}

function matchesCoverageTitle(value: string, title: string) {
  const titleKey = normalizeLookup(title)
  const valueKey = normalizeLookup(value)
  if (valueKey.includes(titleKey)) return true
  if (titleKey === 'vulnerability exploit breach') return /\bvulnerability\b.*\bexploit\b.*\bbreach\b/i.test(valueKey)
  if (titleKey === 'denial of service methods') return /\bdenial\b.*\bservice\b/i.test(valueKey)
  return false
}

function getQuizItemTypeRank(item: StudyOutputQuizPackItem) {
  if (item.type === 'identification' && /^Distinguish\b/.test(item.prompt)) return -1
  return item.type === 'multiple_choice' ? 0 : 1
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
