import assert from 'node:assert/strict'
import test from 'node:test'
import { getSafeStudyOutputActionErrorMessage } from '../lib/study-output-action-errors'

test('study output action errors hide raw server component wrapper text', () => {
  const message = getSafeStudyOutputActionErrorMessage(
    'quiz_pack',
    new Error('An error occurred in the Server Components render. The specific message is omitted in production builds.'),
  )

  assert.equal(message, 'Could not make this quiz right now.')
})

test('study output action errors hide raw database diagnostics from the UI', () => {
  const message = getSafeStudyOutputActionErrorMessage(
    'reviewer',
    new Error('code=42P10 | there is no unique or exclusion constraint matching the ON CONFLICT specification | public.study_outputs'),
  )

  assert.equal(message, 'Could not make this reviewer right now.')
})

test('study output action errors keep clean student-facing messages', () => {
  const message = getSafeStudyOutputActionErrorMessage(
    'study_sheet',
    new Error('Deep Learn needs a saved ready Study Pack before it can generate a Reviewer Full Review variant.'),
  )

  assert.equal(message, 'Deep Learn needs a saved ready Study Pack before it can generate a Reviewer Full Review variant.')
})
