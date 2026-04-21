import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { courses } from '@/lib/mock-data'
import { CourseWorkspace } from '@/components/courses/CourseWorkspace'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
}

export default async function CourseDetailPage({ params }: Props) {
  const { id } = await params
  const course = courses.find((c) => c.id === id)
  if (!course) notFound()

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 lg:px-10 lg:py-12">
      {/* Back */}
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-sf-muted hover:text-sf-text transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Courses
      </Link>

      {/* Course header */}
      <div className="mb-8 pb-8 border-b border-sf-border">
        <div className="flex items-start gap-4">
          <div
            className="h-12 w-12 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: course.color }}
          >
            {course.code.split(' ')[0]}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: course.color }}>
              {course.code}
            </p>
            <h1 className="text-xl font-semibold text-sf-text">{course.name}</h1>
            <p className="text-sm text-sf-muted mt-1">{course.instructor} · Spring 2026</p>
          </div>
        </div>

        <div className="flex items-center gap-6 mt-5">
          <div>
            <p className="text-2xl font-semibold text-sf-text">{course.moduleCount}</p>
            <p className="text-xs text-sf-muted">Modules</p>
          </div>
          <div className="w-px h-8 bg-sf-border" />
          <div>
            <p className="text-2xl font-semibold text-sf-text">{course.taskCount}</p>
            <p className="text-xs text-sf-muted">Active tasks</p>
          </div>
          <div className="w-px h-8 bg-sf-border" />
          <div>
            <p className="text-sm font-medium text-sf-warning">{course.nextDueDate ?? '—'}</p>
            <p className="text-xs text-sf-muted">Next due</p>
          </div>
        </div>
      </div>

      {/* Workspace */}
      <CourseWorkspace course={course} />
    </div>
  )
}
