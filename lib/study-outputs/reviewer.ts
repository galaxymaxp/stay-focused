import { resolveDeepLearnWording } from '@/lib/deep-learn'
import { buildDeepLearnNoteBody } from '@/lib/deep-learn'
import { deepLearnNoteHasUntrustworthyGrounding } from '@/lib/deep-learn-source-validation'
import type {
  DeepLearnAnswerBankItem,
  DeepLearnIdentificationItem,
  DeepLearnNote,
  StudyOutputReviewerContent,
} from '@/lib/types'

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
      message: 'Deep Learn needs a saved ready pack before it can make a reviewer.',
    }
  }

  if (note.status === 'pending') {
    return {
      ok: false,
      reason: 'pending',
      message: 'Deep Learn is still preparing this pack. The reviewer unlocks after the pack is ready.',
    }
  }

  if (note.status === 'failed') {
    return {
      ok: false,
      reason: 'failed',
      message: 'Deep Learn could not build a trustworthy pack from this source, so a reviewer cannot be made yet.',
    }
  }

  if (deepLearnNoteHasUntrustworthyGrounding(note)) {
    return {
      ok: false,
      reason: 'metadata_only',
      message: 'This Deep Learn pack is not grounded in enough readable academic source text for a reviewer.',
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
      message: 'This Deep Learn pack does not yet have enough structured study content for a reviewer.',
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

  const quickReviewBlocks = buildQuickReviewBlocks(note)
  const title = buildReviewerTitle(note.title)
  const highYieldConcepts = note.answerBank
    .slice()
    .sort(compareImportanceDesc)
    .map((item) => ({
      cue: item.cue,
      answer: resolveDeepLearnWording(item.compactAnswer, 'exam_safe'),
      importance: item.importance,
      support: item.supportingContext ?? item.draftExplanation ?? item.reviewText ?? null,
    }))
    .slice(0, 12)

  const identificationReview = note.identificationItems
    .slice()
    .sort(compareImportanceDesc)
    .map((item) => ({
      prompt: item.prompt,
      answer: resolveDeepLearnWording(item.answer, 'exam_safe'),
      importance: item.importance,
      support: item.supportingContext ?? item.draftExplanation ?? item.reviewText ?? null,
    }))
    .slice(0, 14)

  return {
    version: 'reviewer-v1',
    sourceNoteId: note.id,
    sourceResourceId: note.resourceId,
    title,
    summary: buildReviewerSummary(note, highYieldConcepts.length, identificationReview.length),
    intro: note.overview,
    highYieldConcepts,
    identificationReview,
    quickReviewBlocks,
    distinctions: note.distinctions
      .slice(0, 8)
      .map((item) => ({
        conceptA: item.conceptA,
        conceptB: item.conceptB,
        difference: item.difference,
        confusionNote: item.confusionNote,
      })),
    likelyQuizTargets: note.likelyQuizTargets
      .slice()
      .sort((left, right) => compareImportance(right.importance, left.importance))
      .slice(0, 8)
      .map((item) => ({
        target: item.target,
        reason: item.reason,
        importance: item.importance,
      })),
    cautionNotes: note.cautionNotes.slice(0, 6),
  }
}

function buildReviewerTitle(noteTitle: string) {
  const trimmed = noteTitle.trim()
  if (!trimmed) return 'Deep Learn Reviewer'
  if (/\breviewer\b/i.test(trimmed)) return trimmed
  if (/\bexam prep pack\b/i.test(trimmed)) return trimmed.replace(/\bexam prep pack\b/i, 'Reviewer')
  if (/\breview pack\b/i.test(trimmed)) return trimmed.replace(/\breview pack\b/i, 'Reviewer')
  return `${trimmed} Reviewer`
}

function buildReviewerSummary(note: DeepLearnNote, answerCount: number, identificationCount: number) {
  const lead = note.quizReady
    ? 'Printable exam-first reviewer built from the saved Deep Learn pack.'
    : 'Printable reviewer built from the saved Deep Learn pack.'

  return `${lead} ${answerCount} high-yield answer cue${answerCount === 1 ? '' : 's'} and ${identificationCount} identification item${identificationCount === 1 ? '' : 's'} are ready for cram review.`
}

function buildQuickReviewBlocks(note: DeepLearnNote) {
  const sections = note.sections.length > 0
    ? note.sections
    : fallbackSectionsFromNoteBody(note.noteBody || buildDeepLearnNoteBody(note.sections))

  return sections
    .map((section) => ({
      heading: section.heading,
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
    .filter((line) => line.length >= 18)
    .slice(0, 4)
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
