export type ModuleStatus = 'pending' | 'processed' | 'error'
export type TaskStatus = 'pending' | 'completed'
export type TaskCompletionOrigin = 'manual' | 'canvas'
export type TaskPlanningAnnotation = 'best_next_step' | 'needs_attention' | 'worth_reviewing' | 'none'
export type Priority = 'high' | 'medium' | 'low'
export type ModuleResourceExtractionStatus = 'pending' | 'extracted' | 'metadata_only' | 'unsupported' | 'empty' | 'failed'
export type ModuleResourceCapability = 'supported' | 'partial' | 'unsupported' | 'failed'
export type ModuleResourceQuality = 'strong' | 'usable' | 'weak' | 'empty' | 'unsupported' | 'failed'
export type ModuleResourceGroundingLevel = 'strong' | 'weak' | 'none'
export type StudyFileProgressStatus = 'not_started' | 'skimmed' | 'reviewed'
export type ModuleResourceWorkflowOverride = 'study' | 'activity'
export type ModuleTermStatus = 'approved' | 'rejected'
export type ModuleTermOrigin = 'ai' | 'user'
export type DeepLearnNoteStatus = 'pending' | 'ready' | 'failed'
export type DeepLearnTermImportance = 'high' | 'medium' | 'low'
export type DeepLearnGroundingStrategy = 'stored_extract' | 'source_refetch' | 'context_only' | 'insufficient'
export type DeepLearnNoteLoadAvailability = 'available' | 'unavailable'
export type DeepLearnNoteLoadReason =
  | 'ok'
  | 'not_configured'
  | 'unauthenticated'
  | 'table_missing'
  | 'column_missing'
  | 'permission_denied'
  | 'query_failed'

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

export interface DeepLearnNoteSection {
  heading: string
  body: string
}

export interface DeepLearnCoreTerm {
  term: string
  explanation: string
  importance: DeepLearnTermImportance
  preserveExactTerm: boolean
}

export interface DeepLearnDistinction {
  conceptA: string
  conceptB: string
  difference: string
}

export interface DeepLearnSourceGrounding {
  sourceType: string | null
  extractionQuality: string | null
  groundingStrategy: DeepLearnGroundingStrategy
  usedAiFallback: boolean
  qualityReason: string | null
  warning: string | null
  charCount: number
}

export interface DeepLearnNote {
  id: string
  userId: string
  moduleId: string
  courseId: string | null
  resourceId: string
  status: DeepLearnNoteStatus
  title: string
  overview: string
  sections: DeepLearnNoteSection[]
  noteBody: string
  coreTerms: DeepLearnCoreTerm[]
  keyFacts: string[]
  distinctions: DeepLearnDistinction[]
  likelyQuizPoints: string[]
  cautionNotes: string[]
  sourceGrounding: DeepLearnSourceGrounding
  quizReady: boolean
  promptVersion: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  generatedAt: string | null
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
  planningAnnotation?: TaskPlanningAnnotation
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
  completionOrigin?: TaskCompletionOrigin | null
  planningAnnotation: TaskPlanningAnnotation
  moduleFreshnessScore: number
  actionScore: number
}

export interface TodayItem {
  id: string
  kind: 'task' | 'learning' | 'module'
  taskItemId?: string | null
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
  planningAnnotation: TaskPlanningAnnotation
  planningAnnotationLabel: string
  recommendationScore: number
  href: string | null
  learnHref?: string | null
  actionLabel: string
  whyNow: string
  effortLabel: string | null
  completionStatus?: TaskStatus
  completionOrigin?: TaskCompletionOrigin | null
  canvasUrl?: string | null
}

export interface CalendarItem {
  id: string
  kind: 'task' | 'learning'
  taskItemId?: string | null
  moduleId?: string | null
  title: string
  courseName: string
  moduleTitle: string | null
  relatedText: string | null
  dateKey: string
  dateTime: string | null
  status: 'urgent' | 'dueSoon' | 'upcoming' | 'completed'
  completionStatus: TaskStatus
  completionOrigin?: TaskCompletionOrigin | null
  planningAnnotation: TaskPlanningAnnotation
  planningAnnotationLabel: string
  priority: Priority | null
  recommendationScore: number
  href: string | null
  canvasUrl?: string | null
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
