import { normalizeTaskPlanningAnnotation } from '@/lib/task-planning'
import type { Course, LearningItem, Module, Priority, TaskItem, TaskStatus } from '@/lib/types'
import type { WorkspaceCourseRow, WorkspaceLearningItemRow, WorkspaceModuleRow, WorkspaceQueryResult, WorkspaceTaskItemRow } from '@/lib/workspace-queries'

export interface ClarityWorkspaceSourceData {
  courses: Course[]
  modules: Module[]
  learnItems: LearningItem[]
  taskItems: TaskItem[]
}

export function adaptSupabaseWorkspaceRows(rows: WorkspaceQueryResult): ClarityWorkspaceSourceData {
  const courses = rows.courses.map(adaptCourseRow)
  const courseMap = new Map(courses.map((course) => [course.id, course]))
  const modules = rows.modules.map(adaptModuleRow)
  const moduleMap = new Map(modules.map((module) => [module.id, module]))
  const learnItems = rows.learningItems.map((row) => adaptLearningItemRow(row, moduleMap))
  const taskItems = rows.taskItems.map((row) => adaptTaskItemRow(row, courseMap, moduleMap))

  return { courses, modules, learnItems, taskItems }
}

function adaptCourseRow(row: WorkspaceCourseRow): Course {
  return {
    id: row.id,
    code: row.code ?? 'COURSE',
    name: row.name ?? 'Untitled course',
    term: row.term ?? 'Current term',
    instructor: row.instructor ?? 'Course staff',
    focusLabel: row.focus_label ?? 'Synced course work',
    colorToken: normalizeColorToken(row.color_token),
  }
}

function adaptModuleRow(row: WorkspaceModuleRow): Module {
  return {
    id: row.id,
    courseId: row.course_id ?? undefined,
    title: row.title ?? 'Untitled module',
    raw_content: row.raw_content ?? '',
    summary: row.summary ?? null,
    concepts: row.concepts ?? [],
    study_prompts: row.study_prompts ?? [],
    recommended_order: row.recommended_order ?? [],
    status: normalizeModuleStatus(row.status),
    order: row.order ?? undefined,
    released_at: row.released_at ?? row.created_at ?? undefined,
    estimated_minutes: row.estimated_minutes ?? undefined,
    priority_signal: normalizePriority(row.priority_signal),
    showInLearn: row.show_in_learn ?? true,
    created_at: row.created_at ?? new Date().toISOString(),
  }
}

function adaptLearningItemRow(row: WorkspaceLearningItemRow, moduleMap: Map<string, Module>): LearningItem {
  const linkedModule = row.module_id ? moduleMap.get(row.module_id) : undefined

  return {
    id: row.id,
    courseId: row.course_id ?? linkedModule?.courseId ?? 'unknown-course',
    moduleId: row.module_id ?? linkedModule?.id ?? 'unknown-module',
    title: row.title ?? 'Learning item',
    body: row.body ?? '',
    type: normalizeLearningType(row.type),
    order: row.order ?? 0,
  }
}

function adaptTaskItemRow(
  row: WorkspaceTaskItemRow,
  courseMap: Map<string, Course>,
  moduleMap: Map<string, Module>,
): TaskItem {
  const linkedModule = row.module_id ? moduleMap.get(row.module_id) : undefined
  const course = row.course_id ? courseMap.get(row.course_id) : linkedModule?.courseId ? courseMap.get(linkedModule.courseId) : undefined
  const freshnessScore = getModuleFreshnessScoreFromModule(linkedModule)
  const priority = normalizePriority(row.priority) ?? 'medium'
  const status = normalizeTaskStatus(row.status)
  const deadline = row.deadline ?? null

  return {
    id: row.id,
    courseId: row.course_id ?? linkedModule?.courseId ?? 'unknown-course',
    courseName: course?.name ?? 'Course',
    moduleId: row.module_id ?? linkedModule?.id ?? 'unknown-module',
    moduleTitle: linkedModule?.title ?? 'Module',
    title: row.title ?? 'Task item',
    details: row.details ?? null,
    status,
    priority,
    deadline,
    taskType: normalizeTaskType(row.task_type),
    estimatedMinutes: row.estimated_minutes ?? 20,
    extractedFrom: row.extracted_from ?? linkedModule?.title ?? 'Task source',
    canvasUrl: row.canvas_url ?? null,
    completionOrigin: row.completion_origin === 'manual' || row.completion_origin === 'canvas'
      ? row.completion_origin
      : null,
    planningAnnotation: normalizeTaskPlanningAnnotation(row.planning_annotation),
    moduleFreshnessScore: freshnessScore,
    actionScore: computeActionScore(priority, deadline, status, freshnessScore),
  }
}

function getModuleFreshnessScoreFromModule(module: Module | undefined) {
  if (!module) return 4
  return getModuleFreshnessScore(module, new Date())
}

function getModuleFreshnessScore(module: Module, now = new Date()) {
  const daysSinceRelease = Math.max(0, Math.floor((now.getTime() - new Date(module.released_at ?? module.created_at).getTime()) / (1000 * 60 * 60 * 24)))
  if (daysSinceRelease <= 1) return 28
  if (daysSinceRelease <= 3) return 20
  if (daysSinceRelease <= 5) return 12
  return 4
}

function computeActionScore(priority: Priority, deadline: string | null, status: TaskStatus, freshnessScore: number) {
  if (status === 'completed') return -20
  const priorityScore = priority === 'high' ? 34 : priority === 'medium' ? 21 : 10
  const daysUntil = getDaysUntil(deadline)
  const timingScore = daysUntil === null ? 6 : daysUntil < 0 ? 42 : daysUntil === 0 ? 36 : daysUntil === 1 ? 28 : daysUntil <= 3 ? 18 : daysUntil <= 7 ? 9 : 3
  return priorityScore + timingScore + Math.round(freshnessScore / 2)
}

function getDaysUntil(value: string | null) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function normalizePriority(value: string | null | undefined): Priority | undefined {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return undefined
}

function normalizeTaskStatus(value: string | null | undefined): TaskStatus {
  return value === 'completed' ? 'completed' : 'pending'
}

function normalizeModuleStatus(value: string | null | undefined): Module['status'] {
  if (value === 'processed' || value === 'error') return value
  return 'pending'
}

function normalizeLearningType(value: string | null | undefined): LearningItem['type'] {
  if (value === 'summary' || value === 'concept' || value === 'connection' || value === 'review') return value
  return 'summary'
}

function normalizeTaskType(value: string | null | undefined): TaskItem['taskType'] {
  if (value === 'assignment' || value === 'quiz' || value === 'reading' || value === 'prep' || value === 'discussion' || value === 'project') return value
  return 'assignment'
}

function normalizeColorToken(value: string | null | undefined): Course['colorToken'] {
  if (value === 'yellow' || value === 'orange' || value === 'blue' || value === 'green') return value
  return 'yellow'
}
