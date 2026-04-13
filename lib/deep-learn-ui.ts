import type { DeepLearnNote, DeepLearnNoteLoadAvailability } from '@/lib/types'
import type { DeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { buildDeepLearnNoteHref, buildModuleQuizHref } from '@/lib/stay-focused-links'

export type DeepLearnUiStatus = 'not_started' | 'pending' | 'ready' | 'failed' | 'blocked' | 'unavailable'

export interface DeepLearnResourceUiState {
  status: DeepLearnUiStatus
  statusLabel: 'No pack yet' | 'Preparing' | 'Ready' | 'Failed' | 'Source issue' | 'Unavailable'
  tone: 'accent' | 'warning' | 'muted'
  noteHref: string
  quizHref: string
  primaryLabel: 'Build Exam Prep Pack' | 'Open Exam Prep Pack' | 'Rebuild Exam Prep Pack' | 'Open reader fallback'
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
      primaryLabel: 'Open reader fallback',
      summary: options.unavailableMessage || 'Saved Deep Learn exam prep packs are unavailable right now.',
      detail: 'Learn is still rendering the resource, but pack availability could not be loaded. Use the reader or source fallback until Deep Learn storage is healthy again.',
      quizReady: false,
    }
  }

  if ((note?.status === 'failed' || !note) && readiness?.state === 'unreadable') {
    return {
      status: 'blocked',
      statusLabel: 'Source issue',
      tone: 'warning',
      noteHref,
      quizHref,
      primaryLabel: 'Open reader fallback',
      summary: readiness.summary,
      detail: readiness.detail,
      quizReady: false,
    }
  }

  if (!note) {
    return {
      status: 'not_started',
      statusLabel: 'No pack yet',
      tone: 'muted',
      noteHref,
      quizHref,
      primaryLabel: 'Build Exam Prep Pack',
      summary: readiness?.summary
        ?? 'Turn this resource into an answer-first exam prep pack with key answers, identification prompts, timeline cues, and confusable items.',
      detail: readiness?.state === 'scan_fallback'
        ? readiness.detail
        : readiness?.state === 'partial_text'
          ? readiness.detail
          : 'Deep Learn now aims for answer-ready review material first. The reader stays nearby only as a source surface and fallback.',
      quizReady: false,
    }
  }

  if (note.status === 'pending') {
    return {
      status: 'pending',
      statusLabel: 'Preparing',
      tone: 'warning',
      noteHref,
      quizHref,
      primaryLabel: 'Open Exam Prep Pack',
      summary: note.overview || 'Deep Learn is building the saved exam prep pack.',
      detail: 'Generation is in progress. Open the pack to refresh status, or keep the reader and original source nearby while it finishes.',
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
      primaryLabel: 'Rebuild Exam Prep Pack',
      summary: note.errorMessage || 'Deep Learn could not produce a trustworthy exam prep pack from the current source evidence.',
      detail: 'Retry after checking the source, or use the reader and original source while the pack is unavailable.',
      quizReady: false,
    }
  }

  return {
    status: 'ready',
    statusLabel: 'Ready',
    tone: 'accent',
    noteHref,
    quizHref,
    primaryLabel: 'Open Exam Prep Pack',
    summary: note.overview,
    detail: note.quizReady
      ? 'This saved exam prep pack is ready for answer-bank review, identification drills, MCQ recall, and timeline review.'
      : 'This saved exam prep pack is ready for review, but the current answer coverage is still thin for the full quiz lane.',
    quizReady: note.quizReady,
  }
}
