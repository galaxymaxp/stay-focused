import { resolveDeepLearnWording } from '@/lib/deep-learn'
import { collectStudySheetFormulas } from '@/lib/study-outputs/sheets'
import type { StudyNoteQuizItem } from '@/lib/study-note-quiz'
import type { DeepLearnNote } from '@/lib/types'

const MAX_ANSWER_BANK_ITEMS = 8
const MAX_IDENTIFICATION_ITEMS = 8
const MAX_TIMELINE_ITEMS = 4
const MAX_DISTINCTION_ITEMS = 3
const MAX_LIKELY_TARGET_ITEMS = 2
const ADMIN_METADATA_PATTERN = /\b(?:course\s+title|course\s+code|academic\s+year|credits?|credit\s+hours?|meeting\s+schedule|room\s+link|zoom|google\s+meet|instructor|teacher|professor|admin(?:istrative)?|section|semester|term|prepared by|file title)\b/i

export const MIN_DEEP_LEARN_QUIZ_ITEM_COUNT = 5

export function buildDeepLearnQuizItems(note: DeepLearnNote): StudyNoteQuizItem[] {
  const formulaItems = buildFormulaQuizItems(note)
  const mcqItems = note.mcqDrill.map((item, index) => ({
    id: `${note.resourceId}-mcq-${index}`,
    style: 'multiple_choice',
    prompt: item.question,
    choices: item.choices,
    answer: item.correctAnswer,
    explanation: item.explanation ?? 'This multiple-choice question comes directly from the saved study pack.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const answerBankItems = note.answerBank
    .filter((item) => isAcademicQuizText(item.cue) && isAcademicQuizText(resolveDeepLearnWording(item.answer)))
    .slice(0, MAX_ANSWER_BANK_ITEMS)
    .map((item, index) => ({
    id: `${note.resourceId}-answer-${index}`,
    style: item.kind === 'date_event' || item.kind === 'law_effect' || item.kind === 'province_capital' || item.kind === 'person_role' || item.kind === 'place_meaning'
      ? 'identification'
      : 'short_answer',
    prompt: buildAnswerBankPrompt(item.cue, item.kind),
    choices: [],
    answer: resolveDeepLearnWording(item.answer),
    explanation: 'This answer is stated directly in the source.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const identificationItems = note.identificationItems
    .filter((item) => isAcademicQuizText(item.prompt) && isAcademicQuizText(resolveDeepLearnWording(item.answer)))
    .slice(0, MAX_IDENTIFICATION_ITEMS)
    .map((item, index) => {
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
      explanation: 'This clue is answered directly by the selected source.',
      sourceLabel: note.title,
    } satisfies StudyNoteQuizItem
  })

  const timelineItems = note.timeline.slice(0, MAX_TIMELINE_ITEMS).map((item, index) => ({
    id: `${note.resourceId}-timeline-${index}`,
    style: 'short_answer',
    prompt: `What belongs on the timeline at ${item.label}?`,
    choices: [],
    answer: item.detail,
    explanation: 'This date and event pairing comes from the source timeline.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const distinctionItems = note.distinctions.slice(0, MAX_DISTINCTION_ITEMS).map((item, index) => ({
    id: `${note.resourceId}-distinction-${index}`,
    style: 'short_answer',
    prompt: `Distinguish ${item.conceptA} from ${item.conceptB}.`,
    choices: [],
    answer: item.difference,
    explanation: item.confusionNote ?? 'This distinction matters because these ideas are easy to confuse.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const likelyTargetItems = note.likelyQuizTargets.slice(0, MAX_LIKELY_TARGET_ITEMS).map((item, index) => ({
    id: `${note.resourceId}-likely-${index}`,
    style: 'short_answer',
    prompt: `Why is "${item.target}" a likely quiz target?`,
    choices: [],
    answer: item.reason,
    explanation: 'This topic is called out explicitly in the saved study pack.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  return uniqueBy(
    [
      ...formulaItems,
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
  return `What does the source say about ${cue}?`
}

function buildIdentificationPrompt(prompt: string, kind: DeepLearnNote['identificationItems'][number]['kind']) {
  if (kind === 'date_event') return `Which event matches ${prompt}?`
  if (kind === 'law_effect') return `Which law or order matches this clue: ${prompt}?`
  if (kind === 'province_capital') return `Which capital matches ${prompt}?`
  if (kind === 'person_role') return `Which role matches ${prompt}?`
  if (kind === 'place_meaning') return `Which meaning matches ${prompt}?`
  if (kind === 'count') return `Which count matches ${prompt}?`
  return `Which answer best matches this clue: ${prompt}?`
}

function buildFormulaQuizItems(note: DeepLearnNote): StudyNoteQuizItem[] {
  const formulas = collectStudySheetFormulas(note, 6)
  if (formulas.length === 0) return []

  const expressionPool = formulas.map((item) => item.expression)
  return formulas.flatMap((item, index) => {
    const distractors = expressionPool
      .filter((entry) => normalizeLookup(entry) !== normalizeLookup(item.expression))
      .slice(0, 3)

    const items: StudyNoteQuizItem[] = [{
      id: `${note.resourceId}-formula-${index}-recall`,
      style: distractors.length >= 3 ? 'multiple_choice' : 'short_answer',
      prompt: `Which formula should you use for ${item.label}?`,
      choices: distractors.length >= 3 ? sortChoices([item.expression, ...distractors]) : [],
      answer: item.expression,
      explanation: item.note ?? 'This formula is the one provided for the calculation in the source.',
      sourceLabel: note.title,
    }]

    if (item.note && /\b(?:use|when|calculate|solve|plug|substitute|units?)\b/i.test(item.note)) {
      items.push({
        id: `${note.resourceId}-formula-${index}-use`,
        style: 'short_answer',
        prompt: `When should you use ${item.label}?`,
        choices: [],
        answer: item.note,
        explanation: 'This usage note comes directly from the selected source.',
        sourceLabel: note.title,
      })
    }

    return items
  })
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

function isAcademicQuizText(value: string) {
  const cleaned = value.trim()
  return Boolean(cleaned) && !ADMIN_METADATA_PATTERN.test(cleaned)
}
