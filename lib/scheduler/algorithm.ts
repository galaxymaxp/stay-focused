import type { GeneratedScheduledBlock, ScoredSchedulerItem, ScheduledBlockStatus, TimeWindow } from '@/lib/scheduler/types'

export function deriveScheduledBlockStatus(status: Exclude<ScheduledBlockStatus, 'missed'>, startAt: string, now = new Date()): ScheduledBlockStatus {
  if (status !== 'scheduled') return status
  return new Date(startAt).getTime() < now.getTime() ? 'missed' : 'scheduled'
}

export function generateSchedule(items: ScoredSchedulerItem[], window: TimeWindow): GeneratedScheduledBlock[] {
  const start = new Date(window.start).getTime()
  const end = new Date(window.end).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return []

  let cursor = start
  const blocks: GeneratedScheduledBlock[] = []
  const scheduled = new Set<string>()
  // Tracks which source group (T/M/D) already claimed each normalized title
  const scheduledTitleSources = new Map<string, string>()

  for (const item of [...items].sort((a, b) => b.schedulePriorityScore - a.schedulePriorityScore)) {
    const key = `${item.sourceTable}:${item.id}`
    if (scheduled.has(key)) continue

    const titleKey = `${getSourceGroupKey(item.sourceTable)}:${normalizeSourceTitle(item.title)}`
    const existingTable = scheduledTitleSources.get(titleKey)
    if (existingTable !== undefined && existingTable !== item.sourceTable) continue

    const durationMs = item.estimatedMinutes * 60_000
    if (cursor + durationMs > end) continue

    blocks.push({
      userId: item.userId,
      sourceTable: item.sourceTable,
      sourceId: item.id,
      sourceType: item.sourceTable,
      courseId: item.courseId ?? null,
      title: item.title,
      subtitle: item.subtitle ?? null,
      blockType: item.blockType,
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(cursor + durationMs).toISOString(),
      estimatedMinutes: item.estimatedMinutes,
      estimateConfidence: item.estimateConfidence,
      estimateReason: item.estimateReason,
      schedulePriorityScore: item.schedulePriorityScore,
      status: 'scheduled',
    })

    scheduled.add(key)
    if (existingTable === undefined) scheduledTitleSources.set(titleKey, item.sourceTable)
    cursor += durationMs
  }

  return blocks
}

function getSourceGroupKey(sourceTable: ScoredSchedulerItem['sourceTable']): string {
  if (sourceTable === 'task_items' || sourceTable === 'tasks' || sourceTable === 'deadlines') return 'T'
  if (sourceTable === 'drafts') return 'D'
  return 'M'
}

function normalizeSourceTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}
