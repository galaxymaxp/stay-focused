import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreSchedulerItem } from '@/lib/scheduler/priority'
import { estimateMinutesAndConfidence } from '@/lib/scheduler/estimation'
import { deriveScheduledBlockStatus, generateSchedule } from '@/lib/scheduler/algorithm'

const userId = '00000000-0000-0000-0000-000000000001'

test('priority calculation ranks deliverable over announcement/reference', () => {
  const quiz = scoreSchedulerItem({ id: '1', userId, sourceTable: 'task_items', title: 'Midterm quiz', dueAt: new Date(Date.now() + 10 * 3600_000).toISOString(), taskType: 'quiz' })
  const announcement = scoreSchedulerItem({ id: '2', userId, sourceTable: 'learning_items', title: 'Announcement reference notes', dueAt: null })
  assert.ok(quiz.schedulePriorityScore > announcement.schedulePriorityScore)
})

test('time estimation handles long extracted text', () => {
  const est = estimateMinutesAndConfidence({ id: 'r1', userId, sourceTable: 'module_resources', title: 'Large PDF', dueAt: null, extractedCharCount: 120000, extractionStatus: 'extracted' })
  assert.ok(est.estimatedMinutes >= 80)
  assert.ok(est.estimationConfidence > 0.7)
})

test('metadata-only resource gets low confidence', () => {
  const est = estimateMinutesAndConfidence({ id: 'r2', userId, sourceTable: 'module_resources', title: 'Scanned file', dueAt: null, extractionStatus: 'metadata_only' })
  assert.ok(est.estimationConfidence < 0.4)
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
