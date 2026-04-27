import { normalizeCanvasUrl, type CanvasCourse } from '@/lib/canvas'

const DATABASE_NULL_CHARACTER_PATTERN = /\u0000/g

export interface NormalizedCanvasCourseForSync {
  canvasCourseId: number
  canvasInstanceUrl: string
  name: string
  courseCode: string
  termName: string
}

export function buildCanvasCourseSyncKey(
  canvasInstanceUrl: string | null | undefined,
  canvasCourseId: number | string | null | undefined,
) {
  const normalizedCourseId = typeof canvasCourseId === 'string'
    ? Number(canvasCourseId)
    : canvasCourseId

  if (!canvasInstanceUrl || typeof normalizedCourseId !== 'number' || !Number.isFinite(normalizedCourseId)) {
    return null
  }

  try {
    return `${normalizeCanvasUrl(canvasInstanceUrl)}::${Math.trunc(normalizedCourseId)}`
  } catch {
    return null
  }
}

export function normalizeCanvasCourseForSync(
  course: CanvasCourse,
  canvasInstanceUrl: string,
): NormalizedCanvasCourseForSync {
  return {
    canvasCourseId: course.id,
    canvasInstanceUrl: normalizeCanvasUrl(canvasInstanceUrl),
    name: normalizeRequiredCanvasSyncText(course.name, `Canvas course ${course.id}`),
    courseCode: normalizeRequiredCanvasSyncText(course.course_code, `canvas-${course.id}`),
    termName: normalizeRequiredCanvasSyncText(course.term?.name, 'Current term'),
  }
}

export function normalizeOptionalCanvasSyncText(value: string | null | undefined) {
  const normalized = stripDatabaseNullCharacters(value ?? '').trim()
  return normalized || null
}

export function normalizeRequiredCanvasSyncText(value: string | null | undefined, fallback: string) {
  return normalizeOptionalCanvasSyncText(value) ?? fallback
}

export function stripDatabaseNullCharacters(value: string) {
  return value.replace(DATABASE_NULL_CHARACTER_PATTERN, '')
}

export function sanitizeCanvasSyncValue<T>(value: T): T {
  if (typeof value === 'string') {
    return stripDatabaseNullCharacters(value) as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeCanvasSyncValue(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, sanitizeCanvasSyncValue(nestedValue)])
    ) as T
  }

  return value
}
