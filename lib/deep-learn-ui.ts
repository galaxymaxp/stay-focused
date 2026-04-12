import type { DeepLearnNote } from '@/lib/types'
import { buildDeepLearnNoteHref, buildModuleQuizHref } from '@/lib/stay-focused-links'

export type DeepLearnUiStatus = 'not_started' | 'pending' | 'ready' | 'failed'

export interface DeepLearnResourceUiState {
  status: DeepLearnUiStatus
  statusLabel: 'No note yet' | 'Generating' | 'Ready' | 'Failed'
  tone: 'accent' | 'warning' | 'muted'
  noteHref: string
  quizHref: string
  primaryLabel: 'Deep Learn this' | 'Open Deep Learn note' | 'Retry Deep Learn'
  summary: string
  detail: string
  quizReady: boolean
}

export function getDeepLearnResourceUiState(
  moduleId: string,
  resourceId: string,
  note: DeepLearnNote | null,
): DeepLearnResourceUiState {
  const noteHref = buildDeepLearnNoteHref(moduleId, resourceId)
  const quizHref = buildModuleQuizHref(moduleId, { resourceId })

  if (!note) {
    return {
      status: 'not_started',
      statusLabel: 'No note yet',
      tone: 'muted',
      noteHref,
      quizHref,
      primaryLabel: 'Deep Learn this',
      summary: 'Turn this resource into a saved study note that keeps exact terms, explains them clearly, and stays quiz-ready.',
      detail: 'Deep Learn becomes the main study pass here. The reader stays available as a fallback source view when you need it.',
      quizReady: false,
    }
  }

  if (note.status === 'pending') {
    return {
      status: 'pending',
      statusLabel: 'Generating',
      tone: 'warning',
      noteHref,
      quizHref,
      primaryLabel: 'Open Deep Learn note',
      summary: note.overview || 'Deep Learn is building the saved study note.',
      detail: 'Generation is in progress. Open the note to refresh status, or keep the reader/source nearby while it finishes.',
      quizReady: false,
    }
  }

  if (note.status === 'failed') {
    return {
      status: 'failed',
      statusLabel: 'Failed',
      tone: 'warning',
      noteHref,
      quizHref,
      primaryLabel: 'Retry Deep Learn',
      summary: note.errorMessage || 'Deep Learn could not produce a trustworthy note from the current source evidence.',
      detail: 'Retry after checking the source, or use the reader/source fallback while the note is unavailable.',
      quizReady: false,
    }
  }

  return {
    status: 'ready',
    statusLabel: 'Ready',
    tone: 'accent',
    noteHref,
    quizHref,
    primaryLabel: 'Open Deep Learn note',
    summary: note.overview,
    detail: note.quizReady
      ? 'This saved note is ready for review and already structured for quiz generation.'
      : 'This saved note is ready for review. Quiz generation will stay limited until the note has enough reliable study structure.',
    quizReady: note.quizReady,
  }
}
