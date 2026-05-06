import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTestEmailRecipient, classifyTestEmailError, isResendDevSender } from '../lib/resend'

// ---------------------------------------------------------------------------
// resolveTestEmailRecipient
// ---------------------------------------------------------------------------

test('resolveTestEmailRecipient uses EMAIL_TEST_TO in non-production when set', () => {
  const original = process.env.EMAIL_TEST_TO
  process.env.EMAIL_TEST_TO = 'dev-inbox@example.com'

  assert.equal(resolveTestEmailRecipient('account@example.com', false), 'dev-inbox@example.com')

  if (original === undefined) delete process.env.EMAIL_TEST_TO
  else process.env.EMAIL_TEST_TO = original
})

test('resolveTestEmailRecipient falls back to user email in non-production when EMAIL_TEST_TO is absent', () => {
  const original = process.env.EMAIL_TEST_TO
  delete process.env.EMAIL_TEST_TO

  assert.equal(resolveTestEmailRecipient('account@example.com', false), 'account@example.com')

  if (original !== undefined) process.env.EMAIL_TEST_TO = original
})

test('resolveTestEmailRecipient ignores EMAIL_TEST_TO in production', () => {
  const original = process.env.EMAIL_TEST_TO
  process.env.EMAIL_TEST_TO = 'dev-inbox@example.com'

  assert.equal(resolveTestEmailRecipient('account@example.com', true), 'account@example.com')

  if (original === undefined) delete process.env.EMAIL_TEST_TO
  else process.env.EMAIL_TEST_TO = original
})

// ---------------------------------------------------------------------------
// classifyTestEmailError
// ---------------------------------------------------------------------------

test('classifyTestEmailError returns resend.dev restriction message for resend.dev sender', () => {
  const msg = classifyTestEmailError('Stay Focused <onboarding@resend.dev>')
  assert.ok(msg.includes('onboarding@resend.dev'), 'should mention the sender address')
  assert.ok(msg.includes('verified domain'), 'should point to the fix')
})

test('classifyTestEmailError returns generic message for non-resend.dev sender', () => {
  const msg = classifyTestEmailError('Stay Focused <noreply@stayfocused.app>')
  assert.ok(msg.includes('RESEND_API_KEY'), 'should mention config vars')
  assert.ok(!msg.includes('resend.dev'), 'should not mention resend.dev restriction')
})

// ---------------------------------------------------------------------------
// isResendDevSender
// ---------------------------------------------------------------------------

test('isResendDevSender returns true when EMAIL_FROM contains @resend.dev', () => {
  const original = process.env.EMAIL_FROM
  process.env.EMAIL_FROM = 'Stay Focused <onboarding@resend.dev>'
  assert.equal(isResendDevSender(), true)
  if (original === undefined) delete process.env.EMAIL_FROM
  else process.env.EMAIL_FROM = original
})

test('isResendDevSender returns false when EMAIL_FROM is a real domain', () => {
  const original = process.env.EMAIL_FROM
  process.env.EMAIL_FROM = 'Stay Focused <noreply@stayfocused.app>'
  assert.equal(isResendDevSender(), false)
  if (original === undefined) delete process.env.EMAIL_FROM
  else process.env.EMAIL_FROM = original
})

test('isResendDevSender returns false when EMAIL_FROM is not set', () => {
  const original = process.env.EMAIL_FROM
  delete process.env.EMAIL_FROM
  assert.equal(isResendDevSender(), false)
  if (original !== undefined) process.env.EMAIL_FROM = original
})
