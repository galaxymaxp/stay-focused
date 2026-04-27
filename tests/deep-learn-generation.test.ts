import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDeepLearnGroundingWithDependencies,
  DeepLearnGenerationBlockedError,
} from '../lib/deep-learn-generation'
import type { ModuleSourceResource } from '../lib/module-workspace'
import type { Module, ModuleResource } from '../lib/types'

test('buildDeepLearnGroundingWithDependencies recovers weak resources through source fetch', async () => {
  const resource = createLearnResource({
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: 'Only a short preview is stored for this resource.',
    previewState: 'preview_only',
    fullTextAvailable: false,
    storedTextLength: 0,
    storedPreviewLength: 48,
    storedWordCount: 9,
  })
  const storedResource = createStoredResource({
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: resource.extractedTextPreview,
  })

  const grounding = await buildDeepLearnGroundingWithDependencies(createContext(resource, storedResource), {
    reprocessStoredModuleResource: async () => ({
      update: {
        extractionStatus: 'extracted',
        extractedText: buildLongText('Acceptance requires an objective manifestation of assent to the offer terms.'),
        extractedTextPreview: 'Acceptance requires an objective manifestation of assent to the offer terms.',
        extractedCharCount: 980,
        extractionError: null,
        visualExtractionStatus: 'not_started',
        visualExtractedText: null,
        visualExtractionError: null,
        pageCount: null,
        pagesProcessed: 0,
        extractionProvider: null,
        metadata: {
          normalizedSourceType: 'page',
          previewState: 'full_text_available',
          fullTextAvailable: true,
          storedTextLength: 980,
          storedPreviewLength: 120,
          storedWordCount: 155,
        },
      },
      capability: {
        normalizedSourceType: 'page',
        capability: 'supported',
        capabilityLabel: 'Supported',
        capabilityTone: 'accent',
        hasReadableText: true,
        readableCharCount: 980,
        isLinkOnly: false,
        reason: 'Readable text is persisted for this page.',
      },
      quality: {
        capability: {
          normalizedSourceType: 'page',
          capability: 'supported',
          capabilityLabel: 'Supported',
          capabilityTone: 'accent',
          hasReadableText: true,
          readableCharCount: 980,
          isLinkOnly: false,
          reason: 'Readable text is persisted for this page.',
        },
        quality: 'usable',
        qualityLabel: 'Usable',
        qualityTone: 'accent',
        groundingLevel: 'weak',
        groundingLabel: 'Weak grounding',
        shouldUseForStudy: true,
        shouldUseForGrounding: true,
        shouldUseForQuiz: true,
        normalizedText: buildLongText('Acceptance requires an objective manifestation of assent to the offer terms.'),
        meaningfulText: buildLongText('Acceptance requires an objective manifestation of assent to the offer terms.'),
        totalCharCount: 980,
        meaningfulCharCount: 980,
        meaningfulBlockCount: 4,
        sentenceCount: 6,
        noiseLineCount: 0,
        repeatedLineCount: 0,
        signalRatio: 0.88,
        storedTextLength: 980,
        storedPreviewLength: 120,
        wordCount: 155,
        previewState: 'full_text_available',
        fullTextAvailable: true,
        fallbackReason: null,
        recommendationStrength: 'strong',
        reason: 'Readable text is available and usable for study.',
      },
    }),
  })

  assert.equal(grounding.sourceGrounding.groundingStrategy, 'source_refetch')
  assert.equal(grounding.refreshedResource?.extractionStatus, 'extracted')
  assert.ok(grounding.promptGrounding.includes('Acceptance requires an objective manifestation'))
  assert.ok(grounding.sourceGrounding.charCount > 0)
})

test('buildDeepLearnGroundingWithDependencies blocks image-only PDFs until visual extraction completes', async () => {
  const resource = createLearnResource({
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    sourceUrl: 'https://canvas.example/files/acceptance.pdf',
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: 'pdf_image_only_possible: PDF parsed, but it appears to be image-only or scanned.',
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
    sourceUrl: 'https://canvas.example/files/acceptance.pdf',
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: 'pdf_image_only_possible: PDF parsed, but it appears to be image-only or scanned.',
    visualExtractionStatus: 'available',
    metadata: {
      normalizedSourceType: 'pdf',
      previewState: 'no_text_available',
      fullTextAvailable: false,
      storedTextLength: 0,
      storedPreviewLength: 0,
      storedWordCount: 0,
      pdfExtraction: {
        errorCode: 'pdf_image_only_possible',
        pageCount: 51,
      },
    },
  })

  await assert.rejects(
    () => buildDeepLearnGroundingWithDependencies(createContext(resource, storedResource), {
      downloadScanFallbackSource: async () => {
        throw new Error('Scan fallback should not run before visual extraction completes.')
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof DeepLearnGenerationBlockedError)
      assert.equal(error.blockedReason, 'extraction_unusable_after_fetch')
      assert.match(error.message, /image-only|scanned|readable text/i)
      return true
    },
  )
})

test('buildDeepLearnGroundingWithDependencies can use completed visual extracted text', async () => {
  const visualText = buildLongText('Visual OCR recovered the data organization lesson with fields, records, and categories.')
  const resource = createLearnResource({
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    sourceUrl: 'https://canvas.example/files/data-organization.pdf',
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: 'pdf_image_only_possible: PDF parsed, but it appears to be image-only or scanned.',
    visualExtractionStatus: 'completed',
    visualExtractedText: visualText,
    pageCount: 51,
    pagesProcessed: 5,
    extractionProvider: 'manual_test',
    previewState: 'no_text_available',
  })
  const storedResource = createStoredResource({
    resourceType: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    sourceUrl: 'https://canvas.example/files/data-organization.pdf',
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: 'pdf_image_only_possible: PDF parsed, but it appears to be image-only or scanned.',
    visualExtractionStatus: 'completed',
    visualExtractedText: visualText,
    pageCount: 51,
    pagesProcessed: 5,
    extractionProvider: 'manual_test',
    metadata: {
      normalizedSourceType: 'pdf',
      pdfExtraction: {
        errorCode: 'pdf_image_only_possible',
        pageCount: 51,
      },
    },
  })

  const grounding = await buildDeepLearnGroundingWithDependencies(createContext(resource, storedResource))

  assert.equal(grounding.generationMode, 'text')
  assert.equal(grounding.scanFallbackInput, null)
  assert.match(grounding.promptGrounding, /Visual OCR recovered the data organization lesson/i)
  assert.ok(grounding.sourceGrounding.charCount > 0)
})

test('buildDeepLearnGroundingWithDependencies blocks when source fetch still yields unusable text', async () => {
  const resource = createLearnResource({
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: null,
    previewState: 'no_text_available',
    fullTextAvailable: false,
    storedTextLength: 0,
    storedPreviewLength: 0,
    storedWordCount: 0,
  })
  const storedResource = createStoredResource({
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: null,
  })

  await assert.rejects(
    () => buildDeepLearnGroundingWithDependencies(createContext(resource, storedResource), {
      reprocessStoredModuleResource: async () => ({
        update: {
          extractionStatus: 'empty',
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
          metadata: {
            normalizedSourceType: 'page',
            fallbackReason: 'no_text_in_file',
            previewState: 'no_text_available',
            fullTextAvailable: false,
            storedTextLength: 0,
            storedPreviewLength: 0,
            storedWordCount: 0,
          },
        },
        capability: {
          normalizedSourceType: 'page',
          capability: 'partial',
          capabilityLabel: 'Partial',
          capabilityTone: 'warning',
          hasReadableText: false,
          readableCharCount: 0,
          isLinkOnly: false,
          reason: 'The page was fetched, but no readable text surfaced.',
        },
        quality: {
          capability: {
            normalizedSourceType: 'page',
            capability: 'partial',
            capabilityLabel: 'Partial',
            capabilityTone: 'warning',
            hasReadableText: false,
            readableCharCount: 0,
            isLinkOnly: false,
            reason: 'The page was fetched, but no readable text surfaced.',
          },
          quality: 'empty',
          qualityLabel: 'Empty',
          qualityTone: 'muted',
          groundingLevel: 'none',
          groundingLabel: 'Not grounding',
          shouldUseForStudy: false,
          shouldUseForGrounding: false,
          shouldUseForQuiz: false,
          normalizedText: '',
          meaningfulText: '',
          totalCharCount: 0,
          meaningfulCharCount: 0,
          meaningfulBlockCount: 0,
          sentenceCount: 0,
          noiseLineCount: 0,
          repeatedLineCount: 0,
          signalRatio: 0,
          storedTextLength: 0,
          storedPreviewLength: 0,
          wordCount: 0,
          previewState: 'no_text_available',
          fullTextAvailable: false,
          fallbackReason: 'no_text_in_file',
          recommendationStrength: 'weak',
          reason: 'The file was fetched, but no readable text surfaced from the file body.',
        },
      }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof DeepLearnGenerationBlockedError)
      assert.equal(error.blockedReason, 'extraction_unusable_after_fetch')
      assert.match(error.message, /no readable text/i)
      return true
    },
  )
})

function createContext(resource: ModuleSourceResource, storedResource: ModuleResource) {
  const moduleRecord: Module = {
    id: 'module-1',
    courseId: 'course-1',
    title: 'Week 1',
    raw_content: 'Course: Contracts',
    summary: 'Offer and acceptance',
    concepts: [],
    study_prompts: [],
    recommended_order: [],
    status: 'processed',
    created_at: '2026-04-13T00:00:00.000Z',
  }

  return {
    module: moduleRecord,
    courseName: 'Contracts',
    resource,
    storedResource,
    linkedTask: null,
  }
}

function createLearnResource(overrides: Partial<ModuleSourceResource> = {}): ModuleSourceResource {
  return {
    id: overrides.id ?? 'learn-resource-1',
    title: overrides.title ?? 'Acceptance Notes',
    originalTitle: overrides.originalTitle ?? 'Acceptance Notes',
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
    sourceUrl: overrides.sourceUrl ?? 'https://canvas.example/api/v1/courses/1/pages/acceptance',
    htmlUrl: overrides.htmlUrl ?? 'https://canvas.example/courses/1/pages/acceptance',
    moduleUrl: overrides.moduleUrl ?? null,
    canvasUrl: overrides.canvasUrl ?? 'https://canvas.example/courses/1/pages/acceptance',
    linkedContext: overrides.linkedContext ?? null,
    whyItMatters: overrides.whyItMatters ?? 'This reading frames the next contracts problem set.',
    extractionStatus: overrides.extractionStatus ?? 'metadata_only',
    extractedText: overrides.extractedText ?? null,
    extractedTextPreview: overrides.extractedTextPreview ?? null,
    extractedCharCount: overrides.extractedCharCount ?? 0,
    extractionError: overrides.extractionError ?? null,
    visualExtractionStatus: overrides.visualExtractionStatus ?? 'not_started',
    visualExtractedText: overrides.visualExtractedText ?? null,
    visualExtractionError: overrides.visualExtractionError ?? null,
    pageCount: overrides.pageCount ?? null,
    pagesProcessed: overrides.pagesProcessed ?? 0,
    extractionProvider: overrides.extractionProvider ?? null,
    normalizedSourceType: overrides.normalizedSourceType ?? 'page',
    capability: overrides.capability ?? 'partial',
    capabilityReason: overrides.capabilityReason ?? null,
    quality: overrides.quality ?? 'weak',
    qualityReason: overrides.qualityReason ?? 'The stored extract is still too thin for a trustworthy note.',
    groundingLevel: overrides.groundingLevel ?? 'none',
    originalResourceKind: overrides.originalResourceKind ?? 'Page',
    resolvedTargetType: overrides.resolvedTargetType ?? 'page',
    sourceUrlCategory: overrides.sourceUrlCategory ?? 'canvas',
    resolvedUrlCategory: overrides.resolvedUrlCategory ?? 'canvas',
    resolvedUrl: overrides.resolvedUrl ?? 'https://canvas.example/courses/1/pages/acceptance',
    resolutionState: overrides.resolutionState ?? 'resolved',
    fallbackReason: overrides.fallbackReason ?? null,
    recommendationStrength: overrides.recommendationStrength ?? 'weak',
    previewState: overrides.previewState ?? 'preview_only',
    fullTextAvailable: overrides.fullTextAvailable ?? false,
    storedTextLength: overrides.storedTextLength ?? 0,
    storedPreviewLength: overrides.storedPreviewLength ?? 0,
    storedWordCount: overrides.storedWordCount ?? 0,
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
    title: overrides.title ?? 'Acceptance Notes',
    resourceType: overrides.resourceType ?? 'Page',
    contentType: overrides.contentType ?? 'text/html',
    extension: overrides.extension ?? null,
    sourceUrl: overrides.sourceUrl ?? 'https://canvas.example/api/v1/courses/1/pages/acceptance',
    htmlUrl: overrides.htmlUrl ?? 'https://canvas.example/courses/1/pages/acceptance',
    extractionStatus: overrides.extractionStatus ?? 'metadata_only',
    extractedText: overrides.extractedText ?? null,
    extractedTextPreview: overrides.extractedTextPreview ?? null,
    extractedCharCount: overrides.extractedCharCount ?? 0,
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
      previewState: 'preview_only',
      fullTextAvailable: false,
      storedTextLength: 0,
      storedPreviewLength: 0,
      storedWordCount: 0,
    },
    created_at: overrides.created_at ?? '2026-04-13T00:00:00.000Z',
  }
}

function buildLongText(sentence: string) {
  return `${sentence} ${sentence} ${sentence} ${sentence} ${sentence} ${sentence}`
}
