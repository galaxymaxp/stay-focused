import type { StudyNoteQuizItem } from '@/lib/study-note-quiz'
import type { DeepLearnNote } from '@/lib/types'

const MAX_TERM_ITEMS = 6
const MAX_FACT_ITEMS = 3
const MAX_DISTINCTION_ITEMS = 2
const MAX_LIKELY_POINT_ITEMS = 2

export const MIN_DEEP_LEARN_QUIZ_ITEM_COUNT = 5

export function buildDeepLearnQuizItems(note: DeepLearnNote): StudyNoteQuizItem[] {
  const terms = uniqueTerms(note)
  const keyFacts = uniqueTextList(note.keyFacts).slice(0, MAX_FACT_ITEMS)
  const distinctions = note.distinctions
    .filter((item) => item.conceptA && item.conceptB && item.difference)
    .slice(0, MAX_DISTINCTION_ITEMS)
  const likelyQuizPoints = uniqueTextList(note.likelyQuizPoints).slice(0, MAX_LIKELY_POINT_ITEMS)

  const termItems = terms.slice(0, MAX_TERM_ITEMS).map((term, index) => {
    const distractors = uniqueTextList(
      terms
        .filter((candidate) => normalizeLookup(candidate.term) !== normalizeLookup(term.term))
        .map((candidate) => candidate.term),
    ).slice(0, 3)
    const hasChoices = distractors.length >= 3

    return {
      id: `${note.resourceId}-term-${index}`,
      style: hasChoices ? 'multiple_choice' : 'identification',
      prompt: `Which exact term matches this explanation: "${trimAtBoundary(term.explanation, 170)}"?`,
      choices: hasChoices ? sortChoices([term.term, ...distractors]) : [],
      answer: term.term,
      explanation: term.preserveExactTerm
        ? `The note kept "${term.term}" as an exact source term, so the quiz uses that wording directly.`
        : `This term comes from the saved Deep Learn note for "${note.title}".`,
      sourceLabel: note.title,
    } satisfies StudyNoteQuizItem
  })

  const factItems = keyFacts.map((fact, index) => ({
    id: `${note.resourceId}-fact-${index}`,
    style: 'short_answer',
    prompt: `State the key fact this note expects you to remember about "${note.title}".`,
    choices: [],
    answer: fact,
    explanation: 'This answer is taken directly from the Deep Learn note key-fact list.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const distinctionItems = distinctions.map((item, index) => ({
    id: `${note.resourceId}-distinction-${index}`,
    style: 'short_answer',
    prompt: `Explain the difference between ${item.conceptA} and ${item.conceptB}.`,
    choices: [],
    answer: item.difference,
    explanation: 'This difference was preserved because the note marked it as a likely confusion point.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  const likelyPointItems = likelyQuizPoints.map((point, index) => ({
    id: `${note.resourceId}-likely-${index}`,
    style: 'short_answer',
    prompt: `What likely quiz point does this note flag for "${note.title}"?`,
    choices: [],
    answer: point,
    explanation: 'This detail was explicitly marked as likely testable in the Deep Learn note.',
    sourceLabel: note.title,
  } satisfies StudyNoteQuizItem))

  return uniqueBy(
    [...termItems, ...factItems, ...distinctionItems, ...likelyPointItems],
    (item) => `${normalizeLookup(item.prompt)}::${normalizeLookup(item.answer)}`,
  )
}

export function countDeepLearnQuizItems(note: DeepLearnNote) {
  return buildDeepLearnQuizItems(note).length
}

export function isDeepLearnQuizReady(note: DeepLearnNote) {
  return countDeepLearnQuizItems(note) >= MIN_DEEP_LEARN_QUIZ_ITEM_COUNT
}

function uniqueTerms(note: DeepLearnNote) {
  return note.coreTerms
    .filter((term) => term.term && term.explanation)
    .filter((term) => term.importance === 'high' || term.importance === 'medium')
    .slice(0, MAX_TERM_ITEMS)
    .filter((term, index, collection) =>
      collection.findIndex((candidate) => normalizeLookup(candidate.term) === normalizeLookup(term.term)) === index)
}

function uniqueTextList(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, collection) =>
      collection.findIndex((candidate) => normalizeLookup(candidate) === normalizeLookup(value)) === index)
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

function trimAtBoundary(value: string, maxLength: number) {
  if (value.length <= maxLength) return value

  const clipped = value.slice(0, maxLength)
  const breakIndex = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('; '),
    clipped.lastIndexOf(', '),
  )

  return `${clipped.slice(0, breakIndex > 70 ? breakIndex + 1 : maxLength).trim()}...`
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
