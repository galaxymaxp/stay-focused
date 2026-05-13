import { EXTERNAL_CANVAS_SYNC_MODE } from '@/lib/external-sync-queue'

export type SyncActivityTone = 'success' | 'neutral' | 'warning'

export interface SyncActivityCardSnapshot {
  title: string
  detail: string
  tone: SyncActivityTone
  occurredAt: string | null
  successfulUpdate: boolean
}

export interface QueueActivityRow {
  status: string | null
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  created_at: string | null
  completed_at: string | null
}

export interface ResourceRefreshActivityRow {
  status: string | null
  detail: string | null
  created_at: string | null
}

export interface SyncActivitySummary {
  lastCanvasUpdate: SyncActivityCardSnapshot | null
  lastFullManualSync: SyncActivityCardSnapshot | null
  lastBackgroundSync: SyncActivityCardSnapshot | null
  lastResourceRefresh: SyncActivityCardSnapshot | null
}

export function buildSyncActivitySummary(input: {
  queueRows: QueueActivityRow[]
  resourceRefreshRows: ResourceRefreshActivityRow[]
}): SyncActivitySummary {
  const manualSyncs = input.queueRows
    .filter((row) => getQueueMode(row) !== EXTERNAL_CANVAS_SYNC_MODE)
    .map((row) => toQueueSnapshot(row, 'manual'))
    .filter((row): row is SyncActivityCardSnapshot => Boolean(row))

  const backgroundSyncs = input.queueRows
    .filter((row) => getQueueMode(row) === EXTERNAL_CANVAS_SYNC_MODE)
    .map((row) => toQueueSnapshot(row, 'background'))
    .filter((row): row is SyncActivityCardSnapshot => Boolean(row))

  const resourceRefreshes = input.resourceRefreshRows
    .map(toResourceRefreshSnapshot)
    .filter((row): row is SyncActivityCardSnapshot => Boolean(row))

  const latestSuccessfulCandidates = [
    manualSyncs.find((row) => row.successfulUpdate) ?? null,
    backgroundSyncs.find((row) => row.successfulUpdate) ?? null,
    resourceRefreshes.find((row) => row.successfulUpdate) ?? null,
  ].filter((row): row is SyncActivityCardSnapshot => row !== null && Boolean(row.occurredAt))

  const lastCanvasUpdate = latestSuccessfulCandidates.sort(compareSnapshotsByTimeDesc)[0] ?? null

  return {
    lastCanvasUpdate,
    lastFullManualSync: manualSyncs[0] ?? null,
    lastBackgroundSync: backgroundSyncs[0] ?? null,
    lastResourceRefresh: resourceRefreshes[0] ?? null,
  }
}

function toQueueSnapshot(row: QueueActivityRow, source: 'manual' | 'background'): SyncActivityCardSnapshot | null {
  const occurredAt = row.completed_at ?? row.created_at ?? null
  if (!occurredAt) return null

  const status = row.status ?? 'pending'
  const warning = hasQueueWarnings(row)
  const title = formatActivityTime(occurredAt)

  if (status === 'failed' || status === 'cancelled') {
    return {
      title,
      detail: source === 'manual'
        ? 'The last full manual sync did not finish cleanly.'
        : 'The last background sync did not finish cleanly.',
      tone: 'warning',
      occurredAt,
      successfulUpdate: false,
    }
  }

  if (status !== 'completed') {
    return {
      title,
      detail: source === 'manual'
        ? 'A full manual sync started here.'
        : 'A background sync started here.',
      tone: 'neutral',
      occurredAt,
      successfulUpdate: false,
    }
  }

  return {
    title,
    detail: source === 'manual'
      ? warning
        ? 'The last full manual sync finished with warnings.'
        : 'The last full manual sync finished cleanly.'
      : warning
        ? 'The last background sync finished with warnings.'
        : 'The last background sync finished cleanly.',
    tone: warning ? 'warning' : 'success',
    occurredAt,
    successfulUpdate: true,
  }
}

function toResourceRefreshSnapshot(row: ResourceRefreshActivityRow): SyncActivityCardSnapshot | null {
  if (!row.created_at) return null

  const tone = row.status === 'failed'
    ? 'warning'
    : row.status === 'warning'
      ? 'warning'
      : 'success'

  return {
    title: formatActivityTime(row.created_at),
    detail: row.detail?.trim() || 'A resource refresh ran for one of your synced courses.',
    tone,
    occurredAt: row.created_at,
    successfulUpdate: row.status === 'completed' || row.status === 'warning',
  }
}

function hasQueueWarnings(row: QueueActivityRow) {
  const result = row.result ?? {}
  const currentStep = typeof result.currentStep === 'string' ? result.currentStep : null
  const failedCourseCount = typeof result.failedCourseCount === 'number' ? result.failedCourseCount : 0
  const resourceRefreshWarning = typeof result.resourceRefreshWarning === 'string' ? result.resourceRefreshWarning.trim() : ''
  const taskRefreshWarning = typeof result.taskRefreshWarning === 'string' ? result.taskRefreshWarning.trim() : ''
  return currentStep === 'done_with_warnings'
    || failedCourseCount > 0
    || resourceRefreshWarning.length > 0
    || taskRefreshWarning.length > 0
}

function getQueueMode(row: QueueActivityRow) {
  const value = row.payload?.mode
  return typeof value === 'string' ? value : null
}

function compareSnapshotsByTimeDesc(left: SyncActivityCardSnapshot, right: SyncActivityCardSnapshot) {
  const leftTime = left.occurredAt ? new Date(left.occurredAt).getTime() : 0
  const rightTime = right.occurredAt ? new Date(right.occurredAt).getTime() : 0
  return rightTime - leftTime
}

function formatActivityTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return date.toLocaleString()
}
