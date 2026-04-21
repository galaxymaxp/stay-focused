import Link from 'next/link'
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import type { Task } from '@/lib/mock-data'
import { cn } from '@/lib/cn'

type Props = {
  tasks: Task[]
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function TaskList({ tasks }: Props) {
  const active = tasks.filter((t) => t.status !== 'completed')

  return (
    <div className="rounded-2xl border border-sf-border bg-sf-surface overflow-hidden">
      <div className="px-6 py-4 border-b border-sf-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-sf-text">Latest Tasks</h2>
        <Link href="/courses" className="flex items-center gap-1 text-xs text-sf-accent hover:underline">
          All courses
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="divide-y divide-sf-border-muted">
        {active.slice(0, 6).map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-4 px-6 py-4 hover:bg-sf-surface-2 transition-colors group"
          >
            <div className="flex-shrink-0">
              {task.status === 'completed' ? (
                <CheckCircle2 className="h-4 w-4 text-sf-success" />
              ) : (
                <Circle className="h-4 w-4 text-sf-border group-hover:text-sf-muted transition-colors" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium text-sf-text truncate', task.status === 'completed' && 'line-through text-sf-muted')}>
                {task.title}
              </p>
              <p className="text-xs text-sf-muted mt-0.5">{task.course}</p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <TypeBadge type={task.type} />
              <StatusBadge status={task.status} />
              <span className="text-xs text-sf-subtle w-16 text-right">{formatDate(task.dueDate)}</span>
              <Link
                href={`/courses/${task.courseId}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-sf-accent"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {active.length === 0 && (
        <div className="px-6 py-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-sf-success mx-auto mb-2" />
          <p className="text-sm text-sf-muted">All caught up. No pending tasks.</p>
        </div>
      )}
    </div>
  )
}
