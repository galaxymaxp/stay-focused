import type { CanvasAssignment } from '@/lib/canvas'
import { normalizeOptionalCanvasSyncText, normalizeRequiredCanvasSyncText } from '@/lib/canvas-sync'
import type { Priority, TaskItem } from '@/lib/types'

export interface CanvasTaskRefreshDraft {
  canvasAssignmentId: number
  title: string
  details: string | null
  deadline: string | null
  canvasUrl: string | null
  priority: Priority
  taskType: TaskItem['taskType']
  estimatedMinutes: number
  status: 'pending' | 'completed'
  completionOrigin: 'canvas' | null
  pointsPossible: number | null
}

export interface ExistingCanvasTaskSnapshot {
  id: string
  title: string
  details: string | null
  deadline: string | null
  canvasUrl: string | null
  status: 'pending' | 'completed'
  completionOrigin: 'manual' | 'canvas' | null
  priority: Priority
  taskType: TaskItem['taskType']
  estimatedMinutes: number
  canvasAssignmentId: number | null
}

export interface PreparedCanvasTaskRefreshRow {
  title: string
  details: string | null
  deadline: string | null
  canvas_url: string | null
  canvas_assignment_id: number
  status: 'pending' | 'completed'
  completion_origin: 'manual' | 'canvas' | null
  priority: Priority
  task_type: TaskItem['taskType']
  estimated_minutes: number
}

export function buildCanvasTaskRefreshDrafts(assignments: CanvasAssignment[]): CanvasTaskRefreshDraft[] {
  return assignments
    .filter((assignment) => typeof assignment.id === 'number' && assignment.id > 0)
    .map((assignment) => {
      const taskState = deriveCanvasAssignmentTaskState(assignment)
      return {
        canvasAssignmentId: assignment.id,
        title: normalizeRequiredCanvasSyncText(assignment.name, 'Canvas task'),
        details: normalizeOptionalCanvasSyncText(htmlToPlainText(assignment.description)),
        deadline: normalizeOptionalCanvasSyncText(assignment.due_at),
        canvasUrl: normalizeOptionalCanvasSyncText(assignment.html_url ?? assignment.url ?? null),
        priority: deriveAssignmentPriority(assignment),
        taskType: inferCanvasAssignmentTaskType(assignment),
        estimatedMinutes: deriveEstimatedMinutes(assignment),
        pointsPossible: typeof assignment.points_possible === 'number' ? assignment.points_possible : null,
        ...taskState,
      }
    })
}

export function prepareCanvasTaskRefreshRow(
  draft: CanvasTaskRefreshDraft,
  existing?: ExistingCanvasTaskSnapshot | null,
): PreparedCanvasTaskRefreshRow {
  const preserveManualCompletion = existing?.status === 'completed' && existing.completionOrigin === 'manual'
  const status = preserveManualCompletion ? 'completed' : draft.status
  const completionOrigin = status === 'completed'
    ? (preserveManualCompletion ? 'manual' : draft.completionOrigin)
    : null

  return {
    title: draft.title,
    details: draft.details,
    deadline: draft.deadline,
    canvas_url: draft.canvasUrl,
    canvas_assignment_id: draft.canvasAssignmentId,
    status,
    completion_origin: completionOrigin,
    priority: existing?.priority ?? draft.priority,
    task_type: existing?.taskType ?? draft.taskType,
    estimated_minutes: existing?.estimatedMinutes ?? draft.estimatedMinutes,
  }
}

export function hasCanvasTaskRefreshRowChanged(existing: ExistingCanvasTaskSnapshot, next: PreparedCanvasTaskRefreshRow) {
  return existing.title !== next.title
    || existing.details !== next.details
    || existing.deadline !== next.deadline
    || existing.canvasUrl !== next.canvas_url
    || existing.canvasAssignmentId !== next.canvas_assignment_id
    || existing.status !== next.status
    || existing.completionOrigin !== next.completion_origin
    || existing.priority !== next.priority
    || existing.taskType !== next.task_type
    || existing.estimatedMinutes !== next.estimated_minutes
}

function deriveCanvasAssignmentTaskState(assignment: Pick<CanvasAssignment, 'submission'>) {
  const submission = assignment.submission
  if (!submission || submission.missing) {
    return {
      status: 'pending' as const,
      completionOrigin: null,
    }
  }

  const workflowState = submission.workflow_state?.toLowerCase() ?? null
  const isCompleted = submission.excused
    || Boolean(submission.submitted_at)
    || workflowState === 'submitted'
    || workflowState === 'graded'
    || workflowState === 'pending_review'
    || (workflowState === 'unsubmitted' && submission.score !== null && submission.score !== undefined)
    || (workflowState === 'unsubmitted' && Boolean(submission.grade))

  return {
    status: isCompleted ? 'completed' as const : 'pending' as const,
    completionOrigin: isCompleted ? 'canvas' as const : null,
  }
}

function inferCanvasAssignmentTaskType(assignment: CanvasAssignment): TaskItem['taskType'] {
  const text = `${assignment.name} ${(assignment.submission_types ?? []).join(' ')}`.toLowerCase()
  if (/\bquiz|online_quiz\b/.test(text)) return 'quiz'
  if (/\bdiscussion|forum\b/.test(text)) return 'discussion'
  if (/\bproject|portfolio|presentation\b/.test(text)) return 'project'
  return 'assignment'
}

function deriveAssignmentPriority(assignment: CanvasAssignment): Priority {
  if (typeof assignment.points_possible === 'number') {
    if (assignment.points_possible >= 80) return 'high'
    if (assignment.points_possible <= 10) return 'low'
  }

  const dueAt = assignment.due_at ? new Date(assignment.due_at).getTime() : null
  if (dueAt && Number.isFinite(dueAt)) {
    const days = (dueAt - Date.now()) / (24 * 60 * 60 * 1000)
    if (days <= 3) return 'high'
    if (days > 21) return 'low'
  }

  return 'medium'
}

function deriveEstimatedMinutes(assignment: CanvasAssignment) {
  const taskType = inferCanvasAssignmentTaskType(assignment)
  if (taskType === 'quiz') return 35
  if (taskType === 'discussion') return 25
  if (taskType === 'project') return 90
  if (typeof assignment.points_possible === 'number' && assignment.points_possible >= 80) return 90
  return 45
}

function htmlToPlainText(value: string | null | undefined) {
  if (!value) return null
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
