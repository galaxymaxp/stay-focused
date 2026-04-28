import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canUseCanvasEnvFallback,
  getCanvasCoursePickerState,
  getCanvasStateAfterAuthChange,
  getCanvasStateAfterForgetConnection,
  isCurrentUserCanvasConnected,
  type CanvasUiStateSnapshot,
} from '../lib/canvas-settings-state'
import type { CanvasCourse } from '../lib/canvas'

const USER_ID = '7847171f-9c29-45c3-85b1-ef827f624ac0'
const OTHER_USER_ID = 'd2aa2fe2-523a-42f7-b65a-ef593b0b0e7b'

test('current user with no user_settings row stays disconnected even if stale browser storage exists', () => {
  const staleLocalStorage = {
    url: 'https://uc-bcf.instructure.com',
    token: 'old-token',
    courseCount: 8,
  }

  assert.equal(staleLocalStorage.courseCount, 8)
  assert.equal(isCurrentUserCanvasConnected({
    authUserId: USER_ID,
    settingsUserId: USER_ID,
    settingsRowExists: false,
    canvasApiUrl: null,
    canvasAccessToken: null,
  }), false)
})

test('no user_settings row keeps available courses empty and sync disabled', () => {
  const state = getCanvasCoursePickerState({
    connected: false,
    courses: [course(101, 'Stale Course')],
  })

  assert.deepEqual(state.courses, [])
  assert.equal(state.syncDisabled, true)
  assert.equal(state.message, 'Canvas is not connected for this account.')
})

test('account switch clears previous Canvas course selection state', () => {
  const previousState: CanvasUiStateSnapshot = {
    connectionUrl: 'https://uc-bcf.instructure.com',
    courses: [course(101, 'Previous Course')],
    selectedCourseIds: [101],
  }

  assert.deepEqual(getCanvasStateAfterAuthChange({
    currentUserId: USER_ID,
    nextUserId: OTHER_USER_ID,
    state: previousState,
  }), {
    connectionUrl: null,
    courses: [],
    selectedCourseIds: [],
  })
})

test('valid current-user settings row counts as connected and allows courses', () => {
  const connected = isCurrentUserCanvasConnected({
    authUserId: USER_ID,
    settingsUserId: USER_ID,
    settingsRowExists: true,
    canvasApiUrl: 'https://uc-bcf.instructure.com',
    canvasAccessToken: 'current-token',
  })
  const state = getCanvasCoursePickerState({
    connected,
    courses: [course(101, 'Current Course')],
  })

  assert.equal(connected, true)
  assert.equal(state.syncDisabled, false)
  assert.deepEqual(state.courses.map((item) => item.id), [101])
})

test('other-user settings row does not count for current Canvas connection', () => {
  assert.equal(isCurrentUserCanvasConnected({
    authUserId: USER_ID,
    settingsUserId: OTHER_USER_ID,
    settingsRowExists: true,
    canvasApiUrl: 'https://uc-bcf.instructure.com',
    canvasAccessToken: 'other-user-token',
  }), false)
})

test('forget connection clears Canvas UI state even when DB row is absent', () => {
  assert.deepEqual(getCanvasStateAfterForgetConnection(), {
    connectionUrl: null,
    courses: [],
    selectedCourseIds: [],
  })
})

test('production Canvas env fallback is disabled', () => {
  assert.equal(canUseCanvasEnvFallback('production'), false)
  assert.equal(canUseCanvasEnvFallback('development'), true)
  assert.equal(canUseCanvasEnvFallback('test'), true)
})

function course(id: number, name: string): CanvasCourse {
  return {
    id,
    name,
    course_code: name.toUpperCase().replace(/\s+/g, '-'),
    enrollment_state: 'active',
  }
}
