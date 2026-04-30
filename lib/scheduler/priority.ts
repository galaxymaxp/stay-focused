import { estimateMinutesAndConfidence } from '@/lib/scheduler/estimation'
import type { ScoredSchedulerItem, SchedulerItem } from '@/lib/scheduler/types'

export function scoreSchedulerItem(item: SchedulerItem): ScoredSchedulerItem {
  const now = Date.now()
  const dueMs = item.dueAt ? new Date(item.dueAt).getTime() : null
  const hoursUntil = dueMs ? (dueMs - now) / 36e5 : null

  const urgencyScore = hoursUntil === null ? 25 : hoursUntil < 0 ? 100 : hoursUntil <= 24 ? 92 : hoursUntil <= 72 ? 78 : hoursUntil <= 168 ? 55 : 30

  const importanceScore = item.taskType === 'quiz' || item.taskType === 'project'
    ? 88
    : /announcement|reference/i.test(item.title)
      ? 18
      : 62

  const difficultyScore = item.taskType === 'project' || /coding|report|implementation|lab/i.test(item.title) ? 78 : 48

  const createdAnchor = item.releasedAt ?? item.createdAt
  const ageDays = createdAnchor ? Math.max(0, Math.floor((now - new Date(createdAnchor).getTime()) / 86400000)) : 14
  const freshnessScore = ageDays <= 1 ? 90 : ageDays <= 3 ? 72 : ageDays <= 7 ? 48 : 22

  const estimate = estimateMinutesAndConfidence(item)
  const schedulePriorityScore = Number((importanceScore * 0.35 + urgencyScore * 0.45 + difficultyScore * 0.1 + freshnessScore * 0.1).toFixed(2))

  return {
    ...item,
    importanceScore,
    urgencyScore,
    difficultyScore,
    freshnessScore,
    schedulePriorityScore,
    estimatedMinutes: estimate.estimatedMinutes,
    estimationConfidence: estimate.estimationConfidence,
    scoringReason: estimate.reason,
    lastScoredAt: new Date().toISOString(),
  }
}
