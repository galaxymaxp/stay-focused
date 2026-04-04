import Link from 'next/link'
import { getAllTasks } from '@/actions/tasks'
import { TaskCard } from '@/components/TaskCard'
import type { Task } from '@/lib/types'
import { sortTasksByRecommendation, getTaskBucket } from '@/lib/task-ranking'

export default async function Dashboard() {
  const tasks = await getAllTasks()

  const pending = sortTasksByRecommendation(
    tasks.filter((t) => t.status === 'pending')
  )

  const completed = tasks.filter((t) => t.status === 'completed')

  const urgent = pending.filter((t) => getTaskBucket(t) === 'urgent')
  const next = pending.filter((t) => getTaskBucket(t) === 'next')
  const later = pending.filter((t) => getTaskBucket(t) === 'later')

  return (
    <main style={{ maxWidth: '680px', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      {tasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-muted)', fontSize: '14px' }}>
          No tasks yet.{' '}
          <Link href="/canvas" style={{ color: 'var(--accent)' }}>
            Sync your first course.
          </Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        <Section title="Urgent" dot="#C4432A" tasks={urgent} />
        <Section title="Next" dot="#B87333" tasks={next} />
        <Section title="Later" dot="#D4D1C9" tasks={later} />
        <Section title="Completed" dot="#3D7A5A" tasks={completed} />
      </div>
    </main>
  )
}

function Section({ title, dot, tasks }: { title: string; dot: string; tasks: Task[] }) {
  if (tasks.length === 0) return null
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: dot, display: 'inline-block' }} />
        <h2 style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', margin: 0 }}>
          {title}
          <span style={{ marginLeft: '6px', fontWeight: 400, color: 'var(--border-hover)' }}>{tasks.length}</span>
        </h2>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </ul>
    </section>
  )
}
