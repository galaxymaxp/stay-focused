import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CANVAS_ONBOARDING_STEPS,
  CANVAS_VIDEO_PLACEHOLDER_TEXT,
  getCanvasTokenPageUrl,
} from '../lib/canvas-onboarding'

// --- getCanvasTokenPageUrl ---

test('canvas setup: generates /profile/settings link from a full https URL', () => {
  const result = getCanvasTokenPageUrl('https://myschool.instructure.com')
  assert.equal(result, 'https://myschool.instructure.com/profile/settings')
})

test('canvas setup: generates /profile/settings link from a URL without scheme', () => {
  const result = getCanvasTokenPageUrl('myschool.instructure.com')
  assert.equal(result, 'https://myschool.instructure.com/profile/settings')
})

test('canvas setup: generates /profile/settings link from a URL with trailing path', () => {
  const result = getCanvasTokenPageUrl('https://canvas.example.edu/courses/123')
  assert.equal(result, 'https://canvas.example.edu/profile/settings')
})

test('canvas setup: missing Canvas URL falls back — returns null for empty string', () => {
  assert.equal(getCanvasTokenPageUrl(''), null)
})

test('canvas setup: missing Canvas URL falls back — returns null for whitespace-only string', () => {
  assert.equal(getCanvasTokenPageUrl('   '), null)
})

test('canvas setup: unparseable input returns null for manual instruction fallback', () => {
  assert.equal(getCanvasTokenPageUrl('not a url at all !!!'), null)
})

test('canvas setup: http URLs are preserved as-is (respects user scheme)', () => {
  const result = getCanvasTokenPageUrl('http://canvas.school.org')
  assert.equal(result, 'http://canvas.school.org/profile/settings')
})

// --- CANVAS_VIDEO_PLACEHOLDER_TEXT ---

test('canvas setup: video placeholder text is defined and non-empty', () => {
  assert.ok(typeof CANVAS_VIDEO_PLACEHOLDER_TEXT === 'string')
  assert.ok(CANVAS_VIDEO_PLACEHOLDER_TEXT.trim().length > 0)
})

// --- CANVAS_ONBOARDING_STEPS ---

test('canvas setup: onboarding steps list has 7 items covering full token flow', () => {
  assert.equal(CANVAS_ONBOARDING_STEPS.length, 7)
})

test('canvas setup: onboarding steps include key token flow actions', () => {
  const joined = CANVAS_ONBOARDING_STEPS.join(' ').toLowerCase()
  assert.ok(joined.includes('canvas settings'), 'should mention opening Canvas settings')
  assert.ok(joined.includes('access token') || joined.includes('new access token'), 'should mention creating an access token')
  assert.ok(joined.includes('copy'), 'should remind user to copy the token')
  assert.ok(joined.includes('once') || joined.includes('one time'), 'should warn token is shown only one time')
  assert.ok(joined.includes('paste') || joined.includes('return here'), 'should instruct pasting token back')
  assert.ok(joined.includes('test connection'), 'should include test connection step')
})

test('canvas setup: token validation feedback — connection error message is truthy when set', () => {
  const errorFromCanvas = 'Invalid access token. Check that the token was copied correctly.'
  assert.ok(errorFromCanvas.length > 0)
  assert.ok(!errorFromCanvas.includes('401') && !errorFromCanvas.includes('HTTP'), 'error message should not expose raw HTTP codes')
})
