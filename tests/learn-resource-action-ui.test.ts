import assert from 'node:assert/strict'
import test from 'node:test'
import {
  shouldShowGenerateStudyPackAction,
  shouldShowSourceOcrRetryAction,
  type LearnResourceActionUiInput,
} from '../lib/learn-resource-action-ui'

test('ready readable source can show generate study pack action', () => {
  assert.equal(shouldShowGenerateStudyPackAction(createItem({
    deepLearnCanGenerate: true,
    sourceReadinessBucket: 'ready',
    sourceReadinessState: 'ready',
  })), true)
})

test('unsupported ppt source does not show generate study pack action', () => {
  assert.equal(shouldShowGenerateStudyPackAction(createItem({
    deepLearnCanGenerate: false,
    sourceReadinessBucket: 'unsupported',
    sourceReadinessState: 'unsupported_file_type',
  })), false)
})

test('scanned PDF without active OCR does not show generate but can show retry extraction', () => {
  const item = createItem({
    deepLearnCanGenerate: false,
    sourceReadinessBucket: 'needs_action',
    sourceReadinessState: 'visual_ocr_available',
  })

  assert.equal(shouldShowGenerateStudyPackAction(item), false)
  assert.equal(shouldShowSourceOcrRetryAction(item), true)
})

test('active OCR states do not show retry extraction as a competing action', () => {
  assert.equal(shouldShowSourceOcrRetryAction(createItem({ sourceReadinessState: 'visual_ocr_queued' })), false)
  assert.equal(shouldShowSourceOcrRetryAction(createItem({ sourceReadinessState: 'visual_ocr_running' })), false)
})

function createItem(overrides: Partial<LearnResourceActionUiInput> = {}): LearnResourceActionUiInput {
  return {
    deepLearnCanGenerate: false,
    deepLearnStatus: 'not_started',
    sourceReadinessBucket: 'needs_action',
    sourceReadinessState: 'unknown',
    ...overrides,
  }
}
