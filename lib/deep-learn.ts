import type {
  DeepLearnAnswerBankItem,
  DeepLearnAnswerKind,
  DeepLearnDistinction,
  DeepLearnGroundingStrategy,
  DeepLearnIdentificationItem,
  DeepLearnLikelyQuizTarget,
  DeepLearnMultipleChoiceItem,
  DeepLearnNote,
  DeepLearnNoteSection,
  DeepLearnReviewItemType,
  DeepLearnNoteStatus,
  DeepLearnSourceGrounding,
  DeepLearnTermImportance,
  DeepLearnTimelineItem,
  DeepLearnWordingSet,
} from '@/lib/types'

export const DEEP_LEARN_PROMPT_VERSION = 'v2-exam-prep'

export interface DeepLearnGeneratedContent {
  title: string
  overview: string
  sections: DeepLearnNoteSection[]
  answerBank: DeepLearnAnswerBankItem[]
  identificationItems: DeepLearnIdentificationItem[]
  distinctions: DeepLearnDistinction[]
  likelyQuizTargets: DeepLearnLikelyQuizTarget[]
  cautionNotes: string[]
}

export function buildDeepLearnNoteBody(sections: DeepLearnNoteSection[]) {
  return sections
    .map((section) => `${section.heading}\n${section.body}`.trim())
    .filter(Boolean)
    .join('\n\n')
}

export function computeDeepLearnQuizReady(input: {
  answerBank: DeepLearnAnswerBankItem[]
  identificationItems: DeepLearnIdentificationItem[]
  distinctions: DeepLearnDistinction[]
  likelyQuizTargets: DeepLearnLikelyQuizTarget[]
}) {
  const answerBank = input.answerBank.filter((item) => item.importance !== 'low')
  const identificationItems = input.identificationItems.filter((item) => item.importance !== 'low')
  const timeline = buildDeepLearnTimeline(answerBank)
  const mcqDrill = buildDeepLearnMcqDrill({
    answerBank,
    identificationItems,
    distinctions: input.distinctions,
  })
  const likelyQuizTargets = input.likelyQuizTargets.filter((item) => item.importance !== 'low')

  const estimatedCoverage = Math.min(answerBank.length, 6)
    + Math.min(identificationItems.length, 6)
    + Math.min(mcqDrill.length, 4)
    + Math.min(timeline.length, 3)
    + Math.min(input.distinctions.length, 2)
    + Math.min(likelyQuizTargets.length, 2)

  return estimatedCoverage >= 8
    && (
      answerBank.length >= 4
      || identificationItems.length >= 5
      || mcqDrill.length >= 5
      || (timeline.length >= 3 && input.distinctions.length >= 1)
    )
}

export function createEmptyDeepLearnSourceGrounding(
  overrides: Partial<DeepLearnSourceGrounding> = {},
): DeepLearnSourceGrounding {
  return {
    sourceType: null,
    extractionQuality: null,
    groundingStrategy: 'insufficient',
    usedAiFallback: false,
    qualityReason: null,
    warning: null,
    charCount: 0,
    ...overrides,
  }
}

export function resolveDeepLearnWording(
  wording: DeepLearnWordingSet,
  mode: 'exact_source' | 'exam_safe' | 'simplified' = 'exam_safe',
) {
  if (mode === 'exact_source') {
    return wording.exact || wording.examSafe
  }

  if (mode === 'simplified') {
    return wording.simplified || wording.examSafe
  }

  return wording.examSafe
}

export function normalizeDeepLearnGeneratedContent(
  value: unknown,
  fallbackTitle: string,
): DeepLearnGeneratedContent {
  const record = asRecord(value)
  const sections = normalizeSections(record.sections)
  const overview = cleanSentence(record.overview) || buildOverviewFromSections(sections)

  return {
    title: cleanShortText(record.title) || fallbackTitle,
    overview: overview || fallbackTitle,
    sections: sections.length > 0
      ? sections
      : [{ heading: 'Support note', body: overview || fallbackTitle }],
    answerBank: normalizeAnswerBank(record.answerBank),
    identificationItems: normalizeIdentificationItems(record.identificationItems),
    distinctions: normalizeDistinctions(record.distinctions),
    likelyQuizTargets: normalizeLikelyQuizTargets(record.likelyQuizTargets),
    cautionNotes: normalizeStringList(record.cautionNotes, 6),
  }
}

export function normalizeDeepLearnStatus(value: unknown): DeepLearnNoteStatus {
  return value === 'pending' || value === 'ready' || value === 'failed'
    ? value
    : 'pending'
}

export function normalizeDeepLearnGroundingStrategy(value: unknown): DeepLearnGroundingStrategy {
  return value === 'stored_extract'
    || value === 'source_refetch'
    || value === 'scan_fallback'
    || value === 'context_only'
    || value === 'insufficient'
    ? value
    : 'insufficient'
}

export function normalizeDeepLearnSourceGrounding(value: unknown): DeepLearnSourceGrounding {
  const record = asRecord(value)

  return {
    sourceType: cleanShortText(record.sourceType),
    extractionQuality: cleanShortText(record.extractionQuality),
    groundingStrategy: normalizeDeepLearnGroundingStrategy(record.groundingStrategy),
    usedAiFallback: Boolean(record.usedAiFallback),
    qualityReason: cleanParagraph(record.qualityReason),
    warning: cleanParagraph(record.warning),
    charCount: normalizePositiveNumber(record.charCount),
  }
}

export function buildDeepLearnNoteRecord(input: {
  id: string
  userId: string
  moduleId: string
  courseId: string | null
  resourceId: string
  status: DeepLearnNoteStatus
  title: string
  overview: string
  sections: DeepLearnNoteSection[]
  noteBody: string
  answerBank: DeepLearnAnswerBankItem[]
  identificationItems: DeepLearnIdentificationItem[]
  distinctions: DeepLearnDistinction[]
  likelyQuizTargets: DeepLearnLikelyQuizTarget[]
  cautionNotes: string[]
  sourceGrounding: DeepLearnSourceGrounding
  quizReady: boolean
  promptVersion: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  generatedAt: string | null
}): DeepLearnNote {
  const sections = normalizeSections(input.sections)
  const answerBank = normalizeAnswerBank(input.answerBank)
  const identificationItems = normalizeIdentificationItems(input.identificationItems)
  const distinctions = normalizeDistinctions(input.distinctions)
  const likelyQuizTargets = normalizeLikelyQuizTargets(input.likelyQuizTargets)

  return {
    ...input,
    title: cleanShortText(input.title) || 'Exam Prep Pack',
    overview: cleanSentence(input.overview) || 'No overview available.',
    sections,
    noteBody: cleanParagraph(input.noteBody) || buildDeepLearnNoteBody(sections),
    answerBank,
    identificationItems,
    mcqDrill: buildDeepLearnMcqDrill({
      answerBank,
      identificationItems,
      distinctions,
    }),
    timeline: buildDeepLearnTimeline(answerBank),
    distinctions,
    likelyQuizTargets,
    cautionNotes: normalizeStringList(input.cautionNotes, 6),
    sourceGrounding: normalizeDeepLearnSourceGrounding(input.sourceGrounding),
    promptVersion: cleanShortText(input.promptVersion) || DEEP_LEARN_PROMPT_VERSION,
    errorMessage: cleanParagraph(input.errorMessage),
  }
}

export function buildDeepLearnTimeline(answerBank: DeepLearnAnswerBankItem[]) {
  return answerBank
    .filter((item) => item.sortKey || item.kind === 'date_event' || looksLikeTimelineCue(item.cue))
    .map((item) => ({
      label: item.cue,
      detail: resolveDeepLearnWording(item.compactAnswer, 'exam_safe'),
      sortKey: normalizeSortKey(item.sortKey) ?? deriveSortKeyFromCue(item.cue),
      importance: item.importance,
      ...buildReviewLinkFields(asRecord(item), 'timeline', item.cue, resolveDeepLearnWording(item.compactAnswer, 'exam_safe')),
    }) satisfies DeepLearnTimelineItem)
    .sort((left, right) => compareTimelineSortKeys(left.sortKey, right.sortKey) || left.label.localeCompare(right.label))
    .slice(0, 12)
}

export function buildDeepLearnMcqDrill(input: {
  answerBank: DeepLearnAnswerBankItem[]
  identificationItems: DeepLearnIdentificationItem[]
  distinctions: DeepLearnDistinction[]
}): DeepLearnMultipleChoiceItem[] {
  const answerPool = uniqueTextList(input.answerBank.map((item) => resolveDeepLearnWording(item.compactAnswer)))
  const identificationPool = uniqueTextList(input.identificationItems.map((item) => resolveDeepLearnWording(item.answer)))
  const distinctionPool = uniqueTextList(input.distinctions.map((item) => item.difference))

  const mcqItems = [
    ...input.answerBank.map((item) => buildAnswerBankMcq(item, answerPool)),
    ...input.identificationItems.map((item) => buildIdentificationMcq(item, identificationPool)),
    ...input.distinctions.map((item) => buildDistinctionMcq(item, distinctionPool)),
  ]
    .filter((item): item is DeepLearnMultipleChoiceItem => item !== null)

  return uniqueBy(
    mcqItems,
    (item) => `${normalizeLookup(item.question)}::${normalizeLookup(item.correctAnswer)}`,
  ).slice(0, 12)
}

function buildAnswerBankMcq(item: DeepLearnAnswerBankItem, answerPool: string[]): DeepLearnMultipleChoiceItem | null {
  const correctAnswer = resolveDeepLearnWording(item.answer)
  const distractors = uniqueTextList([
    ...item.distractors,
    ...answerPool.filter((entry) => normalizeLookup(entry) !== normalizeLookup(correctAnswer)),
  ]).slice(0, 3)

  if (distractors.length < 3) return null

  return {
    question: buildAnswerBankQuestion(item),
    choices: sortChoices([correctAnswer, ...distractors]),
    correctAnswer,
    explanation: buildMcqExplanation(item.kind),
    importance: item.importance,
    ...buildReviewLinkFields(
      asRecord(item),
      'mcq',
      buildAnswerBankQuestion(item),
      resolveDeepLearnWording(item.compactAnswer, 'exam_safe'),
    ),
  } satisfies DeepLearnMultipleChoiceItem
}

function buildIdentificationMcq(item: DeepLearnIdentificationItem, answerPool: string[]): DeepLearnMultipleChoiceItem | null {
  const correctAnswer = resolveDeepLearnWording(item.answer)
  const distractors = uniqueTextList([
    ...item.distractors,
    ...answerPool.filter((entry) => normalizeLookup(entry) !== normalizeLookup(correctAnswer)),
  ]).slice(0, 3)

  if (distractors.length < 3) return null

  return {
    question: buildIdentificationQuestion(item),
    choices: sortChoices([correctAnswer, ...distractors]),
    correctAnswer,
    explanation: 'This item stays phrased as a direct exam prompt instead of a long explanatory note.',
    importance: item.importance,
    ...buildReviewLinkFields(
      asRecord(item),
      'mcq',
      buildIdentificationQuestion(item),
      resolveDeepLearnWording(item.answer, 'exam_safe'),
    ),
  } satisfies DeepLearnMultipleChoiceItem
}

function buildDistinctionMcq(item: DeepLearnDistinction, distinctionPool: string[]): DeepLearnMultipleChoiceItem | null {
  const correctAnswer = item.difference
  const distractors = uniqueTextList([
    item.confusionNote,
    ...distinctionPool.filter((entry) => normalizeLookup(entry) !== normalizeLookup(correctAnswer)),
    `${item.conceptA} and ${item.conceptB} are interchangeable terms.`,
  ]).slice(0, 3)

  if (distractors.length < 3) return null

  return {
    question: `Which distinction correctly separates ${item.conceptA} from ${item.conceptB}?`,
    choices: sortChoices([correctAnswer, ...distractors]),
    correctAnswer,
    explanation: 'This pair was flagged because it is easy to confuse in exams.',
    importance: 'high',
    ...buildReviewLinkFields(
      asRecord(item),
      'mcq',
      `Which distinction correctly separates ${item.conceptA} from ${item.conceptB}?`,
      item.confusionNote ?? item.difference,
    ),
  } satisfies DeepLearnMultipleChoiceItem
}

function buildAnswerBankQuestion(item: DeepLearnAnswerBankItem) {
  if (item.kind === 'date_event') return `What happened on ${item.cue}?`
  if (item.kind === 'law_effect') return `What did ${item.cue} do?`
  if (item.kind === 'province_capital') return `What is the capital of ${item.cue}?`
  if (item.kind === 'person_role') return `What role is linked to ${item.cue}?`
  if (item.kind === 'place_meaning') return `What does ${item.cue} mean?`
  if (item.kind === 'count') return `What count is linked to ${item.cue}?`
  if (item.kind === 'compare') return `Which comparison is linked to ${item.cue}?`
  return `Which answer-ready fact matches ${item.cue}?`
}

function buildIdentificationQuestion(item: DeepLearnIdentificationItem) {
  if (item.kind === 'date_event') return `Which event matches ${item.prompt}?`
  if (item.kind === 'law_effect') return `Which law or order matches this clue: ${item.prompt}?`
  if (item.kind === 'province_capital') return `Which capital matches ${item.prompt}?`
  if (item.kind === 'place_meaning') return `Which meaning matches ${item.prompt}?`
  if (item.kind === 'person_role') return `Which role matches ${item.prompt}?`
  if (item.kind === 'count') return `Which count matches ${item.prompt}?`
  return `Which answer matches ${item.prompt}?`
}

function buildMcqExplanation(kind: DeepLearnAnswerKind) {
  if (kind === 'date_event') return 'This stays in date-to-event form because that is a common exam pattern.'
  if (kind === 'law_effect') return 'This keeps the law/order-to-effect relationship explicit for fast recall.'
  if (kind === 'province_capital' || kind === 'person_role' || kind === 'place_meaning') {
    return 'This stays compact so the review pack behaves like an exam-ready lookup, not a narrative summary.'
  }

  return 'This came from a compact answer unit that was preserved for direct recall.'
}

function normalizeSections(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      const record = asRecord(entry)
      const heading = cleanShortText(record.heading)
      const body = cleanParagraph(record.body)

      if (!heading || !body) return null

      return { heading, body }
    })
    .filter((entry): entry is DeepLearnNoteSection => Boolean(entry))
    .slice(0, 6)
}

function normalizeAnswerBank(value: unknown): DeepLearnAnswerBankItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry, index): DeepLearnAnswerBankItem | null => {
      if (typeof entry === 'string') {
        const answer = normalizeWordingSet(entry)
        if (!answer) return null

        return {
          cue: `Key answer ${index + 1}`,
          kind: 'fact',
          answer,
          compactAnswer: answer,
          importance: 'medium',
          sortKey: null,
          distractors: [],
          ...buildReviewLinkFields({}, 'answer_bank', `Key answer ${index + 1}`, answer.examSafe),
        } satisfies DeepLearnAnswerBankItem
      }

      const record = asRecord(entry)
      const cue = cleanShortText(record.cue)
      const answer = normalizeWordingSet(record.answer)
      const compactAnswer = normalizeWordingSet(record.compactAnswer) ?? answer
      if (!cue || !answer || !compactAnswer) return null

      return {
        cue,
        kind: normalizeAnswerKind(record.kind),
        answer,
        compactAnswer,
        importance: normalizeImportance(record.importance),
        sortKey: normalizeSortKey(record.sortKey) ?? deriveSortKeyFromCue(cue),
        distractors: normalizeStringList(record.distractors, 4),
        ...buildReviewLinkFields(record, 'answer_bank', cue, compactAnswer.examSafe),
      } satisfies DeepLearnAnswerBankItem
    })
    .filter((entry): entry is DeepLearnAnswerBankItem => Boolean(entry))
    .slice(0, 16)
}

function normalizeIdentificationItems(value: unknown): DeepLearnIdentificationItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry): DeepLearnIdentificationItem | null => {
      const record = asRecord(entry)
      const prompt = cleanShortText(record.prompt)
      const answer = normalizeWordingSet(record.answer)
      if (!prompt || !answer) return null

      return {
        prompt,
        kind: normalizeAnswerKind(record.kind),
        answer,
        importance: normalizeImportance(record.importance),
        distractors: normalizeStringList(record.distractors, 4),
        ...buildReviewLinkFields(record, 'identification', prompt, answer.examSafe),
      } satisfies DeepLearnIdentificationItem
    })
    .filter((entry): entry is DeepLearnIdentificationItem => Boolean(entry))
    .slice(0, 18)
}

function normalizeDistinctions(value: unknown): DeepLearnDistinction[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry): DeepLearnDistinction | null => {
      const record = asRecord(entry)
      const conceptA = cleanShortText(record.conceptA)
      const conceptB = cleanShortText(record.conceptB)
      const difference = cleanParagraph(record.difference)
      if (!conceptA || !conceptB || !difference) return null

      return {
        conceptA,
        conceptB,
        difference,
        confusionNote: cleanParagraph(record.confusionNote),
        ...buildReviewLinkFields(record, 'distinction', `${conceptA} vs ${conceptB}`, difference),
      } satisfies DeepLearnDistinction
    })
    .filter((entry): entry is DeepLearnDistinction => Boolean(entry))
    .slice(0, 8)
}

function normalizeLikelyQuizTargets(value: unknown): DeepLearnLikelyQuizTarget[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry, index): DeepLearnLikelyQuizTarget | null => {
      if (typeof entry === 'string') {
        const target = cleanParagraph(entry)
        if (!target) return null

        return {
          target,
          reason: index === 0
            ? 'Ranked high because it is explicit and answerable from the source.'
            : 'Ranked because it is likely to appear as a recall or recognition item.',
          importance: index === 0 ? 'high' : 'medium',
          ...buildReviewLinkFields({}, 'quiz_target', target, target),
        } satisfies DeepLearnLikelyQuizTarget
      }

      const record = asRecord(entry)
      const target = cleanParagraph(record.target)
      const reason = cleanParagraph(record.reason)
      if (!target || !reason) return null

      return {
        target,
        reason,
        importance: normalizeImportance(record.importance),
        ...buildReviewLinkFields(record, 'quiz_target', target, reason),
      } satisfies DeepLearnLikelyQuizTarget
    })
    .filter((entry): entry is DeepLearnLikelyQuizTarget => Boolean(entry))
    .slice(0, 8)
}

function normalizeWordingSet(value: unknown): DeepLearnWordingSet | null {
  if (typeof value === 'string') {
    const examSafe = cleanParagraph(value)
    if (!examSafe) return null

    return {
      exact: examSafe,
      examSafe,
      simplified: null,
    }
  }

  const record = asRecord(value)
  const examSafe = cleanParagraph(record.examSafe ?? record.answer)
  if (!examSafe) return null

  return {
    exact: cleanParagraph(record.exact),
    examSafe,
    simplified: cleanParagraph(record.simplified),
  }
}

function buildReviewLinkFields(
  record: Record<string, unknown>,
  itemType: DeepLearnReviewItemType,
  fallbackReviewText: string,
  fallbackDraftExplanation: string,
) {
  const draftExplanation = cleanParagraph(record.draftExplanation) ?? cleanParagraph(fallbackDraftExplanation)

  return {
    reviewText: cleanParagraph(record.reviewText) ?? cleanParagraph(fallbackReviewText) ?? fallbackReviewText,
    draftExplanation,
    sourceSnippet: cleanParagraph(record.sourceSnippet),
    linkedDraftSectionId: normalizeSectionId(record.linkedDraftSectionId),
    itemType,
    supportingContext: cleanParagraph(record.supportingContext) ?? draftExplanation,
    compareContext: cleanParagraph(record.compareContext),
    simplifiedWording: cleanParagraph(record.simplifiedWording),
    confusionNotes: normalizeStringList(record.confusionNotes, 3),
    relatedConcepts: normalizeStringList(record.relatedConcepts, 5),
  }
}

function normalizeStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return []

  return uniqueTextList(
    value
      .map((entry) => cleanParagraph(entry))
      .filter((entry): entry is string => Boolean(entry)),
  ).slice(0, maxItems)
}

function buildOverviewFromSections(sections: DeepLearnNoteSection[]) {
  return sections
    .map((section) => section.body)
    .find((entry) => entry.length >= 48)
    ?? sections[0]?.body
    ?? ''
}

function normalizeAnswerKind(value: unknown): DeepLearnAnswerKind {
  return value === 'date_event'
    || value === 'law_effect'
    || value === 'term_definition'
    || value === 'place_meaning'
    || value === 'province_capital'
    || value === 'person_role'
    || value === 'count'
    || value === 'timeline'
    || value === 'compare'
    || value === 'fact'
    ? value
    : 'fact'
}

function normalizeImportance(value: unknown): DeepLearnTermImportance {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : 'medium'
}

function normalizeSortKey(value: unknown) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned && cleaned.length <= 32 ? cleaned : null
}

function normalizeSectionId(value: unknown) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned && cleaned.length <= 96 ? cleaned : null
}

function deriveSortKeyFromCue(cue: string) {
  const fullDate = cue.match(/\b([A-Z][a-z]+ \d{1,2}, \d{4})\b/)
  if (fullDate?.[1]) {
    const parsed = new Date(fullDate[1])
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }

  const year = cue.match(/\b(1[5-9]\d{2}|20\d{2})\b/)
  return year?.[1] ? `${year[1]}-01-01` : null
}

function compareTimelineSortKeys(left: string | null, right: string | null) {
  if (left && right) return left.localeCompare(right)
  if (left) return -1
  if (right) return 1
  return 0
}

function looksLikeTimelineCue(value: string) {
  return /\b(1[5-9]\d{2}|20\d{2})\b/.test(value)
    || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i.test(value)
}

function uniqueTextList(values: Array<string | null | undefined>) {
  return uniqueBy(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
    (value) => normalizeLookup(value),
  )
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

function normalizePositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

function cleanShortText(value: unknown) {
  if (typeof value !== 'string') return null

  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  return cleaned.slice(0, 180)
}

function cleanSentence(value: unknown) {
  if (typeof value !== 'string') return null

  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  return cleaned.slice(0, 420)
}

function cleanParagraph(value: unknown) {
  if (typeof value !== 'string') return null

  const cleaned = value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return cleaned || null
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...value as Record<string, unknown> }
    : {}
}
