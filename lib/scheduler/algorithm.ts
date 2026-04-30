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

  for (const item of [...items].sort((a, b) => b.schedulePriorityScore - a.schedulePriorityScore)) {
    const durationMs = item.estimatedMinutes * 60_000
    if (cursor + durationMs > end) continue

    blocks.push({
      userId: item.userId,
      sourceTable: item.sourceTable,
      sourceId: item.id,
      title: item.title,
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(cursor + durationMs).toISOString(),
      estimatedMinutes: item.estimatedMinutes,
      schedulePriorityScore: item.schedulePriorityScore,
      status: 'scheduled',
    })

    cursor += durationMs
  }

  return blocks
}
