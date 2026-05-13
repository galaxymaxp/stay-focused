import { deepLearnNoteHasUntrustworthyGrounding } from '@/lib/deep-learn-source-validation'
import { buildDeepLearnQuizItems, MIN_DEEP_LEARN_QUIZ_ITEM_COUNT } from '@/lib/deep-learn-quiz'
import { buildStudyNoteQuestionCountOptions } from '@/lib/study-note-quiz'
import type {
  DeepLearnDistinction,
  DeepLearnNote,
  StudyOutputQuizPackContent,
  StudyOutputQuizPackItem,
  StudyOutputQuizItemType,
} from '@/lib/types'

export interface QuizPackBuildReadiness {
  ok: boolean
  reason: 'missing' | 'pending' | 'failed' | 'metadata_only' | 'empty'
  message: string
}

export function getDeepLearnQuizPackReadiness(note: DeepLearnNote | null): QuizPackBuildReadiness {
  if (!note) {
    return {
      ok: false,
      reason: 'missing',
      message: 'Deep Learn needs a saved ready pack before it can make a quiz pack.',
    }
  }

  if (note.status === 'pending') {
    return {
      ok: false,
      reason: 'pending',
      message: 'Deep Learn is still preparing this pack. The quiz pack unlocks after the pack is ready.',
    }
  }

  if (note.status === 'failed') {
    return {
      ok: false,
      reason: 'failed',
      message: 'Deep Learn could not build a trustworthy pack from this source, so a quiz pack cannot be made yet.',
    }
  }

  if (deepLearnNoteHasUntrustworthyGrounding(note)) {
    return {
      ok: false,
      reason: 'metadata_only',
      message: 'This Deep Learn pack is not grounded in enough readable academic source text for a quiz pack.',
    }
  }

  const items = buildQuizPackItems(note)
  if (items.length < MIN_DEEP_LEARN_QUIZ_ITEM_COUNT) {
    return {
      ok: false,
      reason: 'empty',
      message: 'This Deep Learn pack does not yet have enough academic source content for a useful quiz pack.',
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
  }))

  const matchingItems = note.distinctions
    .slice(0, 4)
    .flatMap((item, index) => buildMatchingPairItems(note, item, index))

  const trueFalseItems = note.likelyQuizTargets
    .slice(0, 3)
    .map((item, index): StudyOutputQuizPackItem | null => {
      const statement = item.reviewText ?? item.target
      const normalizedTarget = statement.trim()
      const normalizedReason = item.reason.trim()
      if (!normalizedTarget || !normalizedReason) return null

      return {
        id: `${note.resourceId}-true-false-${index}`,
        type: 'true_false',
        prompt: `True or false: ${normalizedTarget}.`,
        answer: 'True',
        choices: ['False', 'True'],
        explanation: normalizedReason,
        sourceLabel: note.title,
        sourceWording: item.sourceSnippet ?? null,
        sourceBasis: item.sourceSnippet ?? normalizedReason,
        matchingPrompt: null,
        matchingAnswer: null,
        truthValue: true,
      }
    })
    .filter((item): item is StudyOutputQuizPackItem => item !== null)

  return uniqueBy(
    [...baseItems, ...matchingItems, ...trueFalseItems],
    (item) => `${normalizeLookup(item.prompt)}::${normalizeLookup(item.answer)}::${item.type}`,
  )
}

function buildMatchingPairItems(note: DeepLearnNote, item: DeepLearnDistinction, index: number): StudyOutputQuizPackItem[] {
  const promptA = item.conceptA.trim()
  const promptB = item.conceptB.trim()
  const difference = item.difference.trim()
  if (!promptA || !promptB || !difference) return []

  return [
    {
      id: `${note.resourceId}-matching-${index}-a`,
      type: 'matching',
      prompt: `Match the concept to its distinction: ${promptA}`,
      answer: difference,
      choices: [],
      explanation: item.confusionNote ?? 'This pair was preserved to prevent look-alike exam mistakes.',
      sourceLabel: note.title,
      sourceWording: item.sourceSnippet ?? difference,
      sourceBasis: item.sourceSnippet ?? difference,
      matchingPrompt: promptA,
      matchingAnswer: difference,
      truthValue: null,
    },
    {
      id: `${note.resourceId}-matching-${index}-b`,
      type: 'matching',
      prompt: `Match the concept to its distinction: ${promptB}`,
      answer: difference,
      choices: [],
      explanation: item.confusionNote ?? 'This pair was preserved to prevent look-alike exam mistakes.',
      sourceLabel: note.title,
      sourceWording: item.sourceSnippet ?? difference,
      sourceBasis: item.sourceSnippet ?? difference,
      matchingPrompt: promptB,
      matchingAnswer: difference,
      truthValue: null,
    },
  ]
}

function buildQuizPackTitle(noteTitle: string) {
  const trimmed = noteTitle.trim()
  if (!trimmed) return 'Deep Learn Quiz Pack'
  if (/\bquiz pack\b/i.test(trimmed)) return trimmed
  if (/\bexam prep pack\b/i.test(trimmed)) return trimmed.replace(/\bexam prep pack\b/i, 'Quiz Pack')
  if (/\breviewer\b/i.test(trimmed)) return trimmed.replace(/\breviewer\b/i, 'Quiz Pack')
  return `${trimmed} Quiz Pack`
}

function buildQuizPackSummary(note: DeepLearnNote, itemCount: number) {
  const lane = note.quizReady
    ? 'Deterministic quiz pack built from the saved Deep Learn pack.'
    : 'Compact quiz pack built from the saved Deep Learn pack.'
  return `${lane} ${itemCount} source-backed question${itemCount === 1 ? '' : 's'} are ready for self-review without another AI generation step.`
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

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
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
