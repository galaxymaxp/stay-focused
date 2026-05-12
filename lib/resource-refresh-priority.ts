export interface ResourceRefreshCourseCandidate {
  id: string
  name: string
  canvasCourseId: number | null
}

const MAX_RESOURCE_REFRESH_COURSE_CANDIDATES = 24

export function getResourceRefreshCourseCandidateLimit(courseLimit: number) {
  const boundedCourseLimit = Math.max(Math.trunc(courseLimit), 1)
  return Math.min(Math.max(boundedCourseLimit * 4, boundedCourseLimit), MAX_RESOURCE_REFRESH_COURSE_CANDIDATES)
}

export function prioritizeResourceRefreshCourses<T extends ResourceRefreshCourseCandidate>(
  courses: T[],
  activeCanvasCourseIds: Set<number>,
) {
  return [...courses]
    .map((course, index) => ({
      course,
      index,
      isActive: typeof course.canvasCourseId === 'number' && activeCanvasCourseIds.has(course.canvasCourseId),
    }))
    .sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1
      return left.index - right.index
    })
    .map((entry) => entry.course)
}
