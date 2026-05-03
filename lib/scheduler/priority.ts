import { estimateMinutesAndConfidence } from '@/lib/scheduler/estimation'
import type { SchedulerBlockType, SchedulerEstimateConfidence, ScoredSchedulerItem, SchedulerItem } from '@/lib/scheduler/types'

export function scoreSchedulerItem(item: SchedulerItem): ScoredSchedulerItem {
  const now = Date.now()
  const dueMs = item.dueAt ? new Date(item.dueAt).getTime() : null
  const hoursUntil = dueMs ? (dueMs - now) / 36e5 : null

  const urgencyScore = hoursUntil === null ? 25 : hoursUntil < 0 ? 100 : hoursUntil <= 24 ? 92 : hoursUntil <= 72 ? 78 : hoursUntil <= 168 ? 55 : 30

  const importanceScore = item.taskType === 'quiz' || item.taskType === 'project'
    ? 88
    : item.sourceTable === 'deep_learn_notes' || item.sourceTable === 'drafts'
      ? 70
    : /announcement|reference/i.test(item.title)
      ? 18
      : 62

  const difficultyScore = item.taskType === 'project' || /coding|report|implementation|lab/i.test(item.title) ? 78 : 48

  const createdAnchor = item.releasedAt ?? item.createdAt
  const ageDays = createdAnchor ? Math.max(0, Math.floor((now - new Date(createdAnchor).getTime()) / 86400000)) : 14
  const freshnessScore = ageDays <= 1 ? 90 : ageDays <= 3 ? 72 : ageDays <= 7 ? 48 : 22

  const estimate = estimateMinutesAndConfidence(item)
  const blockType = deriveBlockType(item)
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
    estimateConfidence: confidenceLabel(estimate.estimationConfidence),
    estimateReason: estimate.reason,
    blockType,
    scoringReason: estimate.reason,
    lastScoredAt: new Date().toISOString(),
  }
}

export function deriveBlockType(item: SchedulerItem): SchedulerBlockType {
  const taskType = item.taskType?.toLowerCase() ?? ''
  const title = item.title.toLowerCase()
  if (taskType === 'quiz' || /\bquiz|exam|test practice\b/i.test(item.title)) return 'quiz_practice'
  if (item.sourceTable === 'deep_learn_notes') return 'quiz_practice'
  if (item.sourceTable === 'drafts') return item.taskType === 'project' ? 'drafting' : 'learning_material'
  if (item.sourceTable === 'modules') return 'module_review'
  if (item.sourceTable === 'module_resources') {
    if (/\bread|chapter|article|pdf|slides?\b/i.test(item.title) || item.resourceType?.toLowerCase().includes('file')) return 'reading'
    return 'learning_material'
  }
  if (item.sourceTable === 'learning_items') return item.taskType === 'quiz' ? 'quiz_practice' : 'learning_material'
  if (taskType === 'reading' || taskType === 'prep') return 'reading'
  if (taskType === 'project' || /draft|essay|paper|report|write|writing/i.test(title)) return 'drafting'
  return 'assignment'
}

function confidenceLabel(value: number): SchedulerEstimateConfidence {
  if (value >= 0.7) return 'high'
  if (value >= 0.5) return 'medium'
  return 'low'
}
