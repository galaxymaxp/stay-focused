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

test('classifyDeepLearnResourceReadiness enables generation when usable text is already stored', () => {
  const resource = createLearnResource({
    extractedText: buildLongText('Short but usable preview text about consideration, bargain, exchange, promise, and enforcement.'),
    extractedTextPreview: buildLongText('Short but usable preview text about consideration, bargain, exchange, promise, and enforcement.'),
    extractionStatus: 'metadata_only',
    qualityReason: 'The stored extract is still too thin for a trustworthy exam prep pack.',
  })
  const storedResource = createStoredResource({
    extractionStatus: 'metadata_only',
    extractedText: resource.extractedText,
    extractedTextPreview: resource.extractedTextPreview,
    sourceUrl: 'https://canvas.example/api/v1/courses/1/pages/consideration',
  })

  const readiness = classifyDeepLearnResourceReadiness({
    resource,
    storedResource,
    canonicalResourceId: storedResource.id,
  })

  assert.equal(readiness.state, 'text_ready')
  assert.equal(readiness.canGenerate, true)
  assert.equal(readiness.shouldAttemptSourceFetch, false)
  assert.match(readiness.summary, /Text is ready/i)
})

test('classifyDeepLearnResourceReadiness blocks scanned PDFs until OCR provides text', () => {
  const resource = createLearnResource({
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    extractedText: null,
    extractedTextPreview: null,
    extractionError: 'pdf_image_only_possible: scanned PDF',
    extractionStatus: 'metadata_only',
    visualExtractionStatus: 'available',
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
    extractionError: 'pdf_image_only_possible: scanned PDF',
    visualExtractionStatus: 'available',
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

  assert.equal(readiness.state, 'unreadable')
  assert.equal(readiness.canGenerate, false)
  assert.equal(readiness.detail, 'This PDF appears to be image-based. Run visual extraction first.')
})

test('classifyDeepLearnResourceReadiness marks OCR-completed scanned PDFs as ready', () => {
  const text = buildLongText('OCR recovered the consideration notes with bargain, exchange, promises, defenses, and enforcement rules.')
  const resource = createLearnResource({
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    extractionStatus: 'completed',
    extractedText: text,
    extractedTextPreview: text.slice(0, 420),
    extractedCharCount: text.length,
    visualExtractionStatus: 'completed',
    visualExtractedText: text,
    previewState: 'full_text_available',
    fullTextAvailable: true,
    storedTextLength: text.length,
  })
  const storedResource = createStoredResource({
    resourceType: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    extractionStatus: 'completed',
    extractedText: text,
    extractedTextPreview: text.slice(0, 420),
    extractedCharCount: text.length,
    visualExtractionStatus: 'completed',
    visualExtractedText: text,
    metadata: {
      normalizedSourceType: 'pdf',
      previewState: 'full_text_available',
      fullTextAvailable: true,
      storedTextLength: text.length,
    },
  })

  const readiness = classifyDeepLearnResourceReadiness({
    resource,
    storedResource,
    canonicalResourceId: storedResource.id,
  })

  assert.equal(readiness.state, 'text_ready')
  assert.equal(readiness.canGenerate, true)
})

test('classifyDeepLearnResourceReadiness blocks OCR refusal text', () => {
  const refusalText = "I'm unable to transcribe text from images or scanned documents at this time."
  const resource = createLearnResource({
    title: '1.1-Data Organization.pdf',
    extractionStatus: 'completed',
    extractedText: refusalText,
    extractedTextPreview: refusalText,
    extractedCharCount: refusalText.length,
    visualExtractionStatus: 'completed',
    visualExtractedText: refusalText,
    previewState: 'no_text_available',
    fullTextAvailable: false,
    storedTextLength: refusalText.length,
  })
  const storedResource = createStoredResource({
    title: '1.1-Data Organization.pdf',
    extractionStatus: 'completed',
    extractedText: refusalText,
    extractedTextPreview: refusalText,
    extractedCharCount: refusalText.length,
    visualExtractionStatus: 'completed',
    visualExtractedText: refusalText,
    metadata: {
      normalizedSourceType: 'pdf',
      previewState: 'no_text_available',
      fullTextAvailable: false,
      storedTextLength: refusalText.length,
    },
  })

  const readiness = classifyDeepLearnResourceReadiness({
    resource,
    storedResource,
    canonicalResourceId: storedResource.id,
  })

  assert.equal(readiness.state, 'unreadable')
  assert.equal(readiness.canGenerate, false)
})

test('classifyDeepLearnResourceReadiness blocks refusal text mixed with metadata labels', () => {
  const refusalWithMetadata = [
    "I'm unable to transcribe text from images or scanned documents at this time. If there's something specific you'd like to know or discuss from the content, feel free to ask!",
    'File title',
    'Source type of the file',
    'Module name',
    'Course name',
    'Extraction quality reported',
    'Source text quality reported',
    'Grounding strategy used',
    'Was an AI fallback used to supply text?',
    'Was the PDF text transcribed from scanned images?',
  ].join('\n')

  const readiness = classifyDeepLearnResourceReadiness({
    resource: createLearnResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: refusalWithMetadata,
      extractedTextPreview: refusalWithMetadata,
      extractedCharCount: refusalWithMetadata.length,
      visualExtractionStatus: 'failed',
      visualExtractionError: 'Visual extraction did not find enough usable study text. Try OCR again or open the original source.',
      previewState: 'no_text_available',
      fullTextAvailable: false,
      storedTextLength: refusalWithMetadata.length,
    }),
    storedResource: createStoredResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: refusalWithMetadata,
      extractedTextPreview: refusalWithMetadata,
      extractedCharCount: refusalWithMetadata.length,
      visualExtractionStatus: 'failed',
      visualExtractionError: 'Visual extraction did not find enough usable study text. Try OCR again or open the original source.',
    }),
    canonicalResourceId: 'stored-resource-1',
  })

  assert.equal(readiness.state, 'unreadable')
  assert.equal(readiness.canGenerate, false)
})

test('classifyDeepLearnResourceReadiness blocks metadata-only OCR text', () => {
  const metadataText = [
    'Document Title: 1.1-Data Organization.pdf',
    'Resource ID: 550e8400-e29b-41d4-a716-446655440000',
    'Extraction Quality: too short',
    'Quality Note: OCR confidence low',
  ].join('\n')
  const readiness = classifyDeepLearnResourceReadiness({
    resource: createLearnResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: metadataText,
      extractedTextPreview: metadataText,
      extractedCharCount: metadataText.length,
    }),
    storedResource: createStoredResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: metadataText,
      extractedTextPreview: metadataText,
      extractedCharCount: metadataText.length,
    }),
    canonicalResourceId: 'stored-resource-1',
  })

  assert.equal(readiness.state, 'unreadable')
  assert.equal(readiness.canGenerate, false)
})

test('classifyDeepLearnResourceReadiness blocks UUID and title-only content', () => {
  const titleOnlyText = [
    '1.1-Data Organization.pdf',
    '550e8400-e29b-41d4-a716-446655440000',
    '550e8400-e29b-41d4-a716-446655440001',
  ].join('\n')
  const readiness = classifyDeepLearnResourceReadiness({
    resource: createLearnResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: titleOnlyText,
      extractedTextPreview: titleOnlyText,
      extractedCharCount: titleOnlyText.length,
    }),
    storedResource: createStoredResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: titleOnlyText,
      extractedTextPreview: titleOnlyText,
      extractedCharCount: titleOnlyText.length,
    }),
    canonicalResourceId: 'stored-resource-1',
  })

  assert.equal(readiness.state, 'unreadable')
  assert.equal(readiness.canGenerate, false)
})

test('classifyDeepLearnResourceReadiness accepts valid Data Organization OCR text', () => {
  const text = [
    'DATA ORGANIZATION',
    'OLTP means Online Transaction Processing.',
    'ODS stands for Operational Data Store.',
    'A data warehouse is Subject-Oriented, Integrated, Current Valued, and Volatile in this lesson.',
  ].join('\n\n')
  const readiness = classifyDeepLearnResourceReadiness({
    resource: createLearnResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: `${text}\n${text}`,
      extractedTextPreview: `${text}\n${text}`.slice(0, 420),
      extractedCharCount: `${text}\n${text}`.length,
    }),
    storedResource: createStoredResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: `${text}\n${text}`,
      extractedTextPreview: `${text}\n${text}`.slice(0, 420),
      extractedCharCount: `${text}\n${text}`.length,
    }),
    canonicalResourceId: 'stored-resource-1',
  })

  assert.equal(readiness.state, 'text_ready')
  assert.equal(readiness.canGenerate, true)
})

test('classifyDeepLearnResourceReadiness uses meaningful visual OCR when extracted text is stale and thin', () => {
  const thinText = 'DATA ORGANIZATION OLTP ODS.'
  const visualText = buildDataOrganizationText()
  const readiness = classifyDeepLearnResourceReadiness({
    resource: createLearnResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: thinText,
      extractedTextPreview: thinText,
      extractedCharCount: thinText.length,
      visualExtractionStatus: 'completed',
      visualExtractedText: visualText,
      pageCount: 20,
      pagesProcessed: 20,
      previewState: 'full_text_available',
      fullTextAvailable: true,
      storedTextLength: thinText.length,
    }),
    storedResource: createStoredResource({
      title: '1.1-Data Organization.pdf',
      extractionStatus: 'completed',
      extractedText: thinText,
      extractedTextPreview: thinText,
      extractedCharCount: thinText.length,
      visualExtractionStatus: 'completed',
      visualExtractedText: visualText,
      pageCount: 20,
      pagesProcessed: 20,
    }),
    canonicalResourceId: 'stored-resource-1',
  })

  assert.equal(readiness.state, 'text_ready')
  assert.equal(readiness.canGenerate, true)
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
    visualExtractionStatus: overrides.visualExtractionStatus ?? 'not_started',
    visualExtractedText: overrides.visualExtractedText ?? null,
    visualExtractionError: overrides.visualExtractionError ?? null,
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
    visualExtractionStatus: overrides.visualExtractionStatus ?? 'not_started',
    visualExtractedText: overrides.visualExtractedText ?? null,
    visualExtractionError: overrides.visualExtractionError ?? null,
    pageCount: overrides.pageCount ?? null,
    pagesProcessed: overrides.pagesProcessed ?? 0,
    extractionProvider: overrides.extractionProvider ?? null,
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

function buildDataOrganizationText() {
  const paragraph = [
    'DATA ORGANIZATION explains OLTP and Online Transaction Processing for operational systems.',
    'The lesson distinguishes an on demand query approach from an eager approach.',
    'ODS means Operational Data Store and supports current integrated operational reporting.',
    'Data warehouse content is Subject-Oriented, Integrated, Current Valued, and Volatile in the source deck.',
  ].join(' ')
  return Array.from({ length: 10 }, () => paragraph).join('\n\n')
}
