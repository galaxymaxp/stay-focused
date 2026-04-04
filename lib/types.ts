export type ModuleStatus = 'pending' | 'processed' | 'error'
export type TaskStatus = 'pending' | 'completed'
export type Priority = 'high' | 'medium' | 'low'

export interface Module {
  id: string
  title: string
  raw_content: string
  summary: string | null
  recommended_order: string[] | null
  status: ModuleStatus
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