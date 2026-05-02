import type { CanvasCourse } from '@/lib/canvas'

export type CanvasCourseStatus = 'active' | 'past' | 'unavailable'

export function deriveCanvasCourseStatus(course: CanvasCourse, now = new Date()): CanvasCourseStatus {
  if (course.access_restricted_by_date) return 'unavailable'

  const enrollmentStates = [
    course.enrollment_state,
    ...(course.enrollments ?? []).flatMap((enrollment) => [
      enrollment.enrollment_state,
      enrollment.workflow_state,
    ]),
  ].map((value) => value?.toLowerCase().trim()).filter(Boolean)

  if (enrollmentStates.includes('completed')) return 'past'

  const workflowState = course.workflow_state?.toLowerCase().trim()
  if (workflowState === 'completed') return 'past'

  if (course.concluded) return 'past'

  if (isPastDate(course.end_at, now) || isPastDate(course.term?.end_at, now)) return 'past'

  return 'active'
}

function isPastDate(value: string | null | undefined, now: Date) {
  if (!value) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date <= now
}
