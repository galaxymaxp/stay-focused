import { loadWorkspaceSource } from '@/lib/workspace-source'
import type { CalendarItem, Course, LearningItem, Module, TaskItem, TodayItem } from '@/lib/types'

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

export async function getClarityWorkspace(): Promise<ClarityWorkspace> {
  const source = await loadWorkspaceSource()
  const courseMap = new Map(source.courses.map((course) => [course.id, course]))
  const todayItems = [
    ...source.taskItems.filter((task) => task.status !== 'completed').map((task) => buildTodayTaskItem(task)),
    ...source.modules.map((module) => buildTodayLearningItem(module, source.learnItems, source.taskItems, courseMap)),
  ].sort(compareTodayItems)
  const nextBestMove = todayItems[0] ?? null
  const heroId = nextBestMove?.id ?? null

  return {
    ...source,
    todayItems,
    calendarItems: source.taskItems
      .filter((task) => task.deadline)
      .map((task) => buildCalendarItem(task))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || compareCalendarItems(a, b)),
    today: {
      nextBestMove,
      needsAction: todayItems.filter((item) => item.id !== heroId && item.tone === 'attention').slice(0, 4),
      needsUnderstanding: todayItems.filter((item) => item.id !== heroId && item.tone === 'review').slice(0, 4),
      comingUp: todayItems.filter((item) => item.id !== heroId && item.tone === 'upcoming').slice(0, 6),
      undatedTaskCount: source.taskItems.filter((task) => task.status !== 'completed' && !task.deadline).length,
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
): TodayItem {
  const course = courseMap.get(module.courseId ?? '')
  const moduleLearnItems = learnItems.filter((item) => item.moduleId === module.id)
  const moduleTasks = taskItems.filter((item) => item.moduleId === module.id && item.status !== 'completed').sort(compareTaskItems)
  const freshestTask = moduleTasks[0] ?? null
  const freshnessScore = getModuleFreshnessScore(module)
  const recommendationScore = freshnessScore
    + (module.priority_signal === 'high' ? 16 : module.priority_signal === 'medium' ? 8 : 2)
    + (freshestTask ? Math.round(freshestTask.actionScore / 3) : 0)
  const tone = freshnessScore >= 20 || (freshestTask?.actionScore ?? 0) >= 50 ? 'review' : 'upcoming'

  return {
    id: `today-module-${module.id}`,
    kind: 'module',
    title: module.title,
    courseId: module.courseId ?? 'unknown-course',
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

function getDaysUntil(value: string | null) {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function getDaysSince(value: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)))
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
