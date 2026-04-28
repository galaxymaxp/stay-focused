'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import {
  createQueuedJob,
  markQueuedJobCompleted,
  markQueuedJobFailed,
  markQueuedJobRunning,
  updateQueuedJobStatus,
  type QueuedJob,
} from '@/lib/queue'
import {
  buildLearnExperience,
  extractCourseName,
  getModuleWorkspace,
  resolveLearnResourceSelection,
} from '@/lib/module-workspace'
import { DeepLearnGenerationBlockedError, generateDeepLearnNoteForResource } from '@/lib/deep-learn-generation'
import {
  DEEP_LEARN_PROMPT_VERSION,
  buildDeepLearnNoteBody,
  computeDeepLearnQuizReady,
} from '@/lib/deep-learn'
import { classifyDeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { saveDeepLearnNote } from '@/lib/deep-learn-store'
import { buildDeepLearnNoteHref } from '@/lib/stay-focused-links'
import { buildTaskDraftRequestPayload, type TaskDraftContext } from '@/lib/do-now'
import { createNotification } from '@/lib/notifications-server'

export interface QueueJobResult {
  jobId: string
  job?: QueuedJob
  error?: string
}

// ---------------------------------------------------------------------------
// Queue: Deep Learn generation
// ---------------------------------------------------------------------------

export async function queueLearnGenerationAction(input: {
  moduleId: string
  resourceId: string
  courseId?: string | null
  resourceTitle: string
}): Promise<QueueJobResult> {
  const user = await getAuthenticatedUserServer()
  if (!user) return { jobId: '', error: 'Not authenticated.' }

  const job = await createQueuedJob(
    user.id,
    'learn_generation',
    `Generating study pack: ${input.resourceTitle}`,
    {
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      courseId: input.courseId ?? null,
      resourceTitle: input.resourceTitle,
    },
  )

  if (!job) return { jobId: '', error: 'Failed to create queue job.' }

  after(async () => {
    await processLearnGenerationJob({
      jobId: job.id,
      userId: user.id,
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      courseId: input.courseId ?? null,
    })
    revalidatePath(`/modules/${input.moduleId}/learn`)
  })

  return { jobId: job.id, job }
}

// ---------------------------------------------------------------------------
// Queue: Do Now (task draft) generation
// ---------------------------------------------------------------------------

export async function queueDoGenerationAction(input: {
  taskId: string
  moduleId: string
  context: TaskDraftContext
}): Promise<QueueJobResult> {
  const user = await getAuthenticatedUserServer()
  if (!user) return { jobId: '', error: 'Not authenticated.' }

  const taskTitle = input.context.taskTitle

  const job = await createQueuedJob(
    user.id,
    'do_generation',
    `Do Now: ${taskTitle}`,
    {
      taskId: input.taskId,
      moduleId: input.moduleId,
      context: input.context as unknown as Record<string, unknown>,
    },
  )

  if (!job) return { jobId: '', error: 'Failed to create queue job.' }

  after(async () => {
    await processDoGenerationJob({
      jobId: job.id,
      userId: user.id,
      moduleId: input.moduleId,
      taskId: input.taskId,
      context: input.context,
    })
    revalidatePath(`/modules/${input.moduleId}/do`)
  })

  return { jobId: job.id }
}

// ---------------------------------------------------------------------------
// Internal: run deep-learn AI and persist result
// ---------------------------------------------------------------------------

async function processLearnGenerationJob(input: {
  jobId: string
  userId: string
  moduleId: string
  resourceId: string
  courseId: string | null
}) {
  await markQueuedJobRunning(input.jobId, 10)

  try {
    const workspace = await getModuleWorkspace(input.moduleId)
    if (!workspace) {
      await markQueuedJobFailed(input.jobId, 'Module not found.')
      return
    }

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 20 })

    const courseName = extractCourseName(workspace.module.raw_content)
    const experience = buildLearnExperience(workspace.module, {
      taskCount: workspace.tasks.length,
      deadlineCount: workspace.deadlines.length,
      resources: workspace.resources,
      resourceStudyStates: workspace.resourceStudyStates,
    })
    const selection = resolveLearnResourceSelection(experience, workspace.resources, input.resourceId)

    if (!selection) {
      await markQueuedJobFailed(input.jobId, 'Resource not found in module.')
      return
    }

    const { resource, storedResource, canonicalResourceId } = selection
    const readiness = classifyDeepLearnResourceReadiness({ resource, storedResource, canonicalResourceId })

    if (!storedResource || !canonicalResourceId || !readiness.canGenerate) {
      await markQueuedJobFailed(input.jobId, readiness.detail ?? 'Resource not ready for Deep Learn.')
      return
    }

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 30 })

    await saveDeepLearnNote({
      moduleId: workspace.module.id,
      courseId: workspace.module.courseId ?? input.courseId ?? null,
      resourceId: canonicalResourceId,
      status: 'pending',
      title: resource.title,
      overview: 'Deep Learn is preparing the study pack.',
      sections: [],
      noteBody: '',
      answerBank: [],
      identificationItems: [],
      distinctions: [],
      likelyQuizTargets: [],
      cautionNotes: [],
      sourceGrounding: {
        sourceType: null,
        extractionQuality: null,
        groundingStrategy: 'insufficient',
        usedAiFallback: false,
        qualityReason: null,
        warning: null,
        charCount: 0,
      },
      quizReady: false,
      promptVersion: DEEP_LEARN_PROMPT_VERSION,
      errorMessage: null,
    })

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 40 })

    const linkedTask = workspace.tasks.find((t) =>
      t.title.trim().toLowerCase() === resource.title.trim().toLowerCase()
    ) ?? null

    let generated
    try {
      generated = await generateDeepLearnNoteForResource({
        resource,
        storedResource,
        courseName,
        module: workspace.module,
        linkedTask,
      })
    } catch (err) {
      if (err instanceof DeepLearnGenerationBlockedError) {
        await markQueuedJobFailed(input.jobId, err.message)
        await saveDeepLearnNote({
          moduleId: workspace.module.id,
          courseId: workspace.module.courseId ?? input.courseId ?? null,
          resourceId: canonicalResourceId,
          status: 'failed',
          title: resource.title,
          overview: '',
          sections: [],
          noteBody: '',
          answerBank: [],
          identificationItems: [],
          distinctions: [],
          likelyQuizTargets: [],
          cautionNotes: [],
          sourceGrounding: {
            sourceType: null,
            extractionQuality: null,
            groundingStrategy: 'insufficient',
            usedAiFallback: false,
            qualityReason: null,
            warning: null,
            charCount: 0,
          },
          quizReady: false,
          promptVersion: DEEP_LEARN_PROMPT_VERSION,
          errorMessage: err.message,
        })
        return
      }
      throw err
    }

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 85 })

    const noteBody = buildDeepLearnNoteBody(generated.content.sections)
    const quizReady = computeDeepLearnQuizReady(generated.content)

    await saveDeepLearnNote({
      moduleId: workspace.module.id,
      courseId: workspace.module.courseId ?? input.courseId ?? null,
      resourceId: canonicalResourceId,
      status: 'ready',
      title: resource.title,
      overview: generated.content.overview,
      sections: generated.content.sections,
      noteBody,
      answerBank: generated.content.answerBank,
      identificationItems: generated.content.identificationItems,
      distinctions: generated.content.distinctions,
      likelyQuizTargets: generated.content.likelyQuizTargets,
      cautionNotes: generated.content.cautionNotes,
      sourceGrounding: generated.sourceGrounding,
      quizReady,
      promptVersion: DEEP_LEARN_PROMPT_VERSION,
      errorMessage: null,
    })

    const resultHref = buildDeepLearnNoteHref(workspace.module.id, canonicalResourceId)

    await markQueuedJobCompleted(input.jobId, {
      resourceId: canonicalResourceId,
      moduleId: workspace.module.id,
      resourceTitle: resource.title,
      href: resultHref,
    })

    await createNotification({
      userId: input.userId,
      type: 'queue_completed',
      title: 'Study pack ready',
      body: `Your study pack for "${resource.title}" is ready.`,
      href: resultHref,
      severity: 'success',
      metadata: { jobId: input.jobId, dedupeKey: `learn:${canonicalResourceId}` },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during Deep Learn generation.'
    console.error('[queue-jobs] processLearnGenerationJob failed', { jobId: input.jobId, message })
    await markQueuedJobFailed(input.jobId, message)

    await createNotification({
      userId: input.userId,
      type: 'queue_failed',
      title: 'Study pack failed',
      body: message,
      severity: 'error',
      metadata: { jobId: input.jobId, dedupeKey: `learn-fail:${input.jobId}` },
    })
  }
}

// ---------------------------------------------------------------------------
// Internal: run Do Now AI and persist result
// ---------------------------------------------------------------------------

async function processDoGenerationJob(input: {
  jobId: string
  userId: string
  moduleId: string
  taskId: string
  context: TaskDraftContext
}) {
  await markQueuedJobRunning(input.jobId, 10)

  try {
    const apiPayload = buildTaskDraftRequestPayload(input.context)

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 20 })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3000'

    const resp = await fetch(`${baseUrl}/api/do-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    })

    await updateQueuedJobStatus(input.jobId, 'running', { progress: 80 })

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as { error?: string }
      await markQueuedJobFailed(input.jobId, body.error ?? `Do Now API returned ${resp.status}.`)
      return
    }

    const data = await resp.json() as { ok: boolean; draft?: unknown; error?: string }

    if (!data.ok || !data.draft) {
      await markQueuedJobFailed(input.jobId, data.error ?? 'Do Now returned empty draft.')
      return
    }

    const resultHref = `/modules/${input.moduleId}/do?task=${encodeURIComponent(input.taskId)}&donow=1`

    await markQueuedJobCompleted(input.jobId, {
      taskId: input.taskId,
      moduleId: input.moduleId,
      href: resultHref,
      draft: data.draft as Record<string, unknown>,
    })

    await createNotification({
      userId: input.userId,
      type: 'queue_completed',
      title: 'Do Now draft ready',
      body: `Your task draft for "${input.context.taskTitle}" is ready.`,
      href: resultHref,
      severity: 'success',
      metadata: { jobId: input.jobId, dedupeKey: `do:${input.taskId}` },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during Do Now generation.'
    console.error('[queue-jobs] processDoGenerationJob failed', { jobId: input.jobId, message })
    await markQueuedJobFailed(input.jobId, message)

    await createNotification({
      userId: input.userId,
      type: 'queue_failed',
      title: 'Do Now generation failed',
      body: message,
      severity: 'error',
      metadata: { jobId: input.jobId, dedupeKey: `do-fail:${input.jobId}` },
    })
  }
}
