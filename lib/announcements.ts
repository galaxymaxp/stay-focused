import type { Course, Module } from '@/lib/types'

export interface ParsedAnnouncement {
  title: string
  body: string | null
  courseName: string
  courseId: string
  moduleId: string
}

/**
 * Parses the RECENT ANNOUNCEMENTS section out of a compiled Canvas raw_content blob.
 * The format produced by compileCanvasContent() is:
 *   RECENT ANNOUNCEMENTS:
 *   - Title of announcement
 *     Body text here
 */
function parseAnnouncementsFromRaw(raw: string): Array<{ title: string; body: string | null }> {
  const result: Array<{ title: string; body: string | null }> = []
  const lines = raw.split('\n')
  let inSection = false
  let current: { title: string; body: string | null } | null = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed === 'RECENT ANNOUNCEMENTS:') {
      inSection = true
      current = null
      continue
    }

    // Stop at the next top-level section header
    if (inSection && /^(MODULES|ASSIGNMENTS|RESOURCE EXTRACTS):/.test(trimmed)) {
      break
    }

    if (!inSection) continue

    if (trimmed.startsWith('- ')) {
      current = { title: trimmed.slice(2).trim(), body: null }
      result.push(current)
      continue
    }

    if (current) {
      current.body = current.body ? `${current.body} ${trimmed}` : trimmed
    }
  }

  return result
}

/**
 * Aggregates recent announcements across the most recently released modules.
 * Parses each module's raw_content for the RECENT ANNOUNCEMENTS section.
 * Returns at most maxTotal announcements, ordered by module recency.
 */
export function getRecentAnnouncements(
  modules: Module[],
  courseMap: Map<string, Course>,
  maxTotal = 5,
): ParsedAnnouncement[] {
  const result: ParsedAnnouncement[] = []

  const sortedModules = [...modules]
    .filter((m) => Boolean(m.raw_content))
    .sort((a, b) => {
      const aDate = a.released_at ?? a.created_at
      const bDate = b.released_at ?? b.created_at
      return new Date(bDate).getTime() - new Date(aDate).getTime()
    })
    .slice(0, 4) // only parse the most recent 4 modules

  for (const module of sortedModules) {
    if (result.length >= maxTotal) break
    const announcements = parseAnnouncementsFromRaw(module.raw_content)
    const course = courseMap.get(module.courseId ?? '')
    for (const ann of announcements) {
      if (result.length >= maxTotal) break
      result.push({
        title: ann.title,
        body: ann.body,
        courseName: course?.name ?? 'Course',
        courseId: module.courseId ?? '',
        moduleId: module.id,
      })
    }
  }

  return result
}
