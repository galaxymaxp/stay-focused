import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  hasCanvasResourceRefreshRowChanged,
  prepareCanvasResourceRefreshRow,
  shouldQueueCanvasResourceRefreshPreparation,
  type CanvasResourceRefreshInput,
  type ExistingCanvasResourceSnapshot,
} from '../lib/canvas-resource-refresh'
import type { ModuleResource } from '../lib/types'
import {
  getResourceRefreshCourseCandidateLimit,
  prioritizeResourceRefreshCourses,
} from '../lib/resource-refresh-priority'

test('resource refresh preserves extracted and OCR state when Canvas file identity is unchanged', () => {
  const incoming = createIncomingResource({ canvasItemId: 10, canvasFileId: 100 })
  const existing = createExistingResource({
    canvasItemId: 10,
    canvasFileId: 100,
    extractionStatus: 'extracted',
    extractedText: meaningfulAcademicText(),
    extractedTextPreview: 'Data organization describes how observations are structured.',
    extractedCharCount: 240,
    visualExtractionStatus: 'completed',
    visualExtractedText: meaningfulAcademicText(),
  })

  const prepared = prepareCanvasResourceRefreshRow(incoming, existing)

  assert.equal(prepared.fileIdentityChanged, false)
  assert.equal(prepared.row.extraction_status, 'extracted')
  assert.equal(prepared.row.extracted_text, meaningfulAcademicText())
  assert.equal(prepared.row.visual_extraction_status, 'completed')
  assert.equal(prepared.row.visual_extracted_text, meaningfulAcademicText())
})

test('resource refresh resets stored extraction state when a module item points to a new Canvas file', () => {
  const incoming = createIncomingResource({ canvasItemId: 10, canvasFileId: 200 })
  const existing = createExistingResource({
    canvasItemId: 10,
    canvasFileId: 100,
    extractionStatus: 'extracted',
    extractedText: meaningfulAcademicText(),
    extractedTextPreview: 'Preview',
    extractedCharCount: 240,
    visualExtractionStatus: 'completed',
    visualExtractedText: meaningfulAcademicText(),
  })

  const prepared = prepareCanvasResourceRefreshRow(incoming, existing)

  assert.equal(prepared.fileIdentityChanged, true)
  assert.equal(prepared.row.extraction_status, 'metadata_only')
  assert.equal(prepared.row.extracted_text, null)
  assert.equal(prepared.row.visual_extraction_status, 'not_started')
  assert.equal(prepared.row.visual_extracted_text, null)
})

test('resource refresh change detector skips identical metadata rows', () => {
  const incoming = createIncomingResource({ canvasItemId: 10, canvasFileId: 100 })
  const prepared = prepareCanvasResourceRefreshRow(incoming)
  const existing = createExistingResource({
    canvasItemId: 10,
    canvasFileId: 100,
    metadata: prepared.row.metadata,
  })

  assert.equal(hasCanvasResourceRefreshRowChanged(existing, prepared.row), false)
})

test('resource refresh prioritizes active Canvas courses ahead of older concluded courses', () => {
  const prioritized = prioritizeResourceRefreshCourses([
    { id: 'course-old', name: 'Old Stats', canvasCourseId: 10 },
    { id: 'course-current', name: 'Current Biology', canvasCourseId: 20 },
    { id: 'course-other', name: 'Current History', canvasCourseId: 30 },
  ], new Set([20, 30]))

  assert.deepEqual(prioritized.map((course) => course.id), ['course-current', 'course-other', 'course-old'])
})

test('resource refresh candidate limit stays bounded for large course batches', () => {
  assert.equal(getResourceRefreshCourseCandidateLimit(1), 4)
  assert.equal(getResourceRefreshCourseCandidateLimit(6), 24)
  assert.equal(getResourceRefreshCourseCandidateLimit(20), 24)
})

test('resource refresh queues extraction preparation for new unprocessed resources with a source URL', () => {
  assert.equal(shouldQueueCanvasResourceRefreshPreparation(createModuleResource({
    extractionStatus: 'metadata_only',
    sourceUrl: 'https://canvas.example/files/100/download',
  })), true)

  assert.equal(shouldQueueCanvasResourceRefreshPreparation(createModuleResource({
    extractionStatus: 'pending',
    htmlUrl: 'https://canvas.example/courses/42/modules/items/10',
  })), true)
})

test('resource refresh does not queue preparation for completed, unsupported, or sourceless resources', () => {
  assert.equal(shouldQueueCanvasResourceRefreshPreparation(createModuleResource({
    extractionStatus: 'completed',
    sourceUrl: 'https://canvas.example/files/100/download',
  })), false)

  assert.equal(shouldQueueCanvasResourceRefreshPreparation(createModuleResource({
    extractionStatus: 'unsupported',
    sourceUrl: 'https://canvas.example/files/100/download',
  })), false)

  assert.equal(shouldQueueCanvasResourceRefreshPreparation(createModuleResource({
    extractionStatus: 'metadata_only',
    sourceUrl: null,
    htmlUrl: null,
  })), false)
})

test('resource refresh cron route discovers resources and does not process extraction or OCR inline', () => {
  const routeSource = readFileSync('app/api/cron/resource-refresh/route.ts', 'utf8')

  assert.match(routeSource, /refreshCanvasModuleResourceMetadataForCourse/)
  assert.doesNotMatch(routeSource, /processPendingResourceExtractionJobs/)
  assert.doesNotMatch(routeSource, /processSourceOcrJob|processPendingSourceOcr|autoEnqueueSourceOcrJobs/)
  assert.doesNotMatch(routeSource, /\bafter\s*\(/)
})

test('resource refresh metadata path still creates resource extraction queue jobs only', () => {
  const canvasSource = readFileSync('actions/canvas.ts', 'utf8')

  assert.match(canvasSource, /queueResourceExtractionJobs\(\{[\s\S]*resources: resourcesNeedingPreparation/)
  assert.match(canvasSource, /shouldQueueCanvasResourceRefreshPreparation\(insertedResource\)/)
  assert.match(canvasSource, /shouldQueueCanvasResourceRefreshPreparation\(updatedResource\)/)
  assert.match(canvasSource, /!hasCanvasResourceRefreshRowChanged[\s\S]*shouldQueueCanvasResourceRefreshPreparation\(existing\)[\s\S]*resourcesNeedingPreparation\.push\(existing\)/)
  assert.doesNotMatch(canvasSource, /refreshCanvasModuleResourceMetadataForCourse[\s\S]{0,6000}processPendingResourceExtractionJobs/)
  assert.doesNotMatch(canvasSource, /refreshCanvasModuleResourceMetadataForCourse[\s\S]{0,6000}processSourceOcrJob/)
})

function createIncomingResource(input: { canvasItemId: number; canvasFileId: number }) {
  const resource: CanvasResourceRefreshInput = {
    canvasInstanceUrl: 'https://canvas.example',
    canvasCourseId: 42,
    canvasModuleId: 7,
    canvasItemId: input.canvasItemId,
    canvasFileId: input.canvasFileId,
    title: '1. Intro-To-IT-Security.pdf',
    resourceType: 'file',
    contentType: 'application/pdf',
    extension: 'pdf',
    sourceUrl: 'https://canvas.example/files/100/download',
    htmlUrl: 'https://canvas.example/courses/42/modules/items/10',
    required: false,
    metadata: {
      normalizedSourceType: 'file',
      canvasItemId: input.canvasItemId,
      canvasFileId: input.canvasFileId,
      contentId: input.canvasFileId,
    },
  }

  return resource
}

function createExistingResource(overrides: Partial<ExistingCanvasResourceSnapshot>) {
  const base: ExistingCanvasResourceSnapshot = {
    ...createIncomingResource({
      canvasItemId: overrides.canvasItemId ?? 10,
      canvasFileId: overrides.canvasFileId ?? 100,
    }),
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
  }

  return {
    ...base,
    ...overrides,
  }
}

function createModuleResource(overrides: Partial<ModuleResource>): ModuleResource {
  return {
    id: 'resource-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    canvasModuleId: 7,
    canvasItemId: 10,
    canvasFileId: 100,
    title: '1. Intro-To-IT-Security.pdf',
    resourceType: 'file',
    contentType: 'application/pdf',
    extension: 'pdf',
    sourceUrl: null,
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
    created_at: '2026-05-24T00:00:00.000Z',
    ...overrides,
  }
}

function meaningfulAcademicText() {
  return [
    'Information security explains how confidentiality, integrity, and availability protect digital systems.',
    'Students should distinguish assets, threats, vulnerabilities, controls, and incidents when reviewing core security concepts.',
  ].join(' ')
}
