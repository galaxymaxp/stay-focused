import { CourseCard } from '@/components/courses/CourseCard'
import { courses } from '@/lib/mock-data'

export default function CoursesPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-sf-text">Courses</h1>
        <p className="text-sm text-sf-muted mt-1">Spring 2026 · {courses.length} active courses</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </div>
  )
}
