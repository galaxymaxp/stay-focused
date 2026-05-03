export type SchedulerSourceTable = 'task_items' | 'tasks' | 'deadlines' | 'modules' | 'module_resources' | 'learning_items' | 'deep_learn_notes' | 'drafts'
export type ScheduledBlockStatus = 'scheduled' | 'opened' | 'completed' | 'skipped' | 'missed'
export type SchedulerBlockType = 'assignment' | 'learning_material' | 'module_review' | 'quiz_practice' | 'reading' | 'drafting' | 'break'
export type SchedulerEstimateConfidence = 'low' | 'medium' | 'high'

export interface SchedulerItem {
  id: string
  userId: string
  sourceTable: SchedulerSourceTable
  courseId?: string | null
  title: string
  subtitle?: string | null
  dueAt: string | null
  resourceType?: string | null
  taskType?: string | null
  extractedCharCount?: number | null
  extractionStatus?: string | null
  estimatedMinutes?: number | null
  tokenCount?: number | null
  quizReady?: boolean | null
  createdAt?: string | null
  releasedAt?: string | null
  updatedAt?: string | null
}

export interface ScoredSchedulerItem extends SchedulerItem {
  importanceScore: number
  urgencyScore: number
  difficultyScore: number
  freshnessScore: number
  schedulePriorityScore: number
  estimatedMinutes: number
  estimationConfidence: number
  estimateConfidence: SchedulerEstimateConfidence
  estimateReason: string
  blockType: SchedulerBlockType
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
  sourceType: SchedulerSourceTable
  courseId: string | null
  title: string
  subtitle: string | null
  blockType: SchedulerBlockType
  startAt: string
  endAt: string
  estimatedMinutes: number
  estimateConfidence: SchedulerEstimateConfidence
  estimateReason: string
  schedulePriorityScore: number
  status: Exclude<ScheduledBlockStatus, 'missed'>
}
