import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildOcrCompletedUpdate,
  buildOcrFailedUpdate,
  buildOcrProcessingUpdate,
  isOcrAlreadyCompleted,
  isOcrAlreadyRunning,
  isScannedPdfOcrCandidate,
} from '../lib/source-ocr-updates'
import type { ModuleResource } from '../lib/types'

test('scanned PDFs are OCR candidates but text PDFs are not', () => {
  assert.equal(isScannedPdfOcrCandidate(createResource({
    extractionStatus: 'empty',
    extractionError: 'pdf_image_only_possible: scanned PDF',
    visualExtractionStatus: 'available',
  })), true)

  assert.equal(isScannedPdfOcrCandidate(createResource({
    extractionStatus: 'completed',
    extractedText: buildText(),
    extractedCharCount: buildText().length,
    extractionError: null,
    visualExtractionStatus: 'not_started',
  })), false)
})

test('OCR processing update preserves existing metadata and marks progress', () => {
  const update = buildOcrProcessingUpdate({
    resource: createResource({ metadata: { pdfExtraction: { pageCount: 4 } } }),
    now: '2026-04-27T12:00:00.000Z',
  })

  assert.equal(update.extraction_status, 'processing')
  assert.equal(update.visual_extraction_status, 'running')
  assert.equal(update.extraction_error, 'OCR is extracting text from images.')
  assert.deepEqual(update.metadata.pdfExtraction, { pageCount: 4 })
  assert.deepEqual(update.metadata.pdfOcr, {
    status: 'running',
    startedAt: '2026-04-27T12:00:00.000Z',
  })
})

test('completed OCR mirrors text into normal extraction fields for Deep Learn', () => {
  const text = buildText()
  const update = buildOcrCompletedUpdate({
    resource: createResource({ pageCount: 3 }),
    ocr: {
      status: 'completed',
      text,
      charCount: text.length,
      pages: [
        { pageNumber: 1, text: 'OCR recovered visible text about contracts, acceptance, and consideration.', charCount: 74 },
        { pageNumber: 2, text: 'The student can use this text to build grounded review notes after OCR completes.', charCount: 81 },
      ],
      provider: 'test_ocr',
      error: null,
      metadata: {
        pdfOcr: {
          status: 'completed',
          provider: 'test_ocr',
        },
      },
    },
    now: '2026-04-27T12:05:00.000Z',
  })

  assert.equal(update.extraction_status, 'completed')
  assert.equal(update.extracted_text, text)
  assert.equal(update.extracted_text_preview, text.slice(0, 420))
  assert.equal(update.extracted_char_count, text.length)
  assert.equal(update.extraction_error, null)
  assert.equal(update.visual_extraction_status, 'completed')
  assert.equal(update.visual_extracted_text, text)
  assert.equal(update.pages_processed, 3)
  assert.equal(update.extraction_provider, 'test_ocr')
  assert.equal(update.metadata.fullTextAvailable, true)
  assert.equal(update.metadata.previewState, 'full_text_available')
  assert.deepEqual(update.metadata.visualExtractionPages, [
    { pageNumber: 1, text: 'OCR recovered visible text about contracts, acceptance, and consideration.', charCount: 74 },
    { pageNumber: 2, text: 'The student can use this text to build grounded review notes after OCR completes.', charCount: 81 },
  ])
})

test('failed OCR clears extracted text and records an honest error', () => {
  const update = buildOcrFailedUpdate({
    resource: createResource({ extractedText: 'stale text', extractedCharCount: 10 }),
    message: 'OCR finished, but no legible text was returned. Open the original file.',
    provider: 'test_ocr',
    now: '2026-04-27T12:10:00.000Z',
  })

  assert.equal(update.extraction_status, 'empty')
  assert.equal(update.extracted_text, null)
  assert.equal(update.extracted_text_preview, null)
  assert.equal(update.extracted_char_count, 0)
  assert.equal(update.visual_extraction_status, 'failed')
  assert.equal(update.visual_extracted_text, null)
  assert.equal(update.visual_extraction_error, 'OCR finished, but no legible text was returned. Open the original file.')
  assert.equal(update.metadata.fullTextAvailable, false)
  assert.equal(update.metadata.pdfOcr instanceof Object, true)
})

test('OCR duplicate guards distinguish running and completed rows', () => {
  assert.equal(isOcrAlreadyRunning(createResource({
    extractionStatus: 'processing',
    visualExtractionStatus: 'running',
  })), true)

  assert.equal(isOcrAlreadyCompleted(createResource({
    extractionStatus: 'completed',
    extractedText: buildText(),
    extractedCharCount: buildText().length,
    visualExtractionStatus: 'completed',
    visualExtractedText: buildText(),
  })), true)
})

function createResource(overrides: Partial<ModuleResource> = {}): ModuleResource {
  return {
    id: 'resource-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    canvasModuleId: null,
    canvasItemId: null,
    canvasFileId: null,
    title: 'Scanned.pdf',
    resourceType: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    sourceUrl: 'https://canvas.example/files/1/download',
    htmlUrl: 'https://canvas.example/courses/1/files/1',
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: 'pdf_image_only_possible: scanned PDF',
    visualExtractionStatus: 'available',
    visualExtractedText: null,
    visualExtractionError: null,
    pageCount: 2,
    pagesProcessed: 0,
    extractionProvider: null,
    required: false,
    metadata: {},
    created_at: '2026-04-27T00:00:00.000Z',
    ...overrides,
  }
}

function buildText() {
  return [
    'OCR recovered visible text about contracts, acceptance, and consideration.',
    'The student can use this text to build grounded review notes after OCR completes.',
    'No extra facts are added beyond the recovered source wording.',
  ].join('\n')
}
