import type { TaskItem, TaskPlanningAnnotation } from '@/lib/types'

export function normalizeTaskPlanningAnnotation(value: string | null | undefined): TaskPlanningAnnotation {
  if (value === 'best_next_step' || value === 'needs_attention' || value === 'worth_reviewing') {
    return value
  }

  return 'none'
}

export function labelForTaskPlanningAnnotation(annotation: TaskPlanningAnnotation) {
  if (annotation === 'best_next_step') return 'Best next step'
  if (annotation === 'needs_attention') return 'Needs attention'
  if (annotation === 'worth_reviewing') return 'Worth reviewing'
  return 'None'
}

export function deriveTaskPlanningAnnotation(task: TaskItem): TaskPlanningAnnotation {
  if (task.status === 'completed') {
    return 'none'
  }

  if (task.planningAnnotation && task.planningAnnotation !== 'none') {
    return task.planningAnnotation
  }

  if (task.actionScore >= 70) {
    return 'needs_attention'
  }

  if (task.taskType === 'reading' || task.taskType === 'prep') {
    return 'worth_reviewing'
  }

  if (task.actionScore >= 36) {
    return 'needs_attention'
  }

  return 'none'
}
