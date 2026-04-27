'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAuthenticatedUserServer } from '@/lib/auth-server'
import { syncCanvasCourse } from '@/actions/canvas'

interface SyncCourseInput {
  courseId: number
  courseName: string
  courseCode: string
  instructor?: string | null
}
import {
  createQueuedJob,
  markQueuedJobCompleted,
  markQueuedJobFailed,
  markQueuedJobRunning,
  updateQueuedJobStatus,
} from '@/lib/queue'
import { createNotification } from '@/lib/notifications-server'

export interface QueueCanvasSyncInput {
  course: SyncCourseInput
  canvasUrl: string
  accessToken: string
}

export interface QueueCanvasSyncResult {
  jobId: string
  error?: string
}

export async function queueCanvasSyncAction(
  input: QueueCanvasSyncInput,
): Promise<QueueCanvasSyncResult> {
  const user = await requireAuthenticatedUserServer()

  const job = await createQueuedJob(
    user.id,
    'canvas_sync',
    `Sync: ${input.course.courseName}`,
    {
      courseId: input.course.courseId,
      courseName: input.course.courseName,
      courseCode: input.course.courseCode,
      instructor: input.course.instructor ?? null,
      // Credentials stored only for duration of the job — not persisted beyond payload
      canvasUrl: input.canvasUrl,
      accessToken: input.accessToken,
    },
  )

  if (!job) {
    return { jobId: '', error: 'Failed to create sync job.' }
  }

  after(async () => {
    await runCanvasSyncJob({
      jobId: job.id,
      userId: user.id,
      course: input.course,
      canvasUrl: input.canvasUrl,
      accessToken: input.accessToken,
    })

    revalidatePath('/canvas')
    revalidatePath('/courses')
    revalidatePath('/')
  })

  return { jobId: job.id }
}

async function runCanvasSyncJob(input: {
  jobId: string
  userId: string
  course: SyncCourseInput
  canvasUrl: string
  accessToken: string
}) {
  await markQueuedJobRunning(input.jobId, 10)

  try {
    await updateQueuedJobStatus(input.jobId, 'running', { progress: 30 })

    const result = await syncCanvasCourse({
      course: input.course,
      canvasUrl: input.canvasUrl,
      accessToken: input.accessToken,
    })

    if ('error' in result) {
      await markQueuedJobFailed(input.jobId, result.error)
      await createNotification({
        userId: input.userId,
        type: 'queue_failed',
        title: `Canvas sync failed: ${input.course.courseName}`,
        body: result.error,
        severity: 'error',
        metadata: { jobId: input.jobId, dedupeKey: `sync-fail:${input.jobId}` },
      })
      return
    }

    const resultHref = `/modules/${result.moduleId}`
    await markQueuedJobCompleted(input.jobId, {
      courseName: result.courseName,
      moduleId: result.moduleId,
      href: resultHref,
    })

    await createNotification({
      userId: input.userId,
      type: 'sync_completed',
      title: `Canvas sync complete: ${result.courseName}`,
      body: 'Your course content is ready to study.',
      href: resultHref,
      severity: 'success',
      metadata: { jobId: input.jobId, dedupeKey: `sync:${input.jobId}` },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Canvas sync failed.'
    console.error('[queue-canvas] runCanvasSyncJob failed', { jobId: input.jobId, message })
    await markQueuedJobFailed(input.jobId, message)

    await createNotification({
      userId: input.userId,
      type: 'queue_failed',
      title: `Canvas sync failed: ${input.course.courseName}`,
      body: message,
      severity: 'error',
      metadata: { jobId: input.jobId, dedupeKey: `sync-fail:${input.jobId}` },
    })
  }
}
