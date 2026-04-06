export type ModuleStatus = 'pending' | 'processed' | 'error'
export type TaskStatus = 'pending' | 'completed'
export type TaskCompletionOrigin = 'manual' | 'canvas'
export type Priority = 'high' | 'medium' | 'low'
export type ModuleResourceExtractionStatus = 'pending' | 'extracted' | 'metadata_only' | 'unsupported' | 'empty' | 'failed'
export type StudyFileProgressStatus = 'not_started' | 'skimmed' | 'reviewed'
export type ModuleResourceWorkflowOverride = 'study' | 'activity'
export type ModuleTermStatus = 'approved' | 'rejected'
export type ModuleTermOrigin = 'ai' | 'user'

export interface Course {
  id: string
  code: string
  name: string
  term: string
  instructor: string
  focusLabel: string
  colorToken: 'yellow' | 'orange' | 'blue' | 'green'
}

export interface Module {
  id: string
  courseId?: string
  title: string
  raw_content: string
  summary: string | null
  concepts?: string[]
  study_prompts?: string[]
  recommended_order: string[] | null
  status: ModuleStatus
  order?: number
  released_at?: string
  estimated_minutes?: number
  priority_signal?: Priority
  showInLearn?: boolean
  created_at: string
}

export interface ModuleResource {
  id: string
  moduleId: string
  courseId: string | null
  canvasModuleId: number | null
  canvasItemId: number | null
  canvasFileId: number | null
  title: string
  resourceType: string
  contentType: string | null
  extension: string | null
  sourceUrl: string | null
  htmlUrl: string | null
  extractionStatus: ModuleResourceExtractionStatus
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  required: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface ModuleResourceStudyState {
  moduleId: string
  resourceId: string
  studyProgressStatus: StudyFileProgressStatus
  workflowOverride: ModuleResourceWorkflowOverride
  lastOpenedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ModuleTerm {
  id: string
  moduleId: string
  resourceId: string | null
  normalizedTerm: string
  term: string
  definition: string | null
  explanation: string | null
  evidenceSnippet: string | null
  sourceLabel: string | null
  status: ModuleTermStatus
  origin: ModuleTermOrigin
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  module_id: string
  canvasAssignmentId?: number | null
  title: string
  details: string | null
  deadline: string | null  // ISO date string, null if not found
  canvasUrl?: string | null
  priority: Priority
  status: TaskStatus
  completionOrigin?: TaskCompletionOrigin | null
  created_at: string
}

export interface Deadline {
  id: string
  module_id: string
  label: string
  date: string  // ISO date string
  created_at: string
}

export interface LearningItem {
  id: string
  courseId: string
  moduleId: string
  title: string
  body: string
  type: 'summary' | 'concept' | 'connection' | 'review'
  order: number
}

export interface TaskItem {
  id: string
  courseId: string
  courseName: string
  moduleId: string
  moduleTitle: string
  title: string
  details: string | null
  status: TaskStatus
  priority: Priority
  deadline: string | null
  taskType: 'assignment' | 'quiz' | 'reading' | 'prep' | 'discussion' | 'project'
  estimatedMinutes: number
  extractedFrom: string
  canvasUrl?: string | null
  moduleFreshnessScore: number
  actionScore: number
}

export interface TodayItem {
  id: string
  kind: 'task' | 'learning' | 'module'
  title: string
  courseId: string
  courseName: string
  moduleId: string
  moduleTitle: string
  supportingText: string | null
  dateTime: string | null
  priority: Priority | null
  tone: 'attention' | 'review' | 'upcoming'
  toneLabel: string
  recommendationScore: number
  href: string | null
  actionLabel: string
  whyNow: string
  effortLabel: string | null
  completionStatus?: TaskStatus
}

export interface CalendarItem {
  id: string
  kind: 'task' | 'learning'
  title: string
  courseName: string
  moduleTitle: string | null
  relatedText: string | null
  dateKey: string
  dateTime: string | null
  status: 'urgent' | 'dueSoon' | 'upcoming' | 'completed'
  completionStatus: TaskStatus
  priority: Priority | null
  recommendationScore: number
  href: string | null
}

// What we ask OpenAI to return
export interface AIResponse {
  title: string
  summary: string
  concepts: string[]
  study_prompts: string[]
  tasks: {
    title: string
    details: string | null
    deadline: string | null
    priority: Priority
    task_type?: TaskItem['taskType']
    estimated_minutes?: number
  }[]
  deadlines: {
    label: string
    date: string
  }[]
  recommended_order: string[]
}
