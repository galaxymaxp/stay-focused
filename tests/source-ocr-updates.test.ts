import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildOcrCompletedUpdate,
  buildOcrFailedUpdate,
  buildOcrProcessingUpdate,
  buildOcrQueuedUpdate,
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

test('OCR queued update marks source without claiming OCR is complete', () => {
  const update = buildOcrQueuedUpdate({
    resource: createResource({ metadata: { pdfExtraction: { pageCount: 51 } } }),
    now: '2026-04-27T12:00:00.000Z',
  })

  assert.equal(update.visual_extraction_status, 'queued')
  assert.equal(update.extraction_error, 'OCR is queued for this scanned PDF.')
  assert.deepEqual(update.metadata.pdfOcr, {
    status: 'queued',
    queuedAt: '2026-04-27T12:00:00.000Z',
  })
})

test('completed OCR mirrors text into normal extraction fields for Deep Learn', () => {
  const text = [
    'OCR recovered visible text about contracts, acceptance, and consideration.',
    'The student can use this text to build grounded review notes after OCR completes.',
  ].join('\n')
  const update = buildOcrCompletedUpdate({
    resource: createResource({ pageCount: 3 }),
    ocr: {
      status: 'completed',
      text,
      charCount: text.length,
      pages: [
        {
          pageNumber: 1,
          text: 'OCR recovered visible text about contracts, acceptance, and consideration.',
          charCount: 74,
          status: 'completed',
          confidence: null,
          provider: 'openai:test_ocr',
          model: 'test_ocr',
          error: null,
          refusal: false,
          attempts: 1,
          imageWidth: 1800,
          imageHeight: 1200,
        },
        {
          pageNumber: 2,
          text: 'The student can use this text to build grounded review notes after OCR completes.',
          charCount: 81,
          status: 'completed',
          confidence: null,
          provider: 'openai:test_ocr',
          model: 'test_ocr',
          error: null,
          refusal: false,
          attempts: 1,
          imageWidth: 1800,
          imageHeight: 1200,
        },
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
  assert.equal(update.pages_processed, 2)
  assert.equal(update.extraction_provider, 'test_ocr')
  assert.equal(update.metadata.fullTextAvailable, true)
  assert.equal(update.metadata.previewState, 'full_text_available')
  assert.equal(update.metadata.extractedTextQuality, 'meaningful')
  const pages = update.metadata.visualExtractionPages as Array<Record<string, unknown>>
  assert.equal(pages.length, 2)
  assert.equal(pages[0]?.pageNumber, 1)
  assert.equal(pages[0]?.textQuality, 'too_short')
  assert.equal(pages[0]?.usableCharCount, 74)
  assert.equal(pages[1]?.pageNumber, 2)
  assert.equal(pages[1]?.textQuality, 'too_short')
  assert.equal(pages[1]?.usableCharCount, 81)
})

test('completed Data Organization OCR persists thousands of chars and actual PDF page count', () => {
  const text = buildDataOrganizationText()
  const update = buildOcrCompletedUpdate({
    resource: createResource({ pageCount: 51, title: '1.1-Data Organization.pdf' }),
    ocr: {
      status: 'completed',
      text,
      charCount: text.length,
      pages: Array.from({ length: 20 }, (_, index) => ({
        pageNumber: index + 1,
        text: `${index + 1}. ${text}`,
        charCount: text.length + 4,
        status: 'completed' as const,
        confidence: null,
        provider: 'openai:test_ocr',
        model: 'test_ocr',
        error: null,
        refusal: false,
        attempts: 1,
        imageWidth: 1800,
        imageHeight: 1200,
      })),
      provider: 'test_ocr',
      error: null,
      metadata: {
        pdfOcr: {
          status: 'completed',
          provider: 'test_ocr',
          pageCount: 51,
          totalPagesInDocument: 20,
          pagesProcessed: 20,
          usefulCharCount: text.length,
        },
      },
    },
    now: '2026-05-02T12:05:00.000Z',
  })

  assert.equal(update.extraction_status, 'completed')
  assert.equal(update.visual_extraction_status, 'completed')
  assert.equal(update.page_count, 20)
  assert.equal(update.pages_processed, 20)
  assert.ok(update.extracted_char_count > 3000)
  assert.equal(update.extracted_text, update.visual_extracted_text)
  assert.match(update.extracted_text ?? '', /OLTP/i)
  assert.match(update.extracted_text ?? '', /Operational Data Store/i)
  assert.equal(update.metadata.extractedTextQuality, 'meaningful')
})

test('OCR refusal text is stored as metadata and not mirrored into extracted text', () => {
  const update = buildOcrCompletedUpdate({
    resource: createResource({ pageCount: 1 }),
    ocr: {
      status: 'completed',
      text: "I'm unable to transcribe text from images or scanned documents at this time.",
      charCount: 73,
      pages: [
        {
          pageNumber: 1,
          text: "I'm unable to transcribe text from images or scanned documents at this time.",
          charCount: 73,
          status: 'failed',
          confidence: null,
          provider: 'openai:test_ocr',
          model: 'test_ocr',
          error: 'refusal',
          refusal: true,
          attempts: 1,
          imageWidth: 1800,
          imageHeight: 1200,
        },
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
    now: '2026-04-27T12:06:00.000Z',
  })

  assert.equal(update.extraction_status, 'empty')
  assert.equal(update.extracted_text, null)
  assert.equal(update.extracted_text_preview, null)
  assert.equal(update.extracted_char_count, 0)
  assert.equal(update.visual_extraction_status, 'failed')
  assert.equal(update.visual_extracted_text, null)
  assert.match(update.visual_extraction_error ?? '', /usable study text/i)
  assert.equal(update.metadata.extractedTextQuality, 'refusal')
  assert.equal((update.metadata.pdfOcr as { refusalDetected?: boolean }).refusalDetected, true)
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

test('buildOcrCompletedUpdate stores isPartial and completedPageNumbers when pages < total', () => {
  const text = buildDataOrganizationText()
  const pages = Array.from({ length: 24 }, (_, i) => ({
    pageNumber: i + 1,
    text,
    charCount: text.length,
    status: 'completed' as const,
    confidence: null,
    provider: 'openai:test_ocr',
    model: 'test_ocr',
    error: null,
    refusal: false,
    attempts: 1,
    imageWidth: 1800,
    imageHeight: 1200,
  }))
  const update = buildOcrCompletedUpdate({
    resource: createResource({ pageCount: 51 }),
    ocr: {
      status: 'completed',
      text: pages.map((p) => `Page ${p.pageNumber}:\n${text.trim()}`).join('\n\n'),
      charCount: text.length * 24,
      pages,
      provider: 'test_ocr',
      error: null,
      metadata: {
        pdfOcr: { status: 'completed', totalPagesInDocument: 51, pagesProcessed: 24 },
      },
    },
    now: '2026-05-02T12:00:00.000Z',
  })

  const pdfOcr = update.metadata.pdfOcr as Record<string, unknown>
  assert.equal(pdfOcr.isPartial, true)
  assert.equal(pdfOcr.remainingPages, 27)
  assert.equal(pdfOcr.totalPagesInDocument, 51)
  assert.ok(Array.isArray(pdfOcr.completedPageNumbers))
  assert.equal((pdfOcr.completedPageNumbers as number[]).length, 24)
  assert.deepEqual(pdfOcr.failedPageNumbers, [])
  assert.equal(update.pages_processed, 24)
  assert.equal(update.page_count, 51)
})

test('buildOcrCompletedUpdate does not set isPartial when all pages are processed', () => {
  const text = buildDataOrganizationText()
  const pages = Array.from({ length: 24 }, (_, i) => ({
    pageNumber: i + 1,
    text,
    charCount: text.length,
    status: 'completed' as const,
    confidence: null,
    provider: 'openai:test_ocr',
    model: 'test_ocr',
    error: null,
    refusal: false,
    attempts: 1,
    imageWidth: 1800,
    imageHeight: 1200,
  }))
  const update = buildOcrCompletedUpdate({
    resource: createResource({ pageCount: 24 }),
    ocr: {
      status: 'completed',
      text: pages.map((p) => `Page ${p.pageNumber}:\n${text.trim()}`).join('\n\n'),
      charCount: text.length * 24,
      pages,
      provider: 'test_ocr',
      error: null,
      metadata: {
        pdfOcr: { totalPagesInDocument: 24, pagesProcessed: 24 },
      },
    },
    now: '2026-05-02T12:00:00.000Z',
  })

  const pdfOcr = update.metadata.pdfOcr as Record<string, unknown>
  assert.equal(pdfOcr.isPartial, false)
  assert.equal(pdfOcr.remainingPages, 0)
})

test('partial OCR text from earlier pages is preserved when a later page fails or times out', () => {
  const goodText = buildDataOrganizationText()
  const pages = Array.from({ length: 18 }, (_, index) => ({
    pageNumber: index + 1,
    text: goodText,
    charCount: goodText.length,
    status: 'completed' as const,
    confidence: null,
    provider: 'openai:test_ocr',
    model: 'test_ocr',
    error: null,
    refusal: false,
    attempts: 1,
    imageWidth: 1800,
    imageHeight: 1200,
  }))
  const timedOutPage = {
    pageNumber: 19,
    text: '',
    charCount: 0,
    status: 'failed' as const,
    confidence: null,
    provider: 'openai:test_ocr',
    model: 'test_ocr',
    error: 'Page 19 OCR timed out after 30s.',
    refusal: false,
    attempts: 1,
    imageWidth: null,
    imageHeight: null,
  }
  const mergedText = pages.map((p) => `Page ${p.pageNumber}:\n${goodText.trim()}`).join('\n\n').trim()
  const update = buildOcrCompletedUpdate({
    resource: createResource({ pageCount: 51 }),
    ocr: {
      status: 'completed',
      text: mergedText,
      charCount: mergedText.length,
      pages: [...pages, timedOutPage],
      provider: 'test_ocr',
      error: null,
      metadata: {
        pdfOcr: { status: 'completed', provider: 'test_ocr', totalPagesInDocument: 51, pagesProcessed: 19 },
      },
    },
    now: '2026-05-02T12:00:00.000Z',
  })

  assert.equal(update.extraction_status, 'completed')
  assert.ok(update.extracted_char_count > 0, 'text from pages 1-18 should be preserved')
  const allPages = update.metadata.visualExtractionPages as Array<Record<string, unknown>>
  assert.equal(allPages.length, 19)
  assert.equal(allPages[17]?.status, 'completed')
  assert.equal(allPages[18]?.status, 'failed')
  assert.equal(allPages[18]?.pageNumber, 19)
})

test('worker exception with no pages produces failed OCR update', () => {
  const update = buildOcrFailedUpdate({
    resource: createResource({ extractedText: null, extractedCharCount: 0 }),
    message: 'Text extraction stalled. Retry extraction.',
    now: '2026-05-02T12:10:00.000Z',
  })

  assert.equal(update.extraction_status, 'empty')
  assert.equal(update.extracted_text, null)
  assert.equal(update.extracted_char_count, 0)
  assert.equal(update.visual_extraction_status, 'failed')
  assert.match(update.visual_extraction_error ?? '', /Retry extraction/)
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

function buildDataOrganizationText() {
  const paragraph = [
    'DATA ORGANIZATION explains how operational data is arranged for transaction processing and analytics.',
    'OLTP means Online Transaction Processing and supports current operational transactions.',
    'The on demand query approach extracts data when a user requests a report.',
    'The eager approach prepares data earlier so later queries can be answered efficiently.',
    'ODS means Operational Data Store and keeps integrated current valued volatile operational data.',
    'A data warehouse is Subject-Oriented, Integrated, Current Valued, and Volatile in the lesson terminology.',
  ].join(' ')
  return Array.from({ length: 8 }, () => paragraph).join('\n\n')
}
