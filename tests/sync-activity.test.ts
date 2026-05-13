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
  })

  assert.match(summary.lastFullManualSync?.detail ?? '', /full manual sync finished cleanly/i)
  assert.match(summary.lastBackgroundSync?.detail ?? '', /background sync finished with warnings/i)
  assert.equal(summary.lastBackgroundSync?.tone, 'warning')
  assert.match(summary.lastResourceRefresh?.detail ?? '', /refreshed with 3 source changes/i)
  assert.equal(summary.lastCanvasUpdate?.occurredAt, '2026-05-13T22:00:00.000Z')
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
  })

  assert.equal(summary.lastCanvasUpdate?.occurredAt, '2026-05-11T05:07:24.000Z')
  assert.equal(summary.lastBackgroundSync?.tone, 'warning')
})
