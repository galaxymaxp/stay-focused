'use server'

import { revalidatePath } from 'next/cache'
import { getDeepLearnNoteForResource } from '@/lib/deep-learn-store'
import { buildDeepLearnQuizPackContent } from '@/lib/study-outputs/quiz-pack'
import { buildDeepLearnReviewerContent } from '@/lib/study-outputs/reviewer'
import { saveStudyOutput } from '@/lib/study-outputs/store'

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
