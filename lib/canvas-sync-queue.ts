export interface SyncedCanvasCourseSummary {
  courseName: string
  moduleId: string
  href: string
}

export function buildCanvasSyncCompletionResult(input: {
  syncedCourses: SyncedCanvasCourseSummary[]
  queuedOcrJobIds: string[]
  failedCourses?: Array<{ courseName: string; error: string }>
}) {
  const firstResult = input.syncedCourses[0]
  const hasQueuedOcr = input.queuedOcrJobIds.length > 0
  const failedCourses = input.failedCourses ?? []
  const hasFailures = failedCourses.length > 0

  return {
    courseCount: input.syncedCourses.length,
    courseNames: input.syncedCourses.map((course) => course.courseName),
    failedCourseCount: failedCourses.length,
    failedCourses,
    moduleIds: input.syncedCourses.map((course) => course.moduleId),
    queuedOcrJobIds: input.queuedOcrJobIds,
    queuedOcrJobCount: input.queuedOcrJobIds.length,
    href: firstResult?.href ?? '/courses',
    statusMessage: hasFailures
      ? `${input.syncedCourses.length} course${input.syncedCourses.length === 1 ? '' : 's'} synced. ${failedCourses.length} course${failedCourses.length === 1 ? '' : 's'} could not be loaded from Canvas.`
      : hasQueuedOcr
      ? 'Sync complete. Preparing scanned PDFs in the background.'
      : 'Canvas sync complete',
    currentStep: hasFailures ? 'done_with_warnings' : 'done',
  }
}
