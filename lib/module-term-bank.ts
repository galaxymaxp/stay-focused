import type { ModuleLearnOverviewModel, ModuleStudyMaterial } from '@/lib/module-learn-overview'
import type { ModuleTerm, ModuleTermOrigin } from '@/lib/types'

export type ModuleTermCandidateKind = 'term' | 'concept' | 'acronym'
export type ModuleTermQuizStyle = 'multiple_choice' | 'identification' | 'true_false' | 'short_answer'
export type FinalReviewerTermOrigin = ModuleTermOrigin | 'auto'

export interface FinalReviewerTerm {
  id: string
  key: string
  resourceId: string | null
  term: string
  kind: ModuleTermCandidateKind
  definition: string | null
  explanation: string
  whyItMatters: string
  evidenceSnippet: string
  sourceLabel: string | null
  sourceCount: number
  origin: FinalReviewerTermOrigin
  savedTermId: string | null
  persisted: boolean
}

export interface ModuleTermSuggestion {
  id: string
  key: string
  resourceId: string | null
  term: string
  kind: ModuleTermCandidateKind
  definition: string | null
  explanation: string
  evidenceSnippet: string
  sourceLabel: string | null
  sourceCount: number
}

export interface ModuleTermQuizItem {
  id: string
  style: ModuleTermQuizStyle
  prompt: string
  choices: string[]
  answer: string
  explanation: string
  sourceLabel: string | null
}

export interface ModuleTermBankModel {
  finalTerms: FinalReviewerTerm[]
  suggestedTerms: ModuleTermSuggestion[]
  dismissedCount: number
  groundedSourceCount: number
  groundedCharCount: number
  quizItems: ModuleTermQuizItem[]
  termsStateMessage: string
  quizStateMessage: string
  correctionNote: string
}

interface CandidateDraft {
  key: string
  term: string
  kind: ModuleTermCandidateKind
  score: number
  resourceIds: Set<string>
  sourceLabels: Set<string>
  linkedContexts: Set<string>
  requiredCount: number
  definitionSentences: string[]
  explanationSentences: string[]
  evidenceSentences: string[]
}

interface BuiltCandidate {
  id: string
  key: string
  resourceId: string | null
  term: string
  kind: ModuleTermCandidateKind
  definition: string | null
  explanation: string
  whyItMatters: string
  evidenceSnippet: string
  sourceLabel: string | null
  sourceCount: number
  score: number
}

const AUTO_FINAL_TERM_MAX = 12
const MAX_SUGGESTED_TERMS = 6
const MAX_QUIZ_ITEMS = 6

const GENERIC_TERM_KEYS = new Set([
  'a',
  'an',
  'announcement',
  'assignment',
  'canvas',
  'chapter',
  'class',
  'concept',
  'course',
  'discussion',
  'example',
  'examples',
  'features',
  'file',
  'files',
  'introduction',
  'it',
  'label',
  'labels',
  'lesson',
  'materials',
  'module',
  'note',
  'notes',
  'objective',
  'objectives',
  'overview',
  'page',
  'pages',
  'part',
  'practice',
  'question',
  'questions',
  'quiz',
  'reading',
  'review',
  'reviewer',
  'section',
  'slide',
  'slides',
  'source',
  'sources',
  'speaker notes',
  'student',
  'students',
  'study',
  'summary',
  'they',
  'term',
  'terms',
  'topic',
  'week',
  'worksheet',
])

export function buildModuleTermBank({
  overview,
  storedTerms,
}: {
  overview: ModuleLearnOverviewModel
  storedTerms: ModuleTerm[]
}): ModuleTermBankModel {
  const readyMaterials = overview.studyMaterials.filter((material) => material.readiness === 'ready')
  const termSourceMaterials = readyMaterials.filter(isUsefulTermSourceMaterial)
  const groundedCharCount = readyMaterials.reduce((total, material) => total + getMaterialCharCount(material), 0)
  const noisyTitleKeys = buildNoisyTitleKeySet(termSourceMaterials)
  const generatedCandidates = buildGeneratedCandidates(termSourceMaterials, noisyTitleKeys)
  const generatedByKey = new Map(generatedCandidates.map((candidate) => [candidate.key, candidate]))
  const rejectedKeys = new Set(
    storedTerms
      .filter((term) => term.status === 'rejected')
      .map((term) => term.normalizedTerm),
  )
  const storedApproved = storedTerms
    .filter((term) => term.status === 'approved')
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  const storedApprovedKeys = new Set(storedApproved.map((term) => term.normalizedTerm))

  const finalTermsFromCorrections = storedApproved
    .map((term) => buildFinalTermFromStored(term, generatedByKey.get(term.normalizedTerm)))
    .filter((term): term is FinalReviewerTerm => Boolean(term))
  const selectedKeys = new Set(finalTermsFromCorrections.map((term) => term.key))
  const autoFinalTerms = generatedCandidates
    .filter((candidate) => !rejectedKeys.has(candidate.key))
    .filter((candidate) => !storedApprovedKeys.has(candidate.key))
    .filter(isHighConfidenceAutoCandidate)
    .slice(0, Math.max(0, AUTO_FINAL_TERM_MAX - finalTermsFromCorrections.length))
    .map((candidate) => buildFinalTermFromCandidate(candidate))

  const finalTerms = [...finalTermsFromCorrections]
  for (const term of autoFinalTerms) {
    if (selectedKeys.has(term.key)) continue
    selectedKeys.add(term.key)
    finalTerms.push(term)
  }

  const suggestedTerms = generatedCandidates
    .filter((candidate) => !selectedKeys.has(candidate.key))
    .filter((candidate) => !rejectedKeys.has(candidate.key))
    .slice(0, MAX_SUGGESTED_TERMS)
    .map((candidate) => ({
      id: candidate.id,
      key: candidate.key,
      resourceId: candidate.resourceId,
      term: candidate.term,
      kind: candidate.kind,
      definition: candidate.definition,
      explanation: candidate.explanation,
      evidenceSnippet: candidate.evidenceSnippet,
      sourceLabel: candidate.sourceLabel,
      sourceCount: candidate.sourceCount,
    }))
  const quizItems = buildQuizItemsFromFinal(finalTerms)

  return {
    finalTerms,
    suggestedTerms,
    dismissedCount: rejectedKeys.size,
    groundedSourceCount: readyMaterials.length,
    groundedCharCount,
    quizItems,
    termsStateMessage: buildTermsStateMessage(finalTerms.length, suggestedTerms.length, readyMaterials.length, groundedCharCount),
    quizStateMessage: buildQuizStateMessage(finalTerms.length, quizItems.length),
    correctionNote: 'The module term set starts from the strongest grounded terms first. Corrections only step in when you want to remove, pin, refresh, or add something missing.',
  }
}

function buildGeneratedCandidates(materials: ModuleStudyMaterial[], noisyTitleKeys: Set<string>) {
  const drafts = new Map<string, CandidateDraft>()

  for (const material of materials) {
    const text = normalizeReviewText(material.resource.extractedText ?? material.resource.extractedTextPreview ?? '')
    if (!text) continue

    const sentences = splitSentences(text)

    collectDefinitionCandidates(sentences, material, drafts, noisyTitleKeys)
    collectAcronymCandidates(sentences, material, drafts, noisyTitleKeys)
  }

  return Array.from(drafts.values())
    .map((draft) => buildCandidate(draft, noisyTitleKeys))
    .filter((candidate): candidate is BuiltCandidate => Boolean(candidate))
    .sort(compareCandidates)
}

function buildFinalTermFromStored(term: ModuleTerm, matchedCandidate?: BuiltCandidate): FinalReviewerTerm | null {
  const explanation = cleanNullable(term.explanation) ?? matchedCandidate?.explanation ?? null
  const definition = cleanNullable(term.definition) ?? matchedCandidate?.definition ?? null
  const evidenceSnippet = cleanNullable(term.evidenceSnippet) ?? matchedCandidate?.evidenceSnippet ?? null
  const whyItMatters = matchedCandidate?.whyItMatters ?? 'You kept this term in the module set, so it stays available for quick quiz until you remove it.'

  if (!explanation && !definition) return null

  return {
    id: matchedCandidate?.id ?? term.id,
    key: term.normalizedTerm,
    resourceId: term.resourceId ?? matchedCandidate?.resourceId ?? null,
    term: term.term,
    kind: matchedCandidate?.kind ?? classifyCandidateKind(term.term),
    definition,
    explanation: explanation ?? definition ?? 'No explanation saved.',
    whyItMatters,
    evidenceSnippet: evidenceSnippet ?? 'No evidence snippet is saved for this term yet.',
    sourceLabel: cleanNullable(term.sourceLabel) ?? matchedCandidate?.sourceLabel ?? null,
    sourceCount: matchedCandidate?.sourceCount ?? 1,
    origin: term.origin,
    savedTermId: term.id,
    persisted: true,
  }
}

function buildFinalTermFromCandidate(candidate: BuiltCandidate): FinalReviewerTerm {
  return {
    id: candidate.id,
    key: candidate.key,
    resourceId: candidate.resourceId,
    term: candidate.term,
    kind: candidate.kind,
    definition: candidate.definition,
    explanation: candidate.explanation,
    whyItMatters: candidate.whyItMatters,
    evidenceSnippet: candidate.evidenceSnippet,
    sourceLabel: candidate.sourceLabel,
    sourceCount: candidate.sourceCount,
    origin: 'auto',
    savedTermId: null,
    persisted: false,
  }
}

function buildQuizItemsFromFinal(finalTerms: FinalReviewerTerm[]) {
  if (finalTerms.length < 2) {
    return []
  }

  const quizTerms = finalTerms.filter((term) => Boolean(term.definition || term.explanation))
  if (quizTerms.length < 2) {
    return []
  }

  const items: ModuleTermQuizItem[] = []
  const availableStyles = buildQuizStyleCycle(quizTerms.length)
  const totalItems = Math.min(quizTerms.length, MAX_QUIZ_ITEMS, availableStyles.length)

  for (let index = 0; index < totalItems; index += 1) {
    const term = quizTerms[index]
    const style = availableStyles[index]
    const nextTerm = quizTerms[(index + 1) % quizTerms.length]

    if (style === 'multiple_choice') {
      const distractors = quizTerms.filter((candidate) => candidate.key !== term.key).slice(0, 3)
      if (distractors.length < 3) continue

      items.push({
        id: `${term.id}-mc-${index}`,
        style,
        prompt: `Which term best matches this module clue: "${pickBestClue(term)}"?`,
        choices: sortChoices([term.term, ...distractors.map((candidate) => candidate.term)]),
        answer: term.term,
        explanation: `${term.term} is part of the grounded module term set, so the quick quiz can trust this clue.`,
        sourceLabel: term.sourceLabel,
      })
      continue
    }

    if (style === 'identification') {
      items.push({
        id: `${term.id}-identify-${index}`,
        style,
        prompt: `Identify the term described here: "${pickBestClue(term)}"`,
        choices: [],
        answer: term.term,
        explanation: `${term.term} matches the grounded definition kept for this module.`,
        sourceLabel: term.sourceLabel,
      })
      continue
    }

    if (style === 'true_false') {
      const shouldBeTrue = index % 2 === 0 || nextTerm.key === term.key
      const clueTerm = shouldBeTrue ? term : nextTerm

      items.push({
        id: `${term.id}-tf-${index}`,
        style,
        prompt: `True or false: ${term.term} means ${pickBestClue(clueTerm)}.`,
        choices: ['True', 'False'],
        answer: shouldBeTrue ? 'True' : 'False',
        explanation: shouldBeTrue
          ? 'This statement comes directly from the grounded module term set.'
          : `${term.term} is in the grounded term set, but that clue belongs to ${nextTerm.term}.`,
        sourceLabel: term.sourceLabel,
      })
      continue
    }

    items.push({
      id: `${term.id}-sa-${index}`,
      style,
      prompt: `Define ${term.term} in one or two sentences.`,
      choices: [],
      answer: buildShortAnswer(term),
      explanation: 'This answer comes from the grounded term set, not from a raw candidate.',
      sourceLabel: term.sourceLabel,
    })
  }

  return items
}

function buildTermsStateMessage(finalCount: number, suggestedCount: number, groundedSourceCount: number, groundedCharCount: number) {
  if (groundedSourceCount === 0) {
    return 'No grounded study sources are ready yet, so the module term area stays empty instead of guessing from weak inputs.'
  }

  if (finalCount === 0) {
    if (groundedCharCount < 500) {
      return 'Some grounded text is available, but the coverage is still too thin to auto-build a trustworthy term set.'
    }

    return 'Grounded study sources are available, but no strong terminology survived the term filter yet.'
  }

  if (suggestedCount === 0) {
    return `${finalCount} strong term${finalCount === 1 ? '' : 's'} are ready to review in this module.`
  }

  return `${finalCount} strong module term${finalCount === 1 ? '' : 's'} are ready now, with ${suggestedCount} extra suggestion${suggestedCount === 1 ? '' : 's'} tucked behind the correction path.`
}

function buildQuizStateMessage(finalCount: number, quizCount: number) {
  if (finalCount === 0) {
    return 'The module needs at least a few strong terms before the quick quiz can start.'
  }

  if (quizCount === 0) {
    return 'The quick quiz is waiting for a slightly larger grounded term set before it starts asking mixed checks.'
  }

  return `The quick quiz is using ${finalCount} grounded module term${finalCount === 1 ? '' : 's'} as its source of truth.`
}

function collectDefinitionCandidates(
  sentences: string[],
  material: ModuleStudyMaterial,
  drafts: Map<string, CandidateDraft>,
  noisyTitleKeys: Set<string>,
) {
  const definitionPatterns = [
    /^([A-Za-z][A-Za-z0-9/-]*(?: [A-Za-z][A-Za-z0-9/-]*){0,4})\s+(?:is|are|refers to|means|describes|involves|represents|stands for)\s+(.+)$/i,
    /^([A-Za-z][A-Za-z0-9/-]*(?: [A-Za-z][A-Za-z0-9/-]*){0,4})\s*[:\-]\s+(.+)$/i,
  ]

  for (const sentence of sentences) {
    for (const pattern of definitionPatterns) {
      const match = sentence.match(pattern)
      if (!match) continue

      const term = sanitizeCandidateTerm(match[1])
      const definitionClause = cleanupDefinitionClause(match[2])
      if (!term || !definitionClause) continue

      const key = normalizeLookup(term)
      if (noisyTitleKeys.has(key)) continue

      const definitionSentence = normalizeDefinitionSentence(term, sentence, definitionClause)
      addDraft(drafts, {
        term,
        kind: classifyCandidateKind(term),
        score: 8,
        definitionSentence,
        explanationSentence: trimAtBoundary(extractDefinitionBody(term, definitionSentence) ?? definitionSentence, 170),
        evidenceSentence: trimAtBoundary(sentence, 220),
      }, material, noisyTitleKeys)
      break
    }
  }
}

function collectAcronymCandidates(
  sentences: string[],
  material: ModuleStudyMaterial,
  drafts: Map<string, CandidateDraft>,
  noisyTitleKeys: Set<string>,
) {
  const forwardPattern = /\b([A-Za-z][A-Za-z0-9/-]*(?: [A-Za-z][A-Za-z0-9/-]*){1,6})\s+\(([A-Z]{2,10})\)\b/g
  const reversePattern = /\b([A-Z]{2,10})\s+\(([A-Za-z][A-Za-z0-9/-]*(?: [A-Za-z][A-Za-z0-9/-]*){1,6})\)\b/g

  for (const sentence of sentences) {
    for (const match of sentence.matchAll(forwardPattern)) {
      const expanded = sanitizeCandidateTerm(match[1])
      const acronym = sanitizeCandidateTerm(match[2], true)
      if (!expanded || !acronym) continue

      addDraft(drafts, {
        term: acronym,
        kind: 'acronym',
        score: 10,
        definitionSentence: `${acronym} stands for ${expanded}.`,
        explanationSentence: `${acronym} is the shortened form of ${expanded}.`,
        evidenceSentence: trimAtBoundary(sentence, 220),
      }, material, noisyTitleKeys)
    }

    for (const match of sentence.matchAll(reversePattern)) {
      const acronym = sanitizeCandidateTerm(match[1], true)
      const expanded = sanitizeCandidateTerm(match[2])
      if (!expanded || !acronym) continue

      addDraft(drafts, {
        term: acronym,
        kind: 'acronym',
        score: 10,
        definitionSentence: `${acronym} stands for ${expanded}.`,
        explanationSentence: `${acronym} is the shortened form of ${expanded}.`,
        evidenceSentence: trimAtBoundary(sentence, 220),
      }, material, noisyTitleKeys)
    }
  }
}

function addDraft(
  drafts: Map<string, CandidateDraft>,
  input: {
    term: string
    kind: ModuleTermCandidateKind
    score: number
    definitionSentence?: string | null
    explanationSentence?: string | null
    evidenceSentence?: string | null
  },
  material: ModuleStudyMaterial,
  noisyTitleKeys: Set<string>,
) {
  const term = sanitizeCandidateTerm(input.term, input.kind === 'acronym')
  if (!term) return

  const key = normalizeLookup(term)
  if (!key || GENERIC_TERM_KEYS.has(key) || noisyTitleKeys.has(key)) return

  const draft = drafts.get(key) ?? {
    key,
    term,
    kind: input.kind,
    score: 0,
    resourceIds: new Set<string>(),
    sourceLabels: new Set<string>(),
    linkedContexts: new Set<string>(),
    requiredCount: 0,
    definitionSentences: [],
    explanationSentences: [],
    evidenceSentences: [],
  }

  draft.term = chooseDisplayTerm(draft.term, term)
  draft.kind = prioritizeKind(draft.kind, input.kind)
  draft.score += input.score
  draft.resourceIds.add(material.resource.id)
  draft.sourceLabels.add(material.resource.title)
  if (material.resource.linkedContext) draft.linkedContexts.add(material.resource.linkedContext)
  if (material.resource.required) draft.requiredCount += 1
  if (input.definitionSentence) pushUnique(draft.definitionSentences, input.definitionSentence)
  if (input.explanationSentence) pushUnique(draft.explanationSentences, input.explanationSentence)
  if (input.evidenceSentence) pushUnique(draft.evidenceSentences, input.evidenceSentence)

  drafts.set(key, draft)
}

function buildCandidate(draft: CandidateDraft, noisyTitleKeys: Set<string>): BuiltCandidate | null {
  if (!isStrongCandidateDraft(draft, noisyTitleKeys)) {
    return null
  }

  const definition = draft.definitionSentences[0] ?? null
  const explanation = trimAtBoundary(
    draft.explanationSentences[0]
      ?? extractDefinitionBody(draft.term, definition ?? '')
      ?? draft.evidenceSentences[0]
      ?? '',
    170,
  )

  if (!explanation) return null

  const sourceCount = draft.sourceLabels.size
  const whyItMatters = buildWhyItMatters(draft, sourceCount)
  const score = draft.score
    + sourceCount * 3
    + (definition ? 3 : 0)
    + (draft.requiredCount > 0 ? 2 : 0)

  return {
    id: `${draft.key}-candidate`,
    key: draft.key,
    resourceId: Array.from(draft.resourceIds)[0] ?? null,
    term: draft.term,
    kind: draft.kind,
    definition,
    explanation,
    whyItMatters,
    evidenceSnippet: draft.evidenceSentences[0] ?? explanation,
    sourceLabel: Array.from(draft.sourceLabels)[0] ?? null,
    sourceCount,
    score,
  }
}

function isStrongCandidateDraft(draft: CandidateDraft, noisyTitleKeys: Set<string>) {
  if (noisyTitleKeys.has(draft.key)) return false
  if (GENERIC_TERM_KEYS.has(draft.key)) return false
  if (looksLikeJunkTerm(draft.term, draft.kind)) return false

  const hasDefinition = draft.definitionSentences.length > 0
  const repeatedAcrossSources = draft.sourceLabels.size > 1

  if (draft.kind === 'acronym') {
    return hasDefinition && /^[A-Z]{2,10}$/.test(draft.term)
  }

  if (hasDefinition) return true
  if (repeatedAcrossSources && draft.explanationSentences.length > 0) {
    return draft.term.split(' ').length <= 3 && draft.score >= 10
  }

  return false
}

function isHighConfidenceAutoCandidate(candidate: BuiltCandidate) {
  if (looksLikeJunkTerm(candidate.term, candidate.kind)) return false

  if (candidate.kind === 'acronym') {
    return Boolean(candidate.definition) && candidate.score >= 15
  }

  if (candidate.definition && candidate.score >= 13) {
    return true
  }

  return candidate.sourceCount > 1 && candidate.score >= 14 && candidate.term.split(' ').length <= 3
}

function buildWhyItMatters(draft: CandidateDraft, sourceCount: number) {
  const linkedContext = Array.from(draft.linkedContexts)[0] ?? null

  if (sourceCount > 1) {
    return `It shows up across ${sourceCount} grounded sources in this module, which makes it a strong quiz target.`
  }

  if (draft.requiredCount > 0) {
    return 'It comes from a required study source, so it is worth knowing before you switch into the quick quiz.'
  }

  if (linkedContext) {
    return `It connects directly to ${linkedContext}, so later work in this module may assume you already understand it.`
  }

  return `It survived the term filter because it carries one of the clearer lesson ideas in the grounded source set.`
}

function compareCandidates(left: BuiltCandidate, right: BuiltCandidate) {
  return right.score - left.score
    || right.sourceCount - left.sourceCount
    || left.term.localeCompare(right.term)
}

function buildNoisyTitleKeySet(materials: ModuleStudyMaterial[]) {
  const keys = new Set<string>()

  for (const material of materials) {
    const title = material.resource.title
    const key = normalizeLookup(title)
    if (!key) continue

    if (
      title.includes('.')
      || /lecture|slides|notes|handout|worksheet|module|week|chapter|ppt|pptx|pdf|doc|document|reviewer|activity/i.test(title)
      || key.split(' ').length > 3
    ) {
      keys.add(key)
    }
  }

  return keys
}

function isUsefulTermSourceMaterial(material: ModuleStudyMaterial) {
  const title = normalizeLookup(material.resource.title)
  const linkedContext = normalizeLookup(material.resource.linkedContext ?? '')

  if (!title) return false

  if (
    /student handbook|handbook|orientation|roll call|attendance|get to know|learning contract/.test(title)
    || /student handbook|orientation|attendance/.test(linkedContext)
  ) {
    return false
  }

  return true
}

function getMaterialCharCount(material: ModuleStudyMaterial) {
  return typeof material.resource.extractedCharCount === 'number'
    ? material.resource.extractedCharCount
    : (material.resource.extractedText ?? material.resource.extractedTextPreview ?? '').length
}

function pickBestClue(term: Pick<FinalReviewerTerm, 'definition' | 'explanation'>) {
  return trimAtBoundary(term.definition ?? term.explanation, 150)
}

function buildShortAnswer(term: Pick<FinalReviewerTerm, 'definition' | 'explanation' | 'whyItMatters'>) {
  return trimAtBoundary([term.definition, term.explanation, term.whyItMatters].filter(Boolean).join(' '), 190)
}

function normalizeReviewText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, ' ')
    .replace(/(?:^|\n)\s*(speaker notes?|presenter notes?|notes for the presenter|click to add notes?)\s*(?:\n|$)/gi, '\n')
    .replace(/\n?--\s*\d+\s+of\s+\d+\s*--\n?/gi, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => compactWhitespace(sentence))
    .filter((sentence) => sentence.length >= 18 && !looksLikeNoise(sentence))
}

function sanitizeCandidateTerm(raw: string, allowAcronym = false) {
  const cleaned = compactWhitespace(raw.replace(/^[\s"'([{]+|[\s"'.,;:)\]}]+$/g, ''))
    .replace(/^(the|a|an)\s+/i, '')
  if (!cleaned) return null

  const wordCount = cleaned.split(' ').length
  if (!allowAcronym && wordCount > 5) return null
  if (cleaned.length < 2 || cleaned.length > 52) return null
  if (!allowAcronym && wordCount > 3 && looksLikeSentenceFragment(cleaned)) return null

  const key = normalizeLookup(cleaned)
  if (!key || GENERIC_TERM_KEYS.has(key)) return null

  return cleaned
}

function cleanupDefinitionClause(value: string) {
  const cleaned = compactWhitespace(value.replace(/^[\s"'([{]+|[\s"'.,;:)\]}]+$/g, ''))
  if (cleaned.length < 12) return null
  if (looksLikeNoise(cleaned)) return null
  return cleaned
}

function normalizeDefinitionSentence(term: string, sentence: string, definitionClause: string) {
  const compactSentence = trimAtBoundary(compactWhitespace(sentence), 220)
  const sentenceKey = normalizeLookup(compactSentence)
  const termKey = normalizeLookup(term)

  if (sentenceKey.startsWith(termKey)) {
    return compactSentence
  }

  return trimAtBoundary(`${term} is ${definitionClause}.`, 220)
}

function classifyCandidateKind(term: string): ModuleTermCandidateKind {
  if (/^[A-Z]{2,10}$/.test(term)) return 'acronym'
  return term.split(' ').length >= 4 ? 'concept' : 'term'
}

function chooseDisplayTerm(left: string, right: string) {
  if (/^[A-Z]{2,10}$/.test(right) && !/^[A-Z]{2,10}$/.test(left)) return right
  if (right.length < left.length) return right
  return left
}

function prioritizeKind(current: ModuleTermCandidateKind, next: ModuleTermCandidateKind): ModuleTermCandidateKind {
  if (current === 'acronym' || next === 'acronym') return 'acronym'
  if (current === 'concept' || next === 'concept') return 'concept'
  return 'term'
}

function extractDefinitionBody(term: string, sentence: string) {
  if (!sentence) return null

  const escapedTerm = escapeRegExp(term)
  const match = sentence.match(new RegExp(`^${escapedTerm}\\s+(?:is|are|refers to|means|describes|involves|represents|stands for)\\s+(.+)$`, 'i'))
  if (match?.[1]) {
    return cleanupSentenceEnding(match[1])
  }

  const colonMatch = sentence.match(/^[^:]+:\s+(.+)$/)
  if (colonMatch?.[1]) {
    return cleanupSentenceEnding(colonMatch[1])
  }

  const dashMatch = sentence.match(/^[^-]+-\s+(.+)$/)
  if (dashMatch?.[1]) {
    return cleanupSentenceEnding(dashMatch[1])
  }

  return trimAtBoundary(compactWhitespace(sentence), 160)
}

function looksLikeJunkTerm(term: string, kind: ModuleTermCandidateKind) {
  const key = normalizeLookup(term)
  if (!key || GENERIC_TERM_KEYS.has(key)) return true
  if (/^(week|module|chapter|lesson|part|section|slide|page|figure|table)\s+\d+$/i.test(term)) return true
  if (/\.(pdf|pptx?|docx?|txt|md)$/i.test(term)) return true
  if (/^(speaker notes?|presenter notes?|click to add notes?)$/i.test(term)) return true
  if (/^slide:\s+/i.test(term)) return true
  if (/^(learning objectives?|key takeaways?|reference list|discussion board|study guide)$/i.test(term)) return true
  if (/^(definition|definitions|features|key features|benefits|advantages|challenges|key issues|applications|best practice)$/i.test(term)) return true
  if (/^[-*•]/.test(term)) return true
  if (/[\\/=_]/.test(term)) return true
  if (/^(continued|discussion|remember|recall|example|note)$/i.test(term)) return true
  if (kind !== 'acronym' && /^[A-Z0-9-]{1,4}$/.test(term)) return true
  if (kind === 'acronym' && !/^[A-Z]{2,10}$/.test(term)) return true
  if (kind !== 'acronym' && term === term.toUpperCase() && term.length <= 8) return true
  if (looksLikeSentenceFragment(term)) return true
  if (term.split(' ').length >= 4 && term === term.toUpperCase()) return true
  return false
}

function cleanNullable(value: string | null | undefined) {
  const cleaned = value?.trim()
  return cleaned ? cleaned : null
}

function sortChoices(choices: string[]) {
  return [...choices].sort((left, right) => left.localeCompare(right))
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function cleanupSentenceEnding(value: string) {
  return compactWhitespace(value.replace(/[.;:]+$/g, ''))
}

function trimAtBoundary(text: string, maxLength: number) {
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength)
  const punctuationIndex = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('? '),
    clipped.lastIndexOf('! '),
  )

  if (punctuationIndex >= 60) {
    return clipped.slice(0, punctuationIndex + 1).trim()
  }

  const spaceIndex = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, spaceIndex > 0 ? spaceIndex : maxLength).trim()}...`
}

function pushUnique(values: string[], next: string) {
  const cleaned = compactWhitespace(next)
  if (!cleaned) return
  if (values.some((value) => normalizeLookup(value) === normalizeLookup(cleaned))) return
  values.push(cleaned)
}

function looksLikeNoise(value: string) {
  return /^page\s+\d+$/i.test(value)
    || /^figure\s+\d+$/i.test(value)
    || /^table\s+\d+$/i.test(value)
    || /speaker notes?|presenter notes?|click to add notes?/i.test(value)
    || /^[\d\s.,/-]+$/.test(value)
}

function looksLikeSentenceFragment(value: string) {
  const words = normalizeLookup(value).split(' ').filter(Boolean)
  if (words.length === 0) return true

  const badStarts = new Set([
    'and',
    'because',
    'for',
    'from',
    'how',
    'if',
    'in',
    'into',
    'note',
    'remember',
    'that',
    'the',
    'then',
    'this',
    'those',
    'these',
    'to',
    'when',
    'where',
    'why',
    'with',
  ])
  const verbishWords = new Set([
    'are',
    'be',
    'being',
    'describes',
    'explains',
    'has',
    'have',
    'includes',
    'including',
    'involves',
    'is',
    'means',
    'refers',
    'represents',
    'shows',
    'using',
  ])

  if (badStarts.has(words[0] ?? '')) return true
  if (words.length >= 4 && words.some((word) => verbishWords.has(word))) return true

  return false
}

function buildQuizStyleCycle(termCount: number): ModuleTermQuizStyle[] {
  const cycle: ModuleTermQuizStyle[] = []

  if (termCount >= 4) {
    cycle.push('multiple_choice')
  }

  cycle.push('identification', 'true_false', 'short_answer')

  while (cycle.length < Math.min(termCount, MAX_QUIZ_ITEMS)) {
    cycle.push(cycle.length % 2 === 0 ? 'identification' : 'true_false')
  }

  return cycle
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function labelForCandidateKind(kind: ModuleTermCandidateKind) {
  if (kind === 'acronym') return 'Acronym'
  if (kind === 'concept') return 'Concept'
  return 'Key term'
}

export function labelForTermQuizStyle(style: ModuleTermQuizStyle) {
  if (style === 'multiple_choice') return 'Multiple choice'
  if (style === 'identification') return 'Identification'
  if (style === 'true_false') return 'True / false'
  return 'Short answer'
}
