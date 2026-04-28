'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAuthenticatedUserServer } from '@/lib/auth-server'
import { syncCanvasCourse } from '@/actions/canvas'
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
  canvasUrl: string
  accessToken: string
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

  const activeDuplicate = await findDuplicateCanvasSyncJob(user.id, input.canvasUrl, courses)
  if (activeDuplicate) {
    return { jobId: activeDuplicate.id, job: activeDuplicate, duplicate: true }
  }

  const courseCountLabel = formatCourseCount(courses.length)
  const job = await createQueuedJob(
    user.id,
    'canvas_sync',
    `Syncing Canvas: ${courseCountLabel}`,
    {
      canvasUrl: input.canvasUrl,
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
      canvasUrl: input.canvasUrl,
      accessToken: input.accessToken,
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
        await markQueuedJobFailed(input.jobId, result.error)
        await createNotification({
          userId: input.userId,
          type: 'queue_failed',
          title: 'Canvas sync failed',
          body: result.error,
          severity: 'error',
          metadata: { jobId: input.jobId, dedupeKey: `sync-fail:${input.jobId}` },
        })
        return
      }

      syncedCourses.push({
        courseName: result.courseName,
        moduleId: result.moduleId,
        href: `/modules/${result.moduleId}`,
      })
    }

    await updateCanvasJobStep(input.jobId, 98, 'Finalizing sync', 'finalizing')

    const firstResult = syncedCourses[0]
    await markQueuedJobCompleted(input.jobId, {
      courseCount: syncedCourses.length,
      courseNames: syncedCourses.map((course) => course.courseName),
      moduleIds: syncedCourses.map((course) => course.moduleId),
      href: firstResult?.href ?? '/courses',
      statusMessage: 'Canvas sync complete',
      currentStep: 'done',
    })

    await createNotification({
      userId: input.userId,
      type: 'sync_completed',
      title: 'Canvas sync complete',
      body: syncedCourses.length === 1
        ? `${syncedCourses[0].courseName} is ready to study.`
        : `${syncedCourses.length} courses are ready to study.`,
      href: firstResult?.href ?? '/courses',
      severity: 'success',
      metadata: { jobId: input.jobId, dedupeKey: `sync:${input.jobId}` },
    })
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
