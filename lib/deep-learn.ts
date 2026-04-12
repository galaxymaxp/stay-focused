import type {
  DeepLearnCoreTerm,
  DeepLearnDistinction,
  DeepLearnGroundingStrategy,
  DeepLearnNote,
  DeepLearnNoteSection,
  DeepLearnNoteStatus,
  DeepLearnSourceGrounding,
} from '@/lib/types'

export const DEEP_LEARN_PROMPT_VERSION = 'v1'

export interface DeepLearnGeneratedContent {
  title: string
  overview: string
  sections: DeepLearnNoteSection[]
  coreTerms: DeepLearnCoreTerm[]
  keyFacts: string[]
  distinctions: DeepLearnDistinction[]
  likelyQuizPoints: string[]
  cautionNotes: string[]
}

export function buildDeepLearnNoteBody(sections: DeepLearnNoteSection[]) {
  return sections
    .map((section) => `${section.heading}\n${section.body}`.trim())
    .filter(Boolean)
    .join('\n\n')
}

export function computeDeepLearnQuizReady(input: {
  coreTerms: DeepLearnCoreTerm[]
  keyFacts: string[]
  distinctions: DeepLearnDistinction[]
  likelyQuizPoints: string[]
}) {
  const highOrMediumTerms = input.coreTerms.filter((term) =>
    term.importance === 'high' || term.importance === 'medium')

  return highOrMediumTerms.length >= 3
    || (highOrMediumTerms.length >= 2 && input.distinctions.length >= 1)
    || input.keyFacts.length >= 4
    || input.likelyQuizPoints.length >= 4
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
      : [{ heading: 'Study note', body: overview || fallbackTitle }],
    coreTerms: normalizeCoreTerms(record.coreTerms),
    keyFacts: normalizeStringList(record.keyFacts, 8),
    distinctions: normalizeDistinctions(record.distinctions),
    likelyQuizPoints: normalizeStringList(record.likelyQuizPoints, 8),
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
  coreTerms: DeepLearnCoreTerm[]
  keyFacts: string[]
  distinctions: DeepLearnDistinction[]
  likelyQuizPoints: string[]
  cautionNotes: string[]
  sourceGrounding: DeepLearnSourceGrounding
  quizReady: boolean
  promptVersion: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  generatedAt: string | null
}): DeepLearnNote {
  return {
    ...input,
    title: cleanShortText(input.title) || 'Deep Learn note',
    overview: cleanSentence(input.overview) || 'No overview available.',
    sections: normalizeSections(input.sections),
    noteBody: cleanParagraph(input.noteBody) || buildDeepLearnNoteBody(input.sections),
    coreTerms: normalizeCoreTerms(input.coreTerms),
    keyFacts: normalizeStringList(input.keyFacts, 8),
    distinctions: normalizeDistinctions(input.distinctions),
    likelyQuizPoints: normalizeStringList(input.likelyQuizPoints, 8),
    cautionNotes: normalizeStringList(input.cautionNotes, 6),
    sourceGrounding: normalizeDeepLearnSourceGrounding(input.sourceGrounding),
    promptVersion: cleanShortText(input.promptVersion) || DEEP_LEARN_PROMPT_VERSION,
    errorMessage: cleanParagraph(input.errorMessage),
  }
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
    .slice(0, 8)
}

function normalizeCoreTerms(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      const record = asRecord(entry)
      const term = cleanShortText(record.term)
      const explanation = cleanParagraph(record.explanation)
      if (!term || !explanation) return null

      return {
        term,
        explanation,
        importance: normalizeImportance(record.importance),
        preserveExactTerm: Boolean(record.preserveExactTerm),
      } satisfies DeepLearnCoreTerm
    })
    .filter((entry): entry is DeepLearnCoreTerm => Boolean(entry))
    .slice(0, 12)
}

function normalizeDistinctions(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      const record = asRecord(entry)
      const conceptA = cleanShortText(record.conceptA)
      const conceptB = cleanShortText(record.conceptB)
      const difference = cleanParagraph(record.difference)
      if (!conceptA || !conceptB || !difference) return null

      return {
        conceptA,
        conceptB,
        difference,
      } satisfies DeepLearnDistinction
    })
    .filter((entry): entry is DeepLearnDistinction => Boolean(entry))
    .slice(0, 8)
}

function normalizeStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => cleanParagraph(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, maxItems)
}

function buildOverviewFromSections(sections: DeepLearnNoteSection[]) {
  return sections
    .map((section) => section.body)
    .find((entry) => entry.length >= 48)
    ?? sections[0]?.body
    ?? ''
}

function normalizeImportance(value: unknown): DeepLearnCoreTerm['importance'] {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : 'medium'
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...value as Record<string, unknown> }
    : {}
}
