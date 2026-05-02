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
  assert.equal(state.summary, 'A short reader preview is available here, but it does not replace the full item.')
  assert.equal(state.detail, 'Use the reader to get oriented, then open the original source for the full material.')
})

test('full-text partial extracts use study-guidance copy instead of extraction jargon', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'extracted',
    extractedText: null,
    extractedTextPreview: 'Recovered text is present, but it still needs a source check.',
    previewState: 'full_text_available',
  }), {
    readerState: 'weak',
    hasCanvasLink: true,
  })

  assert.equal(state.statusLabel, 'Partial')
  assert.equal(state.primaryAction, 'reader')
  assert.equal(state.summary, 'This item is readable here, but some parts may still be messy or incomplete.')
  assert.equal(state.detail, 'Use the reader for a quick pass, then open the original source when the exact wording or layout matters.')
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
  assert.equal(state.summary, 'Start with the original source for this item.')
  assert.equal(state.detail, 'The reader has the module context, but it still needs the direct Canvas page or file before it can stand in as the main reading path.')
})

test('source-first items without a usable source action fall back to reader-first guidance', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: null,
    fallbackReason: 'canvas_resolution_required',
    previewState: 'no_text_available',
    metadata: {
      fallbackReason: 'canvas_resolution_required',
    },
  }))

  assert.equal(state.statusLabel, 'Source first')
  assert.equal(state.primaryAction, 'reader')
  assert.equal(state.summary, 'The reader only has limited context for this item right now.')
  assert.equal(state.detail, 'The original source is not available from this view right now, so use the reader as a limited fallback instead of a full reading path.')
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

test('image-only PDFs map to automatic scanned-PDF preparation copy', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: 'pdf_image_only_possible: PDF parsed, but it appears to be image-only or scanned.',
    visualExtractionStatus: 'available',
    pageCount: 51,
    previewState: 'no_text_available',
  }), {
    hasOriginalFile: true,
    hasCanvasLink: true,
  })

  assert.equal(state.statusLabel, 'Preparing')
  assert.equal(state.statusKey, 'visual_ocr_required')
  assert.equal(state.primaryAction, 'source')
  assert.equal(state.summary, 'Preparing scanned PDF for Deep Learn...')
})

test('queued OCR shows queued copy instead of prepare/complete contradiction', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractionError: 'OCR is queued for this scanned PDF.',
    visualExtractionStatus: 'queued',
    pageCount: 51,
    previewState: 'no_text_available',
  }), {
    hasOriginalFile: true,
    hasCanvasLink: true,
  })

  assert.equal(state.statusKey, 'visual_ocr_queued')
  assert.equal(state.statusLabel, 'OCR queued')
  assert.equal(state.summary, 'Scanned PDF is queued for text extraction.')
  assert.doesNotMatch(`${state.summary} ${state.detail}`, /OCR is already complete/i)
})

test('running OCR shows page progress', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'processing',
    visualExtractionStatus: 'running',
    pageCount: 51,
    pagesProcessed: 8,
  }), {
    hasOriginalFile: true,
  })

  assert.equal(state.statusKey, 'visual_ocr_running')
  assert.match(state.detail, /8 of 51 pages processed/)
})

test('completed OCR with thin text remains blocked with retry guidance', () => {
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'empty',
    visualExtractionStatus: 'completed',
    visualExtractedText: null,
    visualExtractionError: 'Visual extraction finished, but did not find enough usable study text. Try OCR again or open the original source.',
    pageCount: 51,
    pagesProcessed: 51,
  }), {
    hasOriginalFile: true,
  })

  assert.equal(state.statusKey, 'visual_ocr_completed_empty')
  assert.match(state.summary, /could not find enough readable study text/i)
})

test('completed OCR with meaningful visual text shows ready even when extracted text is stale and thin', () => {
  const visualText = buildDataOrganizationText()
  const state = getLearnResourceUiState(createResource({
    title: '1.1-Data Organization.pdf',
    extractionStatus: 'completed',
    extractedText: 'DATA ORGANIZATION OLTP ODS.',
    extractedTextPreview: 'DATA ORGANIZATION OLTP ODS.',
    extractedCharCount: 27,
    visualExtractionStatus: 'completed',
    visualExtractedText: visualText,
    pageCount: 20,
    pagesProcessed: 20,
    previewState: 'full_text_available',
  }), {
    hasOriginalFile: true,
  })

  assert.equal(state.statusKey, 'ready')
  assert.equal(state.statusLabel, 'OCR complete')
})

test('visual OCR refusal text does not surface as ready reader content', () => {
  const refusalText = "I'm unable to transcribe text from images or scanned documents at this time."
  const state = getLearnResourceUiState(createResource({
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    visualExtractionStatus: 'failed',
    visualExtractedText: refusalText,
    visualExtractionError: 'Visual extraction did not find enough usable study text. Try OCR again or open the original source.',
    previewState: 'no_text_available',
  }), {
    hasOriginalFile: true,
    hasCanvasLink: true,
  })

  assert.equal(state.statusKey, 'visual_ocr_failed')
  assert.match(state.detail, /usable study text/i)
})

test('metadata-heavy refusal preview does not show ready', () => {
  const refusalWithMetadata = [
    "I'm unable to transcribe text from images or scanned documents at this time. If there's something specific you'd like to know or discuss from the content, feel free to ask!",
    'File title',
    'Source type of the file',
    'Module name',
    'Course name',
    'Extraction quality reported',
    'Source text quality reported',
    'Grounding strategy used',
    'Was an AI fallback used to supply text?',
    'Was the PDF text transcribed from scanned images?',
  ].join('\n')
  const state = getLearnResourceUiState(createResource({
    title: '1.1-Data Organization.pdf',
    extractionStatus: 'completed',
    extractedText: refusalWithMetadata,
    extractedTextPreview: refusalWithMetadata,
    extractionError: 'Visual extraction did not find enough usable study text. Try OCR again or open the original source.',
    visualExtractionStatus: 'failed',
    visualExtractionError: 'Visual extraction did not find enough usable study text. Try OCR again or open the original source.',
    previewState: 'no_text_available',
  }), {
    hasOriginalFile: true,
    hasCanvasLink: true,
  })

  assert.equal(state.statusKey, 'visual_ocr_failed')
  assert.equal(state.statusLabel, 'OCR failed')
  assert.match(state.detail, /usable study text/i)
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

function buildDataOrganizationText() {
  const paragraph = [
    'DATA ORGANIZATION explains OLTP and Online Transaction Processing for operational systems.',
    'ODS means Operational Data Store and supports current integrated operational reporting.',
    'The data warehouse is Subject-Oriented, Integrated, Current Valued, and Volatile in the lesson.',
  ].join(' ')
  return Array.from({ length: 10 }, () => paragraph).join('\n\n')
}
