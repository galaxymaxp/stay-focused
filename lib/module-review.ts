import type { ModuleLearnOverviewModel, ModuleStudyMaterial } from '@/lib/module-learn-overview'

export type ModuleReviewAvailability = 'ready' | 'limited' | 'unavailable'
export type ModuleReviewConceptKind = 'term' | 'concept' | 'acronym'
export type ModuleReviewQuizStyle = 'multiple_choice' | 'identification' | 'true_false' | 'short_answer'

export interface ModuleReviewSourceMaterial {
  id: string
  title: string
  fileTypeLabel: string
  charCount: number
  required: boolean
}

export interface ModuleReviewConceptCard {
  id: string
  term: string
  kind: ModuleReviewConceptKind
  simpleExplanation: string
  formalDefinition: string | null
  whyItMatters: string
  quickExample: string | null
  quizFocus: string
  evidence: string
  sourceLabels: string[]
  sourceCount: number
}

export interface ModuleReviewQuizItem {
  id: string
  style: ModuleReviewQuizStyle
  prompt: string
  choices: string[]
  answer: string
  explanation: string
  sourceLabel: string
}

export interface ModuleReviewModel {
  availability: ModuleReviewAvailability
  availabilityLabel: string
  availabilityMessage: string
  coverageNote: string
  groundedCharCount: number
  sourceMaterials: ModuleReviewSourceMaterial[]
  keyTerms: string[]
  conceptCards: ModuleReviewConceptCard[]
  focusPoints: string[]
  quizItems: ModuleReviewQuizItem[]
  selectionNote: string
  quizGroundingNote: string
}

interface ReviewCandidate {
  key: string
  term: string
  kind: ModuleReviewConceptKind
  score: number
  requiredCount: number
  sourceLabels: Set<string>
  resourceIds: Set<string>
  linkedContexts: Set<string>
  definitionSentences: string[]
  evidenceSentences: string[]
  exampleSentences: string[]
}

const MIN_REVIEW_CHAR_COUNT = 750
const MIN_CONCEPT_CARD_COUNT = 4
const MAX_CONCEPT_CARD_COUNT = 8

const BLACKLISTED_TERM_KEYS = new Set([
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
  'file',
  'files',
  'introduction',
  'lesson',
  'materials',
  'module',
  'objective',
  'page',
  'pages',
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
  'student',
  'students',
  'study',
  'summary',
  'term',
  'terms',
  'this',
  'this module',
  'topic',
  'week',
  'worksheet',
])

export function buildModuleReviewModel({
  moduleTitle,
  overview,
}: {
  moduleTitle: string
  overview: ModuleLearnOverviewModel
}): ModuleReviewModel {
  const readyMaterials = overview.studyMaterials.filter((material) => material.readiness === 'ready')
  const sourceMaterials = readyMaterials
    .map((material) => ({
      id: material.resource.id,
      title: material.resource.title,
      fileTypeLabel: material.fileTypeLabel,
      charCount: getMaterialCharCount(material),
      required: material.resource.required,
    }))
    .sort((left, right) => right.charCount - left.charCount || Number(right.required) - Number(left.required) || left.title.localeCompare(right.title))
  const groundedCharCount = sourceMaterials.reduce((total, material) => total + material.charCount, 0)
  const conceptCards = buildConceptCards(readyMaterials).slice(0, MAX_CONCEPT_CARD_COUNT)
  const keyTerms = conceptCards.map((card) => card.term)
  const focusPoints = buildFocusPoints(conceptCards)
  const quizItems = buildQuizItems(conceptCards)
  const hasMixedQuizStyles = hasAllQuizStyles(quizItems)
  const selectionNote = 'Terms and concepts only come from active study-lane materials already marked Ready to study. Candidates are promoted when the extracted text explicitly defines them, expands an acronym, or repeats them across grounded sources.'
  const quizGroundingNote = 'Practice questions only reuse grounded reviewer cards built from extracted study text. Multiple-choice distractors come from other grounded terms in the same module instead of made-up outside facts.'

  if (readyMaterials.length === 0) {
    return {
      availability: overview.totalStudyFileCount === 0 ? 'unavailable' : 'limited',
      availabilityLabel: overview.totalStudyFileCount === 0 ? 'Review unavailable' : 'Review is limited',
      availabilityMessage: overview.totalStudyFileCount === 0
        ? `No study materials are mapped into ${moduleTitle} yet, so the Review tab stays empty instead of inventing a reviewer.`
        : 'The active study lane does not have any study material strong enough yet to ground reviewer terms or quiz practice.',
      coverageNote: buildCoverageNote(overview, groundedCharCount, 0),
      groundedCharCount,
      sourceMaterials,
      keyTerms: [],
      conceptCards: [],
      focusPoints: [],
      quizItems: [],
      selectionNote,
      quizGroundingNote,
    }
  }

  const strongEnough = groundedCharCount >= MIN_REVIEW_CHAR_COUNT
    && conceptCards.length >= MIN_CONCEPT_CARD_COUNT
    && hasMixedQuizStyles

  if (!strongEnough) {
    return {
      availability: 'limited',
      availabilityLabel: 'Review is limited',
      availabilityMessage: buildLimitedAvailabilityMessage({
        groundedCharCount,
        conceptCardCount: conceptCards.length,
        hasMixedQuizStyles,
        readyMaterialCount: readyMaterials.length,
      }),
      coverageNote: buildCoverageNote(overview, groundedCharCount, conceptCards.length),
      groundedCharCount,
      sourceMaterials,
      keyTerms: [],
      conceptCards: [],
      focusPoints: [],
      quizItems: [],
      selectionNote,
      quizGroundingNote,
    }
  }

  return {
    availability: 'ready',
    availabilityLabel: 'Grounded review ready',
    availabilityMessage: `Review mode is grounded in ${readyMaterials.length} study material${readyMaterials.length === 1 ? '' : 's'} with ${groundedCharCount.toLocaleString()} readable extracted characters.`,
    coverageNote: buildCoverageNote(overview, groundedCharCount, conceptCards.length),
    groundedCharCount,
    sourceMaterials,
    keyTerms,
    conceptCards,
    focusPoints,
    quizItems,
    selectionNote,
    quizGroundingNote,
  }
}

function buildConceptCards(materials: ModuleStudyMaterial[]) {
  const candidates = new Map<string, ReviewCandidate>()

  for (const material of materials) {
    const text = normalizeReviewText(material.resource.extractedText ?? material.resource.extractedTextPreview ?? '')
    if (!text) continue

    const sentences = splitSentences(text)
    const blocks = splitBlocks(text)

    collectHeadingCandidates(blocks, material, candidates)
    collectDefinitionCandidates(sentences, material, candidates)
    collectAcronymCandidates(sentences, material, candidates)
    collectSubjectCandidates(sentences, material, candidates)
    collectExampleSentences(sentences, material, candidates)
  }

  return Array.from(candidates.values())
    .map(buildConceptCard)
    .filter((card): card is ModuleReviewConceptCard => Boolean(card))
    .sort((left, right) => right.sourceCount - left.sourceCount || left.term.localeCompare(right.term))
}

function collectHeadingCandidates(blocks: string[], material: ModuleStudyMaterial, candidates: Map<string, ReviewCandidate>) {
  for (let index = 0; index < blocks.length - 1; index += 1) {
    const heading = parseHeadingCandidate(blocks[index])
    if (!heading) continue

    const explanation = splitSentences(blocks[index + 1]).find((sentence) => sentence.length >= 36)
    if (!explanation) continue

    addCandidate(candidates, {
      term: heading,
      kind: classifyConceptKind(heading, false),
      score: 4,
      definitionSentence: trimAtBoundary(explanation, 220),
      evidenceSentence: trimAtBoundary(explanation, 220),
    }, material)
  }
}

function collectDefinitionCandidates(sentences: string[], material: ModuleStudyMaterial, candidates: Map<string, ReviewCandidate>) {
  const definitionPatterns = [
    /^([A-Za-z][A-Za-z0-9/-]*(?: [A-Za-z][A-Za-z0-9/-]*){0,5})\s+(?:is|are|refers to|means|describes|involves|represents|stands for)\s+(.+)$/i,
    /^([A-Za-z][A-Za-z0-9/-]*(?: [A-Za-z][A-Za-z0-9/-]*){0,5})\s*[:\-]\s+(.+)$/i,
  ]

  sentences.forEach((sentence, index) => {
    for (const pattern of definitionPatterns) {
      const match = sentence.match(pattern)
      if (!match) continue

      const term = sanitizeCandidateTerm(match[1])
      const definitionClause = cleanupDefinitionClause(match[2])
      if (!term || !definitionClause) continue

      const definitionSentence = normalizeDefinitionSentence(term, sentence, definitionClause)
      const quickExample = sentences
        .slice(index + 1)
        .find((candidate) => mentionsTerm(candidate, term) && normalizeLookup(candidate) !== normalizeLookup(definitionSentence) && candidate.length >= 30)

      addCandidate(candidates, {
        term,
        kind: classifyConceptKind(term, false),
        score: 6,
        definitionSentence,
        evidenceSentence: definitionSentence,
        exampleSentence: quickExample ? trimAtBoundary(quickExample, 180) : null,
      }, material)
      break
    }
  })
}

function collectAcronymCandidates(sentences: string[], material: ModuleStudyMaterial, candidates: Map<string, ReviewCandidate>) {
  const forwardPattern = /\b([A-Za-z][A-Za-z0-9/-]*(?: [A-Za-z][A-Za-z0-9/-]*){1,6})\s+\(([A-Z]{2,10})\)\b/g
  const reversePattern = /\b([A-Z]{2,10})\s+\(([A-Za-z][A-Za-z0-9/-]*(?: [A-Za-z][A-Za-z0-9/-]*){1,6})\)\b/g

  for (const sentence of sentences) {
    for (const match of sentence.matchAll(forwardPattern)) {
      const fullTerm = sanitizeCandidateTerm(match[1])
      const acronym = sanitizeCandidateTerm(match[2], true)
      if (!fullTerm || !acronym) continue

      addCandidate(candidates, {
        term: acronym,
        kind: 'acronym',
        score: 7,
        definitionSentence: `${acronym} stands for ${fullTerm}.`,
        evidenceSentence: trimAtBoundary(sentence, 220),
      }, material)
    }

    for (const match of sentence.matchAll(reversePattern)) {
      const acronym = sanitizeCandidateTerm(match[1], true)
      const fullTerm = sanitizeCandidateTerm(match[2])
      if (!fullTerm || !acronym) continue

      addCandidate(candidates, {
        term: acronym,
        kind: 'acronym',
        score: 7,
        definitionSentence: `${acronym} stands for ${fullTerm}.`,
        evidenceSentence: trimAtBoundary(sentence, 220),
      }, material)
    }
  }
}

function collectSubjectCandidates(sentences: string[], material: ModuleStudyMaterial, candidates: Map<string, ReviewCandidate>) {
  const subjectPattern = /^([A-Za-z][A-Za-z0-9/-]*(?: [A-Za-z][A-Za-z0-9/-]*){0,5})\s+(?:can|may|should|helps|allows|explains|shows|covers|includes|requires|uses|has|have)\b/i

  for (const sentence of sentences) {
    const match = sentence.match(subjectPattern)
    if (!match) continue

    const term = sanitizeCandidateTerm(match[1])
    if (!term) continue

    addCandidate(candidates, {
      term,
      kind: classifyConceptKind(term, false),
      score: 3,
      evidenceSentence: trimAtBoundary(sentence, 220),
    }, material)
  }
}

function collectExampleSentences(sentences: string[], material: ModuleStudyMaterial, candidates: Map<string, ReviewCandidate>) {
  const materialCandidates = Array.from(candidates.values()).filter((candidate) => candidate.resourceIds.has(material.resource.id))
  if (materialCandidates.length === 0) return

  for (const sentence of sentences) {
    if (!/for example|for instance|such as|e\.g\./i.test(sentence)) continue

    for (const candidate of materialCandidates) {
      if (!mentionsTerm(sentence, candidate.term)) continue
      pushUnique(candidate.exampleSentences, trimAtBoundary(sentence, 180))
    }
  }
}

function addCandidate(
  candidates: Map<string, ReviewCandidate>,
  input: {
    term: string
    kind: ModuleReviewConceptKind
    score: number
    definitionSentence?: string | null
    evidenceSentence?: string | null
    exampleSentence?: string | null
  },
  material: ModuleStudyMaterial,
) {
  const term = sanitizeCandidateTerm(input.term, input.kind === 'acronym')
  if (!term) return

  const key = normalizeLookup(term)
  if (!key || BLACKLISTED_TERM_KEYS.has(key)) return

  const existing = candidates.get(key) ?? {
    key,
    term,
    kind: input.kind,
    score: 0,
    requiredCount: 0,
    sourceLabels: new Set<string>(),
    resourceIds: new Set<string>(),
    linkedContexts: new Set<string>(),
    definitionSentences: [],
    evidenceSentences: [],
    exampleSentences: [],
  }

  existing.term = chooseDisplayTerm(existing.term, term)
  existing.kind = prioritizeKind(existing.kind, input.kind)
  existing.score += input.score
  existing.sourceLabels.add(material.resource.title)
  existing.resourceIds.add(material.resource.id)
  if (material.resource.required) existing.requiredCount += 1
  if (material.resource.linkedContext) existing.linkedContexts.add(material.resource.linkedContext)
  if (input.definitionSentence) pushUnique(existing.definitionSentences, trimAtBoundary(input.definitionSentence, 220))
  if (input.evidenceSentence) pushUnique(existing.evidenceSentences, trimAtBoundary(input.evidenceSentence, 220))
  if (input.exampleSentence) pushUnique(existing.exampleSentences, trimAtBoundary(input.exampleSentence, 180))

  candidates.set(key, existing)
}

function buildConceptCard(candidate: ReviewCandidate): ModuleReviewConceptCard | null {
  const sourceCount = candidate.sourceLabels.size
  const formalDefinition = candidate.definitionSentences[0] ?? null
  const simpleExplanation = buildSimpleExplanation(candidate)

  if (!simpleExplanation) return null
  if (candidate.score < 5 && !formalDefinition) return null

  const evidence = candidate.evidenceSentences[0] ?? formalDefinition ?? simpleExplanation
  const quickExample = candidate.exampleSentences[0] ?? null

  return {
    id: `${candidate.key}-review-card`,
    term: candidate.term,
    kind: candidate.kind,
    simpleExplanation,
    formalDefinition,
    whyItMatters: buildWhyItMatters(candidate, sourceCount),
    quickExample,
    quizFocus: buildQuizFocus(candidate, sourceCount, Boolean(quickExample)),
    evidence,
    sourceLabels: Array.from(candidate.sourceLabels),
    sourceCount,
  }
}

function buildSimpleExplanation(candidate: ReviewCandidate) {
  const definition = candidate.definitionSentences[0]
  if (definition) {
    const extracted = extractDefinitionBody(candidate.term, definition)
    return trimAtBoundary(extracted ?? definition, 160)
  }

  const evidence = candidate.evidenceSentences[0]
  if (!evidence || evidence.length < 24) return null
  return trimAtBoundary(evidence, 160)
}

function buildWhyItMatters(candidate: ReviewCandidate, sourceCount: number) {
  const linkedContext = Array.from(candidate.linkedContexts)[0] ?? null

  if (sourceCount > 1) {
    return `It shows up across ${sourceCount} grounded study materials in this module, which makes it a strong quiz and review target.`
  }

  if (candidate.requiredCount > 0) {
    return 'It comes from a required study material in this module, so it is worth knowing without reopening the source.'
  }

  if (linkedContext) {
    return `It sits next to ${linkedContext}, so later work in this module likely assumes you already understand it.`
  }

  return `It is one of the clearer idea-carrying points surfaced from ${Array.from(candidate.sourceLabels)[0]}.`
}

function buildQuizFocus(candidate: ReviewCandidate, sourceCount: number, hasExample: boolean) {
  if (candidate.kind === 'acronym') {
    return `Be ready to expand ${candidate.term} correctly and connect it back to the lesson context.`
  }

  if (sourceCount > 1) {
    return `Be ready to define ${candidate.term} and explain how it connects across the module materials.`
  }

  if (hasExample) {
    return `Be ready to define ${candidate.term} and use the grounded example to explain it quickly.`
  }

  return `Be ready to define ${candidate.term} and identify it from a short description.`
}

function buildFocusPoints(conceptCards: ModuleReviewConceptCard[]) {
  return uniqueLines(conceptCards.map((card) => card.quizFocus)).slice(0, 6)
}

function buildQuizItems(conceptCards: ModuleReviewConceptCard[]) {
  if (conceptCards.length < MIN_CONCEPT_CARD_COUNT) {
    return []
  }

  const questions: ModuleReviewQuizItem[] = []
  const usedTermKeys = new Set<string>()
  const topCards = conceptCards.slice(0, 6)

  const multipleChoiceCard = topCards.find((card) => Boolean(card.simpleExplanation))
  if (multipleChoiceCard) {
    const distractorCards = topCards.filter((card) => card.id !== multipleChoiceCard.id).slice(0, 3)
    if (distractorCards.length === 3) {
      const choices = sortChoices([multipleChoiceCard.term, ...distractorCards.map((card) => card.term)])
      questions.push({
        id: `${multipleChoiceCard.id}-mc-term`,
        style: 'multiple_choice',
        prompt: `Which term best matches this grounded review clue: "${trimAtBoundary(multipleChoiceCard.simpleExplanation, 120)}"?`,
        choices,
        answer: multipleChoiceCard.term,
        explanation: `${multipleChoiceCard.term} is the grounded match for this clue in ${multipleChoiceCard.sourceLabels[0]}.`,
        sourceLabel: multipleChoiceCard.sourceLabels[0],
      })
      usedTermKeys.add(normalizeLookup(multipleChoiceCard.term))
    }
  }

  const identificationCard = topCards.find((card) => !usedTermKeys.has(normalizeLookup(card.term)) && Boolean(card.simpleExplanation))
  if (identificationCard) {
    questions.push({
      id: `${identificationCard.id}-identify`,
      style: 'identification',
      prompt: `Identify the term or concept described here: "${trimAtBoundary(identificationCard.simpleExplanation, 140)}"`,
      choices: [],
      answer: identificationCard.term,
      explanation: `${identificationCard.term} is the concept tied to this description in ${identificationCard.sourceLabels[0]}.`,
      sourceLabel: identificationCard.sourceLabels[0],
    })
    usedTermKeys.add(normalizeLookup(identificationCard.term))
  }

  const trueFalseCard = topCards.find((card) => !usedTermKeys.has(normalizeLookup(card.term)) && Boolean(card.formalDefinition ?? card.simpleExplanation))
  if (trueFalseCard) {
    const statement = trimAtBoundary(trueFalseCard.formalDefinition ?? trueFalseCard.simpleExplanation, 160)
    questions.push({
      id: `${trueFalseCard.id}-true-false`,
      style: 'true_false',
      prompt: `True or false: In the extracted study material, ${statement}`,
      choices: ['True', 'False'],
      answer: 'True',
      explanation: `This statement is grounded directly in ${trueFalseCard.sourceLabels[0]}.`,
      sourceLabel: trueFalseCard.sourceLabels[0],
    })
    usedTermKeys.add(normalizeLookup(trueFalseCard.term))
  }

  const shortAnswerCard = topCards.find((card) => !usedTermKeys.has(normalizeLookup(card.term)))
  if (shortAnswerCard) {
    questions.push({
      id: `${shortAnswerCard.id}-short-answer`,
      style: 'short_answer',
      prompt: `In one or two sentences, explain why ${shortAnswerCard.term} matters in this module.`,
      choices: [],
      answer: shortAnswerCard.whyItMatters,
      explanation: `This answer is grounded in the review evidence surfaced from ${shortAnswerCard.sourceLabels[0]}.`,
      sourceLabel: shortAnswerCard.sourceLabels[0],
    })
  }

  return questions
}

function buildCoverageNote(overview: ModuleLearnOverviewModel, groundedCharCount: number, conceptCardCount: number) {
  const parts = [
    overview.readyStudyFileCount > 0
      ? `${overview.readyStudyFileCount} study material${overview.readyStudyFileCount === 1 ? '' : 's'} currently qualify for grounded review work.`
      : 'No study materials currently qualify for grounded review work.',
    groundedCharCount > 0
      ? `${groundedCharCount.toLocaleString()} readable extracted characters are feeding the reviewer.`
      : null,
    conceptCardCount > 0
      ? `${conceptCardCount} review term${conceptCardCount === 1 ? '' : 's'} were stable enough to keep.`
      : null,
    overview.limitedStudyFileCount > 0
      ? `${overview.limitedStudyFileCount} study material${overview.limitedStudyFileCount === 1 ? '' : 's'} stay visible in Learn but are too thin for this reviewer layer.`
      : null,
    overview.unavailableStudyFileCount > 0
      ? `${overview.unavailableStudyFileCount} study material${overview.unavailableStudyFileCount === 1 ? ' still needs' : 's still need'} Canvas for the full read.`
      : null,
  ].filter(Boolean)

  return parts.join(' ')
}

function buildLimitedAvailabilityMessage({
  groundedCharCount,
  conceptCardCount,
  hasMixedQuizStyles,
  readyMaterialCount,
}: {
  groundedCharCount: number
  conceptCardCount: number
  hasMixedQuizStyles: boolean
  readyMaterialCount: number
}) {
  if (groundedCharCount < MIN_REVIEW_CHAR_COUNT) {
    return `There is some grounded study text from ${readyMaterialCount} source${readyMaterialCount === 1 ? '' : 's'}, but it is still too thin to support a trustworthy reviewer and quiz set.`
  }

  if (conceptCardCount < MIN_CONCEPT_CARD_COUNT) {
    return 'Readable extracted text is available, but it did not surface enough stable terms and concepts yet to build a proper reviewer.'
  }

  if (!hasMixedQuizStyles) {
    return 'Readable extracted text is available, but there still is not enough distinct grounded material to generate a mixed quiz set honestly.'
  }

  return 'Review is waiting on stronger grounded coverage before it unlocks the full reviewer surface.'
}

function hasAllQuizStyles(items: ModuleReviewQuizItem[]) {
  return ['multiple_choice', 'identification', 'true_false', 'short_answer']
    .every((style) => items.some((item) => item.style === style))
}

function getMaterialCharCount(material: ModuleStudyMaterial) {
  return typeof material.resource.extractedCharCount === 'number'
    ? material.resource.extractedCharCount
    : (material.resource.extractedText ?? material.resource.extractedTextPreview ?? '').length
}

function normalizeReviewText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, ' ')
    .replace(/\n?--\s*\d+\s+of\s+\d+\s*--\n?/gi, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function splitBlocks(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => compactWhitespace(block))
    .filter((block) => block.length >= 4)
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
  if (!allowAcronym && wordCount > 6) return null
  if (cleaned.length < 2 || cleaned.length > 64) return null
  if (!allowAcronym && /^[a-z]+$/.test(cleaned) && cleaned.length <= 2) return null

  const key = normalizeLookup(cleaned)
  if (!key || BLACKLISTED_TERM_KEYS.has(key)) return null
  if (/^(it|they|them|this|that|these|those|there)$/i.test(cleaned)) return null

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

function parseHeadingCandidate(block: string) {
  const heading = compactWhitespace(block.replace(/[:\-]+$/, ''))
  if (heading.length < 4 || heading.length > 60) return null
  if (/[.!?]/.test(heading)) return null

  const words = heading.split(' ')
  if (words.length > 6) return null
  if (words.every((word) => word === word.toLowerCase())) return null

  return sanitizeCandidateTerm(heading)
}

function classifyConceptKind(term: string, isAcronym: boolean): ModuleReviewConceptKind {
  if (isAcronym || /^[A-Z]{2,10}$/.test(term)) return 'acronym'
  return term.split(' ').length >= 4 ? 'concept' : 'term'
}

function chooseDisplayTerm(left: string, right: string) {
  if (/^[A-Z]{2,10}$/.test(right) && !/^[A-Z]{2,10}$/.test(left)) return right
  if (right.length < left.length) return right
  return left
}

function prioritizeKind(current: ModuleReviewConceptKind, next: ModuleReviewConceptKind): ModuleReviewConceptKind {
  if (current === 'acronym' || next === 'acronym') return 'acronym'
  if (current === 'concept' || next === 'concept') return 'concept'
  return 'term'
}

function extractDefinitionBody(term: string, sentence: string) {
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

function mentionsTerm(sentence: string, term: string) {
  const normalizedSentence = normalizeLookup(sentence)
  const normalizedTerm = normalizeLookup(term)
  return normalizedSentence.includes(normalizedTerm)
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

function uniqueLines(lines: string[]) {
  const seen = new Set<string>()
  const results: string[] = []

  for (const line of lines) {
    const cleaned = compactWhitespace(line)
    if (!cleaned) continue
    const key = normalizeLookup(cleaned)
    if (!key || seen.has(key)) continue
    seen.add(key)
    results.push(cleaned)
  }

  return results
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
    || /^[\d\s.,/-]+$/.test(value)
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function labelForReviewConceptKind(kind: ModuleReviewConceptKind) {
  if (kind === 'acronym') return 'Acronym'
  if (kind === 'concept') return 'Concept'
  return 'Key term'
}

export function labelForQuizStyle(style: ModuleReviewQuizStyle) {
  if (style === 'multiple_choice') return 'Multiple choice'
  if (style === 'identification') return 'Identification'
  if (style === 'true_false') return 'True / false'
  return 'Short answer'
}
