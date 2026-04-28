import type { CanvasCourse } from '@/lib/canvas'

export interface CanvasSettingsSnapshot {
  authUserId: string | null
  settingsUserId: string | null
  settingsRowExists: boolean
  canvasApiUrl: string | null
  canvasAccessToken: string | null
}

export interface CanvasUiStateSnapshot {
  connectionUrl: string | null
  courses: CanvasCourse[]
  selectedCourseIds: number[]
}

export function isCurrentUserCanvasConnected(settings: CanvasSettingsSnapshot) {
  return Boolean(
    settings.authUserId &&
    settings.settingsUserId === settings.authUserId &&
    settings.settingsRowExists &&
    settings.canvasApiUrl?.trim() &&
    settings.canvasAccessToken?.trim(),
  )
}

export function getCanvasCoursePickerState(input: {
  connected: boolean
  courses: CanvasCourse[]
}) {
  const courses = input.connected ? input.courses : []

  return {
    courses,
    syncDisabled: !input.connected || courses.length === 0,
    message: input.connected ? null : 'Canvas is not connected for this account.',
  }
}

export function clearCanvasUiState(): CanvasUiStateSnapshot {
  return {
    connectionUrl: null,
    courses: [],
    selectedCourseIds: [],
  }
}

export function getCanvasStateAfterAuthChange(input: {
  currentUserId: string | null
  nextUserId: string | null
  state: CanvasUiStateSnapshot
}) {
  if (input.currentUserId && input.nextUserId === input.currentUserId) {
    return input.state
  }

  return clearCanvasUiState()
}

export function getCanvasStateAfterForgetConnection() {
  return clearCanvasUiState()
}

export function canUseCanvasEnvFallback(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv !== 'production'
}
