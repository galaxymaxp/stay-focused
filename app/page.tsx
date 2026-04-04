import Link from 'next/link'
import { CalendarDashboard, type CalendarItem } from '@/components/CalendarDashboard'
import { dedupeDeadlinesForDisplay } from '@/lib/course-work-dedupe'
import { supabase } from '@/lib/supabase'
import { getDaysUntil, getTaskBucket, getTaskScore } from '@/lib/task-ranking'
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

  if (tasks.length === 0 && deadlines.length === 0) {
    return (
      <main className="page-shell page-shell-narrow page-stack">
        <div className="section-shell" style={{ textAlign: 'center', padding: '5rem 1rem', color: 'var(--text-muted)', fontSize: '14px' }}>
          No tasks yet.{' '}
          <Link href="/canvas" style={{ color: 'var(--accent)' }}>
            Sync your first course.
          </Link>
        </div>
      </main>
    )
  }

  const modulesById = new Map(modules.map((module) => [module.id, module]))
  const datedItems: CalendarItem[] = []
  let undatedTaskCount = 0

  for (const task of tasks) {
    const moduleRecord = modulesById.get(task.module_id)
    if (!task.deadline) {
      undatedTaskCount += 1
      continue
    }

    datedItems.push({
      id: `task-${task.id}`,
      sourceId: task.id,
      kind: 'task',
      title: task.title,
      courseName: extractCourseName(moduleRecord?.raw_content),
      moduleTitle: moduleRecord?.title ?? null,
      relatedText: task.details,
      dateKey: toDateKey(task.deadline),
      dateTime: task.deadline,
      status: getCalendarStatusForTask(task),
      completionStatus: task.status,
      priority: task.priority,
      recommendationScore: getTaskScore(task),
    })
  }

  for (const deadline of deadlines) {
    const moduleRecord = modulesById.get(deadline.module_id)

    datedItems.push({
      id: `deadline-${deadline.id}`,
      sourceId: deadline.id,
      kind: 'deadline',
      title: deadline.label,
      courseName: extractCourseName(moduleRecord?.raw_content),
      moduleTitle: moduleRecord?.title ?? null,
      relatedText: moduleRecord?.summary ?? null,
      dateKey: toDateKey(deadline.date),
      dateTime: deadline.date,
      status: getCalendarStatusForDeadline(deadline.date),
      completionStatus: 'pending',
      priority: null,
      recommendationScore: getDeadlineScore(deadline.date),
    })
  }

  return (
    <main className="page-shell">
      <CalendarDashboard items={datedItems} undatedTaskCount={undatedTaskCount} />
    </main>
  )
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

function toDateKey(value: string) {
  return value.slice(0, 10)
}

function getCalendarStatusForTask(task: Task): CalendarItem['status'] {
  if (task.status === 'completed') return 'completed'

  const bucket = getTaskBucket(task)
  if (bucket === 'urgent') return 'urgent'
  if (bucket === 'next') return 'dueSoon'
  return 'upcoming'
}

function getCalendarStatusForDeadline(date: string): CalendarItem['status'] {
  const daysUntil = getDaysUntil(date)

  if (daysUntil === null) return 'upcoming'
  if (daysUntil < 0) return 'urgent'
  if (daysUntil <= 3) return 'dueSoon'
  return 'upcoming'
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
