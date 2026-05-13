import assert from 'node:assert/strict'
import test from 'node:test'
import { CANVAS_RECONNECT_MESSAGE, resolveCanvasConfigForUserId, resolveStoredCanvasConfigForUserResource } from '../lib/canvas-user-config'
import { reprocessStoredModuleResource } from '../lib/module-resource-reprocess'
import type { ModuleResource } from '../lib/types'

test('resolveCanvasConfigForUserId uses stored user settings without requiring global Canvas env vars', async () => {
  const config = await resolveCanvasConfigForUserId(
    'user-1',
    undefined,
    {
      loadCredentials: async () => ({
        canvasApiUrl: 'https://canvas.example.edu/api/v1',
        canvasAccessToken: 'user-token',
      }),
    },
  )

  assert.equal(config.url, 'https://canvas.example.edu')
  assert.equal(config.token, 'user-token')
})

test('resolveCanvasConfigForUserId shows reconnect guidance when credentials are missing', async () => {
  await assert.rejects(
    () => resolveCanvasConfigForUserId('user-2', undefined, {
      loadCredentials: async () => null,
    }),
    (error: unknown) => {
      assert.equal(error instanceof Error ? error.message : '', CANVAS_RECONNECT_MESSAGE)
      assert.doesNotMatch(error instanceof Error ? error.message : '', /CANVAS_API_URL|CANVAS_API_TOKEN|env/i)
      return true
    },
  )
})

test('resolveStoredCanvasConfigForUserResource resolves saved user Canvas settings for manual retry paths', async () => {
  const config = await resolveStoredCanvasConfigForUserResource('user-1', {
    canvasInstanceUrl: 'https://canvas.example.edu',
    loadCredentials: async () => ({
      canvasApiUrl: 'https://canvas.example.edu/api/v1',
      canvasAccessToken: 'user-token',
    }),
  })

  assert.equal(config?.url, 'https://canvas.example.edu')
  assert.equal(config?.token, 'user-token')
})

test('reprocessStoredModuleResource returns reconnect guidance for relative Canvas files without credentials', async () => {
  const resource: ModuleResource = {
    id: 'resource-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    canvasInstanceUrl: 'https://canvas.example.edu',
    canvasCourseId: 42,
    canvasModuleId: 7,
    canvasItemId: 9,
    canvasFileId: 11,
    title: 'Scanned Lecture.pdf',
    resourceType: 'file',
    contentType: 'application/pdf',
    extension: 'pdf',
    sourceUrl: '/api/v1/courses/42/files/11',
    htmlUrl: null,
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: null,
    visualExtractionStatus: 'not_started',
    visualExtractedText: null,
    visualExtractionError: null,
    pageCount: null,
    pagesProcessed: 0,
    extractionProvider: null,
    required: false,
    metadata: {},
    created_at: '2026-05-13T00:00:00.000Z',
  }

  const result = await reprocessStoredModuleResource(resource, {
    triggeredBy: 'learn',
  })

  assert.equal(result.update.extractionStatus, 'failed')
  assert.equal(result.update.extractionError, CANVAS_RECONNECT_MESSAGE)
})
