import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { supabase } from '@/lib/supabase'

export interface WorkspaceCourseRow {
  id: string
  code?: string | null
  name?: string | null
  term?: string | null
  instructor?: string | null
  focus_label?: string | null
  color_token?: string | null
}

export interface WorkspaceModuleRow {
  id: string
  course_id?: string | null
  title?: string | null
  raw_content?: string | null
  summary?: string | null
  concepts?: string[] | null
  study_prompts?: string[] | null
  recommended_order?: string[] | null
  status?: string | null
  order?: number | null
  released_at?: string | null
  estimated_minutes?: number | null
  priority_signal?: string | null
  show_in_learn?: boolean | null
  created_at?: string | null
}

export interface WorkspaceLearningItemRow {
  id: string
  course_id?: string | null
  module_id?: string | null
  title?: string | null
  body?: string | null
  type?: string | null
  order?: number | null
}

export interface WorkspaceTaskItemRow {
  id: string
  course_id?: string | null
  module_id?: string | null
  title?: string | null
  details?: string | null
  status?: string | null
  priority?: string | null
  deadline?: string | null
  task_type?: string | null
  estimated_minutes?: number | null
  extracted_from?: string | null
  canvas_url?: string | null
  completion_origin?: string | null
  planning_annotation?: string | null
}

export interface WorkspaceQueryResult {
  courses: WorkspaceCourseRow[]
  modules: WorkspaceModuleRow[]
  learningItems: WorkspaceLearningItemRow[]
  taskItems: WorkspaceTaskItemRow[]
}

export async function fetchWorkspaceRows(): Promise<WorkspaceQueryResult | null> {
  if (!supabase) return null
  const user = await getAuthenticatedUserServer()
  if (!user) {
    return {
      courses: [],
      modules: [],
      learningItems: [],
      taskItems: [],
    }
  }

  const { data: courseRows, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  if (courseError) return null

  const courses = (courseRows ?? []) as WorkspaceCourseRow[]
  if (courses.length === 0) {
    return {
      courses: [],
      modules: [],
      learningItems: [],
      taskItems: [],
    }
  }

  const ownedCourseIds = courses.map((course) => course.id)

  const [
    modulesResult,
    learningItemsResult,
    taskItemsResult,
  ] = await Promise.all([
    supabase.from('modules').select('*').in('course_id', ownedCourseIds).order('order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('learning_items').select('*').in('course_id', ownedCourseIds).order('order', { ascending: true }),
    supabase.from('task_items').select('*').in('course_id', ownedCourseIds).order('deadline', { ascending: true, nullsFirst: false }),
  ])

  if (modulesResult.error || learningItemsResult.error || taskItemsResult.error) {
    return null
  }

  return {
    courses,
    modules: (modulesResult.data ?? []) as WorkspaceModuleRow[],
    learningItems: (learningItemsResult.data ?? []) as WorkspaceLearningItemRow[],
    taskItems: (taskItemsResult.data ?? []) as WorkspaceTaskItemRow[],
  }
}
