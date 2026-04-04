const CANVAS_URL = process.env.CANVAS_API_URL
const CANVAS_TOKEN = process.env.CANVAS_API_TOKEN

const NON_ACADEMIC = [
  'library',
  'bulletin',
  'guidance',
  'medical',
  'dental',
  'osas',
  'student services',
  'orientation',
  'helpdesk',
  'support',
  'career',
  'libraries',
  'social responsibility',
]

function canvasHeaders() {
  if (!CANVAS_URL || !CANVAS_TOKEN) {
    throw new Error('Canvas API credentials missing. Check CANVAS_API_URL and CANVAS_API_TOKEN in .env.local')
  }

  return {
    Authorization: `Bearer ${CANVAS_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

async function canvasFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${CANVAS_URL}/api/v1${path}?per_page=100`, {
    headers: canvasHeaders(),
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Canvas API error ${res.status}: ${path}`)
  }

  return res.json()
}

export interface CanvasCourse {
  id: number
  name: string
  course_code: string
  enrollment_state: string
  term?: {
    id: number
    name: string
    end_at: string | null
  }
}

export interface CanvasAssignment {
  id: number
  name: string
  description: string | null
  due_at: string | null
  points_possible: number
  submission_types: string[]
}

export interface CanvasAnnouncement {
  id: number
  title: string
  message: string
  posted_at: string
}

export interface CanvasModuleItem {
  id: number
  title: string
  type: string
  completion_requirement?: { type: string } | null
}

export interface CanvasModule {
  id: number
  name: string
  items: CanvasModuleItem[]
}

export async function getCourses(): Promise<CanvasCourse[]> {
  const courses = await canvasFetch<CanvasCourse[]>(
    '/courses?enrollment_state=active&enrollment_type=student&state[]=available&include[]=term'
  )

  const now = new Date()

  return courses.filter((course) => {
    if (!course.name) return false

    if (course.term?.end_at && new Date(course.term.end_at) <= now) return false

    const nameLower = course.name.toLowerCase()
    if (NON_ACADEMIC.some((keyword) => nameLower.includes(keyword))) return false

    if (!course.course_code || course.course_code.trim() === '') return false

    return true
  })
}

export async function getAssignments(courseId: number): Promise<CanvasAssignment[]> {
  return canvasFetch<CanvasAssignment[]>(`/courses/${courseId}/assignments?order_by=due_at`)
}

export async function getAnnouncements(courseId: number): Promise<CanvasAnnouncement[]> {
  return canvasFetch<CanvasAnnouncement[]>(
    `/courses/${courseId}/discussion_topics?only_announcements=true&order_by=recent_activity`
  )
}

export async function getModules(courseId: number): Promise<CanvasModule[]> {
  return canvasFetch<CanvasModule[]>(`/courses/${courseId}/modules?include[]=items`)
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatDate(iso: string | null): string {
  if (!iso) return 'No due date'

  return new Date(iso).toLocaleDateString('en-NZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function compileCanvasContent(
  course: CanvasCourse,
  assignments: CanvasAssignment[],
  announcements: CanvasAnnouncement[],
  modules: CanvasModule[]
): string {
  const lines: string[] = []

  lines.push(`Course: ${course.name} (${course.course_code})`)
  lines.push('')

  if (assignments.length > 0) {
    lines.push('ASSIGNMENTS:')
    for (const assignment of assignments) {
      lines.push(`- ${assignment.name}`)
      lines.push(`  Due: ${formatDate(assignment.due_at)}`)
      if (assignment.points_possible) lines.push(`  Points: ${assignment.points_possible}`)
      if (assignment.description) {
        const description = stripHtml(assignment.description).slice(0, 400)
        if (description) lines.push(`  Details: ${description}`)
      }
    }
    lines.push('')
  }

  if (announcements.length > 0) {
    lines.push('RECENT ANNOUNCEMENTS:')
    for (const announcement of announcements.slice(0, 5)) {
      lines.push(`- ${announcement.title} (posted ${formatDate(announcement.posted_at)})`)
      const body = stripHtml(announcement.message).slice(0, 300)
      if (body) lines.push(`  ${body}`)
    }
    lines.push('')
  }

  if (modules.length > 0) {
    lines.push('MODULES:')
    for (const canvasModule of modules) {
      lines.push(`- ${canvasModule.name}`)
      if (canvasModule.items?.length > 0) {
        for (const item of canvasModule.items) {
          const required = item.completion_requirement ? ' [required]' : ''
          lines.push(`  * ${item.title} (${item.type})${required}`)
        }
      }
    }
  }

  return lines.join('\n')
}
