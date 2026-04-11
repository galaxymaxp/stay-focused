import { getCourseModules, getModuleTasks, getTaskUrgencyLabel, type ClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseLearnHref, buildModuleDoHref, buildModuleLearnHref } from '@/lib/stay-focused-links'
import type { TodayItem } from '@/lib/types'

export interface HomeDueSoonItem {
  id: string
  title: string
  courseName: string
  moduleTitle: string
  urgencyLabel: string
  timingLabel: string
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
  href: string
  nextActionHref: string
  nextActionLabel: string
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
  const primaryAction = workspace.today.nextBestMove
  const primaryTaskId = primaryAction?.taskItemId ?? null

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
      title: task.title,
      courseName: task.courseName,
      moduleTitle: task.moduleTitle,
      urgencyLabel: getTaskUrgencyLabel(task),
      timingLabel: formatDate(task.deadline!),
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
        href: buildCourseLearnHref(course.id),
        nextActionHref: nextTask
          ? buildModuleDoHref(nextTask.moduleId, { taskTitle: nextTask.title })
          : buildCourseLearnHref(course.id),
        nextActionLabel: nextTask ? 'Open next task' : 'Open course',
        pendingCount: pendingTasks.length,
      }
    })
    .sort((a, b) => b.urgentCount - a.urgentCount || b.pendingCount - a.pendingCount || a.name.localeCompare(b.name))
    .map((snapshot) => {
      const { pendingCount, ...courseSnapshot } = snapshot
      void pendingCount
      return courseSnapshot
    })

  return {
    primaryAction,
    upNext: [...workspace.today.needsAction, ...workspace.today.needsUnderstanding].slice(0, 3),
    dueSoon,
    recentActivity: recentActivity.slice(0, 4),
    courseSnapshots,
    undatedTaskCount: workspace.today.undatedTaskCount,
  }
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
