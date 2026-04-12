import assert from 'node:assert/strict'
import test from 'node:test'
import { getLearnResourceUiState, type LearnResourceUiLike } from '../lib/learn-resource-ui'

test('usable extracted text maps to a ready reader state', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'extracted',
    extractedText: buildUsableText(),
    previewState: 'full_text_available',
  }), {
    hasCanvasLink: true,
  })

  assert.equal(state.statusLabel, 'Ready')
  assert.equal(state.primaryAction, 'reader')
  assert.equal(state.textAvailabilityLabel, 'Full text available')
})

test('preview-only extracts map to partial with reader-first guidance', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'extracted',
    extractedText: null,
    extractedTextPreview: 'Short preview only from the stored reader state.',
    previewState: 'preview_only',
  }), {
    hasCanvasLink: true,
  })

  assert.equal(state.statusLabel, 'Partial')
  assert.equal(state.primaryAction, 'reader')
  assert.equal(state.textAvailabilityLabel, 'Short preview only')
})

test('canvas-resolution blockers map to source-first guidance', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: null,
    fallbackReason: 'canvas_resolution_required',
    previewState: 'no_text_available',
    metadata: {
      fallbackReason: 'canvas_resolution_required',
    },
  }), {
    hasCanvasLink: true,
  })

  assert.equal(state.statusLabel, 'Source first')
  assert.equal(state.primaryAction, 'source')
  assert.equal(state.sourceActionLabel, 'Open in Canvas')
})

test('external link resources stay link-only with source-first action priority', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: null,
    fallbackReason: 'external_link_only',
    sourceUrlCategory: 'external',
    resolvedUrlCategory: 'external',
    normalizedSourceType: 'external_url',
    metadata: {
      normalizedSourceType: 'external_url',
    },
  }), {
    hasCanvasLink: true,
  })

  assert.equal(state.statusLabel, 'Link only')
  assert.equal(state.primaryAction, 'source')
  assert.equal(state.sourceActionLabel, 'Open link')
})

test('unsupported files map to unsupported with original-file priority', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'unsupported',
    extractionError: 'Unsupported file type: .pages',
    extension: 'pages',
    contentType: 'application/octet-stream',
    metadata: {
      fallbackReason: 'unsupported_file_type',
    },
  }), {
    hasOriginalFile: true,
    hasCanvasLink: true,
  })

  assert.equal(state.statusLabel, 'Unsupported')
  assert.equal(state.primaryAction, 'source')
  assert.equal(state.sourceActionLabel, 'Open original file')
})

test('empty extracts map to no-extract guidance', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    previewState: 'no_text_available',
  }), {
    hasCanvasLink: true,
  })

  assert.equal(state.statusLabel, 'No extract')
  assert.equal(state.primaryAction, 'source')
  assert.equal(state.textAvailabilityLabel, 'No text available')
})

function createResource(overrides: Partial<LearnResourceUiLike> = {}): LearnResourceUiLike {
  return {
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    extractionStatus: 'metadata_only' as const,
    extractedText: null,
    extractedTextPreview: null,
    extractionError: null,
    fallbackReason: null,
    metadata: {
      normalizedSourceType: 'file',
    },
    previewState: 'no_text_available' as const,
    sourceUrlCategory: 'canvas_file',
    resolvedUrlCategory: 'canvas_file',
    normalizedSourceType: 'file',
    ...overrides,
  }
}

function buildUsableText() {
  return [
    'Cybercrime methods often rely on exploiting trust, identity, and weak verification across digital systems.',
    'Students need to connect each method to the target, the likely harm, and the defensive response that would reduce the risk.',
    'Readable notes should separate the method, the evidence, and the prevention move so the source can support later tasks.',
    'That structure makes a PDF or page useful in Learn even when the original source still includes repeated headings or framing text.',
  ].join('\n\n')
}
