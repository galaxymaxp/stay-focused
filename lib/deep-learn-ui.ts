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
  primaryLabel: 'Generate Study Pack' | 'Open Study Pack' | 'Open Source'
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
      primaryLabel: 'Generate Study Pack',
      summary: readiness?.summary
        ?? 'Turn this resource into a Study Pack for understanding, application, and source-backed review.',
      detail: readiness?.state === 'scan_fallback'
        ? readiness.detail
        : readiness?.state === 'partial_text'
          ? readiness.detail
          : 'Deep Learn builds a Study Pack first, then Reviewer and Quiz use the same grounded source material.',
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
      primaryLabel: 'Open Study Pack',
      summary: note.overview || 'Deep Learn is building the saved Study Pack.',
      detail: 'Generation is in progress. Open the Study Pack to refresh status, or keep the source support nearby while it finishes.',
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
      primaryLabel: 'Generate Study Pack',
      summary: note.errorMessage || 'Deep Learn could not produce a trustworthy Study Pack from the current source evidence.',
      detail: 'Retry after checking the source, or use the source fallback while the Study Pack is unavailable.',
      quizReady: false,
    }
  }

  return {
    status: 'ready',
    statusLabel: note.quizReady ? 'Review Ready' : 'Review',
    tone: 'accent',
    noteHref,
    quizHref,
    primaryLabel: 'Open Study Pack',
    summary: note.overview,
    detail: note.quizReady
      ? 'This saved Study Pack is ready. Reviewer handles source-exact memorization, and Quiz handles practice.'
      : 'This saved Study Pack is ready for understanding and review, but the current source coverage is still thin for the full quiz lane.',
    quizReady: note.quizReady,
  }
}
