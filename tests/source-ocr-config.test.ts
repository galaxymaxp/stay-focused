import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canAutoRunSourceOcr,
  canRunManualSourceOcr,
  DEFAULT_OCR_MAX_PAGES_PER_JOB,
  DEFAULT_OPENAI_OCR_MAX_PAGES,
  getOcrMaxPagesForProvider,
  getSourceOcrConfig,
} from '../lib/source-ocr-config'

test('source OCR config disables OCR by default', () => {
  const config = getSourceOcrConfig({})

  assert.equal(config.provider, 'disabled')
  assert.equal(config.openaiAutoRun, false)
  assert.equal(config.openaiMaxPages, DEFAULT_OPENAI_OCR_MAX_PAGES)
  assert.equal(config.openaiMaxPages, 5)
  assert.equal(config.maxPagesPerJob, DEFAULT_OCR_MAX_PAGES_PER_JOB)
  assert.equal(config.maxPagesPerJob, 24)
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
    OCR_PROVIDER: 'google_vision',
    OCR_MAX_PAGES_PER_JOB: '12',
    OCR_MAX_JOBS_PER_SYNC: '2',
    OCR_MAX_RETRIES_PER_RESOURCE: '0',
    OPENAI_OCR_MAX_PAGES: '3',
  })

  assert.equal(config.provider, 'google_vision')
  assert.equal(config.maxPagesPerJob, 12)
  assert.equal(config.maxJobsPerSync, 2)
  assert.equal(config.maxRetriesPerResource, 0)
  assert.equal(config.openaiMaxPages, 3)
  assert.equal(canAutoRunSourceOcr(config), true)
})

test('legacy google provider normalizes to Google Vision', () => {
  const config = getSourceOcrConfig({ OCR_PROVIDER: 'google' })

  assert.equal(config.provider, 'google_vision')
  assert.equal(canAutoRunSourceOcr(config), true)
})

test('Document AI provider can auto-run behind the shared page cap', () => {
  const config = getSourceOcrConfig({
    OCR_PROVIDER: 'google_document_ai',
    OCR_MAX_PAGES_PER_JOB: '10',
  })

  assert.equal(config.provider, 'google_document_ai')
  assert.equal(canRunManualSourceOcr(config), true)
  assert.equal(canAutoRunSourceOcr(config), true)
  assert.equal(getOcrMaxPagesForProvider(config), 10)
})

test('OpenAI provider uses the stricter OpenAI and shared page caps', () => {
  const config = getSourceOcrConfig({
    OCR_PROVIDER: 'openai',
    OPENAI_OCR_MAX_PAGES: '5',
    OCR_MAX_PAGES_PER_JOB: '3',
  })

  assert.equal(getOcrMaxPagesForProvider(config), 3)
})
