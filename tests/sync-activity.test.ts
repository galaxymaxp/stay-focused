import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSyncActivitySummary } from '../lib/sync-activity'

test('sync activity summary separates manual, background, and resource refresh timestamps honestly', () => {
  const summary = buildSyncActivitySummary({
    queueRows: [
      {
        status: 'completed',
        payload: { mode: 'selected_courses' },
        result: { currentStep: 'done' },
        error: null,
        created_at: '2026-05-11T05:00:00.000Z',
        completed_at: '2026-05-11T05:07:24.000Z',
      },
      {
        status: 'completed',
        payload: { mode: 'external_cron' },
        result: { currentStep: 'done_with_warnings', resourceRefreshWarning: 'Skipped during external cron to keep announcement sync responsive.' },
        error: null,
        created_at: '2026-05-13T21:20:00.000Z',
        completed_at: '2026-05-13T21:30:00.000Z',
      },
    ],
    resourceRefreshRows: [
      {
        status: 'completed',
        detail: 'Current Biology refreshed with 3 source changes.',
        created_at: '2026-05-13T22:00:00.000Z',
      },
    ],
    taskRefreshRows: [
      {
        status: 'completed',
        detail: 'Current Biology refreshed with 1 task change.',
        metadata: {
          tasksInserted: 1,
          tasksUpdated: 0,
        },
        created_at: '2026-05-13T22:15:00.000Z',
      },
    ],
  })

  assert.match(summary.lastFullManualSync?.detail ?? '', /full manual sync finished cleanly/i)
  assert.match(summary.lastBackgroundSync?.detail ?? '', /background sync finished with warnings/i)
  assert.equal(summary.lastBackgroundSync?.tone, 'warning')
  assert.match(summary.lastResourceRefresh?.detail ?? '', /refreshed with 3 source changes/i)
  assert.match(summary.lastTaskRefresh?.detail ?? '', /Found 1 new task and updated 0/i)
  assert.equal(summary.lastCanvasUpdate?.occurredAt, '2026-05-13T22:15:00.000Z')
})

test('last canvas update ignores failed background syncs when choosing latest successful update', () => {
  const summary = buildSyncActivitySummary({
    queueRows: [
      {
        status: 'failed',
        payload: { mode: 'external_cron' },
        result: { currentStep: 'failed' },
        error: 'Background sync failed',
        created_at: '2026-05-13T23:00:00.000Z',
        completed_at: '2026-05-13T23:05:00.000Z',
      },
      {
        status: 'completed',
        payload: { mode: 'selected_courses' },
        result: { currentStep: 'done' },
        error: null,
        created_at: '2026-05-11T05:00:00.000Z',
        completed_at: '2026-05-11T05:07:24.000Z',
      },
    ],
    resourceRefreshRows: [],
    taskRefreshRows: [],
  })

  assert.equal(summary.lastCanvasUpdate?.occurredAt, '2026-05-11T05:07:24.000Z')
  assert.equal(summary.lastBackgroundSync?.tone, 'warning')
})

test('background sync summary still recognizes external cron jobs when mode is only present in the completed result', () => {
  const summary = buildSyncActivitySummary({
    queueRows: [
      {
        status: 'completed',
        payload: {},
        result: {
          mode: 'external_cron',
          currentStep: 'done',
        },
        error: null,
        created_at: '2026-05-13T05:50:00.000Z',
        completed_at: '2026-05-13T05:58:47.000Z',
      },
    ],
    resourceRefreshRows: [],
    taskRefreshRows: [],
  })

  assert.equal(summary.lastBackgroundSync?.occurredAt, '2026-05-13T05:58:47.000Z')
  assert.match(summary.lastBackgroundSync?.detail ?? '', /background sync finished cleanly/i)
})

test('task refresh summary uses recorded metadata for latest task refresh state', () => {
  const summary = buildSyncActivitySummary({
    queueRows: [],
    resourceRefreshRows: [],
    taskRefreshRows: [
      {
        status: 'completed',
        detail: 'Synced courses refreshed with 19 task changes.',
        warnings: [],
        metadata: {
          usersChecked: 1,
          coursesChecked: 8,
          assignmentsChecked: 21,
          tasksInserted: 9,
          tasksUpdated: 10,
          tasksSkipped: 2,
        },
        course_id: null,
        created_at: '2026-05-18T10:00:00.000Z',
      },
    ],
  })

  assert.equal(summary.lastTaskRefresh?.occurredAt, '2026-05-18T10:00:00.000Z')
  assert.equal(summary.lastTaskRefresh?.tone, 'success')
  assert.match(summary.lastTaskRefresh?.detail ?? '', /Task refresh completed cleanly/i)
  assert.match(summary.lastTaskRefresh?.detail ?? '', /Found 9 new tasks and updated 10/i)
  assert.equal(summary.lastCanvasUpdate?.occurredAt, '2026-05-18T10:00:00.000Z')
})

test('task refresh warnings still count as a latest Canvas update with student-friendly copy', () => {
  const summary = buildSyncActivitySummary({
    queueRows: [],
    resourceRefreshRows: [],
    taskRefreshRows: [
      {
        status: 'warning',
        detail: 'Synced courses task refresh finished, but some items need review.',
        warnings: ['CC19: Canvas could not verify that access token. Double-check it and try again.'],
        metadata: {
          tasksInserted: 9,
          tasksUpdated: 10,
        },
        course_id: null,
        created_at: '2026-05-18T10:00:00.000Z',
      },
    ],
  })

  assert.equal(summary.lastTaskRefresh?.tone, 'warning')
  assert.equal(summary.lastTaskRefresh?.successfulUpdate, true)
  assert.match(summary.lastTaskRefresh?.detail ?? '', /completed with warnings/i)
  assert.match(summary.lastTaskRefresh?.detail ?? '', /One Canvas connection may need to be reconnected/i)
  assert.equal(summary.lastCanvasUpdate?.occurredAt, '2026-05-18T10:00:00.000Z')
})

test('failed task refresh is visible but not counted as a successful Canvas update', () => {
  const summary = buildSyncActivitySummary({
    queueRows: [],
    resourceRefreshRows: [],
    taskRefreshRows: [
      {
        status: 'failed',
        detail: 'Synced courses task refresh failed.',
        warnings: ['Canvas failed.'],
        metadata: {},
        course_id: null,
        created_at: '2026-05-18T10:00:00.000Z',
      },
    ],
  })

  assert.equal(summary.lastTaskRefresh?.tone, 'warning')
  assert.equal(summary.lastTaskRefresh?.successfulUpdate, false)
  assert.match(summary.lastTaskRefresh?.detail ?? '', /Task refresh could not finish/i)
  assert.equal(summary.lastCanvasUpdate, null)
})
