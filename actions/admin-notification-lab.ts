'use server'

import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { isAdminEmail } from '@/lib/admin'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'
import {
  buildGenericCanvasUpdateEvent,
  insertCanvasUpdateEvents,
  type CanvasUpdateEventContext,
  type CanvasUpdateEventInput,
  type CanvasUpdateEventType,
} from '@/lib/canvas-update-events'
import { attemptCanvasDigestForUser } from '@/lib/canvas-digest'

export interface NotificationLabActionState {
  ok: boolean
  error?: string
  presetKey?: string
  presetLabel?: string
  eventInserted?: boolean
  eventSkipped?: boolean
  emailSent?: boolean
  emailSkipped?: boolean
  emailFailed?: boolean
  recipient?: string | null
  skipReason?: string
  resendConfigured?: boolean
}

export const NOTIFICATION_LAB_PRESETS = [
  { key: 'module_posted', label: 'Module posted' },
  { key: 'module_edited', label: 'Module edited' },
  { key: 'syllabus_posted', label: 'Course syllabus posted' },
  { key: 'syllabus_edited', label: 'Course syllabus edited' },
  { key: 'announcement_posted', label: 'Announcement posted' },
  { key: 'announcement_edited', label: 'Announcement edited' },
  { key: 'assignment_posted', label: 'Assignment posted' },
  { key: 'assignment_edited', label: 'Assignment edited' },
  { key: 'quiz_posted', label: 'Quiz posted' },
  { key: 'quiz_edited', label: 'Quiz edited' },
  { key: 'discussion_posted', label: 'Discussion posted' },
  { key: 'discussion_edited', label: 'Discussion edited' },
  { key: 'deadline_changed', label: 'Deadline changed' },
  { key: 'resource_uploaded', label: 'Resource uploaded' },
  { key: 'ocr_completed', label: 'OCR completed' },
  { key: 'deep_learn_ready', label: 'Deep Learn ready' },
  { key: 'grade_update', label: 'Grade update' },
  { key: 'generic_canvas_update', label: 'Generic Canvas update' },
] as const

type NotificationLabPresetKey = typeof NOTIFICATION_LAB_PRESETS[number]['key']

const INITIAL_STATE: NotificationLabActionState = { ok: false }

export function getNotificationLabInitialState(): NotificationLabActionState {
  return INITIAL_STATE
}

export async function runNotificationLabAction(
  _prevState: NotificationLabActionState,
  formData: FormData,
): Promise<NotificationLabActionState> {
  const user = await getAuthenticatedUserServer()
  if (!user?.id) {
    return { ok: false, error: 'Not authenticated.' }
  }
  if (!isAdminEmail(user.email)) {
    return { ok: false, error: 'Not authorized.' }
  }

  const presetKey = String(formData.get('presetKey') ?? '').trim() as NotificationLabPresetKey
  const preset = NOTIFICATION_LAB_PRESETS.find((item) => item.key === presetKey)
  if (!preset) {
    return { ok: false, error: 'Unknown notification preset.' }
  }

  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) {
    return {
      ok: false,
      presetKey,
      presetLabel: preset.label,
      error: 'Supabase service role is not configured.',
      resendConfigured: false,
    }
  }

  const context = await loadNotificationLabContext(supabase, user.id)
  const event = buildNotificationLabEvent(preset.key, context)
  const insertResult = await insertCanvasUpdateEvents(supabase, [event])
  const digestResult = await attemptCanvasDigestForUser({
    supabase,
    userId: user.id,
    now: new Date(),
  })

  return {
    ok: true,
    presetKey,
    presetLabel: preset.label,
    eventInserted: insertResult.inserted > 0,
    eventSkipped: insertResult.skipped > 0,
    emailSent: digestResult.sent,
    emailSkipped: digestResult.skipped,
    emailFailed: !digestResult.sent && !digestResult.skipped,
    recipient: digestResult.recipient ?? null,
    skipReason: digestResult.skipReason,
    resendConfigured: digestResult.resendConfigured ?? false,
  }
}

async function loadNotificationLabContext(
  supabase: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>,
  userId: string,
): Promise<CanvasUpdateEventContext> {
  const { data: courseRow } = await supabase
    .from('courses')
    .select('id, canvas_instance_url, canvas_course_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const courseId = typeof courseRow?.id === 'string' ? courseRow.id : null
  let moduleId: string | null = null

  if (courseId) {
    const { data: moduleRow } = await supabase
      .from('modules')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    moduleId = typeof moduleRow?.id === 'string' ? moduleRow.id : null
  }

  return {
    userId,
    courseId,
    moduleId,
    canvasInstanceUrl: typeof courseRow?.canvas_instance_url === 'string' ? courseRow.canvas_instance_url : null,
    canvasCourseId: typeof courseRow?.canvas_course_id === 'number' ? courseRow.canvas_course_id : null,
    courseHref: courseId ? `/courses/${courseId}` : '/settings?section=notifications',
  }
}

function buildNotificationLabEvent(
  presetKey: NotificationLabPresetKey,
  context: CanvasUpdateEventContext,
): CanvasUpdateEventInput {
  const base: Pick<CanvasUpdateEventInput, 'user_id' | 'course_id' | 'module_id' | 'canvas_instance_url' | 'canvas_course_id' | 'app_href' | 'occurred_at'> = {
    user_id: context.userId,
    course_id: context.courseId,
    module_id: context.moduleId,
    canvas_instance_url: context.canvasInstanceUrl,
    canvas_course_id: context.canvasCourseId,
    app_href: context.courseHref,
    occurred_at: new Date().toISOString(),
  }

  const build = (input: {
    eventType: CanvasUpdateEventType
    stableKey: string
    sourceType: string
    sourceCanvasId: string
    sourceHash: string
    title: string
    summary?: string | null
  }): CanvasUpdateEventInput => ({
    ...base,
    event_type: input.eventType,
    stable_canvas_key: `${context.canvasInstanceUrl ?? ''}:${context.canvasCourseId ?? ''}:${input.sourceType}:${input.sourceCanvasId}`,
    title: input.title,
    summary: input.summary ?? null,
    source_type: input.sourceType,
    source_canvas_id: input.sourceCanvasId,
    source_hash: input.sourceHash,
    source_url: null,
    html_url: null,
    metadata: { notificationLab: true, presetKey, stableKey: input.stableKey },
  })

  switch (presetKey) {
    case 'module_posted':
      return build({ eventType: 'new_module', stableKey: 'module:lab-301', sourceType: 'module', sourceCanvasId: 'lab-301', sourceHash: 'state-v1', title: 'Week 7: Research methods', summary: '4 items' })
    case 'module_edited':
      return build({ eventType: 'edited_module', stableKey: 'module:lab-301', sourceType: 'module', sourceCanvasId: 'lab-301', sourceHash: 'state-v2', title: 'Week 7: Research methods and analysis', summary: '5 items' })
    case 'syllabus_posted':
      return build({ eventType: 'new_resource', stableKey: 'page:lab-syllabus', sourceType: 'page', sourceCanvasId: 'lab-syllabus', sourceHash: 'state-v1', title: 'Course syllabus', summary: 'Published in Canvas' })
    case 'syllabus_edited':
      return build({ eventType: 'edited_resource', stableKey: 'page:lab-syllabus', sourceType: 'page', sourceCanvasId: 'lab-syllabus', sourceHash: 'state-v2', title: 'Course syllabus', summary: 'Attendance and grading sections updated' })
    case 'announcement_posted':
      return build({ eventType: 'new_announcement', stableKey: 'announcement:lab-11', sourceType: 'announcement', sourceCanvasId: 'lab-11', sourceHash: 'state-v1', title: 'Class moved to room 204', summary: 'Tomorrow only.' })
    case 'announcement_edited':
      return build({ eventType: 'edited_announcement', stableKey: 'announcement:lab-11', sourceType: 'announcement', sourceCanvasId: 'lab-11', sourceHash: 'state-v2', title: 'Class moved to room 204', summary: 'Tomorrow only. Start time updated to 9:30 AM.' })
    case 'assignment_posted':
      return build({ eventType: 'new_assignment', stableKey: 'assignment:lab-21', sourceType: 'assignment', sourceCanvasId: 'lab-21', sourceHash: 'state-v1', title: 'Reaction paper 1', summary: 'Due May 20, 2026' })
    case 'assignment_edited':
      return build({ eventType: 'edited_assignment', stableKey: 'assignment:lab-21', sourceType: 'assignment', sourceCanvasId: 'lab-21', sourceHash: 'state-v2', title: 'Reaction paper 1', summary: 'Prompt and rubric updated' })
    case 'quiz_posted':
      return build({ eventType: 'new_quiz', stableKey: 'quiz:lab-31', sourceType: 'quiz', sourceCanvasId: 'lab-31', sourceHash: 'state-v1', title: 'Chapter 3 quiz', summary: 'Due May 18, 2026' })
    case 'quiz_edited':
      return build({ eventType: 'edited_quiz', stableKey: 'quiz:lab-31', sourceType: 'quiz', sourceCanvasId: 'lab-31', sourceHash: 'state-v2', title: 'Chapter 3 quiz', summary: 'Question pool updated' })
    case 'discussion_posted':
      return build({ eventType: 'new_discussion', stableKey: 'discussion:lab-41', sourceType: 'discussion', sourceCanvasId: 'lab-41', sourceHash: 'state-v1', title: 'Week 5 discussion', summary: 'Initial post due Friday' })
    case 'discussion_edited':
      return build({ eventType: 'edited_discussion', stableKey: 'discussion:lab-41', sourceType: 'discussion', sourceCanvasId: 'lab-41', sourceHash: 'state-v2', title: 'Week 5 discussion', summary: 'Reply requirement updated' })
    case 'deadline_changed':
      return build({ eventType: 'due_date_change', stableKey: 'assignment:lab-21:due', sourceType: 'assignment', sourceCanvasId: 'lab-21', sourceHash: '2026-05-23T23:59:00.000Z', title: 'Reaction paper 1', summary: 'Due date changed to May 23, 2026' })
    case 'resource_uploaded':
      return build({ eventType: 'new_resource', stableKey: 'file:lab-51', sourceType: 'file', sourceCanvasId: 'lab-51', sourceHash: 'state-v1', title: 'Lecture 8 slides.pdf', summary: 'Uploaded to Module 4' })
    case 'grade_update':
      return build({ eventType: 'grade_update', stableKey: 'assignment_grade:lab-21', sourceType: 'assignment', sourceCanvasId: 'lab-21', sourceHash: 'grade-v1', title: 'Reaction paper 1', summary: 'Grade A- (92)' })
    case 'ocr_completed':
      return buildGenericCanvasUpdateEvent({
        context,
        eventType: 'ocr_completed',
        stableKeySuffix: 'resource-ocr-lab-1',
        title: 'Scanned PDF is ready',
        summary: 'Readable text is now available for Lecture 8 slides.pdf',
        sourceType: 'resource',
        sourceCanvasId: 'resource-ocr-lab-1',
        sourceHash: 'state-v1',
        metadata: { notificationLab: true, presetKey },
      })
    case 'deep_learn_ready':
      return buildGenericCanvasUpdateEvent({
        context,
        eventType: 'deep_learn_ready',
        stableKeySuffix: 'deep-learn-lab-1',
        title: 'Deep Learn is ready',
        summary: 'Stay Focused finished grounding notes for Lecture 8 slides.pdf',
        sourceType: 'deep_learn',
        sourceCanvasId: 'deep-learn-lab-1',
        sourceHash: 'state-v1',
        metadata: { notificationLab: true, presetKey },
      })
    case 'generic_canvas_update':
      return buildGenericCanvasUpdateEvent({
        context,
        eventType: 'generic_canvas_update',
        stableKeySuffix: 'canvas-update-lab-1',
        title: 'Canvas course updated',
        summary: 'Multiple course items changed in Canvas.',
        sourceType: 'canvas',
        sourceCanvasId: 'canvas-update-lab-1',
        sourceHash: 'state-v1',
        metadata: { notificationLab: true, presetKey },
      })
  }
}
