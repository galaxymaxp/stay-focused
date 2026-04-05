import { seedCourses, seedModules } from '@/lib/mock-data'
import type { CalendarItem, Course, LearningItem, Module, Priority, TaskItem, TaskStatus, TodayItem } from '@/lib/types'

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

export interface ClarityWorkspace {
  courses: Course[]
  modules: Module[]
  learnItems: LearningItem[]
  taskItems: TaskItem[]
  todayItems: TodayItem[]
  calendarItems: CalendarItem[]
  today: {
    nextBestMove: TodayItem | null
    needsAction: TodayItem[]
    needsUnderstanding: TodayItem[]
    comingUp: TodayItem[]
    undatedTaskCount: number
  }
}

export function getClarityWorkspace(): ClarityWorkspace {
  const now = new Date()
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
        created_at: createdAt,
      },
      parsed,
    }
  })

  const modulesOnly = modules.map((entry) => entry.module)
  const courseMap = new Map(seedCourses.map((course) => [course.id, course]))
  const learnItems = modules.flatMap(({ module, parsed }) => buildLearningItems(module, parsed))
  const taskItems = modules.flatMap(({ module, parsed }) => buildTaskItems(module, parsed, courseMap, now))
  const todayItems = [
    ...taskItems.filter((task) => task.status !== 'completed').map((task) => buildTodayTaskItem(task)),
    ...modulesOnly.map((module) => buildTodayLearningItem(module, learnItems, taskItems, courseMap, now)),
  ].sort(compareTodayItems)

  const nextBestMove = todayItems[0] ?? null
  const heroId = nextBestMove?.id ?? null

  return {
    courses: seedCourses,
    modules: modulesOnly,
    learnItems,
    taskItems,
    todayItems,
    calendarItems: taskItems
      .filter((task) => task.deadline)
      .map((task) => buildCalendarItem(task))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || compareCalendarItems(a, b)),
    today: {
      nextBestMove,
      needsAction: todayItems.filter((item) => item.id !== heroId && item.tone === 'attention').slice(0, 4),
      needsUnderstanding: todayItems.filter((item) => item.id !== heroId && item.tone === 'review').slice(0, 4),
      comingUp: todayItems.filter((item) => item.id !== heroId && item.tone === 'upcoming').slice(0, 6),
      undatedTaskCount: taskItems.filter((task) => task.status !== 'completed' && !task.deadline).length,
    },
  }
}

export function getCourseModules(workspace: ClarityWorkspace, courseId: string) {
  return workspace.modules
    .filter((module) => module.courseId === courseId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function getModuleLearnItems(workspace: ClarityWorkspace, moduleId: string) {
  return workspace.learnItems
    .filter((item) => item.moduleId === moduleId)
    .sort((a, b) => a.order - b.order)
}

export function getModuleTasks(workspace: ClarityWorkspace, moduleId: string) {
  return workspace.taskItems
    .filter((item) => item.moduleId === moduleId)
    .sort(compareTaskItems)
}

export function getTaskUrgencyLabel(task: TaskItem) {
  if (task.status === 'completed') return 'Completed'
  const daysUntil = getDaysUntil(task.deadline)
  if (daysUntil === null) return 'No due date'
  if (daysUntil < 0) return 'Overdue'
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  if (daysUntil <= 3) return 'Due soon'
  return 'Upcoming'
}

export function getModuleFreshnessScore(module: Module, now = new Date()) {
  const daysSinceRelease = getDaysSince(module.released_at ?? module.created_at, now)
  if (daysSinceRelease <= 1) return 28
  if (daysSinceRelease <= 3) return 20
  if (daysSinceRelease <= 5) return 12
  return 4
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

function buildTodayTaskItem(task: TaskItem): TodayItem {
  const daysUntil = getDaysUntil(task.deadline)
  const tone = task.actionScore >= 70 ? 'attention' : task.actionScore >= 36 ? 'review' : 'upcoming'

  return {
    id: `today-${task.id}`,
    kind: 'task',
    title: task.title,
    courseId: task.courseId,
    courseName: task.courseName,
    moduleId: task.moduleId,
    moduleTitle: task.moduleTitle,
    supportingText: task.details,
    dateTime: task.deadline,
    priority: task.priority,
    tone,
    toneLabel: tone === 'attention' ? 'Needs action' : tone === 'review' ? 'Worth lining up' : 'Coming up',
    recommendationScore: task.actionScore,
    href: `/do#${task.id}`,
    actionLabel: 'Open in Do',
    whyNow: buildTaskReason(task, daysUntil),
    effortLabel: `${task.estimatedMinutes} min`,
    completionStatus: task.status,
  }
}

function buildTodayLearningItem(
  module: Module,
  learnItems: LearningItem[],
  taskItems: TaskItem[],
  courseMap: Map<string, Course>,
  now: Date,
): TodayItem {
  const course = courseMap.get(module.courseId!)
  const moduleLearnItems = learnItems.filter((item) => item.moduleId === module.id)
  const moduleTasks = taskItems.filter((item) => item.moduleId === module.id && item.status !== 'completed').sort(compareTaskItems)
  const freshestTask = moduleTasks[0] ?? null
  const freshnessScore = getModuleFreshnessScore(module, now)
  const recommendationScore = freshnessScore
    + (module.priority_signal === 'high' ? 16 : module.priority_signal === 'medium' ? 8 : 2)
    + (freshestTask ? Math.round(freshestTask.actionScore / 3) : 0)
  const tone = freshnessScore >= 20 || (freshestTask?.actionScore ?? 0) >= 50 ? 'review' : 'upcoming'

  return {
    id: `today-module-${module.id}`,
    kind: 'module',
    title: module.title,
    courseId: module.courseId!,
    courseName: course?.name ?? 'Course',
    moduleId: module.id,
    moduleTitle: module.title,
    supportingText: moduleLearnItems[0]?.body ?? module.summary,
    dateTime: freshestTask?.deadline ?? module.released_at ?? null,
    priority: freshestTask?.priority ?? module.priority_signal ?? null,
    tone,
    toneLabel: tone === 'review' ? 'Worth reviewing' : 'Coming up',
    recommendationScore,
    href: `/learn#${module.id}`,
    actionLabel: 'Open in Learn',
    whyNow: buildModuleReason(module, freshestTask, freshnessScore),
    effortLabel: module.estimated_minutes ? `${module.estimated_minutes} min review` : null,
  }
}

function buildCalendarItem(task: TaskItem): CalendarItem {
  const daysUntil = getDaysUntil(task.deadline)

  return {
    id: `calendar-${task.id}`,
    kind: 'task',
    title: task.title,
    courseName: task.courseName,
    moduleTitle: task.moduleTitle,
    relatedText: task.details,
    dateKey: getDateKey(task.deadline!),
    dateTime: task.deadline,
    status: task.status === 'completed'
      ? 'completed'
      : daysUntil !== null && daysUntil <= 1
        ? 'urgent'
        : daysUntil !== null && daysUntil <= 3
          ? 'dueSoon'
          : 'upcoming',
    completionStatus: task.status,
    priority: task.priority,
    recommendationScore: task.actionScore,
    href: `/do#${task.id}`,
  }
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
    priority: (priorityPart as Priority) || 'medium',
    status: (statusPart as TaskStatus) || 'pending',
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

  const offsetDays = Number.parseInt(match[1], 10)
  const hours = match[2] ? Number.parseInt(match[2], 10) : 12
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0

  return offsetDateTime(now, offsetDays, hours, minutes)
}

function offsetDateTime(base: Date, offsetDays: number, hours = 12, minutes = 0) {
  const next = new Date(base)
  next.setDate(next.getDate() + offsetDays)
  next.setHours(hours, minutes, 0, 0)
  return next.toISOString()
}

function getDaysUntil(value: string | null) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function getDaysSince(value: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)))
}

function computeActionScore(priority: Priority, deadline: string | null, status: TaskStatus, freshnessScore: number) {
  if (status === 'completed') return -20

  const priorityScore = priority === 'high' ? 34 : priority === 'medium' ? 21 : 10
  const daysUntil = getDaysUntil(deadline)
  const timingScore = daysUntil === null
    ? 6
    : daysUntil < 0
      ? 42
      : daysUntil === 0
        ? 36
        : daysUntil === 1
          ? 28
          : daysUntil <= 3
            ? 18
            : daysUntil <= 7
              ? 9
              : 3

  return priorityScore + timingScore + Math.round(freshnessScore / 2)
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

function buildTaskReason(task: TaskItem, daysUntil: number | null) {
  if (daysUntil === null) return `${task.title} is clearly defined already, so it is a good action item to move without extra planning first.`
  if (daysUntil < 0) return `${task.title} has already slipped past its due date, so clearing it now removes the biggest source of drag.`
  if (daysUntil === 0) return `${task.title} lands today, and the module is still fresh enough that finishing it now should take less effort.`
  if (daysUntil === 1) return `${task.title} is due tomorrow, which makes today the best window for doing it without last-minute pressure.`
  if (daysUntil <= 3) return `${task.title} is close enough that getting ahead of it now keeps the rest of the week lighter.`
  return `${task.title} is not urgent yet, but it is attached to recent material, so starting early will make it easier later.`
}

function buildModuleReason(module: Module, freshestTask: TaskItem | null, freshnessScore: number) {
  if (freshnessScore >= 20) {
    return `${module.title} is newly posted, so understanding it now will make the attached tasks feel much less scattered.`
  }

  if (freshestTask) {
    return `A task in this module is already approaching, so a quick pass through the key ideas will make "${freshestTask.title}" easier to finish.`
  }

  return `${module.title} is a good understanding pass while the workload still has breathing room.`
}

function compareTodayItems(a: TodayItem, b: TodayItem) {
  const scoreDiff = b.recommendationScore - a.recommendationScore
  if (scoreDiff !== 0) return scoreDiff
  if (a.dateTime && b.dateTime) return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
  if (a.dateTime && !b.dateTime) return -1
  if (!a.dateTime && b.dateTime) return 1
  return a.title.localeCompare(b.title)
}

function compareTaskItems(a: TaskItem, b: TaskItem) {
  const statusDiff = Number(a.status === 'completed') - Number(b.status === 'completed')
  if (statusDiff !== 0) return statusDiff
  const scoreDiff = b.actionScore - a.actionScore
  if (scoreDiff !== 0) return scoreDiff
  if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  if (a.deadline && !b.deadline) return -1
  if (!a.deadline && b.deadline) return 1
  return a.title.localeCompare(b.title)
}

function compareCalendarItems(a: CalendarItem, b: CalendarItem) {
  const scoreDiff = b.recommendationScore - a.recommendationScore
  if (scoreDiff !== 0) return scoreDiff
  return a.title.localeCompare(b.title)
}

function getDateKey(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}
