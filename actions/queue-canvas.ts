'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAuthenticatedUserServer } from '@/lib/auth-server'
import { syncCanvasCourse } from '@/actions/canvas'
import { processNextPendingSourceOcrJobForUser } from '@/actions/queue-jobs'
import { buildCanvasSyncCompletionResult } from '@/lib/canvas-sync-queue'
import {
  createQueuedJob,
  getUserQueuedJobs,
  markQueuedJobCompleted,
  markQueuedJobFailed,
  markQueuedJobRunning,
  updateQueuedJobStatus,
  type QueuedJob,
} from '@/lib/queue'
import { createNotification } from '@/lib/notifications-server'

interface SyncCourseInput {
  courseId: number
  courseName: string
  courseCode: string
  instructor?: string | null
}

export interface QueueCanvasSyncInput {
  course?: SyncCourseInput
  courses?: SyncCourseInput[]
  canvasUrl?: string
  accessToken?: string
  mode?: string
}

export interface QueueCanvasSyncResult {
  jobId: string
  job?: QueuedJob
  duplicate?: boolean
  error?: string
}

const CANVAS_SYNC_PROGRESS = {
  connecting: 8,
  reading: 18,
  importing: 42,
  organizing: 58,
  saving: 72,
  extracting: 86,
  finalizing: 96,
} as const

export async function queueCanvasSyncAction(
  input: QueueCanvasSyncInput,
): Promise<QueueCanvasSyncResult> {
  const user = await requireAuthenticatedUserServer()
  const courses = normalizeCourses(input)

  if (courses.length === 0) {
    return { jobId: '', error: 'Choose at least one course to sync.' }
  }

  const activeDuplicate = await findDuplicateCanvasSyncJob(user.id, input.canvasUrl ?? '', courses)
  if (activeDuplicate) {
    return { jobId: activeDuplicate.id, job: activeDuplicate, duplicate: true }
  }

  const courseCountLabel = formatCourseCount(courses.length)
  const job = await createQueuedJob(
    user.id,
    'canvas_sync',
    `Syncing Canvas: ${courseCountLabel}`,
    {
      canvasUrl: input.canvasUrl ?? '',
      courseIds: courses.map((course) => course.courseId),
      courseNames: courses.map((course) => course.courseName),
      courseCount: courses.length,
      mode: input.mode ?? 'selected_courses',
    },
  )

  if (!job) {
    return { jobId: '', error: 'Failed to create sync job.' }
  }

  after(async () => {
    await runCanvasSyncJob({
      jobId: job.id,
      userId: user.id,
      courses,
      canvasUrl: input.canvasUrl ?? '',
      accessToken: input.accessToken ?? '',
    })

    revalidatePath('/canvas')
    revalidatePath('/courses')
    revalidatePath('/learn')
    revalidatePath('/tasks')
    revalidatePath('/')
  })

  return { jobId: job.id, job }
}

async function runCanvasSyncJob(input: {
  jobId: string
  userId: string
  courses: SyncCourseInput[]
  canvasUrl: string
  accessToken: string
}) {
  await markQueuedJobRunning(input.jobId, 4)

  const syncedCourses: Array<{ courseName: string; moduleId: string; href: string }> = []
  const queuedOcrJobIds: string[] = []
  const failedCourses: Array<{ courseName: string; error: string }> = []

  try {
    await updateCanvasJobStep(input.jobId, 6, 'Connecting to Canvas', 'connecting')

    for (const [index, course] of input.courses.entries()) {
      const courseOffset = input.courses.length <= 1 ? 0 : Math.floor((index / input.courses.length) * 80)
      const courseProgressCap = input.courses.length <= 1 ? 100 : Math.floor(((index + 1) / input.courses.length) * 92)

      const result = await syncCanvasCourse({
        course,
        canvasUrl: input.canvasUrl,
        accessToken: input.accessToken,
        onProgress: async (update) => {
          const baseProgress = CANVAS_SYNC_PROGRESS[update.step]
          const scaledProgress = input.courses.length <= 1
            ? baseProgress
            : Math.min(courseProgressCap, Math.max(6, Math.floor(courseOffset + (baseProgress / input.courses.length))))

          await updateCanvasJobStep(
            input.jobId,
            scaledProgress,
            update.message ?? getStepMessage(update.step),
            update.step,
            course.courseName,
          )
        },
      })

      if ('error' in result) {
        await updateCanvasJobStep(input.jobId, Math.max(1, input.courses.length <= 1 ? 98 : courseProgressCap), result.error, 'failed', course.courseName)
        failedCourses.push({ courseName: course.courseName, error: result.error })
        continue
      }

      syncedCourses.push({
        courseName: result.courseName,
        moduleId: result.moduleId,
        href: `/modules/${result.moduleId}`,
      })

      for (const ocrJob of result.autoOcrJobs ?? []) {
        queuedOcrJobIds.push(ocrJob.id)
      }
    }

    if (syncedCourses.length === 0 && failedCourses.length > 0) {
      const message = failedCourses.length === 1
        ? failedCourses[0].error
        : `${failedCourses.length} Canvas courses could not be loaded. Retry current courses first, then add ended courses one at a time if Canvas still allows access.`
      await updateCanvasJobStep(input.jobId, 99, message, 'failed')
      await markQueuedJobFailed(input.jobId, message)
      await createNotification({
        userId: input.userId,
        type: 'queue_failed',
        title: 'Canvas sync failed',
        body: message,
        severity: 'error',
        metadata: { jobId: input.jobId, dedupeKey: `sync-fail:${input.jobId}` },
      })
      return
    }

    await updateCanvasJobStep(input.jobId, 98, failedCourses.length > 0
      ? `${syncedCourses.length} course${syncedCourses.length === 1 ? '' : 's'} synced. ${failedCourses.length} course${failedCourses.length === 1 ? '' : 's'} could not be loaded from Canvas.`
      : queuedOcrJobIds.length > 0
      ? 'Sync complete. Preparing scanned PDFs in the background.'
      : 'Finalizing sync', 'finalizing')

    const completionResult = buildCanvasSyncCompletionResult({ syncedCourses, queuedOcrJobIds, failedCourses })
    await markQueuedJobCompleted(input.jobId, completionResult)

    console.info('[queue-canvas] completed Canvas sync without waiting for OCR', {
      jobId: input.jobId,
      courseCount: syncedCourses.length,
      failedCourseCount: failedCourses.length,
      queuedOcrJobIds,
      waitsForOcr: false,
    })

    await createNotification({
      userId: input.userId,
      type: 'sync_completed',
      title: 'Canvas sync complete',
      body: failedCourses.length > 0
        ? `${syncedCourses.length} course${syncedCourses.length === 1 ? '' : 's'} synced. ${failedCourses.length} could not be loaded from Canvas.`
        : syncedCourses.length === 1
        ? `${syncedCourses[0].courseName} is ready to study.`
        : `${syncedCourses.length} courses are ready to study.`,
      href: completionResult.href,
      severity: failedCourses.length > 0 ? 'warning' : 'success',
      metadata: { jobId: input.jobId, dedupeKey: `sync:${input.jobId}` },
    })

    if (queuedOcrJobIds.length > 0) {
      void processNextPendingSourceOcrJobForUser(input.userId).catch((error) => {
        console.error('[queue-canvas] failed to start queued OCR after Canvas sync completion', {
          jobId: input.jobId,
          queuedOcrJobIds,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Canvas sync failed.'
    console.error('[queue-canvas] runCanvasSyncJob failed', { jobId: input.jobId, message })
    await updateCanvasJobStep(input.jobId, 99, message, 'failed')
    await markQueuedJobFailed(input.jobId, message)

    await createNotification({
      userId: input.userId,
      type: 'queue_failed',
      title: 'Canvas sync failed',
      body: message,
      severity: 'error',
      metadata: { jobId: input.jobId, dedupeKey: `sync-fail:${input.jobId}` },
    })
  }
}

async function updateCanvasJobStep(
  jobId: string,
  progress: number,
  statusMessage: string,
  currentStep: string,
  activeCourseName?: string,
) {
  console.info('[queue-canvas] canvas_sync progress', {
    jobId,
    status: 'running',
    progress: Math.max(0, Math.min(99, progress)),
    currentStep,
    statusMessage,
    activeCourseName: activeCourseName ?? null,
    updatedAt: new Date().toISOString(),
  })
  await updateQueuedJobStatus(jobId, 'running', {
    progress: Math.max(0, Math.min(99, progress)),
    result: {
      statusMessage,
      currentStep,
      activeCourseName: activeCourseName ?? null,
    },
  })
}

async function findDuplicateCanvasSyncJob(userId: string, canvasUrl: string, courses: SyncCourseInput[]) {
  const activeJobs = await getUserQueuedJobs(userId, {
    status: ['pending', 'running'],
    type: 'canvas_sync',
    limit: 20,
  })
  const courseKey = buildCourseSetKey(courses.map((course) => course.courseId))
  const urlKey = canvasUrl.trim()

  return activeJobs.find((job) => {
    const payloadUrl = typeof job.payload?.canvasUrl === 'string' ? job.payload.canvasUrl.trim() : ''
    const payloadCourseIds = Array.isArray(job.payload?.courseIds)
      ? job.payload.courseIds.filter((value): value is number => typeof value === 'number')
      : []

    return payloadUrl === urlKey && buildCourseSetKey(payloadCourseIds) === courseKey
  }) ?? null
}

function normalizeCourses(input: QueueCanvasSyncInput) {
  const courses = input.courses ?? (input.course ? [input.course] : [])
  const byId = new Map<number, SyncCourseInput>()

  for (const course of courses) {
    if (!Number.isFinite(course.courseId)) continue
    byId.set(course.courseId, {
      courseId: course.courseId,
      courseName: course.courseName,
      courseCode: course.courseCode,
      instructor: course.instructor ?? null,
    })
  }

  return Array.from(byId.values())
}

function buildCourseSetKey(courseIds: number[]) {
  return [...courseIds].sort((a, b) => a - b).join(',')
}

function formatCourseCount(count: number) {
  return `${count} course${count === 1 ? '' : 's'}`
}

function getStepMessage(step: keyof typeof CANVAS_SYNC_PROGRESS) {
  if (step === 'connecting') return 'Connecting to Canvas'
  if (step === 'reading') return 'Reading selected courses'
  if (step === 'importing') return 'Importing module content'
  if (step === 'organizing') return 'Organizing data'
  if (step === 'saving') return 'Saving to Stay Focused'
  if (step === 'extracting') return 'Extracting tasks/resources'
  return 'Finalizing sync'
}
