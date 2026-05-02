import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGoogleOcrResultFromPages,
  extractGoogleVisionTextFromResponse,
} from '../lib/extraction/google-ocr'
import { classifyExtractedTextQuality } from '../lib/extracted-text-quality'
import type { PdfOcrPage } from '../lib/extraction/pdf-ocr'

test('Google Vision fullTextAnnotation text is extracted', () => {
  const text = extractGoogleVisionTextFromResponse({
    responses: [{
      fullTextAnnotation: {
        text: 'DATA ORGANIZATION\nOLTP Online Transaction Processing',
      },
    }],
  })

  assert.match(text, /DATA ORGANIZATION/)
  assert.match(text, /Online Transaction Processing/)
})

test('Google Vision falls back to textAnnotations description', () => {
  const text = extractGoogleVisionTextFromResponse({
    responses: [{
      textAnnotations: [{
        description: 'ODS Operational Data Store\nSubject-Oriented Integrated',
      }],
    }],
  })

  assert.match(text, /Operational Data Store/)
  assert.match(text, /Subject-Oriented/)
})

test('empty Google OCR page does not fail entire OCR result when other pages have useful text', () => {
  const usefulText = buildDataOrganizationText()
  const result = buildGoogleOcrResultFromPages({
    provider: 'google_vision:document_text_detection',
    model: 'document_text_detection',
    inputBytes: 1234,
    pageCount: 2,
    totalPagesInDocument: 2,
    pagesProcessed: 2,
    pages: [
      createPage({ pageNumber: 1, text: usefulText }),
      createPage({ pageNumber: 2, text: '', status: 'empty' }),
    ],
    truncated: false,
  })

  assert.equal(result.status, 'completed')
  assert.match(result.text, /DATA ORGANIZATION/)
  assert.equal(result.pages[1].status, 'empty')
  assert.equal(((result.metadata.pdfOcr as Record<string, unknown>).emptyPages), 1)
})

test('Data Organization OCR text passes sourceTextQuality', () => {
  const quality = classifyExtractedTextQuality({
    text: buildDataOrganizationText(),
    title: '1.1-Data Organization.pdf',
  })

  assert.equal(quality.quality, 'meaningful')
  assert.equal(quality.usable, true)
})

function createPage(input: {
  pageNumber: number
  text: string
  status?: PdfOcrPage['status']
}): PdfOcrPage {
  return {
    pageNumber: input.pageNumber,
    text: input.text,
    charCount: input.text.length,
    status: input.status ?? 'completed',
    confidence: null,
    provider: 'google_vision:document_text_detection',
    model: 'document_text_detection',
    error: input.status === 'empty' ? 'No legible text returned.' : null,
    refusal: false,
    attempts: 1,
    imageWidth: 1800,
    imageHeight: 1200,
    imageByteSize: 150000,
    imageBlank: false,
  }
}

function buildDataOrganizationText() {
  const paragraph = [
    'DATA ORGANIZATION explains how operational data is arranged for transaction processing and analytics.',
    'OLTP means Online Transaction Processing and supports current operational transactions.',
    'ODS means Operational Data Store and keeps integrated current valued volatile operational data.',
    'A data warehouse is Subject-Oriented, Integrated, Current Valued, and Volatile in the lesson terminology.',
  ].join(' ')
  return Array.from({ length: 8 }, () => paragraph).join('\n\n')
}
