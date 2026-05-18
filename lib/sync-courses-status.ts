import type { SyncActivitySummary } from '@/lib/sync-activity'

export function getStatusSummary({
  isLoadingCourses,
  isCanvasJobActive,
  courseLoadError,
  syncActivity,
  hasSyncedCourses,
}: {
  isLoadingCourses: boolean
  isCanvasJobActive: boolean
  courseLoadError: string | null
  syncActivity: SyncActivitySummary
  hasSyncedCourses: boolean
}) {
  if (isCanvasJobActive) {
    return { title: 'Syncing', detail: 'Course content is updating in the background.', tone: 'neutral' as const }
  }
  if (isLoadingCourses) {
    return { title: 'Refreshing', detail: 'Reading your available Canvas courses.', tone: 'neutral' as const }
  }
  if (courseLoadError) {
    return { title: 'Needs sync', detail: 'Course list could not refresh. Try again from this page.', tone: 'warning' as const }
  }
  if (syncActivity.lastBackgroundSync?.tone === 'warning') {
    return { title: 'Needs review', detail: 'The latest background sync had warnings or missed part of the refresh path.', tone: 'warning' as const }
  }
  if (syncActivity.lastTaskRefresh && !syncActivity.lastTaskRefresh.successfulUpdate) {
    return { title: 'Needs attention', detail: 'Task refresh could not finish. Try reconnecting Canvas or run Refresh Courses.', tone: 'warning' as const }
  }
  if (hasSyncedCourses && !syncActivity.lastTaskRefresh) {
    return { title: 'Needs attention', detail: 'No task refresh has run yet for this account.', tone: 'warning' as const }
  }
  if (syncActivity.lastTaskRefresh?.tone === 'warning') {
    return { title: 'Needs review', detail: 'Task refresh completed with warnings.', tone: 'warning' as const }
  }
  if (hasSyncedCourses && !syncActivity.lastResourceRefresh) {
    return { title: 'Needs attention', detail: 'No resource refresh has run yet for this account.', tone: 'warning' as const }
  }
  if (syncActivity.lastCanvasUpdate?.tone === 'warning') {
    return { title: 'Needs review', detail: 'The latest Canvas update finished with warnings.', tone: 'warning' as const }
  }
  if (hasSyncedCourses) {
    return { title: 'Updated', detail: 'Synced courses are ready for planning.', tone: 'success' as const }
  }

  return { title: 'Ready', detail: 'Choose courses to bring into Stay Focused.', tone: 'neutral' as const }
}
