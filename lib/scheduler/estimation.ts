import type { SchedulerItem } from '@/lib/scheduler/types'

export function estimateMinutesAndConfidence(item: SchedulerItem): { estimatedMinutes: number, estimationConfidence: number, reason: string } {
  if (item.estimatedMinutes && item.estimatedMinutes > 0) {
    return { estimatedMinutes: item.estimatedMinutes, estimationConfidence: 0.9, reason: 'existing estimate reused' }
  }

  const dueSoon = item.dueAt ? Math.ceil((new Date(item.dueAt).getTime() - Date.now()) / 36e5) <= 36 : false
  const overdue = item.dueAt ? new Date(item.dueAt).getTime() < Date.now() : false

  if (item.taskType === 'quiz') {
    const mins = dueSoon ? 75 : 50
    return { estimatedMinutes: mins, estimationConfidence: 0.82, reason: dueSoon ? 'quiz/exam due soon buffer' : 'quiz/exam default prep' }
  }

  if (item.taskType === 'project' || /coding|report|implementation|lab/i.test(item.title)) {
    return { estimatedMinutes: 95, estimationConfidence: 0.72, reason: 'coding/report workload baseline' }
  }

  if (item.sourceTable === 'module_resources') {
    const chars = item.extractedCharCount ?? 0
    if (chars > 0) {
      const mins = Math.max(20, Math.min(180, Math.round(chars / 1200)))
      return { estimatedMinutes: mins, estimationConfidence: 0.76, reason: 'text length-derived reading estimate' }
    }

    if (item.extractionStatus === 'metadata_only' || item.extractionStatus === 'unsupported' || item.extractionStatus === 'failed') {
      return { estimatedMinutes: 15, estimationConfidence: 0.28, reason: 'metadata-only/unreadable resource low confidence estimate' }
    }
  }

  if (item.sourceTable === 'modules' && !item.dueAt) {
    return { estimatedMinutes: 30, estimationConfidence: 0.55, reason: 'module without due date default review block' }
  }

  if (/announcement|reference/i.test(item.title)) {
    return { estimatedMinutes: 10, estimationConfidence: 0.6, reason: 'announcement/reference lightweight estimate' }
  }

  if (overdue) return { estimatedMinutes: 60, estimationConfidence: 0.75, reason: 'overdue assignment catch-up estimate' }
  return { estimatedMinutes: 35, estimationConfidence: 0.66, reason: 'general default estimate' }
}
