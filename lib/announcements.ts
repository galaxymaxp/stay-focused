import { buildModuleLearnHref } from '@/lib/stay-focused-links'
import type { Course, Module } from '@/lib/types'

export interface ParsedAnnouncement {
  title: string
  body: string | null
  postedLabel: string | null
  courseName: string
  courseId: string
  moduleId: string
  supportId: string
  href: string
  external: boolean
  targetHref: string | null
}

/**
 * Parses the RECENT ANNOUNCEMENTS section out of a compiled Canvas raw_content blob.
 * The format produced by compileCanvasContent() is:
 *   RECENT ANNOUNCEMENTS:
 *   - Title of announcement
 *     Body text here
 */
function parseAnnouncementsFromRaw(raw: string): Array<{ title: string; body: string | null; postedLabel: string | null; targetHref: string | null }> {
  const result: Array<{ title: string; body: string | null; postedLabel: string | null; targetHref: string | null }> = []
  const lines = raw.split('\n')
  let inSection = false
  let current: { title: string; body: string | null; postedLabel: string | null; targetHref: string | null } | null = null

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
      const parsedTitle = parseAnnouncementTitle(trimmed.slice(2).trim())
      current = { title: parsedTitle.title, body: null, postedLabel: parsedTitle.postedLabel, targetHref: null }
      result.push(current)
      continue
    }

    if (current && /^Link:\s+/i.test(trimmed)) {
      current.targetHref = trimmed.replace(/^Link:\s+/i, '').trim() || null
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

  for (const moduleRecord of sortedModules) {
    if (result.length >= maxTotal) break
    const announcements = parseAnnouncementsFromRaw(moduleRecord.raw_content)
    const course = courseMap.get(moduleRecord.courseId ?? '')
    for (const [index, ann] of announcements.entries()) {
      if (result.length >= maxTotal) break
      const supportId = `announcement-${index + 1}`
      const fallbackHref = buildModuleLearnHref(moduleRecord.id, {
        panel: 'source-support',
        supportId,
      })

      result.push({
        title: ann.title,
        body: ann.body,
        postedLabel: ann.postedLabel,
        courseName: course?.name ?? 'Course',
        courseId: moduleRecord.courseId ?? '',
        moduleId: moduleRecord.id,
        supportId,
        href: ann.targetHref ?? fallbackHref,
        external: Boolean(ann.targetHref),
        targetHref: ann.targetHref,
      })
    }
  }

  return result
}

function parseAnnouncementTitle(value: string) {
  const match = value.match(/^(.*)\s+\((posted [^)]+)\)$/i)
  if (!match) {
    return {
      title: value,
      postedLabel: null,
    }
  }

  return {
    title: match[1].trim(),
    postedLabel: match[2].trim(),
  }
}
