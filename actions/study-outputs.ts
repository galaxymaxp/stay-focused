'use server'

import { revalidatePath } from 'next/cache'
import { getDeepLearnNoteForResource } from '@/lib/deep-learn-store'
import { buildTaskDraftContextText, type TaskDraftContext } from '@/lib/do-now'
import { extractCourseName, getModuleWorkspace } from '@/lib/module-workspace'
import { getSafeStudyOutputActionErrorMessage } from '@/lib/study-output-action-errors'
import { StudyOutputSaveError } from '@/lib/study-output-errors'
import { findTaskOutputStudyOutput, getStudyOutputById, saveStudyOutput } from '@/lib/study-outputs/store'
import { serializeErrorForLogging } from '@/lib/supabase'
import { buildDeepLearnQuizPackContent } from '@/lib/study-outputs/quiz-pack'
import { buildDeepLearnReviewerContent } from '@/lib/study-outputs/reviewer'
import { buildDeepLearnSheetContent } from '@/lib/study-outputs/sheets'
import { buildTaskOutputRequest, isTaskOutputApiResponse } from '@/lib/task-output'
import { resolveGroundedTaskOutputContext } from '@/lib/task-output-context'
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

export async function refineTaskOutputStudyOutputAction(input: {
  outputId: string
  instruction: string
}): Promise<DeepLearnStudyOutputActionResult> {
  const instruction = input.instruction.replace(/\s+/g, ' ').trim()
  if (!instruction) return { ok: false, error: 'Add a short refinement request first.' }
  if (instruction.length > 500) return { ok: false, error: 'Keep the refinement request under 500 characters.' }

  try {
    const output = await getStudyOutputById(input.outputId)
    if (!output || output.outputKind !== 'task_output' || output.content.version !== 'task-output-v1') {
      return { ok: false, error: 'This saved task output could not be reopened for refinement.' }
    }
    if (!output.moduleId || !output.sourceTaskId) {
      return { ok: false, error: 'This task output is missing its original task workspace link.' }
    }

    const workspace = await getModuleWorkspace(output.moduleId)
    if (!workspace) {
      return { ok: false, error: 'The original task workspace could not be loaded.' }
    }

    const task = workspace.tasks.find((candidate) => candidate.id === output.sourceTaskId) ?? null
    const taskOutput = output.content
    const baseContext: TaskDraftContext = {
      taskId: output.sourceTaskId,
      moduleId: output.moduleId,
      courseId: output.courseId ?? workspace.module.courseId ?? null,
      taskTitle: task?.title ?? taskOutput.taskTitle,
      taskDetails: task?.details ?? null,
      deadline: task?.deadline ?? null,
      priority: task?.priority ?? null,
      courseName: extractCourseName(workspace.module.raw_content) ?? 'Course',
      moduleTitle: workspace.module.title,
      moduleSummary: null,
      resourceSnippet: null,
      sourceText: null,
      sourceNote: null,
      canvasUrl: task?.canvasUrl ?? null,
      learnHref: null,
      sourceTitle: null,
      sourceType: null,
      sourceHref: null,
    }
    const groundedContext = await resolveGroundedTaskOutputContext(output.moduleId, output.sourceTaskId, baseContext)
    const request = buildTaskOutputRequest(groundedContext, {
      preset: taskOutput.preset,
      outputType: taskOutput.outputType,
    })
    const previousOutput = buildTaskDraftContextText(taskOutput.previewContent, 8000)
    const apiPayload = {
      ...request,
      previousOutput,
      previousTaskOutput: taskOutput,
      refinementInstruction: instruction,
    }
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3000'
    const resp = await fetch(`${baseUrl}/api/task-output`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    })
    if (!resp.ok) {
      return { ok: false, error: `Task output refinement returned ${resp.status}.` }
    }

    const data = await resp.json() as { ok: boolean; output?: unknown; error?: string }
    if (!data.ok || !isTaskOutputApiResponse(data)) {
      return { ok: false, error: data.error ?? 'Task output refinement returned an empty preview.' }
    }

    const saved = await saveTaskOutputStudyOutputAction({
      taskId: output.sourceTaskId,
      moduleId: output.moduleId,
      courseId: output.courseId ?? workspace.module.courseId ?? null,
      taskTitle: groundedContext.taskTitle,
      preset: taskOutput.preset,
      outputType: taskOutput.outputType,
      content: data.output,
    })

    return { ok: true, id: saved.id, href: saved.href }
  } catch (error) {
    console.error('[study-outputs] refineTaskOutputStudyOutputAction failed', {
      outputId: input.outputId,
      error: serializeErrorForLogging(error),
    })

    const message = error instanceof StudyOutputSaveError
      ? error.message
      : getSafeStudyOutputActionErrorMessage('task_output', error)

    return { ok: false, error: message }
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
