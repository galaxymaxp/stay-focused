import { getCourseModules, getModuleTasks, getTaskUrgencyLabel, type ClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseLearnHref, buildModuleDoHref, buildModuleLearnHref } from '@/lib/stay-focused-links'
import type { TodayItem } from '@/lib/types'

export interface HomeDueSoonItem {
  id: string
  moduleId: string
  taskItemId: string
  title: string
  courseName: string
  moduleTitle: string
  urgencyLabel: string
  timingLabel: string
  completionStatus: 'pending' | 'completed'
  href: string
}

export interface HomeActivityItem {
  id: string
  kind: 'announcement' | 'module'
  label: string
  title: string
  detail: string
  meta: string
  href: string
  external: boolean
}

export interface HomeCourseSnapshot {
  id: string
  code: string
  name: string
  statusSummary: string
  latestChange: string | null
  urgentCount: number
  pendingCount: number
  moduleCount: number
  href: string
  nextActionHref: string
  nextActionLabel: string
  nextActionSummary: string
}

export interface HomeOverview {
  primaryAction: TodayItem | null
  upNext: TodayItem[]
  dueSoon: HomeDueSoonItem[]
  recentActivity: HomeActivityItem[]
  courseSnapshots: HomeCourseSnapshot[]
  undatedTaskCount: number
}

export function buildHomeOverview(workspace: ClarityWorkspace): HomeOverview {
  const primaryAction = selectHomePrimaryAction(workspace.todayItems)
  const primaryTaskId = primaryAction?.taskItemId ?? null
  const heroId = primaryAction?.id ?? null

  const dueSoon = workspace.taskItems
    .filter((task) => task.status !== 'completed' && task.deadline && task.id !== primaryTaskId)
    .sort((a, b) => {
      const deadlineDiff = new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()
      if (deadlineDiff !== 0) return deadlineDiff
      return b.actionScore - a.actionScore
    })
    .slice(0, 5)
    .map((task) => ({
      id: task.id,
      moduleId: task.moduleId,
      taskItemId: task.id,
      title: task.title,
      courseName: task.courseName,
      moduleTitle: task.moduleTitle,
      urgencyLabel: getTaskUrgencyLabel(task),
      timingLabel: formatDate(task.deadline!),
      completionStatus: task.status,
      href: buildModuleDoHref(task.moduleId, { taskTitle: task.title }),
    }))

  const recentActivity: HomeActivityItem[] = []

  if (workspace.freshestModule) {
    recentActivity.push({
      id: `module-${workspace.freshestModule.id}`,
      kind: 'module',
      label: 'New material',
      title: workspace.freshestModule.title,
      detail: toShortSentence(workspace.freshestModule.summary) ?? 'A new module is ready to review.',
      meta: workspace.freshestModuleCourse?.name ?? 'Course update',
      href: buildModuleLearnHref(workspace.freshestModule.id),
      external: false,
    })
  }

  for (const announcement of workspace.recentAnnouncements.slice(0, 3)) {
    recentActivity.push({
      id: announcement.announcementKey,
      kind: 'announcement',
      label: 'Announcement',
      title: announcement.title,
      detail: toShortSentence(announcement.body) ?? 'New course update posted.',
      meta: [announcement.courseName, announcement.postedLabel].filter(Boolean).join(' | '),
      href: announcement.href,
      external: announcement.external,
    })
  }

  const courseSnapshots = workspace.courses
    .map((course) => {
      const modules = getCourseModules(workspace, course.id)
      const pendingTasks = modules
        .flatMap((module) => getModuleTasks(workspace, module.id))
        .filter((task) => task.status !== 'completed')
      const urgentCount = pendingTasks.filter((task) => {
        const urgencyLabel = getTaskUrgencyLabel(task)
        return urgencyLabel === 'Overdue' || urgencyLabel === 'Due today' || urgencyLabel === 'Due tomorrow' || urgencyLabel === 'Due soon'
      }).length
      const nextTask = pendingTasks[0] ?? null
      const latestAnnouncement = workspace.recentAnnouncements.find((announcement) => announcement.courseId === course.id)
      const newestModule = [...modules].sort((a, b) => {
        const aDate = a.released_at ?? a.created_at
        const bDate = b.released_at ?? b.created_at
        return new Date(bDate).getTime() - new Date(aDate).getTime()
      })[0] ?? null

      const latestChange = latestAnnouncement?.title
        ?? (newestModule ? `New module posted: ${newestModule.title}` : null)

      const statusSummary = urgentCount > 0
        ? `${urgentCount} task${urgentCount === 1 ? '' : 's'} need attention.`
        : nextTask
          ? `${getTaskUrgencyLabel(nextTask)}. ${pendingTasks.length} open task${pendingTasks.length === 1 ? '' : 's'} in the queue.`
          : newestModule
            ? 'New material is ready to review.'
            : 'Nothing urgent right now.'

      return {
        id: course.id,
        code: course.code,
        name: course.name,
        statusSummary,
        latestChange,
        urgentCount,
        pendingCount: pendingTasks.length,
        moduleCount: modules.length,
        href: buildCourseLearnHref(course.id),
        nextActionHref: nextTask
          ? buildModuleDoHref(nextTask.moduleId, { taskTitle: nextTask.title })
          : buildCourseLearnHref(course.id),
        nextActionLabel: nextTask ? 'Open next task' : 'Open course',
        nextActionSummary: nextTask
          ? `${getTaskUrgencyLabel(nextTask)} in ${nextTask.moduleTitle}`
          : newestModule
            ? `Newest module: ${newestModule.title}`
            : 'Open the course workspace.',
      }
    })
    .sort((a, b) => {
      const urgentDiff = b.urgentCount - a.urgentCount
      if (urgentDiff !== 0) return urgentDiff

      const pendingDiff = b.pendingCount - a.pendingCount
      if (pendingDiff !== 0) return pendingDiff

      const moduleDiff = b.moduleCount - a.moduleCount
      if (moduleDiff !== 0) return moduleDiff

      return a.name.localeCompare(b.name)
    })

  return {
    primaryAction,
    upNext: buildHomeFollowUps(workspace.todayItems, heroId),
    dueSoon,
    recentActivity: recentActivity.slice(0, 4),
    courseSnapshots,
    undatedTaskCount: workspace.today.undatedTaskCount,
  }
}

function selectHomePrimaryAction(todayItems: TodayItem[]) {
  const currentActionables = todayItems
    .filter((item) => !isOverdueTask(item) && isCurrentActionable(item))
    .sort(compareHomePrimaryItems)

  if (currentActionables.length > 0) {
    return currentActionables[0]
  }

  const currentStudyItems = todayItems
    .filter((item) => !isOverdueTask(item))
    .sort(compareHomePrimaryItems)

  if (currentStudyItems.length > 0) {
    return currentStudyItems[0]
  }

  return [...todayItems].sort(compareHomePrimaryItems)[0] ?? null
}

function buildHomeFollowUps(todayItems: TodayItem[], heroId: string | null) {
  const candidates = todayItems.filter((item) => item.id !== heroId)
  const overdue = candidates.filter(isOverdueTask).sort(compareHomeFollowUpItems)
  const currentTasks = candidates
    .filter((item) => !isOverdueTask(item) && item.kind === 'task')
    .sort(compareHomeFollowUpItems)
  const reviewItems = candidates
    .filter((item) => !isOverdueTask(item) && item.kind !== 'task')
    .sort(compareHomeFollowUpItems)

  return [...overdue, ...currentTasks, ...reviewItems].slice(0, 4)
}

function isCurrentActionable(item: TodayItem) {
  if (item.kind === 'task') return true
  return item.planningAnnotation === 'best_next_step' || item.planningAnnotation === 'worth_reviewing'
}

function isOverdueTask(item: TodayItem) {
  if (item.kind !== 'task' || !item.dateTime) return false
  const time = new Date(item.dateTime).getTime()
  return !Number.isNaN(time) && time < Date.now()
}

function compareHomePrimaryItems(a: TodayItem, b: TodayItem) {
  const kindDiff = primaryKindRank(a.kind) - primaryKindRank(b.kind)
  if (kindDiff !== 0) return kindDiff

  const planningDiff = planningRank(a.planningAnnotation) - planningRank(b.planningAnnotation)
  if (planningDiff !== 0) return planningDiff

  const timingDiff = compareFutureDates(a.dateTime, b.dateTime)
  if (timingDiff !== 0) return timingDiff

  const scoreDiff = b.recommendationScore - a.recommendationScore
  if (scoreDiff !== 0) return scoreDiff

  return a.title.localeCompare(b.title)
}

function compareHomeFollowUpItems(a: TodayItem, b: TodayItem) {
  const overdueDiff = Number(isOverdueTask(b)) - Number(isOverdueTask(a))
  if (overdueDiff !== 0) return overdueDiff

  const timingDiff = compareFutureDates(a.dateTime, b.dateTime)
  if (timingDiff !== 0) return timingDiff

  const scoreDiff = b.recommendationScore - a.recommendationScore
  if (scoreDiff !== 0) return scoreDiff

  return a.title.localeCompare(b.title)
}

function compareFutureDates(left: string | null, right: string | null) {
  const leftValue = sortableFutureDate(left)
  const rightValue = sortableFutureDate(right)
  return leftValue - rightValue
}

function sortableFutureDate(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY
  return time >= Date.now() ? time : Number.POSITIVE_INFINITY
}

function primaryKindRank(kind: TodayItem['kind']) {
  if (kind === 'task') return 0
  if (kind === 'module') return 1
  return 2
}

function planningRank(annotation: TodayItem['planningAnnotation']) {
  if (annotation === 'best_next_step') return 0
  if (annotation === 'needs_attention') return 1
  if (annotation === 'worth_reviewing') return 2
  return 3
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const includesTime = /T\d{2}:\d{2}/.test(value)
  return new Intl.DateTimeFormat(undefined, includesTime
    ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { weekday: 'short', month: 'short', day: 'numeric' }
  ).format(date)
}

function toShortSentence(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  const sentenceMatch = cleaned.match(/(.+?[.!?])(\s|$)/)
  const base = sentenceMatch ? sentenceMatch[1].trim() : cleaned

  if (base.length <= 120) {
    return base
  }

  const clipped = base.slice(0, 117)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : clipped.length).trim()}...`
}
