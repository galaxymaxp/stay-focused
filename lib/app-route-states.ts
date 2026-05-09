export type AppRoutePageState = 'sync_first' | 'empty' | 'ready'

export function getCoursesPageState(input: {
  hasSyncedData: boolean
  summaryCount: number
}): AppRoutePageState {
  if (!input.hasSyncedData) return 'sync_first'
  if (input.summaryCount <= 0) return 'empty'
  return 'ready'
}

export function getCalendarPageState(input: {
  hasSyncedData: boolean
  scheduledCount: number
  undatedTaskCount: number
}): AppRoutePageState {
  if (!input.hasSyncedData) return 'sync_first'
  if (input.scheduledCount <= 0 && input.undatedTaskCount <= 0) return 'empty'
  return 'ready'
}
