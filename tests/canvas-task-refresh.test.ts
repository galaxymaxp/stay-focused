import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCanvasTaskRefreshDrafts,
  hasCanvasTaskRefreshRowChanged,
  prepareCanvasTaskRefreshRow,
} from '../lib/canvas-task-refresh'
import { buildTaskRefreshRunActivity } from '../lib/task-refresh-activity'
import type { CanvasAssignment } from '../lib/canvas'

test('background task refresh builds stable Canvas task drafts from assignments', () => {
  const assignments: CanvasAssignment[] = [{
    id: 33003,
    name: 'Assignment No. 3',
    description: '<p>Investigate and analyze a current security topic.</p>',
    due_at: '2026-05-22T10:00:00Z',
    html_url: 'https://canvas.example.edu/courses/1/assignments/33003',
    url: 'https://canvas.example.edu/api/v1/courses/1/assignments/33003',
    points_possible: 100,
    submission_types: ['online_upload'],
    submission: null,
  }]

  const drafts = buildCanvasTaskRefreshDrafts(assignments)

  assert.equal(drafts.length, 1)
  assert.equal(drafts[0]?.canvasAssignmentId, 33003)
  assert.equal(drafts[0]?.title, 'Assignment No. 3')
  assert.equal(drafts[0]?.details, 'Investigate and analyze a current security topic.')
  assert.equal(drafts[0]?.priority, 'high')
  assert.equal(drafts[0]?.taskType, 'assignment')
})

test('task refresh updates due dates while preserving manual completion', () => {
  const draft = buildCanvasTaskRefreshDrafts([{
    id: 42,
    name: 'Module Quiz',
    description: 'Complete the quiz.',
    due_at: '2026-05-25T12:00:00Z',
    html_url: 'https://canvas.example.edu/courses/1/assignments/42',
    url: null,
    points_possible: 10,
    submission_types: ['online_quiz'],
    submission: null,
  }])[0]!

  const prepared = prepareCanvasTaskRefreshRow(draft, {
    id: 'task-1',
    title: 'Old quiz title',
    details: 'Old details',
    deadline: '2026-05-20T12:00:00Z',
    canvasUrl: 'https://old.example/quiz',
    status: 'completed',
    completionOrigin: 'manual',
    priority: 'low',
    taskType: 'quiz',
    estimatedMinutes: 20,
    canvasAssignmentId: 42,
  })

  assert.equal(prepared.title, 'Module Quiz')
  assert.equal(prepared.deadline, '2026-05-25T12:00:00Z')
  assert.equal(prepared.status, 'completed')
  assert.equal(prepared.completion_origin, 'manual')
  assert.equal(prepared.priority, 'low')
  assert.equal(hasCanvasTaskRefreshRowChanged({
    id: 'task-1',
    title: 'Old quiz title',
    details: 'Old details',
    deadline: '2026-05-20T12:00:00Z',
    canvasUrl: 'https://old.example/quiz',
    status: 'completed',
    completionOrigin: 'manual',
    priority: 'low',
    taskType: 'quiz',
    estimatedMinutes: 20,
    canvasAssignmentId: 42,
  }, prepared), true)
})

test('task refresh cron records account-level successful activity metadata', () => {
  const activity = buildTaskRefreshRunActivity({
    userId: 'user-1',
    coursesChecked: 8,
    assignmentsChecked: 21,
    tasksInserted: 9,
    tasksUpdated: 10,
    tasksSkipped: 2,
    failures: 0,
    warnings: [],
  })

  assert.equal(activity.courseId, null)
  assert.equal(activity.status, 'completed')
  assert.equal(activity.metadata.assignmentsChecked, 21)
  assert.equal(activity.metadata.tasksInserted, 9)
  assert.equal(activity.metadata.tasksUpdated, 10)
})

test('task refresh cron records warning activity without treating the run as missing', () => {
  const activity = buildTaskRefreshRunActivity({
    userId: 'user-1',
    coursesChecked: 8,
    assignmentsChecked: 21,
    tasksInserted: 9,
    tasksUpdated: 10,
    tasksSkipped: 2,
    failures: 1,
    warnings: ['Canvas could not verify that access token.'],
  })

  assert.equal(activity.courseId, null)
  assert.equal(activity.status, 'warning')
  assert.equal(activity.metadata.warningsCount, 1)
})
