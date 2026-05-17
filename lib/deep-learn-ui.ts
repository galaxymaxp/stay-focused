import type { DeepLearnNote, DeepLearnNoteLoadAvailability } from '@/lib/types'
import type { DeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { buildDeepLearnNoteHref, buildModuleQuizHref } from '@/lib/stay-focused-links'
import { deepLearnNoteHasUntrustworthyGrounding } from '@/lib/deep-learn-source-validation'
import { BAD_OCR_BLOCKED_MESSAGE } from '@/lib/extracted-text-quality'

export type DeepLearnUiStatus = 'not_started' | 'pending' | 'ready' | 'failed' | 'blocked' | 'unavailable'

export interface DeepLearnResourceUiState {
  status: DeepLearnUiStatus
  statusLabel: 'Pack' | 'Review' | 'Review Ready' | 'Needs action' | 'Unavailable'
  tone: 'accent' | 'warning' | 'muted'
  noteHref: string
  quizHref: string
  primaryLabel: 'Generate Reviewer' | 'Open Reviewer' | 'Open Source'
  summary: string
  detail: string
  quizReady: boolean
}

export function getDeepLearnResourceUiState(
  moduleId: string,
  resourceId: string,
  note: DeepLearnNote | null,
  options: {
    notesAvailability?: DeepLearnNoteLoadAvailability
    unavailableMessage?: string | null
    readiness?: DeepLearnResourceReadiness | null
  } = {},
): DeepLearnResourceUiState {
  const noteHref = buildDeepLearnNoteHref(moduleId, resourceId)
  const quizHref = buildModuleQuizHref(moduleId, { resourceId })
  const readiness = options.readiness ?? null

  if (!note && options.notesAvailability === 'unavailable') {
    return {
      status: 'unavailable',
      statusLabel: 'Unavailable',
      tone: 'warning',
      noteHref,
      quizHref,
      primaryLabel: 'Open Source',
      summary: options.unavailableMessage || 'Saved Deep Learn Study Packs are unavailable right now.',
      detail: 'Learn is still rendering the resource, but Study Pack availability could not be loaded. Use the source fallback until Deep Learn storage is healthy again.',
      quizReady: false,
    }
  }

  if ((note?.status === 'failed' || !note) && readiness?.state === 'unreadable') {
    return {
      status: 'blocked',
      statusLabel: 'Needs action',
      tone: 'warning',
      noteHref,
      quizHref,
      primaryLabel: 'Open Source',
      summary: readiness.summary,
      detail: readiness.detail,
      quizReady: false,
    }
  }

  if (note && (readiness?.state === 'unreadable' || deepLearnNoteHasUntrustworthyGrounding(note))) {
    return {
      status: 'blocked',
      statusLabel: 'Needs action',
      tone: 'warning',
      noteHref,
      quizHref,
      primaryLabel: 'Open Source',
      summary: readiness?.summary ?? 'This saved Study Pack is blocked because its source text is not trustworthy enough for review.',
      detail: readiness?.detail ?? BAD_OCR_BLOCKED_MESSAGE,
      quizReady: false,
    }
  }

  if (!note) {
    return {
      status: 'not_started',
      statusLabel: 'Pack',
      tone: 'muted',
      noteHref,
      quizHref,
      primaryLabel: 'Generate Reviewer',
      summary: readiness?.summary
        ?? 'Turn this resource into a full source-backed exam Reviewer.',
      detail: readiness?.state === 'scan_fallback'
        ? readiness.detail
        : readiness?.state === 'partial_text'
          ? readiness.detail
          : 'Deep Learn builds a full exam Reviewer from the selected academic source.',
      quizReady: false,
    }
  }

  if (note.status === 'pending') {
    return {
      status: 'pending',
      statusLabel: 'Pack',
      tone: 'warning',
      noteHref,
      quizHref,
      primaryLabel: 'Open Reviewer',
      summary: note.overview || 'Deep Learn is building the saved Reviewer.',
      detail: 'Generation is in progress. Open the Reviewer to refresh status, or keep the source support nearby while it finishes.',
      quizReady: false,
    }
  }

  if (note.status === 'failed') {
    return {
      status: 'failed',
      statusLabel: 'Pack',
      tone: 'warning',
      noteHref,
      quizHref,
      primaryLabel: 'Generate Reviewer',
      summary: note.errorMessage || 'Deep Learn could not produce a trustworthy Reviewer from the current source evidence.',
      detail: 'Retry after checking the source, or use the source fallback while the Reviewer is unavailable.',
      quizReady: false,
    }
  }

  return {
    status: 'ready',
    statusLabel: note.quizReady ? 'Review Ready' : 'Review',
    tone: 'accent',
    noteHref,
    quizHref,
    primaryLabel: 'Open Reviewer',
    summary: note.overview,
    detail: note.quizReady
      ? 'This saved Reviewer is ready. Quiz handles practice separately.'
      : 'This saved Reviewer is ready for source-backed review, but the current structured quiz coverage is still thin.',
    quizReady: note.quizReady,
  }
}
