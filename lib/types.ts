export type ModuleStatus = 'pending' | 'processed' | 'error'
export type TaskStatus = 'pending' | 'completed'
export type Priority = 'high' | 'medium' | 'low'

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
  created_at: string
}

export interface Task {
  id: string
  module_id: string
  title: string
  details: string | null
  deadline: string | null  // ISO date string, null if not found
  priority: Priority
  status: TaskStatus
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
  tasks: {
    title: string
    details: string | null
    deadline: string | null
    priority: Priority
  }[]
  deadlines: {
    label: string
    date: string
  }[]
  recommended_order: string[]
}
