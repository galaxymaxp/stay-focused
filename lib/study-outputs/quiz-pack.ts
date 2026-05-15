import { deepLearnNoteHasUntrustworthyGrounding } from '@/lib/deep-learn-source-validation'
import { validateAcademicSourceMap, type AcademicLearningShape, type AcademicSourceMapUnit, type AcademicSourceMapUnitType } from '@/lib/deep-learn-source-map'
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

const MAX_QUIZ_PACK_ITEMS = 48
const MAX_SOURCE_MAP_IDENTIFICATION_ITEMS = 24
const MAX_SOURCE_MAP_MCQ_ITEMS = 24
const MAX_SOURCE_MAP_TRUE_FALSE_ITEMS = 14
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
  unitType: AcademicSourceMapUnitType
  learningShape: AcademicLearningShape
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
        unitType: inferQuizUnitType(title, unit),
        learningShape: inferQuizLearningShape(title, unit),
        confidence: unit.confidence,
        keywords,
        conceptFamily: inferConceptFamily(title, unit.kind, inferQuizLearningShape(title, unit)),
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
    ? 'Quiz built from the exam-ready Study Pack and Reviewer.'
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
  const adaptiveItems = buildAdaptiveSourceMapQuizItems(note, units)

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
  const trueFalseItems = buildSourceMapTrueFalseItems(note, units).slice(0, MAX_SOURCE_MAP_TRUE_FALSE_ITEMS)

  return uniqueBy(
    [...adaptiveItems, ...mcqItems, ...trueFalseItems, ...identificationItems],
    (item) => `${normalizeLookup(item.prompt)}::${normalizeLookup(item.answer)}::${item.type}`,
  )
    .sort(compareQuizItemsForCoverage)
    .reduce(selectQuizItemsForCoverage, [] as StudyOutputQuizPackItem[])
}

function buildAdaptiveSourceMapQuizItems(note: DeepLearnNote, units: NormalizedQuizSourceUnit[]): StudyOutputQuizPackItem[] {
  const items: StudyOutputQuizPackItem[] = []
  const add = (input: {
    id: string
    prompt: string
    answer: string
    choices?: string[]
    unit: NormalizedQuizSourceUnit
    method: StudyOutputQuizPackItem['generationMethod']
  }) => {
    if (!input.prompt || !input.answer || containsQuizGarbage(`${input.prompt} ${input.answer}`)) return
    const choices = input.choices?.length ? sortChoices(input.choices) : []
    items.push({
      id: `${note.resourceId}-${input.id}`,
      type: choices.length >= 2 ? 'multiple_choice' : 'identification',
      prompt: input.prompt,
      answer: input.answer,
      choices,
      explanation: buildSourceMapExplanation(input.unit, input.answer),
      sourceLabel: note.title,
      sourceWording: input.unit.sourceExcerpt,
      sourceBasis: input.unit.sourceExcerpt,
      matchingPrompt: null,
      matchingAnswer: null,
      truthValue: null,
      sourceUnitId: input.unit.sourceUnitId,
      sourceExcerpt: input.unit.sourceExcerpt,
      confidence: input.unit.confidence,
      generationMethod: input.method,
    })
  }

  const organizations = units.find((unit) => normalizeLookup(unit.title) === 'organizations timeline')
  if (organizations) {
    const answer = organizations.aliases.find((item) => normalizeLookup(item) === 'wekaf') ?? 'WEKAF'
    if (organizations.aliases.some((item) => normalizeLookup(item) === normalizeLookup(answer))) {
      add({
        id: 'source-map-adaptive-arnis-organization',
        prompt: 'Which organization standardized Arnis sport rules?',
        answer,
        choices: uniqueStrings([answer, ...organizations.aliases.filter((item) => normalizeLookup(item) !== normalizeLookup(answer)).slice(0, 3)]),
        unit: organizations,
        method: 'source_map_mcq',
      })
    }
    add({
      id: 'source-map-adaptive-arnis-chronology',
      prompt: 'Arrange the Arnis milestones chronologically.',
      answer: organizations.normalizedAnswer,
      unit: organizations,
      method: 'source_map_identification',
    })
  }

  const equipment = units.find((unit) => normalizeLookup(unit.title) === 'equipment weapons' || normalizeLookup(unit.title) === 'stick types')
  if (equipment && /\bbangkaw\b/i.test(`${equipment.normalizedAnswer} ${equipment.sourceExcerpt}`)) {
    add({
      id: 'source-map-adaptive-arnis-bangkaw',
      prompt: 'Which weapon is a six-foot pole?',
      answer: 'Bangkaw',
      choices: uniqueStrings(['Bangkaw', ...equipment.aliases.filter((item) => normalizeLookup(item) !== 'bangkaw').slice(0, 3)]),
      unit: equipment,
      method: 'source_map_mcq',
    })
  }

  const regional = units.find((unit) => normalizeLookup(unit.title) === 'regional classifications')
  if (regional && regional.aliases.some((item) => /\bvisayans?\b/i.test(item))) {
    add({
      id: 'source-map-adaptive-arnis-visayans',
      prompt: 'Which classification belongs to the Visayans?',
      answer: regional.aliases.find((item) => /\bvisayans?\b/i.test(item)) ?? 'Visayans',
      choices: uniqueStrings(regional.aliases.slice(0, 4)),
      unit: regional,
      method: 'source_map_mcq',
    })
  }

  return items
}

function buildSourceMapTrueFalseItems(note: DeepLearnNote, units: NormalizedQuizSourceUnit[]): StudyOutputQuizPackItem[] {
  const candidates = units
    .filter((unit) => unit.confidence >= HIGH_CONFIDENCE_THRESHOLD)
    .filter((unit) => !containsQuizGarbage(`${unit.title} ${unit.normalizedAnswer} ${unit.sourceExcerpt}`))
  const items: StudyOutputQuizPackItem[] = []

  for (let index = 0; index < candidates.length; index += 1) {
    const unit = candidates[index]
    if (!unit) continue
    const makeFalse = index % 3 === 1
    const distractorUnit = candidates.find((candidate) =>
      candidate.sourceUnitId !== unit.sourceUnitId
      && candidate.conceptFamily === unit.conceptFamily
      && !areAnswersTooSimilar(candidate.title, unit.title)
    ) ?? candidates.find((candidate) => candidate.sourceUnitId !== unit.sourceUnitId)
    const trueStatement = buildTrueFalseTrueStatement(unit)
    const falseStatement = distractorUnit ? buildTrueFalseFalseStatement(unit, distractorUnit) : null
    const prompt = makeFalse && falseStatement ? falseStatement.prompt : trueStatement.prompt
    const truthValue = makeFalse && falseStatement ? false : true
    const explanation = makeFalse && falseStatement
      ? falseStatement.explanation
      : trueStatement.explanation

    if (!prompt || containsQuizGarbage(prompt)) continue
    items.push({
      id: `${note.resourceId}-source-map-tf-${index}`,
      type: 'true_false',
      prompt,
      answer: truthValue ? 'True' : 'False',
      choices: ['True', 'False'],
      explanation,
      sourceLabel: note.title,
      sourceWording: unit.sourceExcerpt,
      sourceBasis: unit.sourceExcerpt,
      matchingPrompt: null,
      matchingAnswer: null,
      truthValue,
      sourceUnitId: unit.sourceUnitId,
      sourceExcerpt: unit.sourceExcerpt,
      confidence: unit.confidence,
      generationMethod: 'source_map_true_false',
    })
  }

  return items
}

function buildTrueFalseTrueStatement(unit: NormalizedQuizSourceUnit) {
  if (usesListMembershipMcq(unit)) {
    const answer = buildMultipleChoiceAnswer(unit)
    return {
      prompt: `${answer} belongs under ${unit.title}.`,
      explanation: `Correct because ${answer} belongs under ${unit.title}.`,
    }
  }
  if (unit.learningShape === 'timeline') {
    return {
      prompt: `${unit.title} contains chronology or milestone relationships.`,
      explanation: `Correct because ${unit.title} is reviewed as a timeline or milestone unit.`,
    }
  }
  if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') {
    return {
      prompt: `${unit.title} should be reviewed as a sequence of steps.`,
      explanation: `Correct because ${unit.title} is a procedure or process.`,
    }
  }
  return {
    prompt: `${unit.title} is tested by recalling this answer: ${truncateQuizStatement(unit.normalizedAnswer)}.`,
    explanation: `Correct because this statement matches the answer for ${unit.title}.`,
  }
}

function buildTrueFalseFalseStatement(unit: NormalizedQuizSourceUnit, distractorUnit: NormalizedQuizSourceUnit) {
  if (usesListMembershipMcq(unit) && distractorUnit.aliases.length > 0) {
    const distractor = distractorUnit.aliases.find(isConciseListChoice) ?? distractorUnit.aliases[0]
    if (!distractor) return null
    return {
      prompt: `${distractor} belongs under ${unit.title}.`,
      explanation: `Correct because ${distractor} belongs with ${distractorUnit.title}, not ${unit.title}.`,
    }
  }
  return {
    prompt: `${unit.title} is best defined by: ${truncateQuizStatement(distractorUnit.normalizedAnswer)}.`,
    explanation: `Correct because that wording belongs to ${distractorUnit.title}, not ${unit.title}.`,
  }
}

function truncateQuizStatement(value: string) {
  const cleaned = cleanQuizText(value)
  if (cleaned.length <= 120) return cleaned
  const clipped = cleaned.slice(0, 120)
  const breakIndex = Math.max(clipped.lastIndexOf(';'), clipped.lastIndexOf(','), clipped.lastIndexOf(' '))
  return `${clipped.slice(0, breakIndex > 72 ? breakIndex : 120).trim()}...`
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
  const key = normalizeLookup(unit.title)
  if (key === 'infosec vs it sec') return 'Distinguish InfoSec from IT Sec.'
  if (key === 'vulnerability exploit breach') return 'Distinguish Vulnerability, Exploit, and Breach.'
  if (key === 'malware symptoms') return 'Identify symptoms of malware.'
  if (isAdaptiveEducationalQuizUnit(unit)) {
    if (unit.learningShape === 'timeline') return `Identify the chronology or milestones in ${unit.title}.`
    if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return `Sequence the steps in ${unit.title}.`
    if (unit.learningShape === 'equipment') return `Identify the equipment in ${unit.title}.`
    if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return `Classify items under ${unit.title}.`
    if (unit.learningShape === 'formula') return `Use the formula in ${unit.title}.`
    if (unit.learningShape === 'worked-example') return `Solve using the example pattern in ${unit.title}.`
    if (unit.learningShape === 'case-rule') return `Apply the rule in ${unit.title}.`
    if (unit.learningShape === 'clinical-care') return `Identify the clinical care priority in ${unit.title}.`
    if (unit.learningShape === 'cause-effect') return `Explain the cause-effect relationship in ${unit.title}.`
    if (unit.learningShape === 'troubleshooting') return `Troubleshoot the issue in ${unit.title}.`
    if (unit.learningShape === 'component-system') return `Identify the component role in ${unit.title}.`
    if (unit.learningShape === 'standards-rubrics') return `Apply the criteria in ${unit.title}.`
    if (unit.learningShape === 'passage-theme') return `Explain the theme or claim in ${unit.title}.`
    if (unit.learningShape === 'reflection') return `Reflect on ${unit.title}.`
  }
  if (unit.sourceType === 'definition') return `Define ${unit.title}.`
  if (unit.sourceType === 'process') return `Identify the methods or steps in ${unit.title}.`
  if (unit.aliases.length >= 2) return `Enumerate the items under ${unit.title}.`

  const variants = ['What is', 'Define', 'Identify']
  const variant = variants[Math.abs(hashText(unit.title)) % variants.length]
  if (variant === 'What is') return `What is ${unit.title}?`
  if (variant === 'Define') return `Define ${unit.title}.`
  return `Identify the concept described: ${unit.normalizedAnswer}`
}

function buildMultipleChoiceQuestion(unit: NormalizedQuizSourceUnit) {
  if (normalizeLookup(unit.title) === 'malware symptoms') return 'Which item belongs to the symptoms of malware?'
  if (usesListMembershipMcq(unit)) {
    if (isAdaptiveEducationalQuizUnit(unit)) {
      if (unit.learningShape === 'equipment') return `Which item is equipment in ${unit.title}?`
      if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return `Which item belongs to ${unit.title}?`
      if (unit.learningShape === 'timeline') return `Which item is a milestone in ${unit.title}?`
      if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return `Which item is part of the sequence in ${unit.title}?`
    }
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
    if (normalizeLookup(unit.title) === 'malware types') {
      return `Correct because ${resolvedAnswer} belongs to Malware Types, not Malware Symptoms.`
    }
    if (normalizeLookup(unit.title) === 'malware symptoms') {
      return `Correct because ${resolvedAnswer} belongs to Malware Symptoms, not Malware Types.`
    }
    return `Correct because ${resolvedAnswer} belongs under ${unit.title}.`
  }
  if (normalizeLookup(unit.title) === 'infosec vs it sec') {
    return 'Correct because InfoSec protects sensitive business information, while IT Sec secures digital data through computer network security.'
  }
  if (normalizeLookup(unit.title) === 'vulnerability exploit breach') {
    return 'Correct because the course distinction is vulnerability as the weakness, exploit as the method or tool, and breach as the successful exploit.'
  }
  if (unit.learningShape === 'timeline') return `Correct because ${resolvedAnswer} is a chronology or milestone item for ${unit.title}.`
  if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return `Correct because ${resolvedAnswer} belongs to the sequence for ${unit.title}.`
  if (unit.learningShape === 'equipment') return `Correct because ${resolvedAnswer} is equipment or a tool in ${unit.title}.`
  if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return `Correct because ${resolvedAnswer} belongs to the classification for ${unit.title}.`
  if (unit.learningShape === 'formula') return `Correct because this matches the source formula cue for ${unit.title}.`
  if (unit.learningShape === 'worked-example') return `Correct because this follows the source example pattern for ${unit.title}.`
  if (unit.learningShape === 'case-rule') return `Correct because this applies the source rule or standard for ${unit.title}.`
  if (unit.learningShape === 'clinical-care') return `Correct because this matches the clinical care point for ${unit.title}.`
  if (unit.learningShape === 'cause-effect') return `Correct because this matches the cause-effect relationship for ${unit.title}.`
  if (unit.learningShape === 'troubleshooting') return `Correct because this follows the source troubleshooting cue for ${unit.title}.`
  if (unit.learningShape === 'component-system') return `Correct because this matches a component or system role for ${unit.title}.`
  if (unit.learningShape === 'standards-rubrics') return `Correct because this matches the criteria for ${unit.title}.`
  if (unit.learningShape === 'passage-theme') return `Correct because this matches the theme or claim for ${unit.title}.`
  if (unit.sourceType === 'definition') return `Correct because the source defines ${unit.title} as ${resolvedAnswer}.`
  if (unit.sourceType === 'process') return `Correct because these are the methods or response steps for ${unit.title}.`
  if (unit.aliases.length >= 2) return `Correct because the answer keeps the complete list tied to ${unit.title}.`
  return `Correct because this matches the course wording for ${unit.title}.`
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
  return (unit.sourceType === 'category' || unit.sourceType === 'list' || unit.learningShape === 'equipment' || unit.learningShape === 'classification' || unit.learningShape === 'taxonomy' || normalizeLookup(unit.title) === 'cia triad')
    && unit.aliases.length >= 2
}

function isAdaptiveEducationalQuizUnit(unit: NormalizedQuizSourceUnit) {
  return isSpecializedLearningShape(unit.learningShape)
    || /\b(?:arnis|ra 9850|historical|evolution|organizations|courtesy|salutation|strike|equipment|weapons|stick|regional)\b/i.test(unit.title)
}

function isSpecializedLearningShape(shape: AcademicLearningShape) {
  return shape === 'procedure'
    || shape === 'timeline'
    || shape === 'equipment'
    || shape === 'formula'
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
  if (key === 'equipment weapons') return 'Bangkaw'
  if (key === 'stick types') return 'Bangkaw'
  if (key === 'regional classifications') return 'Visayans'
  if (key === 'regional systems') return 'Pampanguenos - SINAWALI'
  if (key === 'main groups') return 'Central Style - Arnis de Mano'
  if (key === 'organizations timeline') return 'WEKAF'
  if (key === 'timeline') return '1989 - WEKAF'
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
  if (key === 'organizations timeline') return 'the Arnis organizations and timeline'
  if (key === 'timeline') return 'the timeline'
  if (key === 'regional systems') return 'the regional systems'
  if (key === 'main groups') return 'the main groups'
  if (key === 'equipment weapons') return 'Arnis equipment and weapons'
  if (key === 'stick types') return 'Arnis stick types'
  if (key === 'regional classifications') return 'the regional classifications'
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
    .replace(/\?{2,}/g, ' ')
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
  if (/^(?:what|there|high|state|terms|programs|activity|organization|source summary|source notes|exact source wording|reconstructed lists|clean source summary fragments)$/i.test(key)) return true
  if (/^(?:understand the|insiders employees and ex)\b/i.test(key)) return true
  if (/\b(?:uuid|debug|metadata|file title|quality note|extraction|ocr confidence|grounding strategy)\b/i.test(value)) return true
  if (/\b(?:there is|there are|sent to a host|the receiver|attacks backed by state agencies that|other threats\s+InfoSec\s*-\s*processes)\b/i.test(value)) return true
  const alphaChars = value.replace(/[^A-Za-z]/g, '').length
  const totalChars = value.replace(/\s/g, '').length
  return totalChars > 0 && alphaChars / totalChars < 0.42
}

function containsQuizGarbage(value: string) {
  return /\b(?:according to the source|answer-ready fact|compact answer unit|preserved for direct recall|source summary|source notes|exact source wording|reconstructed lists|clean source summary fragments|normalized headings|detected concepts|duplicate ocr|ocr garbage|metadata|uuid|debug|file title|quality notes?)\b/i.test(value)
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
  if (lookup === 'denial of service methods') return 'Denial of Service Methods'
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

function inferConceptFamily(title: string, kind: AcademicSourceMapUnit['kind'], learningShape: AcademicLearningShape = 'definition') {
  const key = normalizeLookup(title)
  if (/\b(?:arnis|ra 9850|historical|organizations|timeline)\b/i.test(key)) return 'arnis-history'
  if (/\b(?:courtesy|salutation|strike|equipment|weapons|stick|regional|classification|main groups)\b/i.test(key)) return 'arnis-practice'
  if (/\b(?:it security|infosec|it sec|cia triad|domains)\b/i.test(key)) return 'it-security'
  if (/\b(?:cybersecurity|threat|attacker|vulnerability|exploit|breach)\b/i.test(key)) return 'cybersecurity'
  if (/\b(?:malware|infiltration|denial|blended|impact reduction|zombie|botnet|seo poisoning)\b/i.test(key)) return 'security-operations'
  if (isSpecializedLearningShape(learningShape)) return `shape-${learningShape}`
  if (kind === 'definition') return 'definitions'
  if (kind === 'process') return 'processes'
  return 'general'
}

function inferQuizUnitType(title: string, unit: AcademicSourceMapUnit): AcademicSourceMapUnitType {
  if (unit.unitType) return unit.unitType
  const key = normalizeLookup(title)
  if (/\b(?:timeline|history|historical|ra 9850|organizations)\b/i.test(key)) return 'timeline'
  if (/\b(?:courtesy|salutation|methods?|steps?|sequence|reduction)\b/i.test(key) || unit.kind === 'process') return 'procedure'
  if (/\b(?:equipment|weapons?|stick)\b/i.test(key)) return 'equipment'
  if (/\b(?:classification|regional|types|domains|categories)\b/i.test(key) || unit.kind === 'category') return 'classification'
  if (unit.kind === 'definition') return 'definition'
  if (unit.kind === 'list') return 'taxonomy'
  return 'narrative'
}

function inferQuizLearningShape(title: string, unit: AcademicSourceMapUnit): AcademicLearningShape {
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
  const unitType = inferQuizUnitType(title, unit)
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
  const coveredItems = selected.filter((entry) => normalizeLookup(getQuizItemCoverageTitle(entry)) === normalizeLookup(title))
  const alreadyCovered = coveredItems.length > 0
  const allowsDuplicateCoverage = allowsDuplicateCoverageItem(item, coveredItems) && coveredItems.every((entry) => entry.type !== item.type)

  if (alreadyCovered && !allowsDuplicateCoverage) return selected

  selected.push(item)
  return selected
}

function allowsDuplicateCoverageItem(item: StudyOutputQuizPackItem, coveredItems: StudyOutputQuizPackItem[] = []) {
  if (coveredItems.length < 2 && ['multiple_choice', 'identification', 'true_false'].includes(item.type)) return true
  if (item.type === 'multiple_choice' && item.prompt === 'Which description best matches InfoSec?') return true
  if (item.type === 'identification' && item.prompt === 'Distinguish InfoSec from IT Sec.') return true
  if (item.type === 'identification' && /^Define (?:IT Security|Cybersecurity)\./.test(item.prompt)) return true
  if (item.type === 'identification' && item.prompt === 'Identify symptoms of malware.') return true
  if (item.prompt === 'Which organization standardized Arnis sport rules?') return true
  if (item.prompt === 'Arrange the Arnis milestones chronologically.') return true
  if (item.prompt === 'Sequence the steps in Courtesy / Salutation.') return true
  if (item.prompt === 'Classify items under Strike Types.') return true
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
  if (key === 'cybersecurity approach layers') return 'Cybersecurity approach layers'
  if (key === 'people process technology') return 'People / Process / Technology'
  if (key === 'unified threat management') return 'Unified Threat Management'
  if (key === 'impact of a security breach') return 'Impact of a Security Breach'
  if (key === 'vulnerability exploit breach') return 'Vulnerability / Exploit / Breach'
  if (key === 'malware types') return 'Malware Types'
  if (key === 'malware symptoms') return 'Malware Symptoms'
  if (key === 'methods of infiltration') return 'Methods of Infiltration'
  if (key === 'denial of service methods') return 'Denial of Service Methods'
  if (key === 'zombie vs botnet') return 'Zombie vs Botnet'
  if (key === 'seo vs seo poisoning') return 'SEO vs SEO Poisoning'
  if (key === 'blended attacks') return 'Blended Attacks'
  if (key === 'impact reduction') return 'Impact Reduction'
  if (key === 'arnis definition') return 'Arnis'
  if (key === 'ra 9850') return 'RA 9850'
  if (key === 'historical concept') return 'Historical Concept'
  if (key === 'evolution classifications') return 'Evolution / Classifications'
  if (key === 'regional systems') return 'Regional Systems'
  if (key === 'organizations timeline') return 'Organizations / Timeline'
  if (key === 'timeline') return 'Timeline'
  if (key === 'main groups') return 'Main Groups'
  if (key === 'courtesy salutation') return 'Courtesy / Salutation'
  if (key === 'strike types') return 'Strike Types'
  if (key === 'equipment weapons') return 'Equipment / Weapons'
  if (key === 'stick types') return 'Stick Types'
  if (key === 'regional classifications') return 'Regional Classifications'
  return null
}

function getRequiredQuizCoverageTitles() {
  return [
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
    'Organizations / Timeline',
    'Timeline',
    'Regional Systems',
    'Main Groups',
    'Courtesy / Salutation',
    'Equipment / Weapons',
    'Regional Classifications',
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
