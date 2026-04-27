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
  teachers?: Array<{ display_name: string }>
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
  html_url?: string | null
  url?: string | null
}

export interface CanvasDiscussionTopic {
  id: number
  title: string
  message: string | null
  html_url?: string | null
  url?: string | null
  posted_at?: string | null
  updated_at?: string | null
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

export type CanvasResolvedTargetType =
  | 'page'
  | 'file'
  | 'assignment'
  | 'discussion'
  | 'external_link'
  | 'unknown'

export type CanvasResolvedUrlCategory =
  | 'canvas_page'
  | 'canvas_file'
  | 'canvas_assignment'
  | 'canvas_discussion'
  | 'canvas_module_redirect'
  | 'canvas_module_item'
  | 'canvas_external_tool'
  | 'canvas_api'
  | 'canvas_html'
  | 'external'
  | 'relative'
  | 'unknown'

export type CanvasTargetResolutionState =
  | 'resolved'
  | 'external_link_only'
  | 'canvas_resolution_required'
  | 'canvas_fetch_failed'
  | 'unknown'

export interface CanvasResolvedLinkTarget {
  originalUrl: string | null
  originalUrlCategory: CanvasResolvedUrlCategory
  resolvedUrl: string | null
  resolvedUrlCategory: CanvasResolvedUrlCategory
  resolvedTargetType: CanvasResolvedTargetType
  resolutionState: CanvasTargetResolutionState
  reason: string | null
  courseId: number | null
  pageUrl: string | null
  fileId: number | null
  assignmentId: number | null
  discussionId: number | null
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

async function resolveCanvasBinaryUrl(url: string, configOverride?: Partial<CanvasConfig>) {
  const config = resolveCanvasConfig(configOverride)
  const absoluteUrl = new URL(url, `${config.url}/`).toString()
  const parsed = new URL(absoluteUrl)
  const normalizedPathname = parsed.pathname.replace(/\/$/, '')

  if (/\/api\/v1\/(?:courses\/\d+\/)?files\/\d+$/i.test(normalizedPathname)) {
    const file = await canvasFetchAbsolute<CanvasFile>(absoluteUrl, configOverride)
    if (!file.url) {
      throw new Error('Canvas returned a file record without a downloadable URL.')
    }

    return file.url
  }

  if (/\/courses\/\d+\/files\/\d+$/i.test(normalizedPathname)) {
    parsed.pathname = `${normalizedPathname}/download`
    return parsed.toString()
  }

  return absoluteUrl
}

export async function downloadCanvasBinarySource(
  url: string,
  configOverride?: Partial<CanvasConfig>,
): Promise<{ buffer: Buffer; contentType: string | null; url: string }> {
  const config = resolveCanvasConfig(configOverride)
  const resolvedUrl = await resolveCanvasBinaryUrl(url, configOverride)
  const res = await fetch(resolvedUrl, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    throw new Error(`Canvas returned an unexpected error (${res.status}) while downloading a file.`)
  }

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type'),
    url: resolvedUrl,
  }
}

export async function downloadCanvasBinary(url: string, configOverride?: Partial<CanvasConfig>): Promise<Buffer> {
  const downloaded = await downloadCanvasBinarySource(url, configOverride)
  return downloaded.buffer
}

export async function getCourses(configOverride?: Partial<CanvasConfig>): Promise<CanvasCourse[]> {
  const courses = await canvasFetch<CanvasCourse[]>(
    '/courses?enrollment_state=active&enrollment_type=student&state[]=available&include[]=term&include[]=teachers',
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

export async function getCanvasAssignment(
  courseId: number,
  input: { assignmentId?: number | null; apiUrl?: string | null },
  configOverride?: Partial<CanvasConfig>,
): Promise<CanvasAssignment> {
  if (typeof input.assignmentId === 'number') {
    return canvasFetch<CanvasAssignment>(`/courses/${courseId}/assignments/${input.assignmentId}`, configOverride)
  }

  if (input.apiUrl) {
    const config = resolveCanvasConfig(configOverride)
    const absoluteUrl = new URL(input.apiUrl, `${config.url}/`).toString()
    return canvasFetchAbsolute<CanvasAssignment>(absoluteUrl, configOverride)
  }

  throw new Error('Canvas assignment resource is missing both assignment ID and API URL.')
}

export async function getAnnouncements(courseId: number, configOverride?: Partial<CanvasConfig>): Promise<CanvasAnnouncement[]> {
  return canvasFetch<CanvasAnnouncement[]>(
    `/courses/${courseId}/discussion_topics?only_announcements=true&order_by=recent_activity`,
    configOverride
  )
}

export async function getCanvasDiscussionTopic(
  courseId: number,
  input: { topicId?: number | null; apiUrl?: string | null },
  configOverride?: Partial<CanvasConfig>,
): Promise<CanvasDiscussionTopic> {
  if (typeof input.topicId === 'number') {
    return canvasFetch<CanvasDiscussionTopic>(`/courses/${courseId}/discussion_topics/${input.topicId}`, configOverride)
  }

  if (input.apiUrl) {
    const config = resolveCanvasConfig(configOverride)
    const absoluteUrl = new URL(input.apiUrl, `${config.url}/`).toString()
    return canvasFetchAbsolute<CanvasDiscussionTopic>(absoluteUrl, configOverride)
  }

  throw new Error('Canvas discussion resource is missing both topic ID and API URL.')
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

export async function resolveCanvasLinkedTarget(
  url: string | null | undefined,
  configOverride?: Partial<CanvasConfig> | null,
): Promise<CanvasResolvedLinkTarget> {
  const baseUrl = getOptionalCanvasBaseUrl(configOverride)
  const initial = classifyCanvasTargetUrl(url ?? null, baseUrl)

  if (!initial.absoluteUrl) {
    return finalizeCanvasResolvedTarget(initial, {
      resolutionState: 'unknown',
      reason: 'This module resource does not have a resolvable Canvas URL yet.',
    })
  }

  if (initial.targetType === 'external_link') {
    return finalizeCanvasResolvedTarget(initial, {
      resolutionState: 'external_link_only',
      reason: 'This resource resolves to an external link, so Stay Focused keeps it link-only instead of pretending it parsed the destination body.',
    })
  }

  if (initial.targetType !== 'unknown') {
    return finalizeCanvasResolvedTarget(initial, {
      resolutionState: 'resolved',
    })
  }

  if (!requiresCanvasFetch(initial.category)) {
    return finalizeCanvasResolvedTarget(initial, {
      resolutionState: 'unknown',
      reason: 'This Canvas URL could not be classified into a readable target yet.',
    })
  }

  const config = getOptionalCanvasResolutionConfig(configOverride)
  if (!config) {
    return finalizeCanvasResolvedTarget(initial, {
      resolutionState: 'canvas_resolution_required',
      reason: 'Canvas auth is required before Stay Focused can resolve this internal Canvas link to its real target.',
    })
  }

  const resolvedFetch = await followCanvasResolutionTarget(initial.absoluteUrl, config)
  if (resolvedFetch.failureState) {
    return finalizeCanvasResolvedTarget(initial, {
      resolvedUrl: resolvedFetch.lastUrl ?? initial.absoluteUrl,
      resolvedUrlCategory: classifyCanvasTargetUrl(resolvedFetch.lastUrl ?? initial.absoluteUrl, config.url).category,
      resolutionState: resolvedFetch.failureState,
      reason: resolvedFetch.reason,
    })
  }

  const resolved = classifyCanvasTargetUrl(resolvedFetch.lastUrl ?? initial.absoluteUrl, config.url)
  if (resolved.targetType === 'external_link') {
    return finalizeCanvasResolvedTarget(initial, {
      resolvedUrl: resolved.absoluteUrl,
      resolvedUrlCategory: resolved.category,
      resolvedTargetType: resolved.targetType,
      courseId: resolved.courseId,
      pageUrl: resolved.pageUrl,
      fileId: resolved.fileId,
      assignmentId: resolved.assignmentId,
      discussionId: resolved.discussionId,
      resolutionState: 'external_link_only',
      reason: 'This resource resolves outside Canvas, so Stay Focused keeps it as a link-only target.',
    })
  }

  if (resolved.targetType === 'unknown') {
    return finalizeCanvasResolvedTarget(initial, {
      resolvedUrl: resolved.absoluteUrl,
      resolvedUrlCategory: resolved.category,
      courseId: resolved.courseId,
      pageUrl: resolved.pageUrl,
      fileId: resolved.fileId,
      assignmentId: resolved.assignmentId,
      discussionId: resolved.discussionId,
      resolutionState: 'canvas_resolution_required',
      reason: 'Canvas resolved this module link, but the final route still needs manual Canvas opening because it is not a readable target in the current pipeline.',
    })
  }

  return finalizeCanvasResolvedTarget(initial, {
    resolvedUrl: resolved.absoluteUrl,
    resolvedUrlCategory: resolved.category,
    resolvedTargetType: resolved.targetType,
    courseId: resolved.courseId,
    pageUrl: resolved.pageUrl,
    fileId: resolved.fileId,
    assignmentId: resolved.assignmentId,
    discussionId: resolved.discussionId,
    resolutionState: 'resolved',
  })
}

export function classifyCanvasTargetUrl(
  value: string | null | undefined,
  canvasBaseUrl?: string | null,
): {
  absoluteUrl: string | null
  category: CanvasResolvedUrlCategory
  targetType: CanvasResolvedTargetType
  courseId: number | null
  pageUrl: string | null
  fileId: number | null
  assignmentId: number | null
  discussionId: number | null
} {
  if (!value?.trim()) {
    return {
      absoluteUrl: null,
      category: 'unknown',
      targetType: 'unknown',
      courseId: null,
      pageUrl: null,
      fileId: null,
      assignmentId: null,
      discussionId: null,
    }
  }

  const absoluteUrl = resolveCanvasAbsoluteUrl(value, canvasBaseUrl)
  if (!absoluteUrl) {
    return {
      absoluteUrl: null,
      category: 'unknown',
      targetType: 'unknown',
      courseId: null,
      pageUrl: null,
      fileId: null,
      assignmentId: null,
      discussionId: null,
    }
  }

  const parsed = new URL(absoluteUrl)
  const normalizedPath = parsed.pathname.replace(/\/$/, '')
  const canvasHost = canvasBaseUrl ? new URL(`${normalizeCanvasUrl(canvasBaseUrl)}/`).host : null
  const isCanvasLikePath = normalizedPath.includes('/courses/') || normalizedPath.includes('/api/v1/')
  const isCanvasHost = canvasHost ? parsed.host === canvasHost : isCanvasLikePath

  if (!isCanvasHost) {
    return {
      absoluteUrl,
      category: absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://') ? 'external' : 'relative',
      targetType: 'external_link',
      courseId: null,
      pageUrl: null,
      fileId: null,
      assignmentId: null,
      discussionId: null,
    }
  }

  const moduleRedirectMatch = normalizedPath.match(/\/api\/v1\/courses\/(\d+)\/module_item_redirect\/(\d+)$/i)
  if (moduleRedirectMatch) {
    return {
      absoluteUrl,
      category: 'canvas_module_redirect',
      targetType: 'unknown',
      courseId: normalizeCanvasNumericId(moduleRedirectMatch[1]),
      pageUrl: null,
      fileId: null,
      assignmentId: null,
      discussionId: null,
    }
  }

  const moduleItemMatch = normalizedPath.match(/\/courses\/(\d+)\/modules\/items\/(\d+)$/i)
  if (moduleItemMatch) {
    return {
      absoluteUrl,
      category: 'canvas_module_item',
      targetType: 'unknown',
      courseId: normalizeCanvasNumericId(moduleItemMatch[1]),
      pageUrl: null,
      fileId: null,
      assignmentId: null,
      discussionId: null,
    }
  }

  const externalToolMatch = normalizedPath.match(/\/courses\/(\d+)\/external_tools\/sessionless_launch$/i)
  if (externalToolMatch) {
    return {
      absoluteUrl,
      category: 'canvas_external_tool',
      targetType: 'unknown',
      courseId: normalizeCanvasNumericId(externalToolMatch[1]),
      pageUrl: null,
      fileId: null,
      assignmentId: null,
      discussionId: null,
    }
  }

  const pageApiMatch = normalizedPath.match(/\/api\/v1\/courses\/(\d+)\/pages\/(.+)$/i)
  if (pageApiMatch) {
    return {
      absoluteUrl,
      category: 'canvas_page',
      targetType: 'page',
      courseId: normalizeCanvasNumericId(pageApiMatch[1]),
      pageUrl: decodeURIComponent(pageApiMatch[2] ?? ''),
      fileId: null,
      assignmentId: null,
      discussionId: null,
    }
  }

  const pageHtmlMatch = normalizedPath.match(/\/courses\/(\d+)\/pages\/(.+)$/i)
  if (pageHtmlMatch) {
    return {
      absoluteUrl,
      category: 'canvas_page',
      targetType: 'page',
      courseId: normalizeCanvasNumericId(pageHtmlMatch[1]),
      pageUrl: decodeURIComponent(pageHtmlMatch[2] ?? ''),
      fileId: null,
      assignmentId: null,
      discussionId: null,
    }
  }

  const fileApiMatch = normalizedPath.match(/\/api\/v1\/(?:courses\/(\d+)\/)?files\/(\d+)$/i)
  if (fileApiMatch) {
    return {
      absoluteUrl,
      category: 'canvas_file',
      targetType: 'file',
      courseId: normalizeCanvasNumericId(fileApiMatch[1]),
      pageUrl: null,
      fileId: normalizeCanvasNumericId(fileApiMatch[2]),
      assignmentId: null,
      discussionId: null,
    }
  }

  const fileHtmlMatch = normalizedPath.match(/\/courses\/(\d+)\/files\/(\d+)(?:\/(?:download|file_preview))?$/i)
  if (fileHtmlMatch) {
    return {
      absoluteUrl,
      category: 'canvas_file',
      targetType: 'file',
      courseId: normalizeCanvasNumericId(fileHtmlMatch[1]),
      pageUrl: null,
      fileId: normalizeCanvasNumericId(fileHtmlMatch[2]),
      assignmentId: null,
      discussionId: null,
    }
  }

  const assignmentApiMatch = normalizedPath.match(/\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)$/i)
  if (assignmentApiMatch) {
    return {
      absoluteUrl,
      category: 'canvas_assignment',
      targetType: 'assignment',
      courseId: normalizeCanvasNumericId(assignmentApiMatch[1]),
      pageUrl: null,
      fileId: null,
      assignmentId: normalizeCanvasNumericId(assignmentApiMatch[2]),
      discussionId: null,
    }
  }

  const assignmentHtmlMatch = normalizedPath.match(/\/courses\/(\d+)\/assignments\/(\d+)$/i)
  if (assignmentHtmlMatch) {
    return {
      absoluteUrl,
      category: 'canvas_assignment',
      targetType: 'assignment',
      courseId: normalizeCanvasNumericId(assignmentHtmlMatch[1]),
      pageUrl: null,
      fileId: null,
      assignmentId: normalizeCanvasNumericId(assignmentHtmlMatch[2]),
      discussionId: null,
    }
  }

  const discussionApiMatch = normalizedPath.match(/\/api\/v1\/courses\/(\d+)\/discussion_topics\/(\d+)$/i)
  if (discussionApiMatch) {
    return {
      absoluteUrl,
      category: 'canvas_discussion',
      targetType: 'discussion',
      courseId: normalizeCanvasNumericId(discussionApiMatch[1]),
      pageUrl: null,
      fileId: null,
      assignmentId: null,
      discussionId: normalizeCanvasNumericId(discussionApiMatch[2]),
    }
  }

  const discussionHtmlMatch = normalizedPath.match(/\/courses\/(\d+)\/discussion_topics\/(\d+)$/i)
  if (discussionHtmlMatch) {
    return {
      absoluteUrl,
      category: 'canvas_discussion',
      targetType: 'discussion',
      courseId: normalizeCanvasNumericId(discussionHtmlMatch[1]),
      pageUrl: null,
      fileId: null,
      assignmentId: null,
      discussionId: normalizeCanvasNumericId(discussionHtmlMatch[2]),
    }
  }

  if (normalizedPath.includes('/api/v1/')) {
    return {
      absoluteUrl,
      category: 'canvas_api',
      targetType: 'unknown',
      courseId: extractCanvasCourseIdFromPath(normalizedPath),
      pageUrl: null,
      fileId: null,
      assignmentId: null,
      discussionId: null,
    }
  }

  return {
    absoluteUrl,
    category: 'canvas_html',
    targetType: 'unknown',
    courseId: extractCanvasCourseIdFromPath(normalizedPath),
    pageUrl: null,
    fileId: null,
    assignmentId: null,
    discussionId: null,
  }
}

async function followCanvasResolutionTarget(url: string, config: CanvasConfig) {
  let currentUrl = url

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(currentUrl, {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
      next: { revalidate: 0 },
      redirect: 'manual',
    })

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('location')
      if (!location) {
        return {
          lastUrl: currentUrl,
          failureState: 'canvas_fetch_failed' as const,
          reason: 'Canvas returned a redirect response without a destination URL while resolving this module link.',
        }
      }

      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    if (response.status === 401 || response.status === 403) {
      return {
        lastUrl: currentUrl,
        failureState: 'canvas_resolution_required' as const,
        reason: 'Canvas auth is still required to resolve this internal module link cleanly.',
      }
    }

    if (!response.ok) {
      return {
        lastUrl: currentUrl,
        failureState: 'canvas_fetch_failed' as const,
        reason: `Canvas returned HTTP ${response.status} while resolving this internal module link.`,
      }
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('json')) {
      const payload = await response.json() as Record<string, unknown>
      const nextUrl = findCanvasRedirectCandidate(payload)
      if (nextUrl) {
        currentUrl = new URL(nextUrl, currentUrl).toString()
        continue
      }
    } else if (contentType.includes('text/html')) {
      const html = await response.text()
      const nextUrl = readHtmlRedirectCandidate(html)
      if (nextUrl) {
        currentUrl = new URL(nextUrl, currentUrl).toString()
        continue
      }
    }

    return {
      lastUrl: currentUrl,
      failureState: null,
      reason: null,
    }
  }

  return {
    lastUrl: currentUrl,
    failureState: 'canvas_fetch_failed' as const,
    reason: 'Canvas kept redirecting this module link without landing on a stable target.',
  }
}

function findCanvasRedirectCandidate(payload: Record<string, unknown>) {
  const directUrl = firstTrimmedString(payload.url, payload.html_url, payload.launch_url)
  if (directUrl) {
    return directUrl
  }

  if (typeof payload.authorized_redirect_url === 'string' && payload.authorized_redirect_url.trim()) {
    return payload.authorized_redirect_url.trim()
  }

  if (typeof payload.session_url === 'string' && payload.session_url.trim()) {
    return payload.session_url.trim()
  }

  return null
}

function readHtmlRedirectCandidate(html: string) {
  const refreshMatch = html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>\s]+)/i)
  if (refreshMatch?.[1]) {
    return refreshMatch[1]
  }

  const locationMatch = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i)
  if (locationMatch?.[1]) {
    return locationMatch[1]
  }

  return null
}

function firstTrimmedString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function finalizeCanvasResolvedTarget(
  base: ReturnType<typeof classifyCanvasTargetUrl>,
  overrides: Partial<Omit<CanvasResolvedLinkTarget, 'originalUrl' | 'originalUrlCategory'>> & {
    resolutionState: CanvasTargetResolutionState
  },
): CanvasResolvedLinkTarget {
  return {
    originalUrl: base.absoluteUrl,
    originalUrlCategory: base.category,
    resolvedUrl: overrides.resolvedUrl ?? base.absoluteUrl,
    resolvedUrlCategory: overrides.resolvedUrlCategory ?? base.category,
    resolvedTargetType: overrides.resolvedTargetType ?? base.targetType,
    resolutionState: overrides.resolutionState,
    reason: overrides.reason ?? null,
    courseId: overrides.courseId ?? base.courseId,
    pageUrl: overrides.pageUrl ?? base.pageUrl,
    fileId: overrides.fileId ?? base.fileId,
    assignmentId: overrides.assignmentId ?? base.assignmentId,
    discussionId: overrides.discussionId ?? base.discussionId,
  }
}

function requiresCanvasFetch(category: CanvasResolvedUrlCategory) {
  return category === 'canvas_module_redirect'
    || category === 'canvas_module_item'
    || category === 'canvas_external_tool'
    || category === 'canvas_api'
    || category === 'canvas_html'
}

function getOptionalCanvasBaseUrl(configOverride?: Partial<CanvasConfig> | null) {
  const rawUrl = configOverride?.url?.trim() || DEFAULT_CANVAS_URL?.trim() || null
  if (!rawUrl) return null

  try {
    return normalizeCanvasUrl(rawUrl)
  } catch {
    return null
  }
}

function getOptionalCanvasResolutionConfig(configOverride?: Partial<CanvasConfig> | null) {
  const url = getOptionalCanvasBaseUrl(configOverride)
  const token = configOverride?.token?.trim() || DEFAULT_CANVAS_TOKEN?.trim() || null
  if (!url || !token) {
    return null
  }

  return {
    url,
    token,
  } satisfies CanvasConfig
}

function resolveCanvasAbsoluteUrl(value: string, canvasBaseUrl?: string | null) {
  try {
    return new URL(value, canvasBaseUrl ? `${normalizeCanvasUrl(canvasBaseUrl)}/` : undefined).toString()
  } catch {
    return null
  }
}

function extractCanvasCourseIdFromPath(pathname: string) {
  const match = pathname.match(/\/courses\/(\d+)(?:\/|$)/i)
  return normalizeCanvasNumericId(match?.[1] ?? null)
}

function normalizeCanvasNumericId(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
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
      if (announcement.html_url) lines.push(`  Link: ${announcement.html_url}`)
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
