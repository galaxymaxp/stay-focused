import { resolveDeepLearnWording, sanitizeStudentFacingText } from '@/lib/deep-learn'
import { buildDeepLearnNoteBody } from '@/lib/deep-learn'
import { deepLearnNoteHasUntrustworthyGrounding } from '@/lib/deep-learn-source-validation'
import { normalizeSourceFaithfulText, normalizeStudyOutputHeadingIfRaw } from '@/lib/study-outputs/source-faithful'
import type {
  DeepLearnAnswerBankItem,
  DeepLearnIdentificationItem,
  DeepLearnNote,
  StudyOutputReviewerContent,
} from '@/lib/types'

const REVIEWER_MEMORIZATION_ITEM_LIMIT = 16

export interface ReviewerBuildReadiness {
  ok: boolean
  reason: 'missing' | 'pending' | 'failed' | 'metadata_only' | 'empty'
  message: string
}

export function getDeepLearnReviewerReadiness(note: DeepLearnNote | null): ReviewerBuildReadiness {
  if (!note) {
    return {
      ok: false,
      reason: 'missing',
      message: 'Deep Learn needs a saved ready Study Pack before it can generate a Reviewer.',
    }
  }

  if (note.status === 'pending') {
    return {
      ok: false,
      reason: 'pending',
      message: 'Deep Learn is still preparing this Study Pack. The Reviewer unlocks after the pack is ready.',
    }
  }

  if (note.status === 'failed') {
    return {
      ok: false,
      reason: 'failed',
      message: 'Deep Learn could not build a trustworthy Study Pack from this source, so a Reviewer cannot be generated yet.',
    }
  }

  if (deepLearnNoteHasUntrustworthyGrounding(note)) {
    return {
      ok: false,
      reason: 'metadata_only',
      message: 'This Study Pack is not grounded in enough readable academic source text for a Reviewer.',
    }
  }

  const quickReviewBlocks = buildQuickReviewBlocks(note)
  if (
    note.answerBank.length === 0
    && note.identificationItems.length === 0
    && note.distinctions.length === 0
    && note.likelyQuizTargets.length === 0
    && quickReviewBlocks.length === 0
  ) {
    return {
      ok: false,
      reason: 'empty',
      message: 'This Study Pack does not yet have enough structured study content for a Reviewer.',
    }
  }

  return {
    ok: true,
    reason: 'empty',
    message: '',
  }
}

export function buildDeepLearnReviewerContent(note: DeepLearnNote): StudyOutputReviewerContent {
  const readiness = getDeepLearnReviewerReadiness(note)
  if (!readiness.ok) {
    throw new Error(readiness.message)
  }

  const quickReviewBlocks = dedupeQuickReviewBlocks(buildQuickReviewBlocks(note))
  const title = buildReviewerTitle(note.title)
  const usedConcepts = new Set<string>()
  const highYieldConcepts = note.answerBank
    .slice()
    .sort(compareImportanceDesc)
    .map((item) => ({
      cue: normalizeStudyOutputHeadingIfRaw(item.cue),
      answer: exactMemorizeText(item.compactAnswer),
      importance: item.importance,
      support: plainExplanation(item),
      sourceWording: exactMemorizeText(item.answer),
      plainExplanation: plainExplanation(item),
    }))
    .filter((item) => claimReviewerConcept(usedConcepts, item.cue))
    .slice(0, 12)

  const identificationReview = note.identificationItems
    .slice()
    .sort(compareImportanceDesc)
    .map((item) => ({
      prompt: buildIdentificationPrompt(item),
      answer: exactMemorizeText(item.answer),
      importance: item.importance,
      support: plainExplanation(item),
      sourceWording: exactMemorizeText(item.answer),
      plainExplanation: plainExplanation(item),
    }))
    .filter((item) => claimReviewerConcept(usedConcepts, item.prompt))
    .slice(0, Math.max(4, REVIEWER_MEMORIZATION_ITEM_LIMIT - highYieldConcepts.length))

  return {
    version: 'reviewer-v1',
    sourceNoteId: note.id,
    sourceResourceId: note.resourceId,
    title,
    summary: buildReviewerSummary(note, highYieldConcepts.length, identificationReview.length),
    intro: cleanReviewerText(note.overview),
    highYieldConcepts,
    identificationReview,
    quickReviewBlocks,
    distinctions: note.distinctions
      .slice(0, 8)
      .map((item) => ({
        conceptA: normalizeStudyOutputHeadingIfRaw(item.conceptA),
        conceptB: normalizeStudyOutputHeadingIfRaw(item.conceptB),
        difference: normalizeSourceFaithfulText(item.difference),
        confusionNote: item.confusionNote,
      })),
    likelyQuizTargets: note.likelyQuizTargets
      .slice()
      .sort((left, right) => compareImportance(right.importance, left.importance))
      .slice(0, 8)
      .map((item) => ({
        target: normalizeStudyOutputHeadingIfRaw(item.target),
        reason: buildLikelyQuizReason(item.reason),
        importance: item.importance,
      }))
      .filter((item) => claimReviewerConcept(usedConcepts, item.target)),
    cautionNotes: note.cautionNotes.map(cleanReviewerText).filter(Boolean).slice(0, 6),
  }
}

function buildReviewerTitle(noteTitle: string) {
  const trimmed = noteTitle.trim()
  if (!trimmed) return 'Reviewer'
  return trimmed
}

function buildReviewerSummary(note: DeepLearnNote, answerCount: number, identificationCount: number) {
  const lead = hasCompactReviewerCaution(note)
    ? 'Compact Reviewer built from the strongest source-backed Study Pack items.'
    : note.quizReady
      ? 'Exam-first Reviewer built from the saved Study Pack.'
      : 'Reviewer built from the saved Study Pack.'

  return `${lead} ${answerCount} high-yield answer cue${answerCount === 1 ? '' : 's'} and ${identificationCount} identification item${identificationCount === 1 ? '' : 's'} are ready for cram review.`
}

function hasCompactReviewerCaution(note: DeepLearnNote) {
  return note.cautionNotes.some((note) => /compact reviewer|compact study pack|source was long/i.test(note))
}

function buildQuickReviewBlocks(note: DeepLearnNote) {
  const sections = note.sections.length > 0
    ? note.sections
    : fallbackSectionsFromNoteBody(note.noteBody || buildDeepLearnNoteBody(note.sections))

  return sections
    .map((section) => ({
      heading: specializeQuickReviewHeading(section.heading, section.body),
      points: toQuickReviewPoints(section.body),
    }))
    .filter((section) => section.points.length > 0)
    .slice(0, 6)
}

function fallbackSectionsFromNoteBody(noteBody: string) {
  const trimmed = noteBody.trim()
  if (!trimmed) return []

  return trimmed
    .split(/\n{2,}/)
    .map((block, index) => ({
      heading: `Core review ${index + 1}`,
      body: block.trim(),
    }))
    .filter((block) => block.body.length > 0)
}

function toQuickReviewPoints(body: string) {
  return body
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .map(cleanEducationalReviewerPoint)
    .filter((line) => line.length >= 18 && !containsInternalPipelineText(line))
    .slice(0, 4)
}

function exactMemorizeText(wording: Parameters<typeof resolveDeepLearnWording>[0]) {
  return cleanReviewerText(resolveDeepLearnWording(wording, 'exact_source'))
}

function plainExplanation(item: DeepLearnAnswerBankItem | DeepLearnIdentificationItem) {
  const simplified = 'simplifiedWording' in item ? item.simplifiedWording : null
  const explanation = simplified ?? item.supportingContext ?? item.draftExplanation ?? item.reviewText ?? null
  const cleaned = explanation ? cleanReviewerText(explanation) : null
  return cleaned && cleaned !== exactMemorizeText(item.answer) ? cleaned : null
}

function buildIdentificationPrompt(item: DeepLearnIdentificationItem) {
  const prompt = cleanReviewerText(item.prompt)
  if (/^(?:identify|define|explain)\b/i.test(prompt)) return prompt
  const answer = exactMemorizeText(item.answer)
  if (answer && normalizeLookup(prompt) !== normalizeLookup(answer)) return `Identify: ${prompt}`
  return prompt
}

function buildLikelyQuizReason(reason: string) {
  const cleaned = cleanReviewerText(reason)
  if (/^(?:explain|distinguish|apply|compare|why|how|which)\b/i.test(cleaned)) return cleaned
  return `Explain or apply: ${cleaned}`
}

function specializeQuickReviewHeading(heading: string, body: string) {
  const cleaned = normalizeStudyOutputHeadingIfRaw(cleanReviewerText(heading))
  if (/multiple layers|layers of protection|systems, networks, programs, and data/i.test(body)) {
    return 'Layered Cybersecurity Defense'
  }
  if (/cia|confidentiality|integrity|availability/i.test(`${heading} ${body}`)) return 'CIA Triad'
  return cleaned
}

function cleanEducationalReviewerPoint(value: string) {
  const cleaned = cleanReviewerText(value)
  const layered = cleaned.match(/(?:successful\s+)?cybersecurity\s+approach\s+has\s+multiple\s+layers.*?(?:systems,\s*networks,\s*programs,\s*and\s*data|systems.*?networks.*?programs.*?data)/i)
  if (layered) return 'Multiple layers of protection are used across systems, networks, programs, and data.'
  return cleaned
}

function cleanReviewerText(value: string) {
  return normalizeSourceFaithfulText(sanitizeStudentFacingText(value))
}

function containsInternalPipelineText(value: string) {
  return /\b(?:Reconstructed lists|Clean source summary fragments|Normalized headings|Detected concepts|Academic headings|Concept hierarchy|Term definitions|Duplicate OCR\/source fragments collapsed)\b/i.test(value)
}

function dedupeQuickReviewBlocks(blocks: ReturnType<typeof buildQuickReviewBlocks>) {
  const seenHeadings = new Set<string>()
  const seenPoints = new Set<string>()
  const result: ReturnType<typeof buildQuickReviewBlocks> = []
  for (const block of blocks) {
    const headingKey = normalizeLookup(block.heading)
    if (!headingKey || seenHeadings.has(headingKey)) continue
    const points = block.points.filter((point) => {
      const key = normalizeLookup(point)
      if (!key || seenPoints.has(key)) return false
      seenPoints.add(key)
      return true
    })
    if (points.length === 0) continue
    seenHeadings.add(headingKey)
    result.push({ ...block, points })
  }
  return result
}

function claimReviewerConcept(seen: Set<string>, value: string) {
  const key = normalizeLookup(value)
  if (!key || key.length < 4) return true
  if (seen.has(key)) return false
  seen.add(key)
  return true
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function compareImportanceDesc(left: DeepLearnAnswerBankItem | DeepLearnIdentificationItem, right: DeepLearnAnswerBankItem | DeepLearnIdentificationItem) {
  return compareImportance(right.importance, left.importance)
}

function compareImportance(left: 'high' | 'medium' | 'low', right: 'high' | 'medium' | 'low') {
  return getImportanceRank(left) - getImportanceRank(right)
}

function getImportanceRank(value: 'high' | 'medium' | 'low') {
  if (value === 'high') return 0
  if (value === 'medium') return 1
  return 2
}
