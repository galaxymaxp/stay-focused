import Link from 'next/link'
import { Clock, ArrowRight } from 'lucide-react'
import type { Course } from '@/lib/mock-data'

type Props = {
  course: Course
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function CourseCard({ course }: Props) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-sf-border bg-sf-surface hover:border-sf-border hover:shadow-md transition-all duration-200"
    >
      {/* Color bar */}
      <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: course.color }} />

      <div className="flex flex-col flex-1 p-5">
        {/* Header */}
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: course.color }}>
            {course.code}
          </p>
          <h3 className="text-sm font-semibold text-sf-text leading-5 group-hover:text-sf-accent transition-colors line-clamp-2">
            {course.name}
          </h3>
          <p className="text-xs text-sf-muted mt-1">{course.instructor}</p>
        </div>

        {/* Next due */}
        {course.nextDue && (
          <div className="flex items-start gap-2 mt-auto pt-3 border-t border-sf-border-muted">
            <Clock className="h-3.5 w-3.5 text-sf-warning flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs text-sf-muted line-clamp-1">{course.nextDue}</p>
              {course.nextDueDate && (
                <p className="text-xs font-medium text-sf-warning mt-0.5">
                  {formatDate(course.nextDueDate)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-sf-border-muted">
          <div className="flex items-center gap-3">
            <span className="text-xs text-sf-subtle">{course.moduleCount} modules</span>
            <span className="text-xs text-sf-subtle">{course.taskCount} tasks</span>
          </div>
          <span className="text-xs text-sf-subtle opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            Open
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  )
}
