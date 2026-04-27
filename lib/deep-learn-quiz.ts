import { resolveDeepLearnWording } from '@/lib/deep-learn'
import type { StudyNoteQuizItem } from '@/lib/study-note-quiz'
import type { DeepLearnNote } from '@/lib/types'

const MAX_ANSWER_BANK_ITEMS = 8
const MAX_IDENTIFICATION_ITEMS = 8
const MAX_TIMELINE_ITEMS = 4
const MAX_DISTINCTION_ITEMS = 3
const MAX_LIKELY_TARGET_ITEMS = 2

export const MIN_DEEP_LEARN_QUIZ_ITEM_COUNT = 5

export function buildDeepLearnQuizItems(note: DeepLearnNote): StudyNoteQuizItem[] {
  const mcqItems = note.mcqDrill.map((item, index) => ({
    id: `${note.resourceId}-mcq-${index}`,
    style: 'multiple_choice',
    prompt: item.question,
    choices: item.choices,
    answer: item.correctAnswer,
    explanation: item.explanation ?? 'This multiple-choice item was built from the saved exam prep pack.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const answerBankItems = note.answerBank.slice(0, MAX_ANSWER_BANK_ITEMS).map((item, index) => ({
    id: `${note.resourceId}-answer-${index}`,
    style: item.kind === 'date_event' || item.kind === 'law_effect' || item.kind === 'province_capital' || item.kind === 'person_role' || item.kind === 'place_meaning'
      ? 'identification'
      : 'short_answer',
    prompt: buildAnswerBankPrompt(item.cue, item.kind),
    choices: [],
    answer: resolveDeepLearnWording(item.answer),
    explanation: 'This answer comes from the saved answer bank instead of a narrative note paragraph.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const identificationItems = note.identificationItems.slice(0, MAX_IDENTIFICATION_ITEMS).map((item, index) => {
    const correctAnswer = resolveDeepLearnWording(item.answer)
    const distractors = item.distractors
      .filter((entry) => normalizeLookup(entry) !== normalizeLookup(correctAnswer))
      .slice(0, 3)
    const isMultipleChoice = distractors.length >= 3

    return {
      id: `${note.resourceId}-identification-${index}`,
      style: isMultipleChoice ? 'multiple_choice' : 'identification',
      prompt: buildIdentificationPrompt(item.prompt, item.kind),
      choices: isMultipleChoice ? sortChoices([correctAnswer, ...distractors]) : [],
      answer: correctAnswer,
      explanation: 'This identification item is phrased as direct exam recall.',
      sourceLabel: note.title,
    } satisfies StudyNoteQuizItem
  })

  const timelineItems = note.timeline.slice(0, MAX_TIMELINE_ITEMS).map((item, index) => ({
    id: `${note.resourceId}-timeline-${index}`,
    style: 'short_answer',
    prompt: `What belongs on the timeline at ${item.label}?`,
    choices: [],
    answer: item.detail,
    explanation: 'This keeps chronology in a direct date-to-event format.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const distinctionItems = note.distinctions.slice(0, MAX_DISTINCTION_ITEMS).map((item, index) => ({
    id: `${note.resourceId}-distinction-${index}`,
    style: 'short_answer',
    prompt: `Distinguish ${item.conceptA} from ${item.conceptB}.`,
    choices: [],
    answer: item.difference,
    explanation: item.confusionNote ?? 'This pair was preserved because it is easy to confuse under exam pressure.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const likelyTargetItems = note.likelyQuizTargets.slice(0, MAX_LIKELY_TARGET_ITEMS).map((item, index) => ({
    id: `${note.resourceId}-likely-${index}`,
    style: 'short_answer',
    prompt: `Why is "${item.target}" a likely quiz target?`,
    choices: [],
    answer: item.reason,
    explanation: 'High-yield items stay ranked instead of flattened.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  return uniqueBy(
    [
      ...mcqItems,
      ...answerBankItems,
      ...identificationItems,
      ...timelineItems,
      ...distinctionItems,
      ...likelyTargetItems,
    ],
    (item) => `${normalizeLookup(item.prompt)}::${normalizeLookup(item.answer)}`,
  )
}

export function countDeepLearnQuizItems(note: DeepLearnNote) {
  return buildDeepLearnQuizItems(note).length
}

export function isDeepLearnQuizReady(note: DeepLearnNote) {
  return countDeepLearnQuizItems(note) >= MIN_DEEP_LEARN_QUIZ_ITEM_COUNT
}

function buildAnswerBankPrompt(cue: string, kind: DeepLearnNote['answerBank'][number]['kind']) {
  if (kind === 'date_event') return `What happened in ${cue}?`
  if (kind === 'law_effect') return `What did ${cue} do?`
  if (kind === 'province_capital') return `What is the capital of ${cue}?`
  if (kind === 'person_role') return `What role is linked to ${cue}?`
  if (kind === 'place_meaning') return `What does ${cue} mean?`
  if (kind === 'count') return `What count is linked to ${cue}?`
  return `What is the answer-ready fact linked to ${cue}?`
}

function buildIdentificationPrompt(prompt: string, kind: DeepLearnNote['identificationItems'][number]['kind']) {
  if (kind === 'date_event') return `Which event matches ${prompt}?`
  if (kind === 'law_effect') return `Which law or order matches this clue: ${prompt}?`
  if (kind === 'province_capital') return `Which capital matches ${prompt}?`
  if (kind === 'person_role') return `Which role matches ${prompt}?`
  if (kind === 'place_meaning') return `Which meaning matches ${prompt}?`
  if (kind === 'count') return `Which count matches ${prompt}?`
  return `Which answer matches ${prompt}?`
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

function sortChoices(choices: string[]) {
  return [...choices].sort((left, right) => left.localeCompare(right))
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
