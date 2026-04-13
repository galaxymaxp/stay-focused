import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyDeepLearnResourceReadiness } from '../lib/deep-learn-readiness'
import type { ModuleResource } from '../lib/types'
import type { ModuleSourceResource } from '../lib/module-workspace'

test('classifyDeepLearnResourceReadiness marks grounded stored resources as text ready', () => {
  const resource = createLearnResource({
    extractedText: buildLongText('The doctrine of consideration requires a bargained-for exchange.'),
    extractedTextPreview: buildLongText('The doctrine of consideration requires a bargained-for exchange.'),
    extractionStatus: 'extracted',
  })
  const storedResource = createStoredResource({
    extractedText: resource.extractedText,
    extractedTextPreview: resource.extractedTextPreview,
    extractionStatus: 'extracted',
  })

  const readiness = classifyDeepLearnResourceReadiness({
    resource,
    storedResource,
    canonicalResourceId: storedResource.id,
  })

  assert.equal(readiness.state, 'text_ready')
  assert.equal(readiness.canGenerate, true)
  assert.equal(readiness.shouldAttemptSourceFetch, false)
})

test('classifyDeepLearnResourceReadiness marks weak but recoverable resources as partial text', () => {
  const resource = createLearnResource({
    extractedText: null,
    extractedTextPreview: 'Short preview only.',
    extractionStatus: 'metadata_only',
    qualityReason: 'The stored extract is still too thin for a trustworthy exam prep pack.',
  })
  const storedResource = createStoredResource({
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: resource.extractedTextPreview,
    sourceUrl: 'https://canvas.example/api/v1/courses/1/pages/consideration',
  })

  const readiness = classifyDeepLearnResourceReadiness({
    resource,
    storedResource,
    canonicalResourceId: storedResource.id,
  })

  assert.equal(readiness.state, 'partial_text')
  assert.equal(readiness.canGenerate, true)
  assert.equal(readiness.shouldAttemptSourceFetch, true)
  assert.match(readiness.detail, /original source|partial text/i)
})

test('classifyDeepLearnResourceReadiness uses scan fallback for scan-capable PDFs without dependable text', () => {
  const resource = createLearnResource({
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    extractedText: null,
    extractedTextPreview: null,
    extractionStatus: 'metadata_only',
    previewState: 'no_text_available',
    fullTextAvailable: false,
    storedTextLength: 0,
    storedPreviewLength: 0,
    storedWordCount: 0,
  })
  const storedResource = createStoredResource({
    resourceType: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    sourceUrl: 'https://canvas.example/files/consideration.pdf',
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: null,
    metadata: {
      normalizedSourceType: 'pdf',
      previewState: 'no_text_available',
      fullTextAvailable: false,
      storedTextLength: 0,
      storedPreviewLength: 0,
      storedWordCount: 0,
    },
  })

  const readiness = classifyDeepLearnResourceReadiness({
    resource,
    storedResource,
    canonicalResourceId: storedResource.id,
  })

  assert.equal(readiness.state, 'scan_fallback')
  assert.equal(readiness.canGenerate, true)
  assert.match(readiness.summary, /scan fallback/i)
})

test('classifyDeepLearnResourceReadiness marks resources with no viable stored backing row as unreadable', () => {
  const readiness = classifyDeepLearnResourceReadiness({
    resource: createLearnResource(),
    storedResource: null,
    canonicalResourceId: null,
  })

  assert.equal(readiness.state, 'unreadable')
  assert.equal(readiness.blockedReason, 'no_stored_resource')
  assert.equal(readiness.canGenerate, false)
})

function createLearnResource(overrides: Partial<ModuleSourceResource> = {}): ModuleSourceResource {
  return {
    id: overrides.id ?? 'learn-resource-1',
    title: overrides.title ?? 'Consideration Notes',
    originalTitle: overrides.originalTitle ?? 'Consideration Notes',
    type: overrides.type ?? 'Page',
    contentType: overrides.contentType ?? 'text/html',
    extension: overrides.extension ?? null,
    required: overrides.required ?? true,
    moduleName: overrides.moduleName ?? 'Week 1',
    category: overrides.category ?? 'resource',
    kind: overrides.kind ?? 'study_file',
    lane: overrides.lane ?? 'learn',
    courseName: overrides.courseName ?? 'Contracts',
    dueDate: overrides.dueDate ?? null,
    sourceUrl: overrides.sourceUrl ?? 'https://canvas.example/api/v1/courses/1/pages/consideration',
    htmlUrl: overrides.htmlUrl ?? 'https://canvas.example/courses/1/pages/consideration',
    moduleUrl: overrides.moduleUrl ?? null,
    canvasUrl: overrides.canvasUrl ?? 'https://canvas.example/courses/1/pages/consideration',
    linkedContext: overrides.linkedContext ?? null,
    whyItMatters: overrides.whyItMatters ?? 'This page defines the bargaining element used in the next assignment.',
    extractionStatus: overrides.extractionStatus ?? 'extracted',
    extractedText: 'extractedText' in overrides
      ? overrides.extractedText ?? null
      : buildLongText('Consideration distinguishes enforceable promises from gratuitous ones.'),
    extractedTextPreview: 'extractedTextPreview' in overrides
      ? overrides.extractedTextPreview ?? null
      : buildLongText('Consideration distinguishes enforceable promises from gratuitous ones.'),
    extractedCharCount: overrides.extractedCharCount ?? 1400,
    extractionError: overrides.extractionError ?? null,
    normalizedSourceType: overrides.normalizedSourceType ?? 'page',
    capability: overrides.capability ?? 'supported',
    capabilityReason: overrides.capabilityReason ?? null,
    quality: overrides.quality ?? 'usable',
    qualityReason: overrides.qualityReason ?? 'Readable text is available and usable for study.',
    groundingLevel: overrides.groundingLevel ?? 'weak',
    originalResourceKind: overrides.originalResourceKind ?? 'Page',
    resolvedTargetType: overrides.resolvedTargetType ?? 'page',
    sourceUrlCategory: overrides.sourceUrlCategory ?? 'canvas',
    resolvedUrlCategory: overrides.resolvedUrlCategory ?? 'canvas',
    resolvedUrl: overrides.resolvedUrl ?? 'https://canvas.example/courses/1/pages/consideration',
    resolutionState: overrides.resolutionState ?? 'resolved',
    fallbackReason: overrides.fallbackReason ?? null,
    recommendationStrength: overrides.recommendationStrength ?? 'strong',
    previewState: overrides.previewState ?? 'full_text_available',
    fullTextAvailable: overrides.fullTextAvailable ?? true,
    storedTextLength: overrides.storedTextLength ?? 1400,
    storedPreviewLength: overrides.storedPreviewLength ?? 420,
    storedWordCount: overrides.storedWordCount ?? 220,
    studyProgressStatus: overrides.studyProgressStatus ?? 'not_started',
    workflowOverride: overrides.workflowOverride ?? 'study',
    lastOpenedAt: overrides.lastOpenedAt ?? null,
    studyStateUpdatedAt: overrides.studyStateUpdatedAt ?? null,
  }
}

function createStoredResource(overrides: Partial<ModuleResource> = {}): ModuleResource {
  return {
    id: overrides.id ?? 'stored-resource-1',
    moduleId: overrides.moduleId ?? 'module-1',
    courseId: overrides.courseId ?? 'course-1',
    canvasModuleId: overrides.canvasModuleId ?? 101,
    canvasItemId: overrides.canvasItemId ?? 201,
    canvasFileId: overrides.canvasFileId ?? null,
    title: overrides.title ?? 'Consideration Notes',
    resourceType: overrides.resourceType ?? 'Page',
    contentType: overrides.contentType ?? 'text/html',
    extension: overrides.extension ?? null,
    sourceUrl: overrides.sourceUrl ?? 'https://canvas.example/api/v1/courses/1/pages/consideration',
    htmlUrl: overrides.htmlUrl ?? 'https://canvas.example/courses/1/pages/consideration',
    extractionStatus: overrides.extractionStatus ?? 'extracted',
    extractedText: 'extractedText' in overrides
      ? overrides.extractedText ?? null
      : buildLongText('Consideration distinguishes enforceable promises from gratuitous ones.'),
    extractedTextPreview: 'extractedTextPreview' in overrides
      ? overrides.extractedTextPreview ?? null
      : buildLongText('Consideration distinguishes enforceable promises from gratuitous ones.'),
    extractedCharCount: overrides.extractedCharCount ?? 1400,
    extractionError: overrides.extractionError ?? null,
    required: overrides.required ?? true,
    metadata: overrides.metadata ?? {
      normalizedSourceType: 'page',
      previewState: 'full_text_available',
      fullTextAvailable: true,
      storedTextLength: 1400,
      storedPreviewLength: 420,
      storedWordCount: 220,
    },
    created_at: overrides.created_at ?? '2026-04-13T00:00:00.000Z',
  }
}

function buildLongText(sentence: string) {
  return `${sentence} ${sentence} ${sentence} ${sentence} ${sentence} ${sentence}`
}
