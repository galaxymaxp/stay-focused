import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGoogleOcrResultFromPages,
  extractGoogleVisionTextFromResponse,
  getGoogleServiceAccount,
  validateGoogleVisionCredentials,
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

test('split env vars initialize Google Vision provider', () => {
  withGoogleEnv({
    GOOGLE_CLOUD_PROJECT: 'stay-focus-test',
    GOOGLE_VISION_CLIENT_EMAIL: 'vision@example.iam.gserviceaccount.com',
    GOOGLE_VISION_PRIVATE_KEY: escapedPem(),
  }, () => {
    const check = validateGoogleVisionCredentials()
    assert.equal(check.ok, true)
    const serviceAccount = getGoogleServiceAccount()
    assert.equal(serviceAccount?.project_id, 'stay-focus-test')
    assert.equal(serviceAccount?.client_email, 'vision@example.iam.gserviceaccount.com')
    assert.match(serviceAccount?.private_key ?? '', /\n/)
  })
})

test('escaped newline private key normalizes', () => {
  withGoogleEnv({
    GOOGLE_CLOUD_PROJECT: 'stay-focus-test',
    GOOGLE_VISION_CLIENT_EMAIL: 'vision@example.iam.gserviceaccount.com',
    GOOGLE_VISION_PRIVATE_KEY: escapedPem(),
  }, () => {
    const serviceAccount = getGoogleServiceAccount()
    assert.ok(serviceAccount?.private_key)
    assert.equal(serviceAccount.private_key.includes('\\n'), false)
    assert.equal(serviceAccount.private_key.includes('\n'), true)
  })
})

test('missing Google Vision client email gives safe error', () => {
  withGoogleEnv({
    GOOGLE_CLOUD_PROJECT: 'stay-focus-test',
    GOOGLE_VISION_PRIVATE_KEY: escapedPem(),
  }, () => {
    const check = validateGoogleVisionCredentials()
    assert.equal(check.ok, false)
    assert.match(check.ok ? '' : check.error, /GOOGLE_VISION_CLIENT_EMAIL/)
    assert.equal(JSON.stringify(check.diagnostics).includes('PRIVATE KEY'), false)
  })
})

test('missing Google Vision private key gives safe error', () => {
  withGoogleEnv({
    GOOGLE_CLOUD_PROJECT: 'stay-focus-test',
    GOOGLE_VISION_CLIENT_EMAIL: 'vision@example.iam.gserviceaccount.com',
  }, () => {
    const check = validateGoogleVisionCredentials()
    assert.equal(check.ok, false)
    assert.match(check.ok ? '' : check.error, /GOOGLE_VISION_PRIVATE_KEY/)
    assert.equal(check.diagnostics.hasGoogleVisionPrivateKey, false)
  })
})

test('malformed JSON fallback does not break split env path', () => {
  withGoogleEnv({
    GOOGLE_CLOUD_PROJECT: 'stay-focus-test',
    GOOGLE_VISION_CLIENT_EMAIL: 'vision@example.iam.gserviceaccount.com',
    GOOGLE_VISION_PRIVATE_KEY: escapedPem(),
    GOOGLE_VISION_CREDENTIALS_JSON: '{not-json',
  }, () => {
    const check = validateGoogleVisionCredentials()
    assert.equal(check.ok, true)
    assert.equal(check.diagnostics.googleVisionCredentialsJsonExists, true)
    assert.equal(check.diagnostics.googleVisionCredentialsJsonParses, false)
    assert.equal(getGoogleServiceAccount()?.client_email, 'vision@example.iam.gserviceaccount.com')
  })
})

test('credential resolution prefers split env vars over JSON', () => {
  withGoogleEnv({
    GOOGLE_CLOUD_PROJECT: 'split-project',
    GOOGLE_VISION_CLIENT_EMAIL: 'split@example.iam.gserviceaccount.com',
    GOOGLE_VISION_PRIVATE_KEY: escapedPem(),
    GOOGLE_VISION_CREDENTIALS_JSON: JSON.stringify({
      project_id: 'json-project',
      client_email: 'json@example.iam.gserviceaccount.com',
      private_key: escapedPem(),
    }),
  }, () => {
    const serviceAccount = getGoogleServiceAccount()
    assert.equal(serviceAccount?.project_id, 'split-project')
    assert.equal(serviceAccount?.client_email, 'split@example.iam.gserviceaccount.com')
  })
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

function escapedPem() {
  return '-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----\\n'
}

function withGoogleEnv(values: Record<string, string | undefined>, fn: () => void) {
  const keys = [
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_VISION_CLIENT_EMAIL',
    'GOOGLE_VISION_PRIVATE_KEY',
    'GOOGLE_VISION_CREDENTIALS_JSON',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_APPLICATION_CREDENTIALS_JSON',
    'GOOGLE_CREDENTIALS_JSON',
    'GOOGLE_OCR_CREDENTIALS_JSON',
    'GOOGLE_VISION_API_KEY',
    'GOOGLE_OCR_API_KEY',
    'GOOGLE_OCR_ACCESS_TOKEN',
    'GOOGLE_ACCESS_TOKEN',
    'OCR_PROVIDER',
  ]
  const previous = new Map(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
  process.env.OCR_PROVIDER = 'google_vision'
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    fn()
  } finally {
    for (const key of keys) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
