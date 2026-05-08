'use server'

import { revalidatePath } from 'next/cache'
import { getDeepLearnNoteForResource } from '@/lib/deep-learn-store'
import { findTaskOutputStudyOutput, saveStudyOutput } from '@/lib/study-outputs/store'
import { buildDeepLearnQuizPackContent } from '@/lib/study-outputs/quiz-pack'
import { buildDeepLearnReviewerContent } from '@/lib/study-outputs/reviewer'
import { buildDeepLearnSheetContent } from '@/lib/study-outputs/sheets'
import type { StudyOutputSheetMode, StudyOutputTaskOutputContent } from '@/lib/types'

export async function makeDeepLearnReviewerAction(input: {
  moduleId: string
  resourceId: string
}) {
  const noteResult = await getDeepLearnNoteForResource(input.moduleId, input.resourceId)
  const note = noteResult.note
  if (!note) {
    throw new Error('Deep Learn needs a saved ready pack before it can make a reviewer.')
  }

  const reviewer = buildDeepLearnReviewerContent(note)
  const saved = await saveStudyOutput({
    courseId: note.courseId,
    moduleId: note.moduleId,
    resourceId: note.resourceId,
    sourceKind: 'deep_learn_note',
    sourceNoteId: note.id,
    sourceTaskId: null,
    outputKind: 'reviewer',
    status: 'ready',
    title: reviewer.title,
    summary: reviewer.summary,
    content: reviewer,
    generatedAt: new Date().toISOString(),
  })

  revalidatePath('/library')
  revalidatePath(`/library/${saved.id}`)
  revalidatePath(`/modules/${note.moduleId}/learn`)
  revalidatePath(`/modules/${note.moduleId}/learn/notes/${encodeURIComponent(note.resourceId)}`)

  return {
    id: saved.id,
    href: `/library/${encodeURIComponent(saved.id)}`,
  }
}

export async function makeDeepLearnQuizPackAction(input: {
  moduleId: string
  resourceId: string
}) {
  const noteResult = await getDeepLearnNoteForResource(input.moduleId, input.resourceId)
  const note = noteResult.note
  if (!note) {
    throw new Error('Deep Learn needs a saved ready pack before it can make a quiz pack.')
  }

  const quizPack = buildDeepLearnQuizPackContent(note)
  const saved = await saveStudyOutput({
    courseId: note.courseId,
    moduleId: note.moduleId,
    resourceId: note.resourceId,
    sourceKind: 'deep_learn_note',
    sourceNoteId: note.id,
    sourceTaskId: null,
    outputKind: 'quiz_pack',
    status: 'ready',
    title: quizPack.title,
    summary: quizPack.summary,
    content: quizPack,
    generatedAt: new Date().toISOString(),
  })

  revalidatePath('/library')
  revalidatePath(`/library/${saved.id}`)
  revalidatePath(`/modules/${note.moduleId}/learn`)
  revalidatePath(`/modules/${note.moduleId}/learn/notes/${encodeURIComponent(note.resourceId)}`)

  return {
    id: saved.id,
    href: `/library/${encodeURIComponent(saved.id)}`,
  }
}

export async function makeDeepLearnSheetAction(input: {
  moduleId: string
  resourceId: string
  mode: StudyOutputSheetMode
}) {
  const noteResult = await getDeepLearnNoteForResource(input.moduleId, input.resourceId)
  const note = noteResult.note
  if (!note) {
    throw new Error(`Deep Learn needs a saved ready pack before it can make a ${input.mode === 'cram_sheet' ? 'cram sheet' : 'study sheet'}.`)
  }

  const sheet = buildDeepLearnSheetContent(note, input.mode)
  const saved = await saveStudyOutput({
    courseId: note.courseId,
    moduleId: note.moduleId,
    resourceId: note.resourceId,
    sourceKind: 'deep_learn_note',
    sourceNoteId: note.id,
    sourceTaskId: null,
    outputKind: input.mode,
    status: 'ready',
    title: sheet.title,
    summary: sheet.summary,
    content: sheet,
    generatedAt: new Date().toISOString(),
  })

  revalidatePath('/library')
  revalidatePath(`/library/${saved.id}`)
  revalidatePath(`/modules/${note.moduleId}/learn`)
  revalidatePath(`/modules/${note.moduleId}/learn/notes/${encodeURIComponent(note.resourceId)}`)

  return {
    id: saved.id,
    href: `/library/${encodeURIComponent(saved.id)}`,
  }
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
