import assert from 'node:assert/strict'
import test from 'node:test'
import { getStatusSummary } from '../lib/sync-courses-status'
import { buildSyncActivitySummary } from '../lib/sync-activity'

test('sync courses status does not say no task refresh after a recorded task refresh', () => {
  const syncActivity = buildSyncActivitySummary({
    queueRows: [],
    resourceRefreshRows: [
      {
        status: 'completed',
        detail: 'Resource refresh completed.',
        created_at: '2026-05-18T09:00:00.000Z',
      },
    ],
    taskRefreshRows: [
      {
        status: 'completed',
        detail: 'Task refresh completed.',
        metadata: { tasksInserted: 1, tasksUpdated: 2 },
        warnings: [],
        created_at: '2026-05-18T10:00:00.000Z',
      },
    ],
  })

  const status = getStatusSummary({
    isLoadingCourses: false,
    isCanvasJobActive: false,
    courseLoadError: null,
    syncActivity,
    hasSyncedCourses: true,
  })

  assert.notEqual(status.detail, 'No task refresh has run yet for this account.')
  assert.equal(status.title, 'Updated')
})

test('sync courses status shows warning state for warning task refreshes', () => {
  const syncActivity = buildSyncActivitySummary({
    queueRows: [],
    resourceRefreshRows: [
      {
        status: 'completed',
        detail: 'Resource refresh completed.',
        created_at: '2026-05-18T09:00:00.000Z',
      },
    ],
    taskRefreshRows: [
      {
        status: 'warning',
        detail: 'Task refresh completed with warnings.',
        metadata: { tasksInserted: 1, tasksUpdated: 0 },
        warnings: ['Canvas could not verify that access token.'],
        created_at: '2026-05-18T10:00:00.000Z',
      },
    ],
  })

  const status = getStatusSummary({
    isLoadingCourses: false,
    isCanvasJobActive: false,
    courseLoadError: null,
    syncActivity,
    hasSyncedCourses: true,
  })

  assert.equal(status.title, 'Needs review')
  assert.match(status.detail, /warnings/i)
})

test('sync courses status shows needs attention for failed task refreshes', () => {
  const syncActivity = buildSyncActivitySummary({
    queueRows: [],
    resourceRefreshRows: [],
    taskRefreshRows: [
      {
        status: 'failed',
        detail: 'Task refresh failed.',
        metadata: {},
        warnings: ['failed'],
        created_at: '2026-05-18T10:00:00.000Z',
      },
    ],
  })

  const status = getStatusSummary({
    isLoadingCourses: false,
    isCanvasJobActive: false,
    courseLoadError: null,
    syncActivity,
    hasSyncedCourses: true,
  })

  assert.equal(status.title, 'Needs attention')
  assert.match(status.detail, /could not finish/i)
})
