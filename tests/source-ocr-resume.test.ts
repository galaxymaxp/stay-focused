import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMergedOcrResult,
  buildMergedOcrText,
  buildOcrResumeState,
  computeOcrPagesToProcess,
  loadPreviousOcrPages,
  mergeOcrPageArrays,
} from '../lib/source-ocr-resume'
import type { PdfOcrPage, PdfOcrResult } from '../lib/extraction/pdf-ocr'
import type { ModuleResource } from '../lib/types'

const GOOD_TEXT = [
  'DATA ORGANIZATION explains OLTP and Operational Data Store concepts for database design.',
  'Subject-Oriented Integrated Current Valued Volatile defines the data warehouse paradigm.',
  'These terms distinguish operational systems from analytical data warehouse structures.',
].join(' ')

test('loadPreviousOcrPages returns empty when no metadata', () => {
  const resource = createResource({ metadata: {} })
  assert.deepEqual(loadPreviousOcrPages(resource), [])
})

test('loadPreviousOcrPages returns validated pages from visualExtractionPages', () => {
  const resource = createResource({
    metadata: {
      visualExtractionPages: [
        createPage(1, 'completed'),
        createPage(2, 'failed'),
        { invalid: true },
        createPage(3, 'completed'),
      ],
    },
  })
  const pages = loadPreviousOcrPages(resource)
  assert.equal(pages.length, 3)
  assert.equal(pages[0]?.pageNumber, 1)
  assert.equal(pages[1]?.pageNumber, 2)
  assert.equal(pages[2]?.pageNumber, 3)
})

test('computeOcrPagesToProcess returns empty when no previous pages', () => {
  assert.deepEqual(computeOcrPagesToProcess({ previousPages: [], totalPageCount: 51 }), [])
})

test('computeOcrPagesToProcess returns failed pages and unprocessed pages beyond last', () => {
  const previous = [
    createPage(1, 'completed'),
    createPage(2, 'completed'),
    createPage(3, 'failed'),
    createPage(4, 'completed'),
  ]
  const result = computeOcrPagesToProcess({ previousPages: previous, totalPageCount: 7 })
  assert.deepEqual(result, [3, 5, 6, 7])
})

test('computeOcrPagesToProcess uses totalPageCount to find unprocessed pages', () => {
  const previous = Array.from({ length: 24 }, (_, i) => createPage(i + 1, 'completed'))
  const result = computeOcrPagesToProcess({ previousPages: previous, totalPageCount: 51 })
  assert.equal(result.length, 27)
  assert.equal(result[0], 25)
  assert.equal(result[26], 51)
})

test('computeOcrPagesToProcess returns only failed pages when all are processed', () => {
  const previous = [
    createPage(1, 'completed'),
    createPage(2, 'failed'),
    createPage(3, 'completed'),
  ]
  const result = computeOcrPagesToProcess({ previousPages: previous, totalPageCount: 3 })
  assert.deepEqual(result, [2])
})

test('mergeOcrPageArrays combines pages and deduplicates by page number', () => {
  const previous = [createPage(1, 'completed'), createPage(2, 'failed'), createPage(3, 'completed')]
  const current = [createPage(2, 'completed'), createPage(4, 'completed')]
  const merged = mergeOcrPageArrays(previous, current)

  assert.equal(merged.length, 4)
  assert.equal(merged[0]?.pageNumber, 1)
  assert.equal(merged[1]?.pageNumber, 2)
  assert.equal(merged[1]?.status, 'completed')
  assert.equal(merged[2]?.pageNumber, 3)
  assert.equal(merged[3]?.pageNumber, 4)
})

test('mergeOcrPageArrays does not overwrite a completed previous page with a failed new one', () => {
  const previous = [createPage(1, 'completed')]
  const current = [createPage(1, 'failed')]
  const merged = mergeOcrPageArrays(previous, current)
  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.status, 'completed')
})

test('mergeOcrPageArrays overwrites failed previous page with completed new page', () => {
  const previous = [createPage(1, 'failed'), createPage(2, 'completed')]
  const current = [createPage(1, 'completed')]
  const merged = mergeOcrPageArrays(previous, current)
  assert.equal(merged[0]?.status, 'completed')
})

test('buildMergedOcrText joins only completed pages in page order', () => {
  const pages = [
    createPage(1, 'completed', GOOD_TEXT),
    createPage(2, 'failed'),
    createPage(3, 'completed', GOOD_TEXT),
  ]
  const text = buildMergedOcrText(pages)
  assert.match(text, /Page 1:/)
  assert.match(text, /Page 3:/)
  assert.doesNotMatch(text, /Page 2:/)
  assert.match(text, /DATA ORGANIZATION/)
})

test('buildMergedOcrResult returns completed when merged text is long enough', () => {
  const pages = Array.from({ length: 5 }, (_, i) => createPage(i + 1, 'completed', GOOD_TEXT))
  const text = buildMergedOcrText(pages)
  const result = buildMergedOcrResult(buildBaseOcr(), pages, text)
  assert.equal(result.status, 'completed')
  assert.equal(result.charCount, text.length)
  assert.equal(result.text, text)
  assert.equal(result.pages.length, 5)
})

test('buildMergedOcrResult returns failed when merged text is too short', () => {
  const pages = [createPage(1, 'completed', 'short')]
  const text = 'short'
  const result = buildMergedOcrResult(buildBaseOcr(), pages, text)
  assert.equal(result.status, 'failed')
  assert.equal(result.charCount, 0)
})

test('buildOcrResumeState detects pages to process from stored metadata', () => {
  const previousPages = [
    ...Array.from({ length: 24 }, (_, i) => createPage(i + 1, i === 18 ? 'failed' : 'completed')),
  ]
  const resource = createResource({
    pageCount: 51,
    metadata: { visualExtractionPages: previousPages },
  })

  const state = buildOcrResumeState(resource)
  assert.ok(state.pagesToProcess.includes(19), 'failed page 19 should be in pages to process')
  assert.equal(state.pagesToProcess[0], 19, 'page 19 (failed) comes first')
  assert.equal(state.pagesToProcess[1], 25, 'page 25 is the first unprocessed page')
  assert.equal(state.pagesToProcess.length, 28, '1 failed + 27 unprocessed = 28')
  assert.equal(state.previousCompletedCount, 23)
})

test('buildOcrResumeState returns empty pagesToProcess for first-run resource', () => {
  const resource = createResource({ pageCount: 51, metadata: {} })
  const state = buildOcrResumeState(resource)
  assert.deepEqual(state.pagesToProcess, [])
  assert.deepEqual(state.previousPages, [])
  assert.equal(state.previousCompletedCount, 0)
})

function createPage(
  pageNumber: number,
  status: 'completed' | 'failed' | 'empty',
  text?: string,
): PdfOcrPage {
  return {
    pageNumber,
    text: status === 'completed' ? (text ?? GOOD_TEXT) : '',
    charCount: status === 'completed' ? (text ?? GOOD_TEXT).length : 0,
    status,
    confidence: null,
    provider: 'openai:test',
    model: 'test',
    error: status === 'failed' ? `Page ${pageNumber} failed.` : null,
    refusal: false,
    attempts: 1,
    imageWidth: 1800,
    imageHeight: 1200,
  }
}

function buildBaseOcr(): PdfOcrResult {
  return {
    status: 'completed',
    text: GOOD_TEXT,
    charCount: GOOD_TEXT.length,
    pages: [],
    provider: 'openai:test',
    error: null,
    metadata: { pdfOcr: { totalPagesInDocument: 51, pagesProcessed: 5 } },
  }
}

function createResource(overrides: Partial<ModuleResource>): ModuleResource {
  return {
    id: 'r1',
    moduleId: 'm1',
    courseId: 'c1',
    canvasModuleId: null,
    canvasItemId: null,
    canvasFileId: null,
    title: 'Test.pdf',
    resourceType: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    sourceUrl: null,
    htmlUrl: null,
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: null,
    visualExtractionStatus: 'running',
    visualExtractedText: null,
    visualExtractionError: null,
    pageCount: null,
    pagesProcessed: 0,
    extractionProvider: null,
    required: false,
    metadata: {},
    created_at: '2026-05-02T00:00:00.000Z',
    ...overrides,
  }
}
