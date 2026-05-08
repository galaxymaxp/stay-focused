import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanvasAnnouncement, CanvasAssignment, CanvasModule } from '@/lib/canvas'
import type { ModuleResource } from '@/lib/types'

export type CanvasUpdateEventType =
  | 'new_announcement'
  | 'edited_announcement'
  | 'new_assignment'
  | 'edited_assignment'
  | 'new_quiz'
  | 'edited_quiz'
  | 'new_discussion'
  | 'edited_discussion'
  | 'due_date_change'
  | 'new_module'
  | 'edited_module'
  | 'new_module_item'
  | 'edited_module_item'
  | 'new_resource'
  | 'edited_resource'
  | 'grade_update'
  | 'ocr_completed'
  | 'deep_learn_ready'
  | 'generic_canvas_update'
  // Reserved for future Canvas API integrations. The current sync code does
  // not fetch Canvas inbox conversations or instructor/submission comments.
  | 'new_message'
  | 'new_submission_comment'

export interface CanvasUpdateEventContext {
  userId: string
  courseId: string | null
  moduleId: string | null
  canvasInstanceUrl: string | null
  canvasCourseId: number | null
  courseHref: string | null
}

export interface CanvasUpdateEventInput {
  user_id: string
  course_id: string | null
  module_id: string | null
  canvas_instance_url: string | null
  canvas_course_id: number | null
  event_type: CanvasUpdateEventType
  stable_canvas_key: string | null
  title: string
  summary: string | null
  source_type: string | null
  source_canvas_id: string | null
  source_hash: string | null
  source_url: string | null
  html_url: string | null
  app_href: string | null
  occurred_at: string
  first_seen_at?: string
  skipped_reason?: string | null
  metadata: Record<string, unknown>
}

export interface CanvasUpdateEventCounts {
  canvasUpdateEventCount: number
  newAnnouncementCount: number
  newAssignmentCount: number
  dueDateChangeCount: number
  newModuleCount: number
  newResourceCount: number
}

export interface SeenCanvasState {
  stableCanvasKey: string
  eventType: CanvasUpdateEventType
  sourceHash: string | null
}

type AnnouncementEventKind = 'new' | 'edited'
type AssignmentEventKind = 'new' | 'edited'
type ModuleEventKind = 'new' | 'edited'
type ResourceEventKind = 'new' | 'edited'

export function buildAnnouncementEvent(
  announcement: CanvasAnnouncement,
  context: CanvasUpdateEventContext,
  kind: AnnouncementEventKind = 'new',
): CanvasUpdateEventInput {
  const stateHash = buildAnnouncementStateHash(announcement)
  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: kind === 'edited' ? 'edited_announcement' : 'new_announcement',
    stable_canvas_key: buildStableCanvasKey(context, 'announcement', announcement.id),
    title: sanitizeEventTitle(announcement.title) || 'New announcement',
    summary: sanitizeEventSnippet(announcement.message),
    source_type: 'announcement',
    source_canvas_id: String(announcement.id),
    source_hash: stateHash,
    source_url: announcement.url ?? null,
    html_url: announcement.html_url ?? announcement.url ?? null,
    app_href: context.courseHref,
    occurred_at: announcement.posted_at || new Date().toISOString(),
    metadata: { canvasAnnouncementId: announcement.id, stateHash },
  }
}

export function buildAssignmentEvent(
  assignment: CanvasAssignment,
  context: CanvasUpdateEventContext,
  kind: AssignmentEventKind = 'new',
): CanvasUpdateEventInput {
  const isQuiz = isCanvasQuizAssignment(assignment)
  const stateHash = buildAssignmentStateHash(assignment)
  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: isQuiz
      ? (kind === 'edited' ? 'edited_quiz' : 'new_quiz')
      : (kind === 'edited' ? 'edited_assignment' : 'new_assignment'),
    stable_canvas_key: buildStableCanvasKey(context, isQuiz ? 'quiz' : 'assignment', assignment.id),
    title: sanitizeEventTitle(assignment.name) || (isQuiz ? 'Quiz updated' : 'Assignment updated'),
    summary: assignment.due_at ? `Due ${formatEventDate(assignment.due_at)}` : null,
    source_type: isQuiz ? 'quiz' : 'assignment',
    source_canvas_id: String(assignment.id),
    source_hash: stateHash,
    source_url: assignment.url ?? null,
    html_url: assignment.html_url ?? assignment.url ?? null,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: { canvasAssignmentId: assignment.id, stateHash },
  }
}

export function buildDueDateChangeEvent(
  assignment: CanvasAssignment,
  newDueAt: string,
  context: CanvasUpdateEventContext,
): CanvasUpdateEventInput {
  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: 'due_date_change',
    stable_canvas_key: buildStableCanvasKey(context, isCanvasQuizAssignment(assignment) ? 'quiz' : 'assignment', assignment.id, newDueAt),
    title: sanitizeEventTitle(assignment.name) || 'Assignment updated',
    summary: `Due date changed to ${formatEventDate(newDueAt)}`,
    source_type: isCanvasQuizAssignment(assignment) ? 'quiz' : 'assignment',
    source_canvas_id: String(assignment.id),
    source_hash: newDueAt,
    source_url: assignment.url ?? null,
    html_url: assignment.html_url ?? assignment.url ?? null,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: { canvasAssignmentId: assignment.id, newDueAt },
  }
}

export function buildModuleEvent(
  module: CanvasModule,
  context: CanvasUpdateEventContext,
  kind: ModuleEventKind = 'new',
): CanvasUpdateEventInput {
  const itemCount = module.items.length
  const stateHash = buildModuleStateHash(module)
  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: kind === 'edited' ? 'edited_module' : 'new_module',
    stable_canvas_key: buildStableCanvasKey(context, 'module', module.id),
    title: sanitizeEventTitle(module.name) || (kind === 'edited' ? 'Module updated' : 'New module'),
    summary: itemCount > 0 ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : null,
    source_type: 'module',
    source_canvas_id: String(module.id),
    source_hash: stateHash,
    source_url: null,
    html_url: null,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: { canvasModuleId: module.id, stateHash },
  }
}

export function buildResourceEvent(
  resource: ModuleResource,
  context: CanvasUpdateEventContext,
  kind: ResourceEventKind = 'new',
): CanvasUpdateEventInput | null {
  const normalizedSourceType = readMetadataString(resource.metadata, 'normalizedSourceType')
    ?? normalizeSourceType(resource.resourceType)
  if (normalizedSourceType === 'assignment' || normalizedSourceType === 'quiz') return null

  const sourceType = normalizedSourceType === 'file'
    ? 'file'
    : normalizedSourceType === 'page'
      ? 'page'
      : normalizedSourceType === 'discussion'
        ? 'discussion'
        : 'module_item'

  const canvasId = sourceType === 'file'
    ? resource.canvasFileId ?? resource.canvasItemId
    : resource.canvasItemId ?? resource.canvasFileId
  if (!canvasId) return null

  const stateHash = buildResourceStateHash(resource)
  const eventType: CanvasUpdateEventType =
    normalizedSourceType === 'discussion'
      ? (kind === 'edited' ? 'edited_discussion' : 'new_discussion')
      : normalizedSourceType === 'file' || normalizedSourceType === 'page'
        ? (kind === 'edited' ? 'edited_resource' : 'new_resource')
        : (kind === 'edited' ? 'edited_module_item' : 'new_module_item')

  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: eventType,
    stable_canvas_key: buildStableCanvasKey(context, sourceType, canvasId),
    title: sanitizeEventTitle(resource.title) || (kind === 'edited' ? 'Resource updated' : 'New resource'),
    summary: null,
    source_type: sourceType,
    source_canvas_id: String(canvasId),
    source_hash: stateHash,
    source_url: resource.sourceUrl ?? null,
    html_url: resource.htmlUrl ?? resource.sourceUrl ?? null,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: {
      canvasModuleId: resource.canvasModuleId ?? null,
      canvasItemId: resource.canvasItemId ?? null,
      canvasFileId: resource.canvasFileId ?? null,
      normalizedSourceType,
      stateHash,
    },
  }
}

export function buildGradeUpdateEvent(
  assignment: CanvasAssignment,
  context: CanvasUpdateEventContext,
): CanvasUpdateEventInput | null {
  const stateHash = buildGradeStateHash(assignment)
  if (!stateHash) return null

  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: 'grade_update',
    stable_canvas_key: buildStableCanvasKey(context, isCanvasQuizAssignment(assignment) ? 'quiz_grade' : 'assignment_grade', assignment.id),
    title: sanitizeEventTitle(assignment.name) || 'Grade updated',
    summary: buildGradeSummary(assignment),
    source_type: isCanvasQuizAssignment(assignment) ? 'quiz' : 'assignment',
    source_canvas_id: String(assignment.id),
    source_hash: stateHash,
    source_url: assignment.url ?? null,
    html_url: assignment.html_url ?? assignment.url ?? null,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: { canvasAssignmentId: assignment.id, stateHash },
  }
}

// Pure: given fetched assignments and a map of existing deadlines keyed by
// canvas_assignment_id, returns assignments whose due date has changed.
export function detectDueDateChanges(
  assignments: CanvasAssignment[],
  existingDeadlines: Map<number, string | null>,
): Array<{ assignment: CanvasAssignment; newDueAt: string }> {
  const changes: Array<{ assignment: CanvasAssignment; newDueAt: string }> = []

  for (const assignment of assignments) {
    if (!existingDeadlines.has(assignment.id)) continue // no tracked task yet
    if (!assignment.due_at) continue // no incoming due date

    const existing = existingDeadlines.get(assignment.id)
    if (existing === assignment.due_at) continue // unchanged

    changes.push({ assignment, newDueAt: assignment.due_at })
  }

  return changes
}

export function buildExternalCanvasSyncEvents(input: {
  announcements: CanvasAnnouncement[]
  assignments: CanvasAssignment[]
  modules: CanvasModule[]
  newResources: ModuleResource[]
  editedResources?: ModuleResource[]
  existingAssignmentIds: Set<number>
  existingCanvasModuleIds: Set<number>
  dueDateChanges: Array<{ assignment: CanvasAssignment; newDueAt: string }>
  seenStates?: SeenCanvasState[]
  context: CanvasUpdateEventContext
}): CanvasUpdateEventInput[] {
  const events: CanvasUpdateEventInput[] = []
  const seenStateMap = buildSeenStateMap(input.seenStates ?? [])

  for (const announcement of input.announcements) {
    const next = buildAnnouncementEvent(announcement, input.context)
    const disposition = getStateDisposition(seenStateMap, next.stable_canvas_key, next.source_hash)
    if (disposition === 'new') {
      events.push(next)
    } else if (disposition === 'changed') {
      events.push(buildAnnouncementEvent(announcement, input.context, 'edited'))
    }
  }

  for (const assignment of input.assignments) {
    const next = buildAssignmentEvent(assignment, input.context)
    const disposition = getStateDisposition(seenStateMap, next.stable_canvas_key, next.source_hash)
    if (disposition === 'new') {
      if (!input.existingAssignmentIds.has(assignment.id)) {
        events.push(next)
      }
    } else if (disposition === 'changed') {
      events.push(buildAssignmentEvent(assignment, input.context, 'edited'))
    }

    const gradeEvent = buildGradeUpdateEvent(assignment, input.context)
    if (gradeEvent) {
      const gradeDisposition = getStateDisposition(seenStateMap, gradeEvent.stable_canvas_key, gradeEvent.source_hash)
      if (gradeDisposition === 'changed') {
        events.push(gradeEvent)
      }
    }
  }

  const newResourceCanvasModuleIds = new Set(
    input.newResources
      .map((resource) => resource.canvasModuleId)
      .filter((id): id is number => typeof id === 'number'),
  )

  for (const canvasModule of input.modules) {
    const next = buildModuleEvent(canvasModule, input.context)
    const disposition = getStateDisposition(seenStateMap, next.stable_canvas_key, next.source_hash)
    if (disposition === 'new') {
      if (
        newResourceCanvasModuleIds.has(canvasModule.id)
        && !input.existingCanvasModuleIds.has(canvasModule.id)
      ) {
        events.push(next)
      }
    } else if (disposition === 'changed') {
      events.push(buildModuleEvent(canvasModule, input.context, 'edited'))
    }
  }

  for (const resource of input.newResources) {
    const event = buildResourceEvent(resource, input.context, 'new')
    if (event) events.push(event)
  }

  for (const resource of input.editedResources ?? []) {
    const event = buildResourceEvent(resource, input.context, 'edited')
    if (!event) continue
    const disposition = getStateDisposition(seenStateMap, event.stable_canvas_key, event.source_hash)
    if (disposition === 'changed') events.push(event)
  }

  for (const { assignment, newDueAt } of input.dueDateChanges) {
    events.push(buildDueDateChangeEvent(assignment, newDueAt, input.context))
  }

  return events
}

export interface CanvasUpdateEventInsertResult {
  inserted: number
  skipped: number
  byType: Record<CanvasUpdateEventType, number>
}

// Insert events one at a time; unique-constraint violations (23505) mean the
// event already exists and are silently skipped. Other errors are logged.
export async function insertCanvasUpdateEvents(
  supabase: SupabaseClient,
  events: CanvasUpdateEventInput[],
): Promise<CanvasUpdateEventInsertResult> {
  const byType: Record<CanvasUpdateEventType, number> = {
    new_announcement: 0,
    edited_announcement: 0,
    new_assignment: 0,
    edited_assignment: 0,
    new_quiz: 0,
    edited_quiz: 0,
    new_discussion: 0,
    edited_discussion: 0,
    due_date_change: 0,
    new_module: 0,
    edited_module: 0,
    new_module_item: 0,
    edited_module_item: 0,
    new_resource: 0,
    edited_resource: 0,
    grade_update: 0,
    ocr_completed: 0,
    deep_learn_ready: 0,
    generic_canvas_update: 0,
    new_message: 0,
    new_submission_comment: 0,
  }

  if (events.length === 0) return { inserted: 0, skipped: 0, byType }

  let inserted = 0
  let skipped = 0

  for (const event of events) {
    const { error } = await supabase
      .from('canvas_update_events')
      .insert(event)

    if (!error) {
      inserted += 1
      byType[event.event_type] = (byType[event.event_type] ?? 0) + 1
      continue
    }

    const code = (error as { code?: string }).code
    if (code === '23505') {
      skipped += 1
      continue
    }

    console.warn('[canvas-update-events] insert failed', {
      eventType: event.event_type,
      sourceCanvasId: event.source_canvas_id,
      code,
      message: error.message,
    })
    skipped += 1
  }

  return { inserted, skipped, byType }
}

export function buildStableCanvasKey(
  context: Pick<CanvasUpdateEventContext, 'canvasInstanceUrl' | 'canvasCourseId'>,
  sourceType: string,
  sourceCanvasId: string | number,
  sourceHash?: string | null,
): string {
  return [
    context.canvasInstanceUrl ?? '',
    context.canvasCourseId ?? '',
    sourceType,
    sourceCanvasId,
    sourceHash ?? '',
  ].map((part) => String(part)).join(':')
}

export function buildAnnouncementStateHash(announcement: Pick<CanvasAnnouncement, 'title' | 'message' | 'posted_at' | 'html_url' | 'url'>): string {
  return hashCanvasState([
    announcement.title,
    sanitizeEventSnippet(announcement.message) ?? '',
    announcement.posted_at,
    announcement.html_url ?? '',
    announcement.url ?? '',
  ])
}

export function buildAssignmentStateHash(assignment: Pick<CanvasAssignment, 'name' | 'description' | 'due_at' | 'points_possible' | 'submission_types' | 'html_url' | 'url'>): string {
  return hashCanvasState([
    assignment.name,
    sanitizeEventSnippet(assignment.description) ?? '',
    assignment.due_at ?? '',
    assignment.points_possible,
    [...(assignment.submission_types ?? [])].sort().join(','),
    assignment.html_url ?? '',
    assignment.url ?? '',
  ])
}

export function buildModuleStateHash(module: Pick<CanvasModule, 'name' | 'items'>): string {
  return hashCanvasState([
    module.name,
    ...(module.items ?? []).map((item) => [
      item.id,
      item.title,
      item.type,
      item.content_id ?? '',
      item.url ?? '',
      item.html_url ?? '',
      item.page_url ?? '',
    ].join('|')),
  ])
}

export function buildResourceStateHash(resource: Pick<ModuleResource, 'title' | 'resourceType' | 'sourceUrl' | 'htmlUrl' | 'canvasItemId' | 'canvasFileId' | 'canvasModuleId' | 'metadata'>): string {
  const metadata = resource.metadata ?? {}
  return hashCanvasState([
    resource.title,
    resource.resourceType,
    resource.sourceUrl ?? '',
    resource.htmlUrl ?? '',
    resource.canvasModuleId ?? '',
    resource.canvasItemId ?? '',
    resource.canvasFileId ?? '',
    readMetadataString(metadata, 'normalizedSourceType') ?? '',
    readRawMetadataString(metadata, 'pageUpdatedAt') ?? '',
    readRawMetadataString(metadata, 'discussionUpdatedAt') ?? '',
    readRawMetadataString(metadata, 'fileUpdatedAt') ?? '',
    readRawMetadataString(metadata, 'discussionPostedAt') ?? '',
  ])
}

export function buildGradeStateHash(assignment: Pick<CanvasAssignment, 'submission'>): string | null {
  const submission = assignment.submission
  if (!submission) return null
  const score = submission.score ?? null
  const grade = submission.grade ?? null
  const workflowState = submission.workflow_state ?? null
  if (score === null && !grade && !workflowState) return null
  return hashCanvasState([score ?? '', grade ?? '', workflowState ?? '', submission.submitted_at ?? '', submission.excused ?? false])
}

export function buildGenericCanvasUpdateEvent(input: {
  context: CanvasUpdateEventContext
  eventType: Extract<CanvasUpdateEventType, 'ocr_completed' | 'deep_learn_ready' | 'generic_canvas_update'>
  stableKeySuffix: string
  title: string
  summary?: string | null
  sourceType?: string | null
  sourceCanvasId?: string | null
  sourceHash?: string | null
  appHref?: string | null
  metadata?: Record<string, unknown>
}): CanvasUpdateEventInput {
  return {
    user_id: input.context.userId,
    course_id: input.context.courseId,
    module_id: input.context.moduleId,
    canvas_instance_url: input.context.canvasInstanceUrl,
    canvas_course_id: input.context.canvasCourseId,
    event_type: input.eventType,
    stable_canvas_key: buildStableCanvasKey(input.context, input.eventType, input.stableKeySuffix),
    title: sanitizeEventTitle(input.title) || 'Canvas update',
    summary: sanitizeEventSnippet(input.summary) ?? null,
    source_type: input.sourceType ?? input.eventType,
    source_canvas_id: input.sourceCanvasId ?? input.stableKeySuffix,
    source_hash: input.sourceHash ?? hashCanvasState([input.eventType, input.stableKeySuffix, input.title, input.summary ?? '']),
    source_url: null,
    html_url: null,
    app_href: input.appHref ?? input.context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: input.metadata ?? {},
  }
}

export function isCanvasQuizAssignment(assignment: Pick<CanvasAssignment, 'name' | 'submission_types'>): boolean {
  const types = assignment.submission_types ?? []
  return types.some((type) => type.toLowerCase().includes('quiz'))
    || /\bquiz|exam|test\b/i.test(assignment.name)
}

export function sanitizeEventTitle(value: string | null | undefined): string {
  if (!value || !value.trim()) return ''
  // Strip patterns that should never appear in user-facing event text.
  const stripped = value
    .trim()
    // UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    // PostgREST error codes (e.g. PGRST204, PGRST116)
    .replace(/\bPGRST\d+\b/g, '')
    // Postgres SQLSTATE codes (e.g. 23505, 42703)
    .replace(/\b(23|42)\d{3}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return stripped.slice(0, 200)
}

function formatEventDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return isoDate
  }
}

function sanitizeEventSnippet(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null
  const stripped = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\bPGRST\d+\b/g, '')
    .replace(/\b(?:stack trace|debug|metadata|uuid)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped ? stripped.slice(0, 240) : null
}

function readMetadataString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'string' && raw.trim() ? normalizeSourceType(raw) : null
}

function readRawMetadataString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function buildSeenStateMap(states: SeenCanvasState[]) {
  const map = new Map<string, Set<string>>()
  for (const state of states) {
    if (!state.stableCanvasKey) continue
    const set = map.get(state.stableCanvasKey) ?? new Set<string>()
    if (state.sourceHash) set.add(state.sourceHash)
    map.set(state.stableCanvasKey, set)
  }
  return map
}

function getStateDisposition(
  states: Map<string, Set<string>>,
  stableCanvasKey: string | null,
  sourceHash: string | null,
): 'new' | 'changed' | 'same' {
  if (!stableCanvasKey || !sourceHash) return 'changed'
  const seen = states.get(stableCanvasKey)
  if (!seen) return 'new'
  if (seen.has(sourceHash)) return 'same'
  return 'changed'
}

function buildGradeSummary(assignment: Pick<CanvasAssignment, 'submission'>) {
  const submission = assignment.submission
  if (!submission) return 'Grade updated in Canvas'
  if (submission.grade && submission.score !== null && submission.score !== undefined) {
    return `Grade ${submission.grade} (${submission.score})`
  }
  if (submission.grade) return `Grade ${submission.grade}`
  if (submission.score !== null && submission.score !== undefined) return `Score ${submission.score}`
  return 'Grade updated in Canvas'
}

function hashCanvasState(parts: unknown[]): string {
  const payload = parts
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .map((part) => String(part ?? ''))
    .join('\u001f')
  let hash = 2166136261
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `st_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function normalizeSourceType(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized.includes('discussion')) return 'discussion'
  if (normalized.includes('assignment')) return 'assignment'
  if (normalized.includes('quiz')) return 'quiz'
  if (normalized.includes('page')) return 'page'
  if (normalized.includes('file') || normalized.includes('pdf') || normalized.includes('document')) return 'file'
  if (normalized.includes('external')) return 'external_link'
  return normalized || 'module_item'
}
