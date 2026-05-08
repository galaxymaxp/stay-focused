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

export const INITIAL_NOTIFICATION_LAB_STATE: NotificationLabActionState = { ok: false }

export type NotificationLabPresetKey = typeof NOTIFICATION_LAB_PRESETS[number]['key']
