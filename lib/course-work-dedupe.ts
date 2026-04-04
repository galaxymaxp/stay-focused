import type { AIResponse, Deadline, Task } from '@/lib/types'

export function dedupeDeadlinesForDisplay(tasks: Task[], deadlines: Deadline[]): Deadline[] {
  return deadlines.filter((deadline) => {
    return !tasks.some((task) => isMatchingCourseWork({
      taskTitle: task.title,
      taskDate: task.deadline,
      taskModuleId: task.module_id,
      deadlineTitle: deadline.label,
      deadlineDate: deadline.date,
      deadlineModuleId: deadline.module_id,
    }))
  })
}

export function dedupeAIResponseDeadlines(
  tasks: AIResponse['tasks'],
  deadlines: AIResponse['deadlines']
): AIResponse['deadlines'] {
  return deadlines.filter((deadline) => {
    return !tasks.some((task) => isMatchingCourseWork({
      taskTitle: task.title,
      taskDate: task.deadline,
      deadlineTitle: deadline.label,
      deadlineDate: deadline.date,
    }))
  })
}

function isMatchingCourseWork(input: {
  taskTitle: string
  taskDate: string | null
  deadlineTitle: string
  deadlineDate: string
  taskModuleId?: string
  deadlineModuleId?: string
}) {
  if (!input.taskDate) return false
  if (input.taskModuleId && input.deadlineModuleId && input.taskModuleId !== input.deadlineModuleId) return false
  if (toDateKey(input.taskDate) !== toDateKey(input.deadlineDate)) return false

  const taskIdentity = normalizeCourseWorkIdentity(input.taskTitle)
  const deadlineIdentity = normalizeCourseWorkIdentity(input.deadlineTitle)

  if (!taskIdentity || !deadlineIdentity) return false
  if (taskIdentity === deadlineIdentity) return true

  return taskIdentity.includes(deadlineIdentity) || deadlineIdentity.includes(taskIdentity)
}

function normalizeCourseWorkIdentity(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function toDateKey(value: string) {
  return value.slice(0, 10)
}
