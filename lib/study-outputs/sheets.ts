import { buildDeepLearnNoteBody, resolveDeepLearnWording } from '@/lib/deep-learn'
import { deepLearnNoteHasUntrustworthyGrounding } from '@/lib/deep-learn-source-validation'
import type {
  DeepLearnAnswerBankItem,
  DeepLearnIdentificationItem,
  DeepLearnNote,
  DeepLearnTermImportance,
  StudyOutputSheetContent,
  StudyOutputSheetFormulaItem,
  StudyOutputSheetMode,
  StudyOutputSheetTrapItem,
} from '@/lib/types'

export interface SheetBuildReadiness {
  ok: boolean
  reason: 'missing' | 'pending' | 'failed' | 'metadata_only' | 'empty'
  message: string
}

const SHEET_LIMITS: Record<StudyOutputSheetMode, {
  keyTerms: number
  formulas: number
  facts: number
  confusingConcepts: number
  traps: number
}> = {
  study_sheet: {
    keyTerms: 12,
    formulas: 6,
    facts: 10,
    confusingConcepts: 6,
    traps: 6,
  },
  cram_sheet: {
    keyTerms: 8,
    formulas: 4,
    facts: 6,
    confusingConcepts: 4,
    traps: 4,
  },
}

export function getDeepLearnSheetReadiness(note: DeepLearnNote | null, mode: StudyOutputSheetMode): SheetBuildReadiness {
  if (!note) {
    return {
      ok: false,
      reason: 'missing',
      message: `Deep Learn needs a saved ready pack before it can make a ${labelForMode(mode)}.`,
    }
  }

  if (note.status === 'pending') {
    return {
      ok: false,
      reason: 'pending',
      message: `Deep Learn is still preparing this pack. The ${labelForMode(mode)} unlocks after the pack is ready.`,
    }
  }

  if (note.status === 'failed') {
    return {
      ok: false,
      reason: 'failed',
      message: `Deep Learn could not build a trustworthy pack from this source, so a ${labelForMode(mode)} cannot be made yet.`,
    }
  }

  if (deepLearnNoteHasUntrustworthyGrounding(note)) {
    return {
      ok: false,
      reason: 'metadata_only',
      message: `This Deep Learn pack is not grounded in enough readable academic source text for a ${labelForMode(mode)}.`,
    }
  }

  const limits = SHEET_LIMITS[mode]
  const hasGroundedContent = buildKeyTerms(note, limits.keyTerms).length > 0
    || buildFormulas(note, limits.formulas).length > 0
    || buildHighYieldFacts(note, limits.facts).length > 0
    || buildLikelyExamTraps(note, limits.traps).length > 0
    || note.distinctions.length > 0

  if (!hasGroundedContent) {
    return {
      ok: false,
      reason: 'empty',
      message: `This Deep Learn pack does not yet have enough compact grounded content for a ${labelForMode(mode)}.`,
    }
  }

  return {
    ok: true,
    reason: 'empty',
    message: '',
  }
}

export function buildDeepLearnSheetContent(note: DeepLearnNote, mode: StudyOutputSheetMode): StudyOutputSheetContent {
  const readiness = getDeepLearnSheetReadiness(note, mode)
  if (!readiness.ok) {
    throw new Error(readiness.message)
  }

  const limits = SHEET_LIMITS[mode]
  const keyTerms = buildKeyTerms(note, limits.keyTerms)
  const formulas = buildFormulas(note, limits.formulas)
  const highYieldFacts = buildHighYieldFacts(note, limits.facts)
  const confusingConcepts = note.distinctions
    .slice(0, limits.confusingConcepts)
    .map((item) => ({
      conceptA: item.conceptA,
      conceptB: item.conceptB,
      difference: trimToSentence(item.difference),
      confusionNote: item.confusionNote ? trimToSentence(item.confusionNote) : null,
    }))
  const likelyExamTraps = buildLikelyExamTraps(note, limits.traps)

  return {
    version: 'study-sheet-v1',
    mode,
    sourceNoteId: note.id,
    sourceResourceId: note.resourceId,
    title: buildSheetTitle(note.title, mode),
    summary: buildSheetSummary(mode, keyTerms.length, formulas.length, highYieldFacts.length),
    intro: buildSheetIntro(note, mode),
    keyTerms,
    formulas,
    highYieldFacts,
    confusingConcepts,
    likelyExamTraps,
  }
}

function buildKeyTerms(note: DeepLearnNote, limit: number) {
  const merged = [
    ...note.answerBank
      .slice()
      .sort(compareImportanceDesc)
      .map((item) => ({
        term: item.cue.trim(),
        definition: trimToSentence(resolveDeepLearnWording(item.compactAnswer, 'exam_safe')),
        importance: item.importance,
      })),
    ...note.identificationItems
      .slice()
      .sort(compareImportanceDesc)
      .map((item) => ({
        term: trimToSentence(resolveDeepLearnWording(item.answer, 'exam_safe')),
        definition: trimToSentence(item.prompt),
        importance: item.importance,
      })),
  ]

  return uniqueBy(
    merged.filter((item) => item.term && item.definition),
    (item) => normalizeLookup(item.term),
  ).slice(0, limit)
}

function buildHighYieldFacts(note: DeepLearnNote, limit: number) {
  const facts = [
    ...note.answerBank
      .slice()
      .sort(compareImportanceDesc)
      .map((item) => ({
        cue: item.cue.trim(),
        detail: trimToSentence(resolveDeepLearnWording(item.answer, 'exam_safe')),
        importance: item.importance,
      })),
    ...note.likelyQuizTargets
      .slice()
      .sort((left, right) => compareImportance(right.importance, left.importance))
      .map((item) => ({
        cue: item.target.trim(),
        detail: trimToSentence(item.reason),
        importance: item.importance,
      })),
  ]

  return uniqueBy(
    facts.filter((item) => item.cue && item.detail),
    (item) => `${normalizeLookup(item.cue)}::${normalizeLookup(item.detail)}`,
  ).slice(0, limit)
}

function buildLikelyExamTraps(note: DeepLearnNote, limit: number): StudyOutputSheetTrapItem[] {
  const traps = [
    ...note.cautionNotes.map((item) => ({
      trap: trimToSentence(item),
      explanation: trimToSentence(item),
      importance: 'high' as DeepLearnTermImportance,
    })),
    ...note.distinctions
      .filter((item) => item.confusionNote)
      .map((item) => ({
        trap: `${item.conceptA} vs ${item.conceptB}`,
        explanation: trimToSentence(item.confusionNote ?? item.difference),
        importance: 'high' as DeepLearnTermImportance,
      })),
    ...note.likelyQuizTargets.map((item) => ({
      trap: item.target.trim(),
      explanation: trimToSentence(item.reason),
      importance: item.importance,
    })),
  ]

  return uniqueBy(
    traps.filter((item) => item.trap && item.explanation),
    (item) => `${normalizeLookup(item.trap)}::${normalizeLookup(item.explanation)}`,
  ).slice(0, limit)
}

function buildFormulas(note: DeepLearnNote, limit: number): StudyOutputSheetFormulaItem[] {
  const sectionSource = note.noteBody || buildDeepLearnNoteBody(note.sections)
  const candidates = [
    ...note.answerBank.flatMap((item) => toFormulaCandidatesFromAnswer(item)),
    ...note.identificationItems.flatMap((item) => toFormulaCandidatesFromIdentification(item)),
    ...extractFormulaCandidatesFromText(sectionSource),
  ]

  return uniqueBy(
    candidates.filter((item) => item.label && item.expression),
    (item) => `${normalizeLookup(item.label)}::${normalizeLookup(item.expression)}`,
  ).slice(0, limit)
}

function toFormulaCandidatesFromAnswer(item: DeepLearnAnswerBankItem): StudyOutputSheetFormulaItem[] {
  const label = item.cue.trim()
  const candidates = [
    resolveDeepLearnWording(item.answer, 'exact_source'),
    resolveDeepLearnWording(item.compactAnswer, 'exact_source'),
    item.supportingContext ?? '',
    item.reviewText ?? '',
  ]

  return candidates
    .flatMap((candidate) => extractFormulaCandidatesFromText(candidate))
    .map((candidate) => ({ ...candidate, label: candidate.label || label }))
}

function toFormulaCandidatesFromIdentification(item: DeepLearnIdentificationItem): StudyOutputSheetFormulaItem[] {
  const label = trimToSentence(resolveDeepLearnWording(item.answer, 'exam_safe'))
  const candidates = [item.prompt, item.supportingContext ?? '', item.reviewText ?? '']

  return candidates
    .flatMap((candidate) => extractFormulaCandidatesFromText(candidate))
    .map((candidate) => ({ ...candidate, label: candidate.label || label }))
}

function extractFormulaCandidatesFromText(value: string) {
  const text = value.trim()
  if (!text) return []

  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => looksLikeFormula(line))
    .map((line) => {
      const [labelPart, ...rest] = line.split(':')
      if (rest.length > 0 && looksLikeFormula(rest.join(':'))) {
        return {
          label: trimToSentence(labelPart),
          expression: trimToSentence(rest.join(':')),
          note: null,
        }
      }

      return {
        label: 'Formula',
        expression: trimToSentence(line),
        note: null,
      }
    })
}

function buildSheetTitle(noteTitle: string, mode: StudyOutputSheetMode) {
  const trimmed = noteTitle.trim()
  const replacement = mode === 'cram_sheet' ? 'Cram Sheet' : 'Study Sheet'

  if (!trimmed) return `Deep Learn ${replacement}`
  if (new RegExp(`\\b${replacement}\\b`, 'i').test(trimmed)) return trimmed
  if (/\bexam prep pack\b/i.test(trimmed)) return trimmed.replace(/\bexam prep pack\b/i, replacement)
  if (/\breviewer\b/i.test(trimmed)) return trimmed.replace(/\breviewer\b/i, replacement)
  if (/\bquiz pack\b/i.test(trimmed)) return trimmed.replace(/\bquiz pack\b/i, replacement)
  return `${trimmed} ${replacement}`
}

function buildSheetSummary(mode: StudyOutputSheetMode, termCount: number, formulaCount: number, factCount: number) {
  const lead = mode === 'cram_sheet'
    ? 'Printable last-minute cram sheet built from the saved Deep Learn pack.'
    : 'Printable compact study sheet built from the saved Deep Learn pack.'
  return `${lead} ${termCount} key term${termCount === 1 ? '' : 's'}, ${formulaCount} formula${formulaCount === 1 ? '' : 's'}, and ${factCount} high-yield fact${factCount === 1 ? '' : 's'} are arranged for fast scan review.`
}

function buildSheetIntro(note: DeepLearnNote, mode: StudyOutputSheetMode) {
  if (mode === 'cram_sheet') {
    return note.quizReady
      ? 'Use this for the final pass: terms, traps, formulas, and distinctions only.'
      : 'Use this for a tight last-minute pass over the strongest grounded material in the saved pack.'
  }

  return note.quizReady
    ? 'Use this as a compact study pass before switching back to quizzes or the full reviewer.'
    : 'Use this as a compact grounded study sheet when you need the key takeaways without the full note.'
}

function looksLikeFormula(value: string) {
  const text = value.trim()
  if (text.length < 5 || text.length > 120) return false
  if (!/[0-9A-Za-z]/.test(text)) return false
  return /[=/%^+]|(?:\bper\b)|(?:\bminus\b)|(?:\bplus\b)|(?:\bdivided by\b)|(?:\bx\b)|(?:\*)/.test(text)
}

function trimToSentence(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*[:;,-]\s*$/, '')
    .trim()
}

function compareImportanceDesc(left: DeepLearnAnswerBankItem | DeepLearnIdentificationItem, right: DeepLearnAnswerBankItem | DeepLearnIdentificationItem) {
  return compareImportance(right.importance, left.importance)
}

function compareImportance(left: DeepLearnTermImportance, right: DeepLearnTermImportance) {
  return getImportanceRank(left) - getImportanceRank(right)
}

function getImportanceRank(value: DeepLearnTermImportance) {
  if (value === 'high') return 0
  if (value === 'medium') return 1
  return 2
}

function labelForMode(mode: StudyOutputSheetMode) {
  return mode === 'cram_sheet' ? 'cram sheet' : 'study sheet'
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
