export interface SyncedCanvasCourseSummary {
  courseName: string
  moduleId: string
  href: string
}

export function buildCanvasSyncCompletionResult(input: {
  syncedCourses: SyncedCanvasCourseSummary[]
  queuedOcrJobIds: string[]
}) {
  const firstResult = input.syncedCourses[0]
  const hasQueuedOcr = input.queuedOcrJobIds.length > 0

  return {
    courseCount: input.syncedCourses.length,
    courseNames: input.syncedCourses.map((course) => course.courseName),
    moduleIds: input.syncedCourses.map((course) => course.moduleId),
    queuedOcrJobIds: input.queuedOcrJobIds,
    queuedOcrJobCount: input.queuedOcrJobIds.length,
    href: firstResult?.href ?? '/courses',
    statusMessage: hasQueuedOcr
      ? 'Sync complete. Preparing scanned PDFs in the background.'
      : 'Canvas sync complete',
    currentStep: 'done',
  }
}
