import type {
  StudyOutput,
  StudyOutputKind,
  StudyOutputQuizPackContent,
  StudyOutputReviewerContent,
  StudyOutputSheetContent,
  StudyOutputTaskOutputContent,
} from '@/lib/types'

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasVersion(value: unknown, version: string) {
  return isPlainRecord(value) && value.version === version
}

export function isStudyOutputKind(value: unknown): value is StudyOutputKind {
  return value === 'reviewer'
    || value === 'quiz_pack'
    || value === 'task_output'
    || value === 'study_sheet'
    || value === 'cram_sheet'
}

export function getStudyOutputKindLabel(value: unknown) {
  if (value === 'reviewer') return 'Reviewer'
  if (value === 'quiz_pack') return 'Quiz'
  if (value === 'task_output') return 'Activity'
  if (value === 'study_sheet') return 'Reviewer'
  if (value === 'cram_sheet') return 'Reviewer'
  return 'Unsupported output'
}

export function getStudyOutputVariantLabel(value: unknown) {
  if (value === 'study_sheet') return 'Full Review'
  if (value === 'cram_sheet') return 'Cram'
  if (value === 'reviewer') return 'Full Review'
  if (value === 'quiz_pack') return 'Mixed'
  return null
}

export function isReviewerStudyOutputContent(value: unknown): value is StudyOutputReviewerContent {
  return hasVersion(value, 'reviewer-v1')
}

export function isQuizPackStudyOutputContent(value: unknown): value is StudyOutputQuizPackContent {
  return hasVersion(value, 'quiz-pack-v1')
}

export function isSheetStudyOutputContent(value: unknown): value is StudyOutputSheetContent {
  return hasVersion(value, 'study-sheet-v1')
}

export function isTaskOutputStudyOutputContent(value: unknown): value is StudyOutputTaskOutputContent {
  return hasVersion(value, 'task-output-v1')
}

export function isRenderableStudyOutput(output: Pick<StudyOutput, 'outputKind' | 'content'>) {
  if (output.outputKind === 'reviewer') return isReviewerStudyOutputContent(output.content)
  if (output.outputKind === 'quiz_pack') return isQuizPackStudyOutputContent(output.content)
  if (output.outputKind === 'task_output') return isTaskOutputStudyOutputContent(output.content)
  if (output.outputKind === 'study_sheet' || output.outputKind === 'cram_sheet') {
    return isSheetStudyOutputContent(output.content)
  }
  return false
}

export function getUnsupportedStudyOutputMessage(output: Pick<StudyOutput, 'outputKind' | 'content'>) {
  const label = getStudyOutputKindLabel(output.outputKind).toLowerCase()

  if (!isStudyOutputKind(output.outputKind)) {
    return 'This saved output uses a subtype this app build does not recognize yet.'
  }

  if (!isPlainRecord(output.content)) {
    return `This saved ${label} does not have a readable content payload right now.`
  }

  const version = typeof output.content.version === 'string' ? output.content.version : null
  if (!version) {
    return `This saved ${label} is missing its version marker, so Stay Focused cannot render it safely.`
  }

  return `This saved ${label} uses an unsupported content version (${version}).`
}
