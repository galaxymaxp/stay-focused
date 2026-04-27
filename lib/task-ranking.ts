import type { Task } from '@/lib/types'

export function getDaysUntil(deadline: string | null): number | null {
  if (!deadline) return null
  return Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
}

export function getTaskScore(task: Task): number {
  if (task.status === 'completed') return -9999

  let score = 0

  const priorityPoints = {
    high: 35,
    medium: 20,
    low: 8,
  }

  score += priorityPoints[task.priority] ?? 0

  const daysUntil = getDaysUntil(task.deadline)

  if (daysUntil === null) return score
  if (daysUntil < 0) score += 50
  else if (daysUntil === 0) score += 40
  else if (daysUntil === 1) score += 32
  else if (daysUntil <= 3) score += 24
  else if (daysUntil <= 7) score += 14
  else if (daysUntil <= 14) score += 6

  return score
}

export function sortTasksByRecommendation(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const scoreDiff = getTaskScore(b) - getTaskScore(a)
    if (scoreDiff !== 0) return scoreDiff

    if (a.deadline && b.deadline) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    }

    if (a.deadline && !b.deadline) return -1
    if (!a.deadline && b.deadline) return 1

    return a.title.localeCompare(b.title)
  })
}

export function getTaskBucket(task: Task): 'urgent' | 'next' | 'later' {
  const score = getTaskScore(task)
  if (score >= 55) return 'urgent'
  if (score >= 25) return 'next'
  return 'later'
}