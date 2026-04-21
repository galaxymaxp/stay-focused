import Link from 'next/link'
import { ArrowRight, Clock, Flame } from 'lucide-react'
import type { Task } from '@/lib/mock-data'

type Props = {
  task: Task
}

function getDaysUntil(dateStr: string) {
  const due = new Date(dateStr)
  const now = new Date('2026-04-21')
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  return `Due in ${diff} days`
}

export function PrimaryTaskHero({ task }: Props) {
  const urgency = getDaysUntil(task.dueDate)
  const isUrgent = task.dueDate <= '2026-04-25'

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-8 lg:p-10"
      style={{
        background: 'linear-gradient(135deg, #1A1917 0%, #262421 60%, #2E2B28 100%)',
      }}
    >
      {/* Subtle glow */}
      <div
        className="absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-20 blur-3xl"
        style={{ background: '#4B57E8' }}
      />

      <div className="relative">
        <div className="flex items-center gap-2 mb-6">
          <Flame className="h-4 w-4 text-sf-accent-muted" />
          <span className="text-xs font-semibold uppercase tracking-widest text-sf-accent-muted">
            Do Now
          </span>
        </div>

        <h1 className="text-2xl lg:text-3xl font-semibold text-white leading-tight mb-2">
          {task.title}
        </h1>

        <div className="flex items-center gap-4 mt-3 mb-8">
          <span className="text-sm text-[#C5C3BD]">{task.course}</span>
          <span className="text-[#4B4845]">·</span>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-sf-warning" />
            <span className="text-sm font-medium" style={{ color: isUrgent ? '#F59E0B' : '#C5C3BD' }}>
              {urgency}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/courses/${task.courseId}`}
            className="inline-flex items-center gap-2 rounded-xl bg-sf-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-sf-accent-hover transition-colors"
          >
            Open Task
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/drafts"
            className="inline-flex items-center gap-2 rounded-xl border border-[#3A3734] px-5 py-2.5 text-sm font-medium text-[#C5C3BD] hover:border-[#4A4744] hover:text-white transition-colors"
          >
            Generate Draft
          </Link>
        </div>
      </div>
    </div>
  )
}
