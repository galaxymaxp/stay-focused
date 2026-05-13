'use server'

import { revalidatePath } from 'next/cache'
import { getDeepLearnNoteForResource } from '@/lib/deep-learn-store'
import { getSafeStudyOutputActionErrorMessage } from '@/lib/study-output-action-errors'
import { StudyOutputSaveError } from '@/lib/study-output-errors'
import { findTaskOutputStudyOutput, saveStudyOutput } from '@/lib/study-outputs/store'
import { serializeErrorForLogging } from '@/lib/supabase'
import { buildDeepLearnQuizPackContent } from '@/lib/study-outputs/quiz-pack'
import { buildDeepLearnReviewerContent } from '@/lib/study-outputs/reviewer'
import { buildDeepLearnSheetContent } from '@/lib/study-outputs/sheets'
import type { StudyOutputContent, StudyOutputSheetMode, StudyOutputTaskOutputContent } from '@/lib/types'

type DeepLearnStudyOutputActionResult =
  | { ok: true; id: string; href: string }
  | { ok: false; error: string }

export async function makeDeepLearnReviewerAction(input: {
  moduleId: string
  resourceId: string
}): Promise<DeepLearnStudyOutputActionResult> {
  return makeDeepLearnStudyOutputAction({
    moduleId: input.moduleId,
    resourceId: input.resourceId,
    outputKind: 'reviewer',
    missingNoteMessage: 'Deep Learn needs a saved ready Study Pack before it can generate a Reviewer.',
    buildContent: buildDeepLearnReviewerContent,
  })
}

export async function makeDeepLearnQuizPackAction(input: {
  moduleId: string
  resourceId: string
}): Promise<DeepLearnStudyOutputActionResult> {
  return makeDeepLearnStudyOutputAction({
    moduleId: input.moduleId,
    resourceId: input.resourceId,
    outputKind: 'quiz_pack',
    missingNoteMessage: 'Deep Learn needs a saved ready Study Pack before it can start a Quiz.',
    buildContent: buildDeepLearnQuizPackContent,
  })
}

export async function makeDeepLearnSheetAction(input: {
  moduleId: string
  resourceId: string
  mode: StudyOutputSheetMode
}): Promise<DeepLearnStudyOutputActionResult> {
  return makeDeepLearnStudyOutputAction({
    moduleId: input.moduleId,
    resourceId: input.resourceId,
    outputKind: input.mode,
    missingNoteMessage: `Deep Learn needs a saved ready Study Pack before it can generate a Reviewer ${input.mode === 'cram_sheet' ? 'Cram' : 'Full Review'} variant.`,
    buildContent: (note) => buildDeepLearnSheetContent(note, input.mode),
  })
}

export async function saveTaskOutputStudyOutputAction(input: {
  taskId: string
  moduleId: string
  courseId: string | null
  taskTitle: string
  preset: StudyOutputTaskOutputContent['preset']
  outputType: StudyOutputTaskOutputContent['outputType']
  content: StudyOutputTaskOutputContent
}) {
  const existing = await findTaskOutputStudyOutput({
    taskId: input.taskId,
    preset: input.preset,
    outputType: input.outputType,
  })
  const previousContent = existing?.content?.version === 'task-output-v1'
    ? existing.content as StudyOutputTaskOutputContent
    : null
  const mergedContent: StudyOutputTaskOutputContent = previousContent
    ? {
        ...input.content,
        revisionHistory: input.content.revisionHistory.length > 0
          ? input.content.revisionHistory
          : previousContent.revisionHistory,
      }
    : input.content

  const saved = await saveStudyOutput({
    existingId: existing?.id ?? null,
    courseId: input.courseId,
    moduleId: input.moduleId,
    resourceId: null,
    sourceKind: 'task',
    sourceNoteId: null,
    sourceTaskId: input.taskId,
    outputKind: 'task_output',
    status: 'ready',
    title: input.content.title,
    summary: input.content.summary,
    content: mergedContent,
    generatedAt: new Date().toISOString(),
  })

  revalidatePath('/library')
  revalidatePath(`/library/${saved.id}`)
  revalidatePath(`/modules/${input.moduleId}/tasks`)
  revalidatePath(`/modules/${input.moduleId}/do`)
  if (input.courseId) revalidatePath(`/courses/${input.courseId}`)

  return {
    id: saved.id,
    href: `/library/${encodeURIComponent(saved.id)}`,
  }
}

async function makeDeepLearnStudyOutputAction(input: {
  moduleId: string
  resourceId: string
  outputKind: 'reviewer' | 'quiz_pack' | StudyOutputSheetMode
  missingNoteMessage: string
  buildContent: (note: Awaited<ReturnType<typeof getDeepLearnNoteForResource>>['note'] extends infer T
    ? Exclude<T, null>
    : never) => StudyOutputContent
}) : Promise<DeepLearnStudyOutputActionResult> {
  try {
    const noteResult = await getDeepLearnNoteForResource(input.moduleId, input.resourceId)
    const note = noteResult.note
    if (!note) {
      return { ok: false, error: input.missingNoteMessage }
    }

    const content = input.buildContent(note)
    const saved = await saveStudyOutput({
      courseId: note.courseId,
      moduleId: note.moduleId,
      resourceId: note.resourceId,
      sourceKind: 'deep_learn_note',
      sourceNoteId: note.id,
      sourceTaskId: null,
      outputKind: input.outputKind,
      status: 'ready',
      title: content.title,
      summary: content.summary,
      content,
      generatedAt: new Date().toISOString(),
    })

    revalidatePath('/library')
    revalidatePath(`/library/${saved.id}`)
    revalidatePath(`/modules/${note.moduleId}/learn`)
    revalidatePath(`/modules/${note.moduleId}/learn/notes/${encodeURIComponent(note.resourceId)}`)

    return {
      ok: true,
      id: saved.id,
      href: `/library/${encodeURIComponent(saved.id)}`,
    }
  } catch (error) {
    console.error('[study-outputs] makeDeepLearnStudyOutputAction failed', {
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      outputKind: input.outputKind,
      error: serializeErrorForLogging(error),
    })

    const message = error instanceof StudyOutputSaveError
      ? error.message
      : getSafeStudyOutputActionErrorMessage(input.outputKind, error)

    return { ok: false, error: message }
  }
}
