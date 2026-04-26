import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyUnrepairedCanvasItem,
  findSourceRepairMatch,
  summarizeSourceRepairCounts,
  type RepairableLearningItem,
} from '../lib/source-repair'
import { normalizeSourceReadiness } from '../lib/source-readiness'
import { formatSourceProcessingSummary, isProcessableReadableSource, normalizeSourceProcessingResult } from '../lib/source-processing'
import type { ModuleResource } from '../lib/types'
import type { ModuleSourceResource } from '../lib/module-workspace'

test('source repair matches by Canvas item id first', () => {
  const match = findSourceRepairMatch(createItem({ canvasItemId: 22, title: 'Different' }), [
    createResource({ id: 'resource-title', title: 'Different', canvasItemId: 11 }),
    createResource({ id: 'resource-canvas', title: 'Original', canvasItemId: 22 }),
  ])

  assert.equal(match?.resource.id, 'resource-canvas')
  assert.equal(match?.strategy, 'canvas_item_id')
})

test('source repair matches by URL', () => {
  const match = findSourceRepairMatch(createItem({ sourceUrl: 'https://canvas.example/courses/1/pages/osfp' }), [
    createResource({ id: 'resource-url', sourceUrl: 'https://canvas.example/courses/1/pages/osfp' }),
  ])

  assert.equal(match?.resource.id, 'resource-url')
  assert.equal(match?.strategy, 'url')
})

test('source repair matches normalized title within the same module', () => {
  const match = findSourceRepairMatch(createItem({ title: 'Unit 1 - OSPF Configuration (Continuation)' }), [
    createResource({ id: 'other-module', moduleId: 'module-2', title: 'Unit 1 OSPF Configuration Continuation' }),
    createResource({ id: 'same-module', title: 'Unit 1 OSPF Configuration Continuation' }),
  ])

  assert.equal(match?.resource.id, 'same-module')
  assert.equal(match?.strategy, 'module_title')
})

test('source repair does not create duplicate module resources when a match exists', () => {
  const resources = [createResource({ id: 'existing', title: 'Learning Targets' })]
  const match = findSourceRepairMatch(createItem({ title: 'Learning Targets' }), resources)

  assert.equal(match?.resource.id, 'existing')
  assert.equal(resources.length, 1)
})

test('unknown Canvas items without file metadata are not labeled Generic file', () => {
  const label = classifyUnrepairedCanvasItem(createItem({
    title: "4.2 Gender Relations in the Cordillera IPs' Worldview",
    type: 'Page',
  }))

  assert.equal(label, 'Canvas page')
  assert.notEqual(label, 'Generic file')
})

test('bulk repair result summary includes counts', () => {
  assert.equal(
    summarizeSourceRepairCounts({ repaired: 8, created: 0, classified: 3, skipped: 2, failed: 0 }),
    '8 repaired · 3 classified · 2 still need Canvas',
  )
})

test('pending PPTX sources classify as needs processing', () => {
  const readiness = normalizeSourceReadiness({
    resource: createLearnResource({
      title: 'ENSA_Module_7.pptx',
      type: 'File',
      extension: 'pptx',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extractionStatus: 'pending',
      sourceUrl: 'https://canvas.example/files/7/download',
    }),
    storedResource: createResource({
      title: 'ENSA_Module_7.pptx',
      extension: 'pptx',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extractionStatus: 'pending',
      sourceUrl: 'https://canvas.example/files/7/download',
    }),
    canonicalResourceId: 'resource-1',
    moduleId: 'module-1',
    moduleTitle: 'Networking',
  })

  assert.equal(readiness.state, 'needs_processing')
  assert.match(readiness.message, /Process source|Process all readable sources/)
})

test('PPTX extraction success persists completed status and text', () => {
  const result = normalizeSourceProcessingResult({
    resource: createResource({ extension: 'pptx' }),
    extractionStatus: 'extracted',
    extractedText: 'OSPF configuration requires router IDs, neighbor adjacency, and advertised networks.'.repeat(3),
    extractedTextPreview: 'OSPF configuration requires router IDs.',
    extractedCharCount: 240,
    extractionError: 'old error',
    metadata: {},
  })

  assert.equal(result.extractionStatus, 'completed')
  assert.equal(result.outcome, 'ready')
  assert.equal(result.extractionError, null)
  assert.match(result.extractedText ?? '', /OSPF configuration/)
})

test('successful processed resource becomes source-readiness ready', () => {
  const text = 'OSPF configuration requires router IDs, neighbor adjacency, and advertised networks.'.repeat(3)
  const readiness = normalizeSourceReadiness({
    resource: createLearnResource({ extractedText: text, extractedCharCount: text.length, extractionStatus: 'completed' }),
    storedResource: createResource({ extractedText: text, extractedTextPreview: text.slice(0, 120), extractedCharCount: text.length, extractionStatus: 'completed' }),
    canonicalResourceId: 'resource-1',
    moduleId: 'module-1',
    moduleTitle: 'Networking',
  })

  assert.equal(readiness.state, 'ready')
  assert.deepEqual(readiness.actions.slice(0, 2), ['preview', 'start_deep_learn'])
})

test('extracted resource with readable text is source-readiness ready', () => {
  const text = 'OSPF configuration requires router IDs, neighbor adjacency, and advertised networks.'.repeat(3)
  const readiness = normalizeSourceReadiness({
    resource: createLearnResource({ extractedText: text, extractedCharCount: text.length, extractionStatus: 'extracted' }),
    storedResource: createResource({ extractedText: text, extractedTextPreview: text.slice(0, 120), extractedCharCount: text.length, extractionStatus: 'extracted' }),
    canonicalResourceId: 'resource-1',
    moduleId: 'module-1',
    moduleTitle: 'Networking',
  })

  assert.equal(readiness.state, 'ready')
  assert.equal(readiness.statusLabel, 'Ready')
  assert.equal(readiness.actions.includes('process_source'), false)
})

test('extracted resource with only char count loaded is source-readiness ready', () => {
  const readiness = normalizeSourceReadiness({
    resource: createLearnResource({ extractedText: null, extractedTextPreview: null, extractedCharCount: 26574, extractionStatus: 'extracted' }),
    storedResource: createResource({ extractedText: null, extractedTextPreview: null, extractedCharCount: 26574, extractionStatus: 'extracted' }),
    canonicalResourceId: 'resource-1',
    moduleId: 'module-1',
    moduleTitle: 'Networking',
  })

  assert.equal(readiness.state, 'ready')
  assert.deepEqual(readiness.actions.slice(0, 2), ['preview', 'start_deep_learn'])
})

test('empty extraction becomes empty_or_metadata_only', () => {
  const result = normalizeSourceProcessingResult({
    resource: createResource({ extension: 'pptx' }),
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: null,
    metadata: {},
  })
  const readiness = normalizeSourceReadiness({
    resource: createLearnResource({ extractionStatus: result.extractionStatus }),
    storedResource: createResource(result),
    canonicalResourceId: 'resource-1',
    moduleId: 'module-1',
    moduleTitle: 'Networking',
  })

  assert.equal(result.outcome, 'empty')
  assert.equal(readiness.state, 'empty_or_metadata_only')
  assert.match(readiness.message, /could not find readable text/i)
})

test('pending or missing extraction status stays needs_processing for supported files', () => {
  const pendingReadiness = normalizeSourceReadiness({
    resource: createLearnResource({ extractionStatus: 'pending', sourceUrl: 'https://canvas.example/files/1/download', extension: 'pptx' }),
    storedResource: createResource({ extractionStatus: 'pending', sourceUrl: 'https://canvas.example/files/1/download', extension: 'pptx' }),
    canonicalResourceId: 'resource-1',
    moduleId: 'module-1',
    moduleTitle: 'Networking',
  })
  const missingStatusResource = createResource({
    sourceUrl: 'https://canvas.example/files/1/download',
    extension: 'pptx',
  })
  ;(missingStatusResource as { extractionStatus?: unknown }).extractionStatus = null
  const missingReadiness = normalizeSourceReadiness({
    resource: createLearnResource({ sourceUrl: 'https://canvas.example/files/1/download', extension: 'pptx' }),
    storedResource: missingStatusResource,
    canonicalResourceId: 'resource-1',
    moduleId: 'module-1',
    moduleTitle: 'Networking',
  })

  assert.equal(pendingReadiness.state, 'needs_processing')
  assert.equal(missingReadiness.state, 'needs_processing')
})

test('metadata-only resource with no text becomes empty_or_metadata_only', () => {
  const readiness = normalizeSourceReadiness({
    resource: createLearnResource({ extractionStatus: 'metadata_only', sourceUrl: 'https://canvas.example/files/1/download', extension: 'pptx' }),
    storedResource: createResource({ extractionStatus: 'metadata_only', sourceUrl: 'https://canvas.example/files/1/download', extension: 'pptx' }),
    canonicalResourceId: 'resource-1',
    moduleId: 'module-1',
    moduleTitle: 'Networking',
  })

  assert.equal(readiness.state, 'empty_or_metadata_only')
})

test('failed extraction becomes extraction_failed', () => {
  const result = normalizeSourceProcessingResult({
    resource: createResource({ extension: 'pptx' }),
    extractionStatus: 'failed',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: 'Zip parse failed',
    metadata: {},
  })
  const readiness = normalizeSourceReadiness({
    resource: createLearnResource({ extractionStatus: result.extractionStatus, extractionError: result.extractionError }),
    storedResource: createResource(result),
    canonicalResourceId: 'resource-1',
    moduleId: 'module-1',
    moduleTitle: 'Networking',
  })

  assert.equal(result.outcome, 'failed')
  assert.equal(readiness.state, 'extraction_failed')
})

test('process all skips unsupported files', () => {
  assert.equal(isProcessableReadableSource(createResource({ extension: 'pptx', sourceUrl: 'https://canvas.example/files/1/download' })), true)
  assert.equal(isProcessableReadableSource(createResource({ extension: 'pkt', sourceUrl: 'https://canvas.example/files/2/download' })), false)
})

test('processing summary uses honest ready, empty, and failed text', () => {
  assert.equal(
    formatSourceProcessingSummary({ processed: 1, ready: 1, empty: 0, skipped: 0, failed: 0 }),
    'Processed 1 source · 1 ready for Deep Learn',
  )
  assert.equal(
    formatSourceProcessingSummary({ processed: 1, ready: 0, empty: 1, skipped: 0, failed: 0 }),
    'Processed 1 source · no readable text found',
  )
  assert.equal(
    formatSourceProcessingSummary({ processed: 0, ready: 0, empty: 0, skipped: 0, failed: 1 }),
    'Processing failed for 1 source',
  )
})

function createItem(overrides: Partial<RepairableLearningItem> = {}): RepairableLearningItem {
  return {
    id: overrides.id ?? 'item-1',
    courseId: overrides.courseId ?? 'course-1',
    moduleId: overrides.moduleId ?? 'module-1',
    title: overrides.title ?? 'Learning Targets',
    type: overrides.type ?? 'Page',
    body: overrides.body ?? null,
    canvasItemId: overrides.canvasItemId ?? null,
    canvasFileId: overrides.canvasFileId ?? null,
    canvasUrl: overrides.canvasUrl ?? null,
    htmlUrl: overrides.htmlUrl ?? null,
    externalUrl: overrides.externalUrl ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    sourceResourceId: overrides.sourceResourceId ?? null,
    canonicalSourceId: overrides.canonicalSourceId ?? null,
    metadata: overrides.metadata ?? null,
  }
}

function createResource(overrides: Partial<ModuleResource> = {}): ModuleResource {
  return {
    id: overrides.id ?? 'resource-1',
    moduleId: overrides.moduleId ?? 'module-1',
    courseId: overrides.courseId ?? 'course-1',
    canvasModuleId: overrides.canvasModuleId ?? 10,
    canvasItemId: overrides.canvasItemId ?? null,
    canvasFileId: overrides.canvasFileId ?? null,
    title: overrides.title ?? 'Learning Targets',
    resourceType: overrides.resourceType ?? 'File',
    contentType: overrides.contentType ?? null,
    extension: overrides.extension ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    htmlUrl: overrides.htmlUrl ?? null,
    extractionStatus: overrides.extractionStatus ?? 'metadata_only',
    extractedText: overrides.extractedText ?? null,
    extractedTextPreview: overrides.extractedTextPreview ?? null,
    extractedCharCount: overrides.extractedCharCount ?? 0,
    extractionError: overrides.extractionError ?? null,
    required: overrides.required ?? false,
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? '2026-04-27T00:00:00.000Z',
  }
}

function createLearnResource(overrides: Partial<ModuleSourceResource> = {}): ModuleSourceResource {
  return {
    id: overrides.id ?? 'resource-1',
    title: overrides.title ?? 'Learning Targets',
    originalTitle: overrides.originalTitle ?? overrides.title ?? 'Learning Targets',
    type: overrides.type ?? 'Page',
    contentType: overrides.contentType ?? null,
    extension: overrides.extension ?? null,
    required: overrides.required ?? false,
    moduleName: overrides.moduleName ?? 'Module 1',
    category: overrides.category ?? 'resource',
    kind: overrides.kind ?? 'study_file',
    lane: overrides.lane ?? 'learn',
    sourceUrl: overrides.sourceUrl ?? null,
    htmlUrl: overrides.htmlUrl ?? null,
    canvasUrl: overrides.canvasUrl ?? overrides.sourceUrl ?? null,
    extractionStatus: overrides.extractionStatus ?? 'metadata_only',
    extractedText: overrides.extractedText ?? null,
    extractedTextPreview: overrides.extractedTextPreview ?? null,
    extractedCharCount: overrides.extractedCharCount ?? 0,
    extractionError: overrides.extractionError ?? null,
  }
}
