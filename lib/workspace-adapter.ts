import { seedCourses, seedModules } from '@/lib/mock-data'
import type { Course, LearningItem, Module, Priority, TaskItem, TaskStatus } from '@/lib/types'
import type { WorkspaceCourseRow, WorkspaceLearningItemRow, WorkspaceModuleRow, WorkspaceQueryResult, WorkspaceTaskItemRow } from '@/lib/workspace-queries'

export interface ClarityWorkspaceSourceData {
  courses: Course[]
  modules: Module[]
  learnItems: LearningItem[]
  taskItems: TaskItem[]
}

interface ParsedTaskSeed {
  title: string
  deadline: string | null
  priority: Priority
  status: TaskStatus
  estimatedMinutes: number
  details: string | null
  taskType: TaskItem['taskType']
}

interface ParsedModuleSource {
  summary: string
  concepts: string[]
  studyPrompts: string[]
  tasks: ParsedTaskSeed[]
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

export function buildSeedWorkspaceSource(now = new Date()): ClarityWorkspaceSourceData {
  const modules = seedModules.map((seed) => {
    const parsed = parseRawModuleContent(seed.rawContent, now)
    const createdAt = offsetDateTime(now, seed.releasedOffsetDays, 8)

    return {
      module: {
        id: seed.id,
        courseId: seed.courseId,
        title: seed.title,
        raw_content: seed.rawContent,
        summary: parsed.summary,
        concepts: parsed.concepts,
        study_prompts: parsed.studyPrompts,
        recommended_order: parsed.tasks.slice(0, 3).map((task) => task.title),
        status: 'processed' as const,
        order: seed.order,
        released_at: createdAt,
        estimated_minutes: seed.estimatedMinutes,
        priority_signal: seed.prioritySignal,
        showInLearn: true,
        created_at: createdAt,
      },
      parsed,
    }
  })

  const modulesOnly = modules.map((entry) => entry.module)
  const courseMap = new Map(seedCourses.map((course) => [course.id, course]))

  return {
    courses: seedCourses,
    modules: modulesOnly,
    learnItems: modules.flatMap(({ module, parsed }) => buildLearningItems(module, parsed)),
    taskItems: modules.flatMap(({ module, parsed }) => buildTaskItems(module, parsed, courseMap, now)),
  }
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
    moduleFreshnessScore: freshnessScore,
    actionScore: computeActionScore(priority, deadline, status, freshnessScore),
  }
}

function buildLearningItems(module: Module, parsed: ParsedModuleSource): LearningItem[] {
  return [
    {
      id: `${module.id}-summary`,
      courseId: module.courseId!,
      moduleId: module.id,
      title: 'What this module is trying to teach',
      body: parsed.summary,
      type: 'summary',
      order: 0,
    },
    ...parsed.concepts.map((concept, index) => ({
      id: `${module.id}-concept-${index + 1}`,
      courseId: module.courseId!,
      moduleId: module.id,
      title: `Key idea ${index + 1}`,
      body: concept,
      type: 'concept' as const,
      order: index + 1,
    })),
    ...parsed.studyPrompts.map((prompt, index) => ({
      id: `${module.id}-prompt-${index + 1}`,
      courseId: module.courseId!,
      moduleId: module.id,
      title: `Check your understanding ${index + 1}`,
      body: prompt,
      type: 'review' as const,
      order: parsed.concepts.length + index + 1,
    })),
  ]
}

function buildTaskItems(
  module: Module,
  parsed: ParsedModuleSource,
  courseMap: Map<string, Course>,
  now: Date,
): TaskItem[] {
  const course = courseMap.get(module.courseId!)
  const freshnessScore = getModuleFreshnessScore(module, now)

  return parsed.tasks.map((task, index) => ({
    id: `${module.id}-task-${index + 1}`,
    courseId: module.courseId!,
    courseName: course?.name ?? 'Course',
    moduleId: module.id,
    moduleTitle: module.title,
    title: task.title,
    details: task.details,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline,
    taskType: task.taskType,
    estimatedMinutes: task.estimatedMinutes,
    extractedFrom: module.title,
    moduleFreshnessScore: freshnessScore,
    actionScore: computeActionScore(task.priority, task.deadline, task.status, freshnessScore),
  }))
}

function parseRawModuleContent(rawContent: string, now: Date): ParsedModuleSource {
  const lines = rawContent.split('\n').map((line) => line.trim()).filter(Boolean)

  return {
    summary: getSectionParagraph(lines, 'Overview:'),
    concepts: getBulletSection(lines, 'Key concepts:'),
    studyPrompts: getBulletSection(lines, 'Study prompts:'),
    tasks: getBulletSection(lines, 'Tasks:').map((line) => parseTaskLine(line, now)),
  }
}

function parseTaskLine(line: string, now: Date): ParsedTaskSeed {
  const [title, duePart, priorityPart, statusPart, minutesPart, detailsPart] = line.split('|').map((part) => part.trim())

  return {
    title,
    deadline: resolveRelativeDate(duePart?.replace(/^due\s+/i, '') ?? '', now),
    priority: normalizePriority(priorityPart) ?? 'medium',
    status: normalizeTaskStatus(statusPart),
    estimatedMinutes: Number.parseInt(minutesPart?.replace(/m$/i, '') ?? '20', 10),
    details: detailsPart ?? null,
    taskType: inferTaskType(title),
  }
}

function getSectionParagraph(lines: string[], heading: string) {
  const start = lines.indexOf(heading)
  if (start === -1) return ''
  const collected: string[] = []

  for (let index = start + 1; index < lines.length; index += 1) {
    if (isHeading(lines[index])) break
    collected.push(lines[index])
  }

  return collected.join(' ').trim()
}

function getBulletSection(lines: string[], heading: string) {
  const start = lines.indexOf(heading)
  if (start === -1) return []
  const items: string[] = []

  for (let index = start + 1; index < lines.length; index += 1) {
    if (isHeading(lines[index])) break
    if (lines[index].startsWith('- ')) {
      items.push(lines[index].slice(2).trim())
    }
  }

  return items
}

function isHeading(line: string) {
  return /^(Course|Module|Overview|Key concepts|Study prompts|Tasks):$/i.test(line)
}

function resolveRelativeDate(token: string, now: Date) {
  if (!token) return null
  const match = token.match(/^([+-]?\d+)d(?:\s+(\d{1,2}):(\d{2}))?$/i)
  if (!match) return token

  return offsetDateTime(
    now,
    Number.parseInt(match[1], 10),
    match[2] ? Number.parseInt(match[2], 10) : 12,
    match[3] ? Number.parseInt(match[3], 10) : 0,
  )
}

function offsetDateTime(base: Date, offsetDays: number, hours = 12, minutes = 0) {
  const next = new Date(base)
  next.setDate(next.getDate() + offsetDays)
  next.setHours(hours, minutes, 0, 0)
  return next.toISOString()
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

function inferTaskType(title: string): TaskItem['taskType'] {
  const normalized = title.toLowerCase()
  if (normalized.includes('quiz')) return 'quiz'
  if (normalized.includes('read')) return 'reading'
  if (normalized.includes('discussion') || normalized.includes('response')) return 'discussion'
  if (normalized.includes('implement') || normalized.includes('project')) return 'project'
  if (normalized.includes('set up') || normalized.includes('draft') || normalized.includes('start')) return 'prep'
  return 'assignment'
}
