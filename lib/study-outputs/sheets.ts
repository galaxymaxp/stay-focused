import { buildDeepLearnNoteBody, resolveDeepLearnWording } from '@/lib/deep-learn'
import { deepLearnNoteHasUntrustworthyGrounding } from '@/lib/deep-learn-source-validation'
import { normalizeSourceFaithfulText, normalizeStudyOutputHeadingIfRaw } from '@/lib/study-outputs/source-faithful'
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
    || collectStudySheetFormulas(note, limits.formulas).length > 0
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
  const formulas = collectStudySheetFormulas(note, limits.formulas)
  const supplementalSection = formulas.length === 0
    ? buildSupplementalSection(note, limits.formulas)
    : { title: null, items: [] }
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
    summary: buildSheetSummary(mode, keyTerms.length, formulas.length, supplementalSection.title, supplementalSection.items.length, highYieldFacts.length),
    intro: buildSheetIntro(note, mode),
    keyTerms,
    formulas,
    supplementalSectionTitle: supplementalSection.title,
    supplementalSectionItems: supplementalSection.items,
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
        term: normalizeStudyOutputHeadingIfRaw(item.cue),
        definition: trimToSentence(resolveDeepLearnWording(item.compactAnswer, 'exact_source')),
        importance: item.importance,
        sourceWording: trimToSentence(resolveDeepLearnWording(item.answer, 'exact_source')),
        plainExplanation: buildPlainExplanation(item),
      })),
    ...note.identificationItems
      .slice()
      .sort(compareImportanceDesc)
      .map((item) => ({
        term: trimToSentence(resolveDeepLearnWording(item.answer, 'exact_source')),
        definition: trimToSentence(item.prompt),
        importance: item.importance,
        sourceWording: trimToSentence(resolveDeepLearnWording(item.answer, 'exact_source')),
        plainExplanation: buildPlainExplanation(item),
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
        detail: trimToSentence(resolveDeepLearnWording(item.answer, 'exact_source')),
        importance: item.importance,
      })),
    ...note.likelyQuizTargets
      .slice()
      .sort((left, right) => compareImportance(right.importance, left.importance))
      .map((item) => ({
        cue: normalizeStudyOutputHeadingIfRaw(item.target),
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

export function collectStudySheetFormulas(note: DeepLearnNote, limit: number): StudyOutputSheetFormulaItem[] {
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

  const lines = text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)

  return lines.flatMap((line, index) => {
    if (!looksLikeRealFormula(line)) return []

    const [labelPart, ...rest] = line.split(':')
    const expression = rest.length > 0 && looksLikeRealFormula(rest.join(':'))
      ? trimFormulaText(rest.join(':'))
      : trimFormulaText(line)
    const label = rest.length > 0 && looksLikeRealFormula(rest.join(':'))
      ? trimToSentence(labelPart)
      : inferFormulaLabel(line)
    const note = collectFormulaSupportNote(lines.slice(index + 1, index + 3))

    return [{
      label,
      expression,
      note,
    }]
  })
}

function buildSupplementalSection(note: DeepLearnNote, limit: number) {
  const definitionItems = uniqueBy(
    [
      ...note.answerBank
        .filter((item) => item.kind === 'term_definition' || looksLikeDefinitionRelation(item.cue, resolveDeepLearnWording(item.answer, 'exam_safe')))
        .map((item) => ({
          cue: normalizeStudyOutputHeadingIfRaw(item.cue),
          detail: trimToSentence(resolveDeepLearnWording(item.answer, 'exact_source')),
          importance: item.importance,
        })),
      ...note.identificationItems
        .filter((item) => item.kind === 'term_definition')
        .map((item) => ({
          cue: trimToSentence(resolveDeepLearnWording(item.answer, 'exact_source')),
          detail: trimToSentence(item.prompt),
          importance: item.importance,
        })),
      ...extractDefinitionRelationsFromText(note.noteBody || buildDeepLearnNoteBody(note.sections))
    ].filter((item) => item.cue && item.detail),
    (item) => `${normalizeLookup(item.cue)}::${normalizeLookup(item.detail)}`,
  ).slice(0, limit)

  return {
    title: definitionItems.length > 0 ? selectSupplementalSectionTitle(definitionItems) : null,
    items: definitionItems,
  }
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

function buildSheetSummary(
  mode: StudyOutputSheetMode,
  termCount: number,
  formulaCount: number,
  supplementalTitle: string | null,
  supplementalCount: number,
  factCount: number,
) {
  const lead = mode === 'cram_sheet'
    ? 'Printable last-minute cram sheet built from the saved Deep Learn pack.'
    : 'Printable compact study sheet built from the saved Deep Learn pack.'
  if (formulaCount > 0) {
    return `${lead} ${termCount} key term${termCount === 1 ? '' : 's'}, ${formulaCount} formula${formulaCount === 1 ? '' : 's'}, and ${factCount} high-yield fact${factCount === 1 ? '' : 's'} are arranged for fast scan review.`
  }

  if (supplementalTitle && supplementalCount > 0) {
    return `${lead} ${termCount} key term${termCount === 1 ? '' : 's'}, ${supplementalCount} ${supplementalTitle.toLowerCase()}, and ${factCount} high-yield fact${factCount === 1 ? '' : 's'} are arranged for fast scan review.`
  }

  return `${lead} ${termCount} key term${termCount === 1 ? '' : 's'} and ${factCount} high-yield fact${factCount === 1 ? '' : 's'} are arranged for fast scan review.`
}

function buildSheetIntro(note: DeepLearnNote, mode: StudyOutputSheetMode) {
  if (mode === 'cram_sheet') {
    return note.quizReady
      ? 'Use this for the final pass: terms, traps, the strongest source-backed details, and distinctions only.'
      : 'Use this for a tight last-minute pass over the strongest grounded material in the saved pack.'
  }

  return note.quizReady
    ? 'Use this as a compact study pass before switching back to quizzes or the full reviewer.'
    : 'Use this as a compact grounded study sheet when you need the key takeaways without the full note.'
}

function looksLikeRealFormula(value: string) {
  const text = value.trim()
  if (text.length < 5 || text.length > 140) return false
  if (!/[0-9A-Za-z]/.test(text)) return false
  if (/\b(?:means|definition|defined as)\b/i.test(text)) return false
  if (/\b(?:process(?:es)?|tools?|flaw|weakness|successful exploit|sensitive|hardware|software|attack|symptoms?|indicators?)\b/i.test(text) && !/[0-9^/%*()]/.test(text)) {
    return false
  }

  const [leftRaw, rightRaw] = text.includes('=') ? text.split(/=(.+)/).filter(Boolean) : ['', '']
  const left = leftRaw?.trim() ?? ''
  const right = rightRaw?.trim() ?? ''
  const hasEquationSignal = /[=^/%*()]|(?:\bdivided by\b)|(?:\bper\b)|(?:\bplus\b)|(?:\bminus\b)|(?:\d+\s*(?:cm|mm|m|km|kg|g|s|ms|a|v|w|j|n|pa|hz|mol|l)\b)/i.test(text)
  const hasVariableShape = /\b[a-z]{1,3}\b/i.test(left.replace(/\s+/g, ''))
    || /[A-Z]{1,4}\s*=/.test(text)
    || /[a-z]\^?\d?/i.test(right)
  const hasCompactQuantitativeRelation = text.includes('=')
    && /[/^*()]|\d/.test(right)
    && tokenCount(left) <= 3
    && tokenCount(right) <= 6
  const hasWordFormulaPattern = text.includes('=')
    && /(speed|distance|time|density|mass|volume|force|energy|power|voltage|current|resistance|pressure|acceleration|momentum)/i.test(text)
    && /[/^*()]|\bdivided by\b|\bper\b/.test(right)
  const looksDefinitionOnly = text.includes('=')
    && tokenCount(left) <= 4
    && tokenCount(right) >= 5
    && !/[0-9^/%*()]/.test(text)
  const containsWordSlashOnly = /[A-Za-z]{4,}\/[A-Za-z]{4,}/.test(right)
    && !/\b(?:distance|time|mass|volume|current|voltage|power|energy|speed|density|pressure|acceleration|momentum)\b/i.test(right)

  if (looksDefinitionOnly || containsWordSlashOnly) return false
  return hasEquationSignal && (hasVariableShape || hasCompactQuantitativeRelation || hasWordFormulaPattern)
}

function trimToSentence(value: string) {
  return normalizeSourceFaithfulText(value)
    .replace(/\s+/g, ' ')
    .replace(/\s*[:;,-]\s*$/, '')
    .trim()
}

function buildPlainExplanation(item: DeepLearnAnswerBankItem | DeepLearnIdentificationItem) {
  const explanation = item.simplifiedWording ?? item.supportingContext ?? item.draftExplanation ?? null
  const cleaned = explanation ? trimToSentence(explanation) : null
  const source = trimToSentence(resolveDeepLearnWording(item.answer, 'exact_source'))
  return cleaned && cleaned !== source ? cleaned : null
}

function trimFormulaText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*[,;]\s*$/, '')
    .trim()
}

function inferFormulaLabel(line: string) {
  const beforeEquals = line.split('=')[0]?.trim()
  if (beforeEquals && tokenCount(beforeEquals) <= 4) return beforeEquals
  return 'Formula'
}

function collectFormulaSupportNote(lines: string[]) {
  const noteLines = lines
    .map((line) => trimToSentence(line))
    .filter((line) => line.length > 0 && !looksLikeRealFormula(line))
    .filter((line) => /^(?:where\b|[A-Za-z]{1,4}\s*=|\buse\b|\bcalculate\b|\bplug\b|\bsubstitute\b|\bunits?\b)/i.test(line))
    .slice(0, 2)

  return noteLines.length > 0 ? noteLines.join('\n') : null
}

function extractDefinitionRelationsFromText(value: string) {
  return value
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => looksLikeDefinitionRelationLine(line))
    .map((line) => {
      const separator = line.includes('=') ? '=' : line.includes('->') ? '->' : ':'
      const [left, ...rest] = line.split(separator)
      return {
        cue: trimToSentence(left),
        detail: trimToSentence(rest.join(separator)),
        importance: 'high' as DeepLearnTermImportance,
      }
    })
}

function looksLikeDefinitionRelationLine(line: string) {
  if (!line || looksLikeRealFormula(line)) return false
  if (line.includes('=')) return looksLikeDefinitionRelation(line.split('=')[0] ?? '', line.split('=').slice(1).join('='))
  if (line.includes('->')) return looksLikeDefinitionRelation(line.split('->')[0] ?? '', line.split('->').slice(1).join('->'))
  return /:/.test(line) && tokenCount(line.split(':')[0] ?? '') <= 4 && tokenCount(line.split(':').slice(1).join(':')) >= 3
}

function looksLikeDefinitionRelation(left: string, right: string) {
  const trimmedLeft = left.trim()
  const trimmedRight = right.trim()
  if (!trimmedLeft || !trimmedRight) return false
  if (tokenCount(trimmedLeft) > 5 || tokenCount(trimmedRight) > 20) return false
  if (/[0-9^/%*()]/.test(`${trimmedLeft} ${trimmedRight}`)) return false
  return true
}

function selectSupplementalSectionTitle(items: Array<{ cue: string; detail: string }>) {
  const definitionLikeCount = items.filter((item) => tokenCount(item.cue) <= 3).length
  if (definitionLikeCount >= Math.max(2, Math.ceil(items.length / 2))) return 'Key definitions'

  const corpus = items.map((item) => `${item.cue} ${item.detail}`).join(' ')
  if (/\b(?:symptom|indicator|crash|slow|usage|lag|malware)\b/i.test(corpus)) return 'Symptoms and indicators'
  if (/\b(?:attack|threat|phishing|virus|worm|trojan|dos|ddos|exploit|infiltration)\b/i.test(corpus)) return 'Attack methods'
  if (/\b(?:domain|triad|relationship|compare|versus|vs\.?)\b/i.test(corpus)) return 'Concept relationships'
  return 'Key definitions'
}

function tokenCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
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
