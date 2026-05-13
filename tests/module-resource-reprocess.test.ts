import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { reprocessStoredModuleResource } from '../lib/module-resource-reprocess'
import type { ModuleResource } from '../lib/types'

test('reprocessStoredModuleResource prefers Canvas file identity over a stale stored file URL for PDFs', async () => {
  const pdfBuffer = await readFile('tests/fixtures/text-readable.pdf')
  const resource = createPdfResource({
    sourceUrl: 'https://canvas.example/courses/42/files/10910070',
    canvasCourseId: 42,
    canvasFileId: 10910070,
  })

  const originalFetch = globalThis.fetch
  const requestedUrls: string[] = []
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    requestedUrls.push(url)

    if (url === 'https://canvas.example/api/v1/courses/42/files/10910070') {
      return new Response(JSON.stringify({
        id: 10910070,
        display_name: '1. Intro-To-IT-Security.pdf',
        filename: '1.+Intro-To-IT-Security.pdf',
        url: 'https://canvas.example/files/10910070/download?download_frd=1',
        content_type: 'application/pdf',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (url === 'https://canvas.example/files/10910070/download?download_frd=1') {
      return new Response(pdfBuffer, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })
    }

    return new Response('<html>stale preview</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
  }

  try {
    const result = await reprocessStoredModuleResource(resource, {
      triggeredBy: 'learn',
      canvasConfig: {
        url: 'https://canvas.example',
        token: 'user-token',
      },
    })

    assert.equal(result.update.extractionStatus, 'extracted')
    assert.ok(result.update.extractedCharCount > 120)
    assert.match(result.update.extractedText ?? '', /Stay Focused PDF extraction test/i)
    assert.deepEqual(requestedUrls, [
      'https://canvas.example/api/v1/courses/42/files/10910070',
      'https://canvas.example/files/10910070/download?download_frd=1',
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reprocessStoredModuleResource rejects html returned for a supposed PDF download with a clean message', async () => {
  const resource = createPdfResource({
    sourceUrl: 'https://canvas.example/courses/42/files/10910070',
    canvasCourseId: 42,
    canvasFileId: 10910070,
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    if (url === 'https://canvas.example/api/v1/courses/42/files/10910070') {
      return new Response(JSON.stringify({
        id: 10910070,
        display_name: '1. Intro-To-IT-Security.pdf',
        filename: '1.+Intro-To-IT-Security.pdf',
        url: 'https://canvas.example/files/10910070/download?download_frd=1',
        content_type: 'application/pdf',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response('<!doctype html><html><head><title>Canvas Login</title></head><body>Sign in</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
  }

  try {
    const result = await reprocessStoredModuleResource(resource, {
      triggeredBy: 'learn',
      canvasConfig: {
        url: 'https://canvas.example',
        token: 'user-token',
      },
    })

    assert.equal(result.update.extractionStatus, 'failed')
    assert.equal(result.update.extractedText, null)
    assert.match(result.update.extractionError ?? '', /Reconnect Canvas in Settings, then retry/i)
    assert.doesNotMatch(result.update.extractionError ?? '', /CANVAS_API_URL|CANVAS_API_TOKEN|env/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

function createPdfResource(overrides: Partial<ModuleResource> = {}): ModuleResource {
  return {
    id: 'resource-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    canvasInstanceUrl: 'https://canvas.example',
    canvasCourseId: 42,
    canvasModuleId: 7,
    canvasItemId: 9,
    canvasFileId: 10910070,
    title: '1. Intro-To-IT-Security.pdf',
    resourceType: 'file',
    contentType: 'application/pdf',
    extension: 'pdf',
    sourceUrl: 'https://canvas.example/files/10910070/download?download_frd=1',
    htmlUrl: 'https://canvas.example/courses/42/files/10910070',
    extractionStatus: 'failed',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: 'The file was fetched, but no readable text surfaced from the file body.',
    visualExtractionStatus: 'not_started',
    visualExtractedText: null,
    visualExtractionError: null,
    pageCount: null,
    pagesProcessed: 0,
    extractionProvider: null,
    required: false,
    metadata: {},
    created_at: '2026-05-13T00:00:00.000Z',
    ...overrides,
  }
}
