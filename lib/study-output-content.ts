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

export interface TaskOutputReadinessDisplayInfo {
  label: string
  isReady: boolean
  note: string
}

export function resolveTaskOutputReadinessDisplay(
  content: StudyOutputTaskOutputContent | null | undefined,
): TaskOutputReadinessDisplayInfo | null {
  if (!content || content.version !== 'task-output-v1') return null
  const status = content.readinessStatus
  // No banner for ready outputs or legacy records without readinessStatus
  if (!status || status === 'ready') return null

  if (status === 'needs_research') {
    return {
      label: 'Needs research',
      isReady: false,
      note: 'This output needs external research or course-provided source material before it is ready to submit.',
    }
  }

  if (status === 'needs_course_source_content') {
    const sourceLimited = content.sourceMode === 'source_limited_scaffold'
    return {
      label: 'Source-limited draft',
      isReady: false,
      note: sourceLimited
        ? 'Not enough readable course source text was available. Add course-specific content before submitting.'
        : 'This output needs more course source content. Add the relevant reading or source material before submitting.',
    }
  }

  if (status === 'draft_outline_only') {
    return {
      label: 'Draft outline',
      isReady: false,
      note: 'This output is an outline draft. Replace placeholders and add real content before submitting.',
    }
  }

  if (status === 'insufficient_content') {
    return {
      label: 'Could not generate enough content',
      isReady: false,
      note: 'The generated content did not have enough substance. Try regenerating with more course source context.',
    }
  }

  return {
    label: 'Needs review',
    isReady: false,
    note: 'Review and complete this output before submitting.',
  }
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
