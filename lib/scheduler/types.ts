export type SchedulerSourceTable = 'task_items' | 'tasks' | 'deadlines' | 'modules' | 'module_resources' | 'learning_items'
export type ScheduledBlockStatus = 'scheduled' | 'opened' | 'completed' | 'skipped' | 'missed'

export interface SchedulerItem {
  id: string
  userId: string
  sourceTable: SchedulerSourceTable
  title: string
  dueAt: string | null
  resourceType?: string | null
  taskType?: string | null
  extractedCharCount?: number | null
  extractionStatus?: string | null
  estimatedMinutes?: number | null
  createdAt?: string | null
  releasedAt?: string | null
}

export interface ScoredSchedulerItem extends SchedulerItem {
  importanceScore: number
  urgencyScore: number
  difficultyScore: number
  freshnessScore: number
  schedulePriorityScore: number
  estimatedMinutes: number
  estimationConfidence: number
  scoringReason: string
  lastScoredAt: string
}

export interface TimeWindow {
  start: string
  end: string
}

export interface GeneratedScheduledBlock {
  userId: string
  sourceTable: SchedulerSourceTable
  sourceId: string
  title: string
  startAt: string
  endAt: string
  estimatedMinutes: number
  schedulePriorityScore: number
  status: Exclude<ScheduledBlockStatus, 'missed'>
}
