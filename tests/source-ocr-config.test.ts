import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canAutoRunSourceOcr,
  canRunManualSourceOcr,
  DEFAULT_OPENAI_OCR_MAX_PAGES,
  getSourceOcrConfig,
} from '../lib/source-ocr-config'

test('source OCR config disables OCR by default', () => {
  const config = getSourceOcrConfig({})

  assert.equal(config.provider, 'disabled')
  assert.equal(config.openaiAutoRun, false)
  assert.equal(config.openaiMaxPages, DEFAULT_OPENAI_OCR_MAX_PAGES)
  assert.equal(config.openaiMaxPages, 5)
  assert.equal(canAutoRunSourceOcr(config), false)
  assert.equal(canRunManualSourceOcr(config), false)
})

test('OpenAI OCR does not auto-run unless explicitly enabled', () => {
  const config = getSourceOcrConfig({ OCR_PROVIDER: 'openai' })
  const enabled = getSourceOcrConfig({ OCR_PROVIDER: 'openai', OPENAI_OCR_AUTO_RUN: 'true' })

  assert.equal(canRunManualSourceOcr(config), true)
  assert.equal(canAutoRunSourceOcr(config), false)
  assert.equal(canAutoRunSourceOcr(enabled), true)
})

test('source OCR config accepts future provider values and guardrail overrides', () => {
  const config = getSourceOcrConfig({
    OCR_PROVIDER: 'google',
    OCR_MAX_JOBS_PER_SYNC: '2',
    OCR_MAX_RETRIES_PER_RESOURCE: '0',
    OPENAI_OCR_MAX_PAGES: '3',
  })

  assert.equal(config.provider, 'google')
  assert.equal(config.maxJobsPerSync, 2)
  assert.equal(config.maxRetriesPerResource, 0)
  assert.equal(config.openaiMaxPages, 3)
  assert.equal(canAutoRunSourceOcr(config), true)
})
