const DEFAULT_CANVAS_URL = process.env.CANVAS_API_URL ?? process.env.CANVAS_API_BASE_URL
const DEFAULT_CANVAS_TOKEN = process.env.CANVAS_API_TOKEN

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

export interface CanvasConfig {
  url: string
  token: string
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
  html_url?: string | null
  url?: string | null
  points_possible: number
  submission_types: string[]
  submission?: CanvasSubmission | null
}

export interface CanvasSubmission {
  submitted_at?: string | null
  workflow_state?: string | null
  grade?: string | null
  score?: number | null
  excused?: boolean | null
  missing?: boolean | null
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
  content_id?: number | null
  url?: string | null
  html_url?: string | null
  page_url?: string | null
  content_details?: {
    url?: string | null
    display_name?: string | null
    content_type?: string | null
    mime_class?: string | null
    size?: number | null
    locked_for_user?: boolean | null
  } | null
  completion_requirement?: { type: string } | null
}

export interface CanvasModule {
  id: number
  name: string
  items: CanvasModuleItem[]
}

export interface CanvasFile {
  id: number
  display_name?: string | null
  filename?: string | null
  url?: string | null
  preview_url?: string | null
  mime_class?: string | null
  'content-type'?: string | null
  content_type?: string | null
  size?: number | null
  updated_at?: string | null
}

export interface CanvasPage {
  page_id?: number | null
  url?: string | null
  title?: string | null
  body?: string | null
  html_url?: string | null
  published?: boolean | null
  updated_at?: string | null
}

export function resolveCanvasConfig(override?: Partial<CanvasConfig>): CanvasConfig {
  const url = override?.url?.trim() || DEFAULT_CANVAS_URL?.trim()
  const token = override?.token?.trim() || DEFAULT_CANVAS_TOKEN?.trim()

  if (!url || !token) {
    throw new Error('Add your Canvas URL and access token to continue.')
  }

  try {
    return {
      url: normalizeCanvasUrl(url),
      token,
    }
  } catch {
    throw new Error('Enter a valid Canvas URL, like https://school.instructure.com.')
  }
}

export function normalizeCanvasUrl(value: string) {
  const normalizedInput = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`

  const url = new URL(normalizedInput)
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

async function canvasFetch<T>(path: string, configOverride?: Partial<CanvasConfig>): Promise<T> {
  const config = resolveCanvasConfig(configOverride)
  const url = new URL(`/api/v1${path}`, `${config.url}/`)

  if (!url.searchParams.has('per_page')) {
    url.searchParams.set('per_page', '100')
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Canvas could not verify that access token. Double-check it and try again.')
    }

    if (res.status === 404) {
      throw new Error('That Canvas URL did not respond like a Canvas site. Check the address and try again.')
    }

    throw new Error(`Canvas returned an unexpected error (${res.status}). Please try again.`)
  }

  return res.json()
}

async function canvasFetchAbsolute<T>(url: string, configOverride?: Partial<CanvasConfig>): Promise<T> {
  const config = resolveCanvasConfig(configOverride)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Canvas returned an unexpected error (${res.status}) while fetching a resource.`)
  }

  return res.json()
}

export async function downloadCanvasBinary(url: string, configOverride?: Partial<CanvasConfig>): Promise<Buffer> {
  const config = resolveCanvasConfig(configOverride)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Canvas returned an unexpected error (${res.status}) while downloading a file.`)
  }

  return Buffer.from(await res.arrayBuffer())
}

export async function getCourses(configOverride?: Partial<CanvasConfig>): Promise<CanvasCourse[]> {
  const courses = await canvasFetch<CanvasCourse[]>(
    '/courses?enrollment_state=active&enrollment_type=student&state[]=available&include[]=term',
    configOverride
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

export async function getAssignments(courseId: number, configOverride?: Partial<CanvasConfig>): Promise<CanvasAssignment[]> {
  return canvasFetch<CanvasAssignment[]>(`/courses/${courseId}/assignments?order_by=due_at&include[]=submission`, configOverride)
}

export async function getAnnouncements(courseId: number, configOverride?: Partial<CanvasConfig>): Promise<CanvasAnnouncement[]> {
  return canvasFetch<CanvasAnnouncement[]>(
    `/courses/${courseId}/discussion_topics?only_announcements=true&order_by=recent_activity`,
    configOverride
  )
}

export async function getModules(courseId: number, configOverride?: Partial<CanvasConfig>): Promise<CanvasModule[]> {
  return canvasFetch<CanvasModule[]>(`/courses/${courseId}/modules?include[]=items&include[]=content_details`, configOverride)
}

export async function getCanvasFile(courseId: number, fileId: number, configOverride?: Partial<CanvasConfig>): Promise<CanvasFile> {
  return canvasFetchAbsolute<CanvasFile>(`${resolveCanvasConfig(configOverride).url}/api/v1/courses/${courseId}/files/${fileId}`, configOverride)
}

export async function getCanvasPage(
  courseId: number,
  input: { pageUrl?: string | null; apiUrl?: string | null },
  configOverride?: Partial<CanvasConfig>
): Promise<CanvasPage> {
  if (input.pageUrl) {
    return canvasFetch<CanvasPage>(`/courses/${courseId}/pages/${encodeURIComponent(input.pageUrl)}`, configOverride)
  }

  if (input.apiUrl) {
    const config = resolveCanvasConfig(configOverride)
    const absoluteUrl = new URL(input.apiUrl, `${config.url}/`).toString()
    return canvasFetchAbsolute<CanvasPage>(absoluteUrl, configOverride)
  }

  throw new Error('Canvas page resource is missing both page_url and API URL.')
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
  modules: CanvasModule[],
  resourceExtracts: Array<{ title: string; resourceType: string; extractedText: string }> = [],
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

  const usableExtracts = resourceExtracts.filter((resource) => resource.extractedText.trim().length > 0)
  if (usableExtracts.length > 0) {
    lines.push('')
    lines.push('RESOURCE EXTRACTS:')
    let totalChars = 0

    for (const resource of usableExtracts) {
      const remaining = 18000 - totalChars
      if (remaining <= 0) break

      const excerpt = resource.extractedText.slice(0, Math.min(remaining, 3200)).trim()
      if (!excerpt) continue

      lines.push(`- ${resource.title} (${resource.resourceType})`)
      lines.push(`  ${excerpt}`)
      totalChars += excerpt.length
    }
  }

  return lines.join('\n')
}
