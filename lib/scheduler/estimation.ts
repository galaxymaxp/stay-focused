import type { SchedulerItem } from '@/lib/scheduler/types'

export function estimateMinutesAndConfidence(item: SchedulerItem): { estimatedMinutes: number, estimationConfidence: number, reason: string } {
  if (item.estimatedMinutes && item.estimatedMinutes > 0) {
    return { estimatedMinutes: clampMinutes(item.estimatedMinutes, 10, 120), estimationConfidence: 0.7, reason: 'Adjusted by you' }
  }

  const dueSoon = item.dueAt ? Math.ceil((new Date(item.dueAt).getTime() - Date.now()) / 36e5) <= 36 : false
  const overdue = item.dueAt ? new Date(item.dueAt).getTime() < Date.now() : false
  const normalizedTaskType = item.taskType?.toLowerCase() ?? ''
  const title = item.title.toLowerCase()

  if (item.sourceTable === 'deep_learn_notes') {
    return {
      estimatedMinutes: item.quizReady ? 30 : 25,
      estimationConfidence: 0.68,
      reason: 'Estimated from saved study pack',
    }
  }

  if (item.sourceTable === 'drafts') {
    const tokenBasedMinutes = item.tokenCount && item.tokenCount > 0
      ? clampMinutes(Math.round(item.tokenCount / 220), 20, 75)
      : 30
    return {
      estimatedMinutes: tokenBasedMinutes,
      estimationConfidence: item.tokenCount && item.tokenCount > 0 ? 0.64 : 0.52,
      reason: 'Estimated from saved draft',
    }
  }

  if (normalizedTaskType === 'quiz' || /\bquiz|exam|test|practice\b/i.test(item.title)) {
    const mins = dueSoon ? 40 : 30
    return { estimatedMinutes: mins, estimationConfidence: 0.55, reason: 'Estimated from quiz/review type' }
  }

  if (normalizedTaskType === 'project' || /draft|essay|paper|report|writing|write|coding|implementation|lab/i.test(item.title)) {
    const mins = /draft|essay|paper|report|writing|write/i.test(item.title) ? 75 : 60
    return { estimatedMinutes: mins, estimationConfidence: 0.52, reason: 'Estimated from task type' }
  }

  if (item.sourceTable === 'module_resources') {
    const chars = item.extractedCharCount ?? 0
    if (chars > 0) {
      const mins = clampMinutes(Math.round(chars / 1800), 20, 90)
      return { estimatedMinutes: mins, estimationConfidence: 0.62, reason: 'Estimated from content length' }
    }

    if (item.extractionStatus === 'metadata_only' || item.extractionStatus === 'unsupported' || item.extractionStatus === 'failed') {
      return { estimatedMinutes: 30, estimationConfidence: 0.22, reason: 'Estimated from material fallback' }
    }

    return { estimatedMinutes: 30, estimationConfidence: 0.35, reason: 'Estimated from material fallback' }
  }

  if (item.sourceTable === 'modules' && !item.dueAt) {
    return { estimatedMinutes: 30, estimationConfidence: 0.4, reason: 'Estimated from module review' }
  }

  if (item.sourceTable === 'learning_items') {
    return { estimatedMinutes: 25, estimationConfidence: 0.42, reason: 'Estimated review practice block' }
  }

  if (/announcement|reference/i.test(title)) {
    return { estimatedMinutes: 15, estimationConfidence: 0.35, reason: 'Estimated lightweight review' }
  }

  if (overdue) return { estimatedMinutes: 35, estimationConfidence: 0.45, reason: 'Estimated overdue catch-up block' }
  if (normalizedTaskType === 'reading' || normalizedTaskType === 'prep') return { estimatedMinutes: 30, estimationConfidence: 0.4, reason: 'Estimated from task type' }
  return { estimatedMinutes: 20, estimationConfidence: 0.35, reason: 'Estimated from workload and urgency' }
}

function clampMinutes(minutes: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(minutes)))
}
