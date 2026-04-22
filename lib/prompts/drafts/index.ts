import type { DraftType } from '@/lib/types'
import { examReviewerSystemPrompt } from './exam_reviewer'
import { studyNotesSystemPrompt } from './study_notes'
import { summarySystemPrompt } from './summary'
import { flashcardSetSystemPrompt } from './flashcard_set'

export function getDraftPrompt(draftType: DraftType): { systemPrompt: string } {
  switch (draftType) {
    case 'exam_reviewer':
      return { systemPrompt: examReviewerSystemPrompt }
    case 'study_notes':
      return { systemPrompt: studyNotesSystemPrompt }
    case 'summary':
      return { systemPrompt: summarySystemPrompt }
    case 'flashcard_set':
      return { systemPrompt: flashcardSetSystemPrompt }
  }
}

export const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  exam_reviewer: 'Exam Reviewer',
  study_notes: 'Study Notes',
  summary: 'Summary',
  flashcard_set: 'Flashcard Set',
}

export const DRAFT_TYPE_DESCRIPTIONS: Record<DraftType, string> = {
  exam_reviewer: 'Full topic coverage, definitions, formulas, 5 question sections, answer key, exam tips, and quick reference card.',
  study_notes: 'Structured outline, key concepts, definitions, examples, and cross-topic connections.',
  summary: 'Concise overview, key points by section, important terms, and key takeaways.',
  flashcard_set: '20+ term/definition, formula, and application cards in a study-ready format.',
}
