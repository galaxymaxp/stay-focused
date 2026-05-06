import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanvasAnnouncement, CanvasAssignment, CanvasModule } from '@/lib/canvas'
import type { ModuleResource } from '@/lib/types'

export type CanvasUpdateEventType =
  | 'new_announcement'
  | 'new_assignment'
  | 'due_date_change'
  | 'new_module'
  | 'new_resource'

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
  title: string
  summary: string | null
  source_type: string | null
  source_canvas_id: string | null
  source_hash: string | null
  app_href: string | null
  occurred_at: string
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

export function buildAnnouncementEvent(
  announcement: CanvasAnnouncement,
  context: CanvasUpdateEventContext,
): CanvasUpdateEventInput {
  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: 'new_announcement',
    title: sanitizeEventTitle(announcement.title) || 'New announcement',
    summary: null,
    source_type: 'announcement',
    source_canvas_id: String(announcement.id),
    source_hash: null,
    app_href: context.courseHref,
    occurred_at: announcement.posted_at || new Date().toISOString(),
    metadata: {},
  }
}

export function buildAssignmentEvent(
  assignment: CanvasAssignment,
  context: CanvasUpdateEventContext,
): CanvasUpdateEventInput {
  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: 'new_assignment',
    title: sanitizeEventTitle(assignment.name) || 'New assignment',
    summary: assignment.due_at ? `Due ${formatEventDate(assignment.due_at)}` : null,
    source_type: 'assignment',
    source_canvas_id: String(assignment.id),
    source_hash: null,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: {},
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
    title: sanitizeEventTitle(assignment.name) || 'Assignment updated',
    summary: `Due date changed to ${formatEventDate(newDueAt)}`,
    source_type: 'assignment',
    source_canvas_id: String(assignment.id),
    source_hash: newDueAt,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: {},
  }
}

export function buildModuleEvent(
  module: CanvasModule,
  context: CanvasUpdateEventContext,
): CanvasUpdateEventInput {
  const itemCount = module.items.length
  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: 'new_module',
    title: sanitizeEventTitle(module.name) || 'New module',
    summary: itemCount > 0 ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : null,
    source_type: 'module',
    source_canvas_id: String(module.id),
    source_hash: null,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: {},
  }
}

export function buildResourceEvent(
  resource: ModuleResource,
  context: CanvasUpdateEventContext,
): CanvasUpdateEventInput | null {
  const canvasId = resource.canvasItemId ?? resource.canvasFileId
  if (!canvasId) return null

  return {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    event_type: 'new_resource',
    title: sanitizeEventTitle(resource.title) || 'New resource',
    summary: null,
    source_type: resource.canvasItemId !== null ? 'module_item' : 'file',
    source_canvas_id: String(canvasId),
    source_hash: null,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
    metadata: {},
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
    new_assignment: 0,
    due_date_change: 0,
    new_module: 0,
    new_resource: 0,
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
