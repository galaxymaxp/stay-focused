import Link from 'next/link'
import { TodayDashboard, type TodayFocusItem } from '@/components/TodayDashboard'
import { dedupeDeadlinesForDisplay } from '@/lib/course-work-dedupe'
import { supabase } from '@/lib/supabase'
import { getDaysUntil, getTaskBucket, getTaskScore, sortTasksByRecommendation } from '@/lib/task-ranking'
import type { Deadline, Module, Task } from '@/lib/types'

interface ModuleRecord extends Module {
  raw_content: string
}

export default async function Dashboard() {
  const [
    { data: tasksData, error: tasksError },
    { data: deadlinesData, error: deadlinesError },
    { data: modulesData, error: modulesError },
  ] = await Promise.all([
    supabase.from('tasks').select('*').order('deadline', { ascending: true, nullsFirst: false }),
    supabase.from('deadlines').select('*').order('date', { ascending: true }),
    supabase.from('modules').select('*').order('created_at', { ascending: false }),
  ])

  if (tasksError || deadlinesError || modulesError) {
    throw new Error('Failed to load dashboard data.')
  }

  const tasks = (tasksData ?? []) as Task[]
  const deadlines = dedupeDeadlinesForDisplay(tasks, (deadlinesData ?? []) as Deadline[])
  const modules = (modulesData ?? []) as ModuleRecord[]
  const modulesById = new Map(modules.map((module) => [module.id, module]))

  const pendingTasks = sortTasksByRecommendation(tasks.filter((task) => task.status !== 'completed'))
  const actionItems = [
    ...pendingTasks.map((task) => buildTaskItem(task, modulesById)),
    ...deadlines.map((deadline) => buildDeadlineItem(deadline, modulesById)),
  ]
    .filter((item): item is TodayFocusItem => Boolean(item))
    .sort(compareTodayItems)

  const understandingItems = modules
    .filter((module) => module.status === 'processed')
    .map((module) => buildUnderstandingItem(module, tasks, deadlines))
    .filter((item): item is TodayFocusItem => Boolean(item))
    .sort(compareTodayItems)

  const nextBestMove = actionItems[0] ?? understandingItems[0] ?? null
  const heroId = nextBestMove?.id ?? null

  const needsAction = actionItems
    .filter((item) => item.id !== heroId && item.tone === 'attention')
    .slice(0, 4)

  const needsUnderstanding = understandingItems
    .filter((item) => item.id !== heroId)
    .slice(0, 4)

  const comingUp = [
    ...actionItems.filter((item) => item.id !== heroId && item.tone === 'upcoming'),
    ...understandingItems.filter((item) => item.id !== heroId && !needsUnderstanding.some((entry) => entry.id === item.id)),
  ].slice(0, 6)

  const undatedTaskCount = tasks.filter((task) => task.status !== 'completed' && !task.deadline).length

  if (!nextBestMove && needsAction.length === 0 && needsUnderstanding.length === 0 && comingUp.length === 0) {
    return (
      <main className="page-shell page-shell-narrow page-stack">
        <div className="section-shell section-shell-elevated" style={{ textAlign: 'center', padding: '5rem 1.5rem', color: 'var(--text-muted)', fontSize: '15px', lineHeight: 1.7 }}>
          No synced work yet.{' '}
          <Link href="/canvas" style={{ color: 'var(--accent)' }}>
            Sync your first course
          </Link>
          {' '}to start building a calmer view of your workload.
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <TodayDashboard
        nextBestMove={nextBestMove}
        needsAction={needsAction}
        needsUnderstanding={needsUnderstanding}
        comingUp={comingUp}
        undatedTaskCount={undatedTaskCount}
      />
    </main>
  )
}

function buildTaskItem(task: Task, modulesById: Map<string, ModuleRecord>): TodayFocusItem | null {
  const module = modulesById.get(task.module_id)
  const bucket = getTaskBucket(task)
  const daysUntil = getDaysUntil(task.deadline)

  return {
    id: `task-${task.id}`,
    kind: 'task',
    title: task.title,
    courseName: extractCourseName(module?.raw_content),
    moduleTitle: module?.title ?? null,
    supportingText: task.details ?? module?.summary ?? null,
    dateTime: task.deadline,
    priority: task.priority,
    tone: bucket === 'later' ? 'upcoming' : 'attention',
    toneLabel: bucket === 'urgent'
      ? 'Needs attention'
      : bucket === 'next'
        ? 'Best done soon'
        : 'Coming up',
    recommendationScore: getTaskScore(task),
    href: module ? `/modules/${module.id}/do` : null,
    actionLabel: 'Mark complete',
    whyNow: buildTaskReason(task.title, daysUntil, task.priority),
    effortLabel: getEffortLabel(task.priority, task.details),
    completionStatus: task.status,
    sourceId: task.id,
  }
}

function buildDeadlineItem(deadline: Deadline, modulesById: Map<string, ModuleRecord>): TodayFocusItem | null {
  const module = modulesById.get(deadline.module_id)
  const daysUntil = getDaysUntil(deadline.date)

  return {
    id: `deadline-${deadline.id}`,
    kind: 'deadline',
    title: deadline.label,
    courseName: extractCourseName(module?.raw_content),
    moduleTitle: module?.title ?? null,
    supportingText: module?.summary ?? firstRecommendedStep(module) ?? null,
    dateTime: deadline.date,
    priority: null,
    tone: daysUntil !== null && daysUntil <= 3 ? 'attention' : 'upcoming',
    toneLabel: daysUntil !== null && daysUntil <= 3 ? 'Needs attention' : 'Coming up',
    recommendationScore: getDeadlineScore(deadline.date),
    href: module ? `/modules/${module.id}/do` : null,
    actionLabel: 'Open module',
    whyNow: buildDeadlineReason(daysUntil),
    effortLabel: daysUntil !== null && daysUntil <= 1 ? 'Quick check-in' : null,
  }
}

function buildUnderstandingItem(module: ModuleRecord, tasks: Task[], deadlines: Deadline[]): TodayFocusItem | null {
  const courseName = extractCourseName(module.raw_content)
  const moduleTasks = tasks.filter((task) => task.module_id === module.id && task.status !== 'completed')
  const moduleDeadlines = deadlines.filter((deadline) => deadline.module_id === module.id)
  const firstStep = firstRecommendedStep(module)
  const nextTask = sortTasksByRecommendation(moduleTasks)[0] ?? null
  const nextDeadline = moduleDeadlines
    .map((deadline) => ({ deadline, daysUntil: getDaysUntil(deadline.date) }))
    .sort((a, b) => {
      if (a.daysUntil === null && b.daysUntil === null) return 0
      if (a.daysUntil === null) return 1
      if (b.daysUntil === null) return -1
      return a.daysUntil - b.daysUntil
    })[0] ?? null
  const nextDeadlineDaysUntil = nextDeadline?.daysUntil ?? null

  const recommendationScore = 18
    + (firstStep ? 8 : 0)
    + (module.summary ? 6 : 0)
    + (nextTask ? Math.max(0, Math.min(18, getTaskScore(nextTask) / 2)) : 0)
    + (nextDeadlineDaysUntil !== null && nextDeadlineDaysUntil <= 7 ? 8 : 0)

  return {
    id: `module-${module.id}`,
    kind: 'module',
    title: module.title,
    courseName,
    moduleTitle: module.title,
    supportingText: module.summary ?? firstStep ?? null,
    dateTime: nextDeadline?.deadline.date ?? nextTask?.deadline ?? null,
    priority: nextTask?.priority ?? null,
    tone: nextTask || (nextDeadlineDaysUntil !== null && nextDeadlineDaysUntil <= 5) ? 'review' : 'upcoming',
    toneLabel: nextTask || (nextDeadlineDaysUntil !== null && nextDeadlineDaysUntil <= 5) ? 'Worth reviewing' : 'Coming up',
    recommendationScore,
    href: `/modules/${module.id}/learn`,
    actionLabel: 'Review module',
    whyNow: buildModuleReason(firstStep, nextTask?.title ?? null, nextDeadlineDaysUntil),
    effortLabel: firstStep ? '10-15 min review' : 'Light review',
  }
}

function compareTodayItems(a: TodayFocusItem, b: TodayFocusItem) {
  const scoreDiff = b.recommendationScore - a.recommendationScore
  if (scoreDiff !== 0) return scoreDiff

  if (a.dateTime && b.dateTime) {
    return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
  }

  if (a.dateTime && !b.dateTime) return -1
  if (!a.dateTime && b.dateTime) return 1

  return a.title.localeCompare(b.title)
}

function extractCourseName(rawContent?: string | null) {
  if (!rawContent) return 'Synced course'

  const firstLine = rawContent.split('\n').find((line) => line.startsWith('Course:'))
  if (!firstLine) return 'Synced course'

  return firstLine
    .replace(/^Course:\s*/, '')
    .replace(/\s+\([^)]+\)\s*$/, '')
    .trim() || 'Synced course'
}

function getDeadlineScore(date: string) {
  const daysUntil = getDaysUntil(date)

  if (daysUntil === null) return 0
  if (daysUntil < 0) return 80
  if (daysUntil === 0) return 68
  if (daysUntil === 1) return 58
  if (daysUntil <= 3) return 44
  if (daysUntil <= 7) return 28
  return 12
}

function firstRecommendedStep(module: ModuleRecord | undefined) {
  if (!module?.recommended_order || module.recommended_order.length === 0) return null
  return module.recommended_order[0] ?? null
}

function buildTaskReason(title: string, daysUntil: number | null, priority: Task['priority']) {
  const priorityLabel = priority === 'high'
    ? 'high-priority'
    : priority === 'medium'
      ? 'important'
      : 'steady'

  if (daysUntil === null) return `${title} is the clearest ${priorityLabel} task to move forward now.`
  if (daysUntil < 0) return `${title} needs attention because its due date has already passed.`
  if (daysUntil === 0) return `${title} is due today, so finishing it now keeps the rest of the day lighter.`
  if (daysUntil === 1) return `${title} is due tomorrow and is worth clearing before it becomes last-minute work.`
  if (daysUntil <= 3) return `${title} is close enough that handling it now will reduce pressure later this week.`
  return `${title} is a good steady move now, especially before other deadlines crowd it out.`
}

function buildDeadlineReason(daysUntil: number | null) {
  if (daysUntil === null) return 'This deadline is worth reviewing so you know what is expected next.'
  if (daysUntil < 0) return 'This deadline has already passed, so it is worth checking the module context first.'
  if (daysUntil === 0) return 'This deadline lands today, so a quick check now can prevent surprises.'
  if (daysUntil === 1) return 'This deadline is tomorrow, which makes it the right time to confirm what is needed.'
  if (daysUntil <= 3) return 'This deadline is coming up soon, and getting context now will make the next move clearer.'
  return 'This deadline is on the horizon, so reviewing it early keeps the week more predictable.'
}

function buildModuleReason(firstStep: string | null, nextTaskTitle: string | null, deadlineDaysUntil: number | null) {
  if (firstStep) return `Start with "${firstStep}" so this module feels easier to approach.`
  if (nextTaskTitle) return `A related task is coming up, so reviewing this module now will make "${nextTaskTitle}" easier to finish.`
  if (deadlineDaysUntil !== null && deadlineDaysUntil <= 5) return 'There is work connected to this module coming up soon, so it is worth getting familiar with the material now.'
  return 'This looks like a good learning item to review while your workload still has breathing room.'
}

function getEffortLabel(priority: Task['priority'], details: string | null) {
  if (priority === 'high') return '20-30 min focus'
  if (priority === 'medium') return details ? '15-20 min pass' : '10-15 min pass'
  return details ? '10 min review' : null
}
