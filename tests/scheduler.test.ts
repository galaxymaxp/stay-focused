import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreSchedulerItem } from '@/lib/scheduler/priority'
import { estimateMinutesAndConfidence } from '@/lib/scheduler/estimation'
import { deriveScheduledBlockStatus, generateSchedule } from '@/lib/scheduler/algorithm'
import { formatDuration, formatTime, getWindowDurationMinutes, isBlockInsideWindow, minutesToTime, timeToMinutes } from '@/lib/scheduler/time'

const userId = '00000000-0000-0000-0000-000000000001'

test('priority calculation ranks deliverable over announcement/reference', () => {
  const quiz = scoreSchedulerItem({ id: '1', userId, sourceTable: 'task_items', title: 'Midterm quiz', dueAt: new Date(Date.now() + 10 * 3600_000).toISOString(), taskType: 'quiz' })
  const announcement = scoreSchedulerItem({ id: '2', userId, sourceTable: 'learning_items', title: 'Announcement reference notes', dueAt: null })
  assert.ok(quiz.schedulePriorityScore > announcement.schedulePriorityScore)
})

test('time estimation handles long extracted text', () => {
  const est = estimateMinutesAndConfidence({ id: 'r1', userId, sourceTable: 'module_resources', title: 'Large PDF', dueAt: null, extractedCharCount: 120000, extractionStatus: 'extracted' })
  assert.ok(est.estimatedMinutes >= 60)
  assert.ok(est.estimatedMinutes <= 90)
  assert.ok(est.estimationConfidence < 0.7)
  assert.equal(est.reason, 'Estimated from content length')
})

test('metadata-only resource gets low confidence', () => {
  const est = estimateMinutesAndConfidence({ id: 'r2', userId, sourceTable: 'module_resources', title: 'Scanned file', dueAt: null, extractionStatus: 'metadata_only' })
  assert.ok(est.estimationConfidence < 0.4)
})

test('saved study outputs get stable student-facing estimates', () => {
  const pack = estimateMinutesAndConfidence({ id: 'p1', userId, sourceTable: 'deep_learn_notes', title: 'Data Organization pack', dueAt: null, quizReady: true })
  const draft = estimateMinutesAndConfidence({ id: 'd1', userId, sourceTable: 'drafts', title: 'Activity draft', dueAt: null, tokenCount: 6600 })

  assert.equal(pack.estimatedMinutes, 30)
  assert.equal(pack.reason, 'Estimated from saved study pack')
  assert.equal(draft.estimatedMinutes, 30)
  assert.equal(draft.reason, 'Estimated from saved draft')
})

test('schedule generation uses score ordering and fits time window', () => {
  const now = Date.now()
  const blocks = generateSchedule([
    scoreSchedulerItem({ id: 'a', userId, sourceTable: 'task_items', title: 'Project coding report', dueAt: new Date(now + 5 * 3600_000).toISOString(), taskType: 'project' }),
    scoreSchedulerItem({ id: 'b', userId, sourceTable: 'learning_items', title: 'Reference links', dueAt: null }),
  ], { start: new Date(now).toISOString(), end: new Date(now + 3 * 3600_000).toISOString() })

  assert.ok(blocks.length >= 1)
  assert.equal(blocks[0]?.sourceId, 'a')
})

test('schedule time helpers keep visible blocks inside the selected free-time window', () => {
  const inside = {
    startAt: '2026-04-30T05:45:00',
    endAt: '2026-04-30T06:30:00',
  }
  const outside = {
    startAt: '2026-04-30T14:00:00',
    endAt: '2026-04-30T14:45:00',
  }

  assert.equal(timeToMinutes('05:45'), 345)
  assert.equal(minutesToTime(525), '08:45')
  assert.equal(formatTime('05:45'), '5:45 AM')
  assert.equal(formatDuration(180), '3h')
  assert.equal(isBlockInsideWindow(inside, '05:45', '08:45'), true)
  assert.equal(isBlockInsideWindow(outside, '05:45', '08:45'), false)
})

test('schedule time helpers support overnight free-time windows', () => {
  const evening = {
    startAt: '2026-04-30T19:15:00',
    endAt: '2026-04-30T20:00:00',
  }
  const afterMidnight = {
    startAt: '2026-05-01T00:15:00',
    endAt: '2026-05-01T00:45:00',
  }
  const outside = {
    startAt: '2026-05-01T01:15:00',
    endAt: '2026-05-01T01:45:00',
  }

  assert.equal(getWindowDurationMinutes('19:00', '00:00'), 300)
  assert.equal(isBlockInsideWindow(evening, '19:00', '00:00'), true)
  assert.equal(isBlockInsideWindow(afterMidnight, '19:00', '01:00'), true)
  assert.equal(isBlockInsideWindow(outside, '19:00', '01:00'), false)
})

test('block status transition marks missed lazily for scheduled past blocks', () => {
  const past = new Date(Date.now() - 3600_000).toISOString()
  assert.equal(deriveScheduledBlockStatus('scheduled', past), 'missed')
  assert.equal(deriveScheduledBlockStatus('opened', past), 'opened')
})

test('regenerate preservation filter would keep non-scheduled statuses', () => {
  const statuses = ['scheduled', 'opened', 'completed', 'skipped'] as const
  const deletable = statuses.filter((s) => s === 'scheduled')
  assert.deepEqual(deletable, ['scheduled'])
})

test('cross-table title dedup produces only one block for same-group title', () => {
  const now = Date.now()
  const window = { start: new Date(now).toISOString(), end: new Date(now + 4 * 3600_000).toISOString() }
  // Same title exists in both task_items and tasks (cross-table)
  const blocks = generateSchedule([
    scoreSchedulerItem({ id: 'ti1', userId, sourceTable: 'task_items', title: 'Statistics midterm', dueAt: new Date(now + 2 * 3600_000).toISOString(), taskType: 'quiz' }),
    scoreSchedulerItem({ id: 't1', userId, sourceTable: 'tasks', title: 'Statistics midterm', dueAt: new Date(now + 2 * 3600_000).toISOString(), taskType: 'quiz' }),
  ], window)

  assert.equal(blocks.length, 1, 'cross-table duplicate should produce only one block')
})

test('same-table same-title items are both scheduled independently', () => {
  const now = Date.now()
  const window = { start: new Date(now).toISOString(), end: new Date(now + 6 * 3600_000).toISOString() }
  // Two different task_items with same title in same table — both should be scheduled
  const blocks = generateSchedule([
    scoreSchedulerItem({ id: 'ti2', userId, sourceTable: 'task_items', title: 'Reading chapter 1', dueAt: new Date(now + 2 * 3600_000).toISOString(), taskType: 'reading' }),
    scoreSchedulerItem({ id: 'ti3', userId, sourceTable: 'task_items', title: 'Reading chapter 1', dueAt: new Date(now + 3 * 3600_000).toISOString(), taskType: 'reading' }),
  ], window)

  assert.equal(blocks.length, 2, 'same-table items with same title should both be scheduled')
})

test('ready module_resource is included in generated schedule', () => {
  const now = Date.now()
  const window = { start: new Date(now).toISOString(), end: new Date(now + 3 * 3600_000).toISOString() }
  const blocks = generateSchedule([
    scoreSchedulerItem({ id: 'mr1', userId, sourceTable: 'module_resources', title: 'Week 3 slides PDF', dueAt: null, extractedCharCount: 8000, extractionStatus: 'extracted' }),
  ], window)

  assert.equal(blocks.length, 1, 'ready module_resource should appear in schedule')
  assert.equal(blocks[0]?.sourceTable, 'module_resources')
})
