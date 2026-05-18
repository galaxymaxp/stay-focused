import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  normalizeDeepLearnGeneratedContent,
  type DeepLearnGeneratedContent,
} from '../lib/deep-learn'
import {
  buildDeepLearnPrompt,
  buildDeepLearnGroundingWithDependencies,
  DEEP_LEARN_COMPACT_MAX_OUTPUT_TOKENS,
  DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE,
  DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE,
  DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_REASON,
  DEEP_LEARN_MAX_OUTPUT_TOKENS,
  DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_MESSAGE,
  DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_REASON,
  DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE,
  DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON,
  DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE,
  DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON,
  LEGACY_STAGED_COMPOSER_VERSION,
  DeepLearnGenerationIncompleteError,
  DeepLearnGenerationBlockedError,
  DeepLearnGeneratedContentValidationError,
  buildExamReviewerFromOutline,
  buildDeterministicReviewerFallback,
  buildDeepLearnContentFromSourceMap,
  buildDeepLearnSourceDiagnostics,
  buildAcademicStructuredGrounding,
  generateDeepLearnStructuredContent,
  structureAcademicSourceText,
  validateDeepLearnContentReadyForSave,
} from '../lib/deep-learn-generation'
import {
  DEEP_LEARN_REFINEMENT_BAD_SOURCE_MESSAGE,
  getDeepLearnRefinementModel,
  selectDeepLearnRefinementGrounding,
} from '../lib/deep-learn-refinement'
import {
  buildAcademicSourceMap,
  buildAcademicSourceMapGrounding,
  detectAcademicDisciplineClusters,
} from '../lib/deep-learn-source-map'
import type { ModuleSourceResource } from '../lib/module-workspace'
import type { Module, ModuleResource } from '../lib/types'
import {
  reviewerSourceFixtures,
  type ReviewerSourceFixture,
} from './fixtures/deep-learn-reviewer-sources'

async function generateDeepLearnStructuredContentWithLegacyComposer(
  ...args: Parameters<typeof generateDeepLearnStructuredContent>
): ReturnType<typeof generateDeepLearnStructuredContent> {
  const previousMode = process.env.DEEP_LEARN_GENERATOR_MODE
  process.env.DEEP_LEARN_GENERATOR_MODE = LEGACY_STAGED_COMPOSER_VERSION
  try {
    return await generateDeepLearnStructuredContent(...args)
  } finally {
    if (previousMode === undefined) {
      delete process.env.DEEP_LEARN_GENERATOR_MODE
    } else {
      process.env.DEEP_LEARN_GENERATOR_MODE = previousMode
    }
  }
}

async function withTemporaryEnv<T>(values: Record<string, string | undefined>, callback: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  try {
    return await callback()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

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
      assert.equal(error.message, 'This PDF needs visual text extraction before Deep Learn.')
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

test('buildDeepLearnGroundingWithDependencies grounds prompts only in the selected resource text', async () => {
  const selectedText = buildLongText('Data Organization explains OLTP, Online Transaction Processing, ODS, Operational Data Store, Subject-Oriented, Integrated, Current Valued, and Volatile data.')
  const resource = createLearnResource({
    id: 'data-org-resource',
    title: '1.1-Data Organization.pdf',
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    extractedText: selectedText,
    extractedTextPreview: selectedText.slice(0, 420),
    extractedCharCount: selectedText.length,
    extractionStatus: 'completed',
    whyItMatters: 'ERP SAP Learning Hub Gym Badge assignment date stale context.',
    linkedContext: 'ERP SAP Learning Hub Gym Badge unrelated assignment dates.',
  })
  const storedResource = createStoredResource({
    id: 'data-org-resource',
    resourceType: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    extractedText: selectedText,
    extractedTextPreview: selectedText.slice(0, 420),
    extractedCharCount: selectedText.length,
    extractionStatus: 'completed',
  })

  const grounding = await buildDeepLearnGroundingWithDependencies(createContext(resource, storedResource))

  assert.match(grounding.promptGrounding, /Data Organization explains OLTP/i)
  assert.doesNotMatch(grounding.promptGrounding, /ERP|SAP Learning Hub|Gym Badge|assignment date/i)
})

test('buildDeepLearnGroundingWithDependencies blocks empty sources without using stale module context', async () => {
  const resource = createLearnResource({
    title: '1.1-Data Organization.pdf',
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: null,
    visualExtractionStatus: 'not_started',
    whyItMatters: 'ERP SAP Learning Hub Gym Badge assignment date stale context.',
    linkedContext: 'ERP SAP Learning Hub Gym Badge unrelated assignment dates.',
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
    extractionStatus: 'metadata_only',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    visualExtractionStatus: 'not_started',
  })

  await assert.rejects(
    () => buildDeepLearnGroundingWithDependencies(createContext(resource, storedResource), {
      reprocessStoredModuleResource: async () => {
        throw new Error('No stale module/course context fallback should be used when selected source text is empty.')
      },
      downloadScanFallbackSource: async () => {
        throw new Error('Scan fallback should not run when selected source text is empty.')
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof DeepLearnGenerationBlockedError)
      assert.equal(error.blockedReason, 'extraction_unusable_after_fetch')
      assert.doesNotMatch(error.message, /ERP|SAP Learning Hub|Gym Badge|assignment date/i)
      return true
    },
  )
})

test('buildDeepLearnGroundingWithDependencies blocks refusal text instead of generating from it', async () => {
  const refusalText = "I'm unable to transcribe text from images or scanned documents at this time."
  const resource = createLearnResource({
    title: '1.1-Data Organization.pdf',
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    extractionStatus: 'completed',
    extractedText: refusalText,
    extractedTextPreview: refusalText,
    extractedCharCount: refusalText.length,
    visualExtractionStatus: 'failed',
    whyItMatters: 'ERP SAP Learning Hub Gym Badge assignment date stale context.',
    linkedContext: 'ERP SAP Learning Hub Gym Badge unrelated assignment dates.',
    previewState: 'no_text_available',
    fullTextAvailable: false,
    storedTextLength: refusalText.length,
  })
  const storedResource = createStoredResource({
    title: '1.1-Data Organization.pdf',
    resourceType: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    extractionStatus: 'completed',
    extractedText: refusalText,
    extractedTextPreview: refusalText,
    extractedCharCount: refusalText.length,
    visualExtractionStatus: 'failed',
  })

  await assert.rejects(
    () => buildDeepLearnGroundingWithDependencies(createContext(resource, storedResource)),
    (error: unknown) => {
      assert.ok(error instanceof DeepLearnGenerationBlockedError)
      assert.equal(error.blockedReason, 'extraction_unusable_after_fetch')
      assert.doesNotMatch(error.message, /ERP|SAP Learning Hub|Gym Badge/i)
      return true
    },
  )
})

test('buildDeepLearnGroundingWithDependencies blocks refusal text even when surrounded by metadata labels', async () => {
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
  const resource = createLearnResource({
    title: '1.1-Data Organization.pdf',
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    extractionStatus: 'completed',
    extractedText: refusalWithMetadata,
    extractedTextPreview: refusalWithMetadata,
    extractedCharCount: refusalWithMetadata.length,
    visualExtractionStatus: 'failed',
    previewState: 'no_text_available',
    fullTextAvailable: false,
    storedTextLength: refusalWithMetadata.length,
  })
  const storedResource = createStoredResource({
    title: '1.1-Data Organization.pdf',
    resourceType: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    extractionStatus: 'completed',
    extractedText: refusalWithMetadata,
    extractedTextPreview: refusalWithMetadata,
    extractedCharCount: refusalWithMetadata.length,
    visualExtractionStatus: 'failed',
  })

  await assert.rejects(
    () => buildDeepLearnGroundingWithDependencies(createContext(resource, storedResource)),
    (error: unknown) => {
      assert.ok(error instanceof DeepLearnGenerationBlockedError)
      assert.equal(error.blockedReason, 'extraction_unusable_after_fetch')
      return true
    },
  )
})

test('buildDeepLearnPrompt does not inject metadata or debug labels into model grounding', () => {
  const prompt = buildDeepLearnPrompt({
    ...createContext(createLearnResource({
      title: '1.1-Data Organization.pdf',
      extractedText: buildLongText('DATA ORGANIZATION covers OLTP, Online Transaction Processing, ODS, and Operational Data Store.'),
      extractedTextPreview: buildLongText('DATA ORGANIZATION covers OLTP, Online Transaction Processing, ODS, and Operational Data Store.'),
      extractedCharCount: buildLongText('DATA ORGANIZATION covers OLTP, Online Transaction Processing, ODS, and Operational Data Store.').length,
      extractionStatus: 'completed',
    }), createStoredResource()),
    promptGrounding: 'DATA ORGANIZATION covers OLTP, Online Transaction Processing, ODS, and Operational Data Store.',
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful' as const,
      groundingStrategy: 'stored_extract' as const,
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 200,
    },
    generationMode: 'text',
  })

  assert.doesNotMatch(prompt, /\bResource context\b/i)
  assert.doesNotMatch(prompt, /\bGrounding status\b/i)
  assert.doesNotMatch(prompt, /\bSource text quality\b/i)
  assert.doesNotMatch(prompt, /\bGrounding strategy\b/i)
  assert.doesNotMatch(prompt, /\bUsed AI fallback\b/i)
  assert.doesNotMatch(prompt, /\bCourse:\s*Contracts\b/i)
  assert.doesNotMatch(prompt, /\bModule:\s*Week 1\b/i)
  assert.doesNotMatch(prompt, /\banswer-ready\b|\bcompact answer unit\b/i)
  assert.match(prompt, /DATA ORGANIZATION covers OLTP/i)
  assert.match(prompt, /wording\.exact must keep the teacher\/source wording nearly 1:1/i)
  assert.match(prompt, /Do not use module summaries, course context, assignment metadata/i)
})

test('buildDeepLearnPrompt describes compact three-output Deep Learn contract', () => {
  const prompt = buildDeepLearnPrompt({
    ...createContext(createLearnResource({
      extractedText: buildLongText('Information security explains confidentiality, integrity, availability, vulnerabilities, threats, and controls.'),
      extractedTextPreview: buildLongText('Information security explains confidentiality, integrity, availability, vulnerabilities, threats, and controls.'),
      extractedCharCount: buildLongText('Information security explains confidentiality, integrity, availability, vulnerabilities, threats, and controls.').length,
      extractionStatus: 'completed',
    }), createStoredResource()),
    promptGrounding: 'Information security explains confidentiality, integrity, availability, vulnerabilities, threats, and controls.',
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful' as const,
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 200,
    },
    generationMode: 'text',
  })

  assert.match(prompt.replace(/\n/g, ' '), /Study Pack.*compact/i)
  assert.match(prompt, /Do not generate Reviewer, Quiz, Study Sheet, Cram Sheet, and Source Summary as separate documents/i)
  assert.match(prompt, /answerBank 12 to 16 items/i)
  assert.match(prompt, /identificationItems no more than 16/i)
  assert.match(prompt, /likelyQuizTargets no more than 6/i)
  assert.match(prompt, /distinctions no more than 6/i)
})

test('Deep Learn output token policy uses bounded 10000-token caps and clean student fallback', () => {
  assert.equal(DEEP_LEARN_MAX_OUTPUT_TOKENS, 10000)
  assert.equal(DEEP_LEARN_COMPACT_MAX_OUTPUT_TOKENS, 10000)

  const error = new DeepLearnGenerationIncompleteError('max_output_tokens')
  assert.equal(error.message, 'Reviewer generation could not finish. Try again from the source.')
  assert.equal(error.reason, 'max_output_tokens')
  assert.doesNotMatch(error.message, /max_output_tokens/i)
  assert.doesNotMatch(error.message, /finish in one pass|Regenerate a shorter version|split the module/i)
})

test('buildDeepLearnPrompt compact retry enforces smaller output limits', () => {
  const prompt = buildDeepLearnPrompt({
    ...createContext(createLearnResource({
      extractedText: buildLongText('Information security explains confidentiality, integrity, availability, vulnerabilities, threats, and controls.'),
      extractedTextPreview: buildLongText('Information security explains confidentiality, integrity, availability, vulnerabilities, threats, and controls.'),
      extractedCharCount: buildLongText('Information security explains confidentiality, integrity, availability, vulnerabilities, threats, and controls.').length,
      extractionStatus: 'completed',
    }), createStoredResource()),
    promptGrounding: 'Information security explains confidentiality, integrity, availability, vulnerabilities, threats, and controls.',
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 200,
    },
    generationMode: 'text',
  }, { compact: true })

  assert.match(prompt, /Compact retry limits/i)
  assert.match(prompt, /Generate a shorter Study Pack/i)
  assert.match(prompt, /Key Concepts: no more than 8/i)
  assert.match(prompt, /no more than 10 answerBank items/i)
  assert.match(prompt, /no more than 8 identificationItems/i)
})

test('staged Deep Learn generation completes long readable sources without one giant response', async () => {
  const progress: Array<{ progress: number; statusMessage: string; compactFallbackUsed?: boolean }> = []
  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    createPromptInput(),
    createPreparedGrounding(),
    async ({ schemaName }) => {
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'IT Security',
          overview: 'Focus on the core security ideas first.',
          sections: [
            { heading: 'Source Summary', body: 'The source defines information security, threats, vulnerabilities, and controls.' },
            { heading: 'High-Yield First', body: 'Prioritize confidentiality, integrity, availability, and basic control categories.' },
          ],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') {
        return jsonResponse({
          sections: [{ heading: 'Identification Review', body: 'Practice core terms such as threat, vulnerability, and control.' }],
          identificationItems: [identificationItem(1), identificationItem(2), identificationItem(3)],
        })
      }
      if (schemaName === 'deep_learn_quick_answers_stage') {
        return jsonResponse({
          sections: [{ heading: 'Quick-Answer Blocks', body: 'Use these quick answers for direct recall and short-response questions.' }],
          answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3), answerBankItem(4)],
        })
      }
      return jsonResponse({
        sections: [{ heading: 'Likely Quiz Targets', body: 'Expect CIA triad definitions, threat vs vulnerability, and control examples.' }],
        distinctions: [distinctionItem(1)],
        likelyQuizTargets: [quizTargetItem(1), quizTargetItem(2), quizTargetItem(3)],
        cautionNotes: ['Some examples were brief, so memorize the definitions and lists first.'],
      })
    },
    {
      onProgress(update) {
        progress.push(update)
      },
    },
  )

  assert.equal(result.compactFallbackUsed, false)
  assert.equal(result.content.sections.length, 5)
  assert.equal(result.content.answerBank.length, 4)
  assert.equal(result.content.identificationItems.length, 3)
  assert.equal(result.content.likelyQuizTargets.length, 3)
  assert.deepEqual(progress.map((item) => item.progress), [40, 55, 70, 80])
})

test('staged Deep Learn generation saves a compact fallback when the full quick-answer stage is too large', async () => {
  const progress: Array<{ progress: number; statusMessage: string; compactFallbackUsed?: boolean }> = []
  let quickAnswerCalls = 0
  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    createPromptInput(),
    createPreparedGrounding(),
    async ({ schemaName }) => {
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'IT Security',
          overview: 'Compact fallback should still preserve the main source summary.',
          sections: [
            { heading: 'Source Summary', body: 'The source explains information security basics and common risk terms.' },
            { heading: 'High-Yield First', body: 'Remember CIA, controls, and common attack surfaces first.' },
          ],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') {
        return jsonResponse({
          sections: [{ heading: 'Identification Review', body: 'Keep the strongest key terms only.' }],
          identificationItems: [identificationItem(1), identificationItem(2)],
        })
      }
      if (schemaName === 'deep_learn_quick_answers_stage') {
        quickAnswerCalls += 1
        if (quickAnswerCalls === 1) {
          return {
            status: 'incomplete',
            output_text: '',
            incomplete_details: { reason: 'max_output_tokens' },
          }
        }
        return jsonResponse({
          sections: [{ heading: 'Quick-Answer Blocks', body: 'Compact quick answers keep only the strongest direct recall items.' }],
          answerBank: [answerBankItem(1), answerBankItem(2)],
        })
      }
      return jsonResponse({
        sections: [{ heading: 'Likely Quiz Targets', body: 'Focus on the source definitions most likely to appear in short quizzes.' }],
        distinctions: [],
        likelyQuizTargets: [quizTargetItem(1)],
        cautionNotes: ['Generated a compact reviewer because the source was long.'],
      })
    },
    {
      onProgress(update) {
        progress.push(update)
      },
    },
  )

  assert.equal(result.compactFallbackUsed, true)
  assert.equal(result.content.sections[0]?.heading, 'Source Summary')
  assert.ok(result.content.identificationItems.length >= 2)
  assert.ok(result.content.answerBank.length >= 2)
  assert.ok(result.content.likelyQuizTargets.length >= 1)
  assert.ok(progress.some((item) => item.compactFallbackUsed && item.progress === 32))
  assert.doesNotMatch(JSON.stringify(result), /finish in one pass|Regenerate a shorter version/i)
})

test('staged Deep Learn generation completes through micro fallback when compact also exceeds limits', async () => {
  let identificationCalls = 0
  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    createPromptInput(),
    createPreparedGrounding(),
    async ({ schemaName }) => {
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'IT Security',
          overview: 'Large source.',
          sections: [
            { heading: 'Source Summary', body: 'Summary.' },
            { heading: 'High-Yield First', body: '- CIA triad\n- Controls\n- Threats' },
          ],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') {
        identificationCalls += 1
        if (identificationCalls < 3) {
          return {
            status: 'incomplete',
            output_text: '',
            incomplete_details: { reason: 'max_output_tokens' },
          }
        }
        return jsonResponse({
          sections: [{ heading: 'Identification Review', body: 'Micro key terms only.' }],
          identificationItems: Array.from({ length: 12 }, (_, index) => identificationItem(index)),
        })
      }
      if (schemaName === 'deep_learn_quick_answers_stage') {
        return jsonResponse({
          sections: [{ heading: 'Quick-Answer Blocks', body: 'Micro Q&A only.' }],
          answerBank: Array.from({ length: 10 }, (_, index) => answerBankItem(index)),
        })
      }
      return jsonResponse({
        sections: [{ heading: 'Likely Quiz Targets', body: 'Micro quiz targets.' }],
        distinctions: [distinctionItem(1), distinctionItem(2)],
        likelyQuizTargets: Array.from({ length: 9 }, (_, index) => quizTargetItem(index)),
        cautionNotes: ['First caution.', 'Second caution.', 'Third caution.'],
      })
    },
  )

  assert.equal(result.compactFallbackUsed, true)
  assert.equal(identificationCalls, 3)
  assert.ok(result.content.identificationItems.length <= 4)
  assert.ok(result.content.answerBank.length <= 6)
  assert.ok(result.content.likelyQuizTargets.length <= 5)
  assert.ok(result.content.cautionNotes.length <= 2)
  assert.ok(result.content.cautionNotes.includes('Generated as a compact reviewer because the source was long.'))
  assert.doesNotMatch(JSON.stringify(result), /finish in one pass|Regenerate a shorter version/i)
})

test('staged Deep Learn generation saves partial output when identification exceeds all fallback limits', async () => {
  let identificationCalls = 0
  const tokenCaps: number[] = []
  const prompts: string[] = []
  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    createPromptInput(),
    createPreparedGrounding(),
    async ({ schemaName, maxOutputTokens, promptText }) => {
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'IT Security',
          overview: 'Large source.',
          sections: [
            { heading: 'Source Summary', body: 'The source explains information security basics.' },
            { heading: 'High-Yield First', body: '- CIA triad\n- Threats and vulnerabilities' },
          ],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') {
        identificationCalls += 1
        tokenCaps.push(maxOutputTokens)
        prompts.push(promptText)
        return {
          status: 'incomplete',
          output_text: '',
          incomplete_details: { reason: 'max_output_tokens' },
        }
      }
      if (schemaName === 'deep_learn_quick_answers_stage') {
        return jsonResponse({
          sections: [{ heading: 'Quick-Answer Blocks', body: 'Short source-grounded answers remain available.' }],
          answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3), answerBankItem(4)],
        })
      }
      return jsonResponse({
        sections: [{ heading: 'Likely Quiz Targets', body: 'Quiz targets remain available without the identification review.' }],
        distinctions: [distinctionItem(1)],
        likelyQuizTargets: [quizTargetItem(1), quizTargetItem(2), quizTargetItem(3)],
        cautionNotes: [],
      })
    },
  )

  assert.equal(result.compactFallbackUsed, true)
  assert.equal(identificationCalls, 4)
  assert.deepEqual(tokenCaps, [3600, 2200, 1400, 900])
  assert.match(prompts.at(-1) ?? '', /identificationItems: 2 to 3 strongest/i)
  assert.equal(result.content.identificationItems.length, 0)
  assert.ok(result.content.answerBank.length >= 3)
  assert.ok(result.content.likelyQuizTargets.length >= 3)
  assert.ok(result.content.cautionNotes.includes(DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE))
  const validation = validateDeepLearnContentReadyForSave(result.content)
  assert.equal(validation.ok, true)
  assert.equal(validation.reason, null)
})

test('meaningful extracted text with dense source relations does not fail when identification hits token limits', async () => {
  const denseRelationSource = [
    'Security assets include data, networks, applications, devices, credentials, and backups.',
    'Access control includes identification, authentication, authorization, and accountability.',
    'Defense in depth includes physical controls, technical controls, administrative controls, and monitoring.',
    'Malware symptoms include slow performance, unexpected popups, unknown processes, deleted files, and modified files.',
    'Incident response procedure 1. Identify the event 2. Contain affected systems 3. Eradicate malware 4. Recover services 5. Document lessons.',
    'Password hardening procedure 1. Use long passphrases 2. Enable MFA 3. Avoid reuse 4. Rotate compromised credentials.',
    'Risk assessment procedure 1. Identify assets 2. Identify threats 3. Estimate likelihood 4. Estimate impact 5. Prioritize controls.',
    '2018 - The organization adopted multifactor authentication for administrative accounts.',
    '2019 - Endpoint detection was added to laptops and servers.',
    '2020 - Backup testing became part of the disaster recovery plan.',
    'Firewall - network security device that filters traffic based on rules.',
    'Encryption - method used to transform readable data into protected ciphertext.',
    'Phishing - social engineering attack that tricks users into revealing credentials.',
    'Vulnerability is a weakness while an exploit is a method used to take advantage of that weakness.',
    'Threat actors use phishing because human trust can bypass technical controls.',
    'Backup integrity matters because recovery fails when restored data is incomplete or corrupted.',
    'Area Formula Risk equals likelihood times impact for qualitative prioritization.',
    'The security policy applies when users handle confidential data, access systems remotely, or use personal devices.',
    'Nursing-style triage includes assessment, intervention, monitoring, and evaluation during incident response.',
    'Router - network equipment used to forward packets between networks.',
  ].join('\n')
  const sourceText = `${IT_SECURITY_SAMPLE_SOURCE}\n\n${denseRelationSource}\n\n${denseRelationSource}`
  const sourceMap = buildAcademicSourceMap(sourceText)
  assert.ok(sourceText.length >= 5900)
  assert.ok((sourceMap.relations?.length ?? 0) >= 16)

  const promptInput: Parameters<typeof generateDeepLearnStructuredContent>[0] = {
    ...createContext(createLearnResource({
      title: '1. Intro-To-IT-Security.pdf',
      type: 'File',
      contentType: 'application/pdf',
      extension: 'pdf',
      normalizedSourceType: 'pdf',
      extractedText: sourceText,
      extractedTextPreview: sourceText.slice(0, 420),
      extractedCharCount: sourceText.length,
      extractionStatus: 'completed',
    }), createStoredResource({
      title: '1. Intro-To-IT-Security.pdf',
      resourceType: 'File',
      contentType: 'application/pdf',
      extension: 'pdf',
      extractedText: sourceText,
      extractedTextPreview: sourceText.slice(0, 420),
      extractedCharCount: sourceText.length,
      extractionStatus: 'completed',
    })),
    promptGrounding: buildAcademicStructuredGrounding(sourceText),
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: sourceText.length,
      sourceMap,
    },
    generationMode: 'text',
  }
  const grounding: Parameters<typeof generateDeepLearnStructuredContent>[1] = {
    generationMode: 'text',
    promptGrounding: buildAcademicStructuredGrounding(sourceText),
    sourceGrounding: promptInput.sourceGrounding,
    refreshedResource: null,
    scanFallbackInput: null,
  }

  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    promptInput,
    grounding,
    async ({ schemaName }) => {
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'Intro To IT Security',
          overview: 'The source explains information security, cybersecurity, threats, malware, and impact reduction.',
          sections: [
            { heading: 'Source Summary', body: 'The source explains information security, cybersecurity, threats, malware, and impact reduction.' },
            { heading: 'High-Yield First', body: '- CIA triad\n- Malware types\n- Attack methods' },
          ],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') {
        return {
          status: 'incomplete',
          output_text: '',
          incomplete_details: { reason: 'max_output_tokens' },
        }
      }
      if (schemaName === 'deep_learn_quick_answers_stage') {
        return jsonResponse({
          sections: [{ heading: 'Quick-Answer Blocks', body: 'Use source-backed security definitions and attack examples.' }],
          answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3), answerBankItem(4)],
        })
      }
      return jsonResponse({
        sections: [{ heading: 'Likely Quiz Targets', body: 'Expect CIA triad, malware, attackers, and impact reduction.' }],
        distinctions: [distinctionItem(1)],
        likelyQuizTargets: [quizTargetItem(1), quizTargetItem(2), quizTargetItem(3), quizTargetItem(4)],
        cautionNotes: [],
      })
    },
  )

  assert.equal(result.compactFallbackUsed, true)
  assert.ok(result.content.identificationItems.length <= 5)
  assert.ok(result.content.answerBank.length >= 3)
  assert.ok(result.content.likelyQuizTargets.length >= 3)
  assert.ok(result.content.cautionNotes.includes(DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE))
  assert.equal(validateDeepLearnContentReadyForSave(result.content).ok, true)
})

test('identification output size failures use the specific student-facing reason', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'IT Security',
    overview: 'The source explains information security basics.',
    sections: [
      { heading: 'Source Summary', body: 'The source explains information security basics.' },
      { heading: 'Quick-Answer Blocks', body: 'Use these source-grounded quick answers.' },
      { heading: 'Likely Quiz Targets', body: 'Use these source-grounded quiz targets.' },
    ],
    answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3)],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [quizTargetItem(1), quizTargetItem(2), quizTargetItem(3)],
    cautionNotes: [DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE],
  }, 'IT Security')

  const validation = validateDeepLearnContentReadyForSave(content)
  const error = new DeepLearnGenerationIncompleteError(DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_REASON)

  assert.equal(validation.ok, true)
  assert.equal(error.message, DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE)
  assert.doesNotMatch(error.message, /could not build enough structured study content/i)
})

test('quick-answer output size failures save partial Study Pack content', async () => {
  let quickAnswerCalls = 0
  const quickAnswerTokenCaps: number[] = []
  const quickAnswerPrompts: string[] = []
  const diagnostics: Array<Record<string, unknown>> = []
  const originalWarn = console.warn
  const originalInfo = console.info
  console.warn = (...args: unknown[]) => {
    if (args[0] === '[deep-learn-generation] stage diagnostics' && typeof args[1] === 'object' && args[1]) {
      diagnostics.push(args[1] as Record<string, unknown>)
    }
  }
  console.info = (...args: unknown[]) => {
    if (args[0] === '[deep-learn-generation] stage diagnostics' && typeof args[1] === 'object' && args[1]) {
      diagnostics.push(args[1] as Record<string, unknown>)
    }
  }
  let result
  try {
    result = await generateDeepLearnStructuredContentWithLegacyComposer(
      createPromptInput(),
      createPreparedGrounding(),
      async ({ schemaName, maxOutputTokens, promptText }) => {
        if (schemaName === 'deep_learn_high_yield_stage') {
          return jsonResponse({
            title: 'Academic Module',
            overview: 'The source explains core academic concepts and procedures.',
            sections: [
              { heading: 'Source Summary', body: 'The source explains core academic concepts and procedures.' },
              { heading: 'High-Yield First', body: '- Concept groups\n- Procedures\n- Definitions' },
            ],
          })
        }
        if (schemaName === 'deep_learn_identification_stage') {
          return jsonResponse({
            sections: [{ heading: 'Identification Review', body: 'Practice direct prompts from the source.' }],
            identificationItems: Array.from({ length: 12 }, (_, index) => identificationItem(index)),
            cautionNotes: ['Use source-backed uncertainty only when the source is incomplete.'],
          })
        }
        if (schemaName === 'deep_learn_quick_answers_stage') {
          quickAnswerCalls += 1
          quickAnswerTokenCaps.push(maxOutputTokens)
          quickAnswerPrompts.push(promptText)
          return {
            status: 'incomplete',
            output_text: '',
            incomplete_details: { reason: 'max_output_tokens' },
          }
        }
        return jsonResponse({
          sections: [{ heading: 'Likely Quiz Targets', body: 'Likely quiz targets remain usable without a full quick-answer section.' }],
          distinctions: [distinctionItem(1)],
          likelyQuizTargets: Array.from({ length: 6 }, (_, index) => quizTargetItem(index)),
          cautionNotes: [],
        })
      },
    )
  } finally {
    console.warn = originalWarn
    console.info = originalInfo
  }

  assert.equal(result.compactFallbackUsed, true)
  assert.equal(quickAnswerCalls, 4)
  assert.deepEqual(quickAnswerTokenCaps, [4200, 2600, 1200, 800])
  assert.match(quickAnswerPrompts[0] ?? '', /answer only the generated identification items/i)
  assert.match(quickAnswerPrompts.at(-1) ?? '', /answer max 3 generated identification items, one sentence each/i)
  assert.match(quickAnswerPrompts.at(-1) ?? '', /No long explanations\. No essay-style output/i)
  assert.ok(result.content.sections.some((section) => section.heading === 'Source Summary'))
  assert.ok(result.content.sections.some((section) => section.heading === 'Identification Review'))
  assert.ok(result.content.identificationItems.length >= 3)
  assert.ok(result.content.answerBank.length <= 3)
  assert.ok(result.content.cautionNotes.includes(DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE))
  assert.doesNotMatch(JSON.stringify(result.content), /source-backed/i)
  const finalQuickAnswerDiagnostic = diagnostics.findLast((item) => item.failedStage === 'quick_answers')
  assert.equal(finalQuickAnswerDiagnostic?.stageCriticality, 'optional')
  assert.equal(finalQuickAnswerDiagnostic?.rawReason, 'max_output_tokens')
  assert.equal(finalQuickAnswerDiagnostic?.normalizedIncompleteReason, DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON)
  assert.equal(finalQuickAnswerDiagnostic?.hasUsableCoreContent, true)
  assert.equal(finalQuickAnswerDiagnostic?.shouldSavePartial, true)
  assert.equal(finalQuickAnswerDiagnostic?.partialSaveHappened, true)
  assert.equal(finalQuickAnswerDiagnostic?.finalJobStatus, 'completed')
  assert.doesNotMatch(JSON.stringify(result.content), /could not build enough structured study content/i)
  assert.equal(validateDeepLearnContentReadyForSave(result.content).ok, true)
})

test('partial save completes when only caution notes contain composer leakage', async () => {
  const diagnostics: Array<Record<string, unknown>> = []
  const originalWarn = console.warn
  const originalInfo = console.info
  console.warn = (...args: unknown[]) => {
    if (args[0] === '[deep-learn-generation] stage diagnostics' && typeof args[1] === 'object' && args[1]) {
      diagnostics.push(args[1] as Record<string, unknown>)
    }
  }
  console.info = (...args: unknown[]) => {
    if (args[0] === '[deep-learn-generation] stage diagnostics' && typeof args[1] === 'object' && args[1]) {
      diagnostics.push(args[1] as Record<string, unknown>)
    }
  }
  let result
  try {
    result = await generateDeepLearnStructuredContentWithLegacyComposer(
      createPromptInput(),
      createPreparedGrounding(),
      async ({ schemaName }) => {
        if (schemaName === 'deep_learn_high_yield_stage') {
          return jsonResponse({
            title: 'Academic Module',
            overview: 'The source explains academic concepts and procedures.',
            sections: [
              { heading: 'Source Summary', body: 'The source explains academic concepts and procedures for review.' },
              { heading: 'High-Yield First', body: 'Focus on definitions, steps, and checks from the source.' },
            ],
          })
        }
        if (schemaName === 'deep_learn_identification_stage') {
          return jsonResponse({
            sections: [{ heading: 'Identification Review', body: 'Practice direct prompts from the source.' }],
            identificationItems: [identificationItem(1), identificationItem(2), identificationItem(3), identificationItem(4), identificationItem(5)],
            cautionNotes: ['Generated as compact reviewer because the source was long.'],
          })
        }
        if (schemaName === 'deep_learn_quick_answers_stage') {
          return jsonResponse({
            sections: [],
            answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3)],
          })
        }
        if (schemaName === 'deep_learn_distinctions_stage') {
          return {
            status: 'incomplete',
            output_text: '',
            incomplete_details: { reason: 'max_output_tokens' },
          }
        }
        return jsonResponse({ sections: [], distinctions: [], likelyQuizTargets: [], cautionNotes: [] })
      },
    )
  } finally {
    console.warn = originalWarn
    console.info = originalInfo
  }

  assert.equal(result.compactFallbackUsed, true)
  assert.ok(result.content.sections.length >= 3)
  assert.equal(result.content.answerBank.length, 3)
  assert.equal(result.content.identificationItems.length, 5)
  assert.doesNotMatch(JSON.stringify(result.content.cautionNotes), /Generated as compact reviewer|Generated from fallback|source-backed/i)
  const finalDiagnostic = diagnostics.findLast((item) => item.failedStage === 'distinctions' && item.event === 'partial_save')
  assert.equal(finalDiagnostic?.event, 'partial_save')
  assert.equal(finalDiagnostic?.shouldSavePartial, true)
  assert.equal(finalDiagnostic?.finalJobStatus, 'completed')
  assert.equal((finalDiagnostic?.finalValidatorResult as { reason?: string } | undefined)?.reason, null)
})

test('SDLC-style quick-answer partial save is not failed by internal caution note wording', async () => {
  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    createPromptInput(),
    createPreparedGrounding(),
    async ({ schemaName }) => {
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'Systems Development',
          overview: 'The source explains planning, implementation, testing, and maintenance.',
          sections: [
            { heading: 'Source Summary', body: 'The source explains planning, implementation, testing, and maintenance.' },
            { heading: 'High-Yield First', body: 'Focus on lifecycle phases, control checks, and maintenance decisions.' },
          ],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') {
        return jsonResponse({
          sections: [{ heading: 'Identification Review', body: 'Practice lifecycle terms and phase prompts.' }],
          identificationItems: [identificationItem(1), identificationItem(2), identificationItem(3), identificationItem(4), identificationItem(5)],
          cautionNotes: ['Generated from fallback for compact grounding.'],
        })
      }
      if (schemaName === 'deep_learn_quick_answers_stage') {
        return {
          status: 'incomplete',
          output_text: '',
          incomplete_details: { reason: 'max_output_tokens' },
        }
      }
      return jsonResponse({ sections: [], distinctions: [], likelyQuizTargets: [], cautionNotes: [] })
    },
  )

  const validation = validateDeepLearnContentReadyForSave(result.content)

  assert.equal(validation.ok, true)
  assert.equal(validation.reason, null)
  assert.equal(result.content.answerBank.length, 3)
  assert.equal(result.content.identificationItems.length, 5)
  assert.doesNotMatch(JSON.stringify(result.content), /compact grounding|Generated from fallback/i)
})

test('quick-answer output size failures use the specific student-facing reason', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'Academic Module',
    overview: 'The source explains core academic concepts.',
    sections: [
      { heading: 'Source Summary', body: 'The source explains core academic concepts.' },
      { heading: 'Identification Review', body: 'Use direct prompts for review.' },
      { heading: 'Likely Quiz Targets', body: 'Use these source-grounded quiz targets.' },
    ],
    answerBank: [],
    identificationItems: [identificationItem(1), identificationItem(2), identificationItem(3)],
    distinctions: [],
    likelyQuizTargets: [quizTargetItem(1), quizTargetItem(2), quizTargetItem(3)],
    cautionNotes: [DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE],
  }, 'Academic Module')

  const validation = validateDeepLearnContentReadyForSave(content)
  const error = new DeepLearnGenerationIncompleteError(DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON)

  assert.equal(validation.ok, true)
  assert.equal(error.message, DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE)
  assert.doesNotMatch(error.message, /could not build enough structured study content/i)
})

test('valid source saves partial Study Pack when likely quiz targets exceed all fallback limits', async () => {
  let quizTargetCalls = 0
  const quizTargetTokenCaps: number[] = []
  const diagnostics: Array<Record<string, unknown>> = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    if (args[0] === '[deep-learn-generation] stage diagnostics' && typeof args[1] === 'object' && args[1]) {
      diagnostics.push(args[1] as Record<string, unknown>)
    }
  }
  let result
  try {
    result = await generateDeepLearnStructuredContentWithLegacyComposer(
      createPromptInput(),
      createPreparedGrounding(),
      async ({ schemaName, maxOutputTokens }) => {
        if (schemaName === 'deep_learn_high_yield_stage') {
          return jsonResponse({
            title: 'Academic Systems',
            overview: 'The source explains how academic systems organize concepts, procedures, and checks.',
            sections: [
              { heading: 'Source Summary', body: 'The source explains how academic systems organize concepts, procedures, and checks for reliable work.' },
              { heading: 'High-Yield First', body: '- Concepts\n- Procedures\n- Checks' },
            ],
          })
        }
        if (schemaName === 'deep_learn_identification_stage') {
          return jsonResponse({
            sections: [{ heading: 'Identification Review', body: 'Practice direct source-grounded prompts.' }],
            identificationItems: [identificationItem(1), identificationItem(2), identificationItem(3)],
          })
        }
        if (schemaName === 'deep_learn_quick_answers_stage') {
          return jsonResponse({
            sections: [{ heading: 'Quick-Answer Blocks', body: 'Use compact answers for direct recall.' }],
            answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3)],
          })
        }
        quizTargetCalls += 1
        quizTargetTokenCaps.push(maxOutputTokens)
        return {
          status: 'incomplete',
          output_text: '',
          incomplete_details: { reason: 'max_output_tokens' },
        }
      },
    )
  } finally {
    console.warn = originalWarn
  }

  assert.equal(result.compactFallbackUsed, true)
  assert.equal(quizTargetCalls, 4)
  assert.deepEqual(quizTargetTokenCaps, [2600, 1800, 900, 650])
  assert.ok(result.content.sections.some((section) => section.heading === 'Source Summary'))
  assert.ok(result.content.sections.some((section) => section.heading === 'Likely Quiz Targets'))
  assert.ok(result.content.likelyQuizTargets.length >= 3)
  assert.ok(result.content.likelyQuizTargets.length <= 5)
  assert.ok(result.content.cautionNotes.includes(DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE))
  const finalCombinedDiagnostic = diagnostics.findLast((item) => item.failedStage === 'distinctions')
  assert.equal(finalCombinedDiagnostic?.normalizedStage, 'distinctions')
  assert.equal(finalCombinedDiagnostic?.stageCriticality, 'optional')
  assert.equal(finalCombinedDiagnostic?.rawReason, 'max_output_tokens')
  assert.equal(finalCombinedDiagnostic?.normalizedIncompleteReason, DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON)
  assert.equal(finalCombinedDiagnostic?.hasUsableCoreContent, true)
  assert.equal(finalCombinedDiagnostic?.shouldSavePartial, true)
  assert.equal(finalCombinedDiagnostic?.partialSaveHappened, true)
  assert.equal(finalCombinedDiagnostic?.finalJobStatus, 'completed')
  assert.equal(validateDeepLearnContentReadyForSave(result.content).ok, true)
  assert.doesNotMatch(JSON.stringify(result.content), /IT Security|SDLC|Arnis|PATHFit/i)
  assert.doesNotMatch(JSON.stringify(result.content), /could not build enough structured study content/i)
})

test('valid source saves partial Study Pack when identification and quiz-target optional stages fail', async () => {
  let identificationCalls = 0
  let quizTargetCalls = 0
  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    createPromptInput(),
    createPreparedGrounding(),
    async ({ schemaName }) => {
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'Neutral Academic Notes',
          overview: 'The source explains concept groups, procedures, and evaluation checks.',
          sections: [
            { heading: 'Source Summary', body: 'The source explains concept groups, procedures, and evaluation checks for a neutral academic topic.' },
            { heading: 'High-Yield First', body: '- Concept groups\n- Procedure order\n- Evaluation checks' },
          ],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') {
        identificationCalls += 1
        return {
          status: 'incomplete',
          output_text: '',
          incomplete_details: { reason: 'max_output_tokens' },
        }
      }
      if (schemaName === 'deep_learn_quick_answers_stage') {
        return jsonResponse({
          sections: [{ heading: 'Quick-Answer Blocks', body: 'Other compact recall answers remain available.' }],
          answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3), answerBankItem(4)],
        })
      }
      quizTargetCalls += 1
      return {
        status: 'incomplete',
        output_text: '',
        incomplete_details: { reason: 'max_output_tokens' },
      }
    },
  )

  assert.equal(result.compactFallbackUsed, true)
  assert.equal(identificationCalls, 4)
  assert.equal(quizTargetCalls, 1)
  assert.ok(result.content.answerBank.length >= 3)
  assert.equal(result.content.identificationItems.length, 0)
  assert.ok(result.content.cautionNotes.includes(DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE))
  assert.ok(result.content.cautionNotes.includes(DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE))
  assert.equal(validateDeepLearnContentReadyForSave(result.content).ok, true)
})

test('optional-stage parse failure after core content saves available Study Pack sections', async () => {
  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    createPromptInput(),
    createPreparedGrounding(),
    async ({ schemaName }) => {
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'Learning Process Notes',
          overview: 'The source explains stages, checks, and outcomes.',
          sections: [
            { heading: 'Source Summary', body: 'The source explains stages, checks, and outcomes for a general learning process.' },
            { heading: 'High-Yield First', body: '- Stages\n- Checks\n- Outcomes' },
          ],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') {
        return jsonResponse({
          sections: [{ heading: 'Identification Review', body: 'Practice source-grounded prompts.' }],
          identificationItems: [identificationItem(1), identificationItem(2), identificationItem(3)],
        })
      }
      return {
        status: 'completed',
        output_text: '{not json',
        incomplete_details: null,
      }
    },
  )

  assert.equal(result.compactFallbackUsed, false)
  assert.ok(result.content.sections.some((section) => section.heading === 'Source Summary'))
  assert.ok(result.content.cautionNotes.some((note) =>
    note === DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE
    || note === DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_MESSAGE
  ))
  assert.equal(validateDeepLearnContentReadyForSave(result.content).ok, true)
})

test('metadata-only source still fails normal Study Pack validation despite optional skip notes', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'Upload Metadata',
    overview: 'File title and UUID only.',
    sections: [
      { heading: 'Source Summary', body: 'File title: upload.pdf UUID: 11111111-1111-4111-8111-111111111111 metadata only.' },
    ],
    answerBank: [],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [],
    cautionNotes: [DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE],
  }, 'Upload Metadata')

  const validation = validateDeepLearnContentReadyForSave(content)

  assert.equal(validation.ok, false)
  assert.equal(validation.reason, 'insufficient_structured_artifacts')
})

test('optional-stage partial policy does not fake success when no usable core content exists', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'Meaningful Academic Source',
    overview: 'The source explains academic theory, procedure steps, evaluation criteria, and grounded examples.',
    sections: [
      { heading: 'Quick-Answer Blocks', body: 'Academic theory uses definitions, procedure steps, evaluation criteria, and grounded examples for assessment.' },
      { heading: 'Likely Quiz Targets', body: 'Expect definitions, ordered procedures, criteria, and examples from the source.' },
    ],
    answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3)],
    identificationItems: [identificationItem(1), identificationItem(2), identificationItem(3)],
    distinctions: [],
    likelyQuizTargets: [quizTargetItem(1), quizTargetItem(2), quizTargetItem(3)],
    cautionNotes: [DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE],
  }, 'Meaningful Academic Source')

  const validation = validateDeepLearnContentReadyForSave(content)

  assert.equal(validation.ok, false)
  assert.equal(validation.reason, 'insufficient_structured_artifacts')
})

test('optional stage incomplete reasons use student-facing copy without generic structured-content failure', () => {
  assert.equal(new DeepLearnGenerationIncompleteError(DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON).message, DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE)
  assert.equal(new DeepLearnGenerationIncompleteError(DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_REASON).message, DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_MESSAGE)
  assert.doesNotMatch(new DeepLearnGenerationIncompleteError(DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON).message, /could not build enough structured study content/i)
})

test('Deep Learn save validator rejects source-summary-only reviewer artifacts', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'IT Security',
    overview: 'The source explains information security basics.',
    sections: [
      { heading: 'Source Summary', body: 'The source explains information security basics.' },
      { heading: 'High-Yield First', body: '- Review the selected source directly.' },
    ],
    answerBank: [],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [],
    cautionNotes: [],
  }, 'IT Security')

  const validation = validateDeepLearnContentReadyForSave(content)

  assert.equal(validation.ok, false)
  assert.equal(validation.message, DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE)
})

test('readable IT Security-like source repairs weak model output locally', async () => {
  let calls = 0
  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    createItSecurityPromptInput(),
    createItSecurityPreparedGrounding(),
    async ({ schemaName }) => {
      calls += 1
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'Intro to IT Security',
          overview: 'The source introduces IT security and cybersecurity.',
          sections: [
            { heading: 'Source Summary', body: 'The source introduces IT security and cybersecurity.' },
            { heading: 'High-Yield First', body: 'Review the source directly.' },
          ],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') {
        return jsonResponse({ sections: [], identificationItems: [] })
      }
      if (schemaName === 'deep_learn_quick_answers_stage') {
        return jsonResponse({ sections: [], answerBank: [] })
      }
      return jsonResponse({
        sections: [],
        distinctions: [],
        likelyQuizTargets: [],
        cautionNotes: [],
      })
    },
  )

  assert.equal(calls, 4)
  assert.equal(result.compactFallbackUsed, false)
  assert.ok(result.content.sections.some((section) => section.heading === 'Source Summary'))
  assert.ok(result.content.sections.some((section) => section.heading === 'High-Yield First'))
  assert.ok(result.content.answerBank.length > 0)
  assert.ok(result.content.identificationItems.length > 0)
  assert.ok(result.content.likelyQuizTargets.length > 0)
  assert.equal(validateDeepLearnContentReadyForSave(result.content).ok, true)
  assert.ok(result.content.answerBank.some((item) => /Cybersecurity/i.test(item.cue)))
  assert.ok(result.content.answerBank.some((item) => /CIA Triad/i.test(item.cue)))
  assert.ok(result.content.answerBank.some((item) => /Malware Types/i.test(item.cue)))
  assert.ok(result.content.answerBank.some((item) => /Methods of Infiltration/i.test(item.cue)))
})

test('Source Map compact reviewer content passes save validation with IT Security concepts', () => {
  const sourceMap = buildAcademicSourceMap(IT_SECURITY_SAMPLE_SOURCE)
  const content = buildDeepLearnContentFromSourceMap(sourceMap, 'Intro to IT Security')

  assert.ok(content)
  assert.equal(validateDeepLearnContentReadyForSave(content).ok, true)
  assert.ok(content.sections.some((section) => section.heading === 'Key Answers / Answer Bank'))
  assert.ok(content.sections.some((section) => section.heading === 'Identification Review'))
  assert.ok(content.sections.some((section) => section.heading === 'Likely Quiz Targets'))

  const cues = content.answerBank.map((item) => item.cue).join(' | ')
  for (const expected of [
    'Cybersecurity',
    'CIA Triad',
    'Malware Types',
    'Methods of Infiltration',
    'Vulnerability / Exploit / Breach',
  ]) {
    assert.match(cues, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
  assert.match(JSON.stringify(content), /Information Security/i)
})

test('Source Map compact reviewer preserves complete lists and word-safe compact answers', () => {
  const sourceMap = buildAcademicSourceMap(IT_SECURITY_SAMPLE_SOURCE)
  const content = buildDeepLearnContentFromSourceMap(sourceMap, 'Intro to IT Security')
  assert.ok(content)

  const answerFor = (cue: string) => {
    const match = content.answerBank.find((item) => item.cue === cue)
    assert.ok(match, `missing ${cue}`)
    return match
  }

  const domains = answerFor('Domains of IT Security')
  for (const item of ['Network Security', 'Internet Security', 'Endpoint Security', 'Cloud Security', 'Application Security', 'Information Security', 'Operational Security', 'Mobile Security', 'IoT Security', 'User Education', 'Cyber Security']) {
    assert.match(domains.answer.examSafe, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(domains.answer.examSafe, /Domains of IT Security:\n1\. Network Security/)

  const malware = answerFor('Malware Types')
  for (const item of ['Spyware', 'Adware', 'Bot', 'Rootkit', 'Scareware', 'Ransomware', 'Virus', 'Trojan Horse', 'Worm', 'MiTM']) {
    assert.match(malware.answer.examSafe, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  const itSecurity = answerFor('IT Security')
  assert.match(itSecurity.answer.examSafe, /^IT Security uses cybersecurity strategies/)
  assert.doesNotMatch(itSecurity.answer.examSafe, /InfoSec|processes and tools/i)

  const cybersecurity = answerFor('Cybersecurity')
  assert.match(cybersecurity.answer.examSafe, /unauthorized access\.$/)
  assert.doesNotMatch(cybersecurity.compactAnswer.examSafe, /\b(?:u|architect)$/i)

  for (const item of content.answerBank) {
    assert.doesNotMatch(item.compactAnswer.examSafe, /[A-Za-z]{2,}-$| [A-Za-z]{1,2}$/)
  }

  const highYield = content.sections.find((section) => section.heading === 'High-Yield First')?.body ?? ''
  assert.match(highYield, /IT Security uses cybersecurity strategies/)
  assert.doesNotMatch(highYield, /IT Security: .*InfoSec -|IT Security: .*processes and tools/i)

  const rendered = JSON.stringify(content)
  assert.doesNotMatch(rendered, /source-backed|source wording|source chronology|grouped concepts|extracted concepts|compact grounding|exact source passage|Source Notes|using the source wording|Explain the source-backed concept|\bclassifies\b|\bpreserves\b/i)
  assert.ok(content.likelyQuizTargets.every((item) => /\?$|\.$/.test(item.target)))
  assert.ok(content.likelyQuizTargets.some((item) => item.target === 'What are the three goals of IT Security?'))
})

test('Source Map compact reviewer filters weak terms without removing legitimate security concepts', () => {
  const sourceMap = buildAcademicSourceMap(IT_SECURITY_SAMPLE_SOURCE)
  sourceMap.units.unshift(
    {
      id: 'weak-what',
      title: 'What',
      kind: 'concept',
      summary: 'What',
      items: [],
      sourceQuotes: ['What'],
      importanceScore: 100,
      confidence: 1,
    },
    {
      id: 'weak-organization',
      title: 'organization',
      kind: 'concept',
      summary: 'organization',
      items: [],
      sourceQuotes: ['organization'],
      importanceScore: 99,
      confidence: 1,
    },
    {
      id: 'weak-reconstructed',
      title: 'Reconstructed lists',
      kind: 'list',
      summary: 'Clean source summary fragments',
      items: ['source summary'],
      sourceQuotes: ['Reconstructed lists: Clean source summary fragments'],
      importanceScore: 98,
      confidence: 1,
    },
  )

  const content = buildDeepLearnContentFromSourceMap(sourceMap, 'Intro to IT Security')

  assert.ok(content)
  const serialized = JSON.stringify(content)
  assert.doesNotMatch(serialized, /"cue":"What"|"cue":"organization"|Reconstructed lists|Clean source summary fragments/)
  assert.match(serialized, /Cybersecurity/i)
  assert.match(serialized, /CIA Triad/i)
  assert.match(serialized, /Vulnerability \/ Exploit \/ Breach/i)
  assert.equal(validateDeepLearnContentReadyForSave(content).ok, true)
})

test('Source Map compact reviewer rejects garbage-only concepts', () => {
  const sourceMap = {
    version: 'academic-source-map-v1' as const,
    normalizedText: 'Readable looking classroom text with weak labels only and no usable academic concepts.',
    units: [
      {
        id: 'weak-what',
        title: 'What',
        kind: 'concept' as const,
        summary: 'What',
        items: [],
        sourceQuotes: ['What'],
        importanceScore: 100,
        confidence: 1,
      },
      {
        id: 'weak-activity',
        title: 'activity',
        kind: 'concept' as const,
        summary: 'activity',
        items: [],
        sourceQuotes: ['activity'],
        importanceScore: 99,
        confidence: 1,
      },
    ],
    chunks: [],
    duplicateFragmentsRemoved: 0,
    validation: { ok: true as const, reason: 'ok' as const, unitCount: 2, quoteCount: 2 },
  }

  const content = buildDeepLearnContentFromSourceMap(sourceMap, 'Noise PDF')

  assert.equal(content, null)
})

test('deterministic reviewer fallback creates minimum study artifacts without internal labels', () => {
  const structuredSource = structureAcademicSourceText(IT_SECURITY_SAMPLE_SOURCE)
  const content = buildDeterministicReviewerFallback(structuredSource, 'Intro to IT Security', {
    sections: [
      { heading: 'Source Summary', body: 'Reconstructed lists: weak model text.' },
    ],
  })

  assert.ok(content.answerBank.length > 0)
  assert.ok(content.identificationItems.length > 0)
  assert.ok(content.likelyQuizTargets.length > 0)
  assert.equal(validateDeepLearnContentReadyForSave(content).ok, true)
  assert.doesNotMatch(JSON.stringify(content), /Reconstructed lists|Clean source summary fragments|Normalized headings|Detected concepts/)
})

test('deterministic reviewer fallback does not make garbage source text saveable', () => {
  const structuredSource = structureAcademicSourceText([
    'File title: 550e8400-e29b-41d4-a716-446655440000.pdf',
    'UUID: 550e8400-e29b-41d4-a716-446655440000',
    'Extraction quality: metadata_only',
  ].join('\n'))
  const content = buildDeterministicReviewerFallback(structuredSource, 'Noise PDF')

  const validation = validateDeepLearnContentReadyForSave(content)

  assert.equal(validation.ok, false)
  assert.equal(validation.message, DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE)
})

test('outline exam reviewer fallback builds useful questions from bullet-heavy IT Security notes', () => {
  const content = buildExamReviewerFromOutline(BULLET_HEAVY_IT_SECURITY_SOURCE, 'IT Security Outline')

  assert.ok(content)
  assert.equal(validateDeepLearnContentReadyForSave(content).ok, true)
  assert.ok(content.sections.some((section) => section.heading === 'Key Terms' && /Confidentiality|Malware|Phishing/i.test(section.body)))
  assert.ok(content.sections.some((section) => section.heading === 'Identification Questions' && /Answer:/i.test(section.body)))
  assert.ok(content.sections.some((section) => section.heading === 'Multiple Choice Questions' && /Which statement matches/i.test(section.body)))
  assert.ok(content.sections.some((section) => section.heading === 'True/False Questions' && /True or False/i.test(section.body)))
  assert.ok(content.sections.some((section) => section.heading === 'Quick Review Notes' && /CIA triad|malware|attacks/i.test(section.body)))
  assert.ok(content.answerBank.length >= 6)
  assert.ok(content.identificationItems.length >= 6)
  assert.ok(content.likelyQuizTargets.some((item) => /Multiple choice/i.test(item.target)))
  assert.ok(content.likelyQuizTargets.some((item) => /True or false/i.test(item.target)))
  assert.doesNotMatch(JSON.stringify(content), /metadata|uuid|debug|file title|quality note|unable to transcribe/i)
})

test('Deep Learn generation repairs sparse structured output with outline exam reviewer', async () => {
  const resource = createLearnResource({
    title: 'Arnis Outline.pdf',
    type: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    normalizedSourceType: 'pdf',
    extractedText: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE,
    extractedTextPreview: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE.slice(0, 420),
    extractedCharCount: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE.length,
    extractionStatus: 'completed',
    quality: 'usable',
    groundingLevel: 'strong',
    previewState: 'full_text_available',
    fullTextAvailable: true,
    storedTextLength: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE.length,
    storedPreviewLength: 420,
    storedWordCount: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE.split(/\s+/).length,
  })
  const storedResource = createStoredResource({
    title: 'Arnis Outline.pdf',
    resourceType: 'File',
    contentType: 'application/pdf',
    extension: 'pdf',
    extractedText: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE,
    extractedTextPreview: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE.slice(0, 420),
    extractedCharCount: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE.length,
    extractionStatus: 'completed',
  })
  const result = await generateDeepLearnStructuredContentWithLegacyComposer(
    {
      ...createContext(resource, storedResource),
      promptGrounding: buildAcademicStructuredGrounding(SPARSE_RELATION_ARNIS_OUTLINE_SOURCE),
      sourceGrounding: {
        sourceType: 'PDF',
        extractionQuality: 'usable',
        sourceTextQuality: 'meaningful',
        groundingStrategy: 'stored_extract',
        usedAiFallback: false,
        qualityReason: null,
        warning: null,
        charCount: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE.length,
        sourceMap: null,
      },
      generationMode: 'text' as const,
    },
    {
      generationMode: 'text',
      promptGrounding: buildAcademicStructuredGrounding(SPARSE_RELATION_ARNIS_OUTLINE_SOURCE),
      sourceGrounding: {
        sourceType: 'PDF',
        extractionQuality: 'usable',
        sourceTextQuality: 'meaningful',
        groundingStrategy: 'stored_extract',
        usedAiFallback: false,
        qualityReason: null,
        warning: null,
        charCount: SPARSE_RELATION_ARNIS_OUTLINE_SOURCE.length,
        sourceMap: null,
      },
      refreshedResource: null,
      scanFallbackInput: null,
    },
    async ({ schemaName }) => {
      if (schemaName === 'deep_learn_high_yield_stage') {
        return jsonResponse({
          title: 'Arnis Outline',
          overview: 'The source has Arnis outline notes.',
          sections: [{ heading: 'Source Summary', body: 'The source has Arnis outline notes.' }],
        })
      }
      if (schemaName === 'deep_learn_identification_stage') return jsonResponse({ sections: [], identificationItems: [] })
      if (schemaName === 'deep_learn_quick_answers_stage') return jsonResponse({ sections: [], answerBank: [] })
      return jsonResponse({ sections: [], distinctions: [], likelyQuizTargets: [], cautionNotes: [] })
    },
  )

  assert.equal(result.compactFallbackUsed, false)
  assert.equal(validateDeepLearnContentReadyForSave(result.content).ok, true)
  assert.ok(result.content.sections.some((section) => section.heading === 'Multiple Choice Questions'))
  assert.ok(result.content.sections.some((section) => section.heading === 'True/False Questions'))
  assert.match(JSON.stringify(result.content), /RA 9850|Doce Pares|baston|classification/i)
  assert.doesNotMatch(JSON.stringify(result.content), /metadata|uuid|debug|file title|quality note|unable to transcribe/i)
})

test('Deep Learn invalid JSON fails cleanly without fallback retry loop', async () => {
  let calls = 0
  await assert.rejects(
    () => generateDeepLearnStructuredContentWithLegacyComposer(
      createPromptInput(),
      createPreparedGrounding(),
      async () => {
        calls += 1
        return {
          status: 'completed',
          output_text: '{not valid json',
          incomplete_details: null,
        }
      },
    ),
    /High-Yield First returned malformed structured output/,
  )

  assert.equal(calls, 1)
})

test('Deep Learn empty provider response fails cleanly without fallback retry loop', async () => {
  let calls = 0
  await assert.rejects(
    () => generateDeepLearnStructuredContentWithLegacyComposer(
      createPromptInput(),
      createPreparedGrounding(),
      async () => {
        calls += 1
        return {
          status: 'completed',
          output_text: '',
          incomplete_details: null,
        }
      },
    ),
    /High-Yield First returned no structured output/,
  )

  assert.equal(calls, 1)
})

test('Deep Learn provider errors fail cleanly without compact or micro retry loop', async () => {
  let calls = 0
  await assert.rejects(
    () => generateDeepLearnStructuredContentWithLegacyComposer(
      createPromptInput(),
      createPreparedGrounding(),
      async () => {
        calls += 1
        throw new Error('provider overloaded')
      },
    ),
    /High-Yield First failed during Deep Learn generation: provider overloaded/,
  )

  assert.equal(calls, 1)
})

test('Deep Learn generated-content validation error is student-facing', () => {
  const error = new DeepLearnGeneratedContentValidationError()

  assert.equal(error.message, DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE)
  assert.doesNotMatch(error.message, /JSON|max_output_tokens|provider|schema/i)
})

test('Deep Learn long source grounding keeps representative chunks instead of one front-only slice', async () => {
  const beginning = Array.from({ length: 80 }, () => 'Beginning concept explains readiness, warm up, and safety cues for the activity.').join(' ')
  const middle = Array.from({ length: 80 }, () => 'Middle concept explains target heart rate, perceived exertion, and pacing.').join(' ')
  const ending = Array.from({ length: 80 }, () => 'Ending concept explains cool down, reflection, recovery, and habit planning.').join(' ')
  const longText = [beginning, middle, ending].join('\n\n')
  const resource = createLearnResource({
    extractedText: longText,
    extractedTextPreview: beginning.slice(0, 200),
    extractedCharCount: longText.length,
    extractionStatus: 'completed',
  })
  const storedResource = createStoredResource({
    extractedText: longText,
    extractedTextPreview: beginning.slice(0, 200),
    extractedCharCount: longText.length,
    extractionStatus: 'completed',
  })

  const grounding = await buildDeepLearnGroundingWithDependencies(createContext(resource, storedResource))

  assert.match(grounding.promptGrounding, /Deterministic academic structure/i)
  assert.match(grounding.promptGrounding, /Middle concept explains target heart rate/)
  assert.match(grounding.promptGrounding, /Ending concept explains cool down/)
  assert.ok(grounding.promptGrounding.length <= 12000)
})

test('deterministic academic structuring normalizes raw OCR headings and reconstructs lists', () => {
  const structured = structureAcademicSourceText([
    'What is Cybersecurity all about?',
    'Cybersecurity is the practice of protecting systems, networks, and data from digital attacks.',
    'Password Cracking Brute-force Network Sniffing Social Engineering',
    'CIA includes Confidentiality, Integrity, and Availability.',
  ].join('\n'))

  assert.ok(structured.headings.includes('What is Cybersecurity?'))
  assert.ok(structured.headingConfidence.some((entry) => entry.heading === 'Password Cracking Methods' && entry.confidence >= 0.9))
  assert.ok(structured.lists.some((list) =>
    list.heading === 'Password Cracking Methods'
    && list.items.includes('Brute-force')
    && list.items.includes('Network Sniffing')
    && list.items.includes('Social Engineering')
  ))
  assert.ok(structured.lists.some((list) =>
    list.heading === 'CIA Triad'
    && list.items.includes('Confidentiality')
    && list.items.includes('Integrity')
    && list.items.includes('Availability')
  ))
})

test('deterministic academic structuring collapses duplicate headings and extracts term definitions', () => {
  const structured = structureAcademicSourceText([
    'Core Principles',
    'Core Principles',
    'Vulnerability is a weakness or flaw in hardware, software, or procedures that can be exploited.',
    'Threat refers to a possible danger that can exploit a vulnerability.',
    'Vulnerability is a weakness or flaw in hardware, software, or procedures that can be exploited.',
  ].join('\n'))

  assert.equal(structured.headings.filter((heading) => heading === 'Core Principles').length, 1)
  assert.ok(structured.duplicateFragmentsRemoved >= 2)
  assert.ok(structured.termDefinitions.some((item) =>
    item.term === 'Vulnerability'
    && /weakness or flaw/i.test(item.definition)
  ))
  assert.ok(structured.termDefinitions.some((item) =>
    item.term === 'Threat'
    && /possible danger/i.test(item.definition)
  ))
})

test('buildAcademicStructuredGrounding keeps compact structured units and exact source excerpts', () => {
  const grounding = buildAcademicStructuredGrounding([
    'What is Cybersecurity all about?',
    'Cybersecurity is the practice of protecting systems, networks, and data from digital attacks.',
    'Password Cracking Brute-force Network Sniffing Social Engineering',
  ].join('\n'), 1800)

  assert.match(grounding, /Deterministic academic structure/i)
  assert.match(grounding, /What is Cybersecurity\?/)
  assert.match(grounding, /Password Cracking Methods: Brute-force, Network Sniffing, Social Engineering/)
  assert.match(grounding, /Closest source passages/i)
  assert.match(grounding, /Cybersecurity is the practice/i)
  assert.ok(grounding.length <= 1800)
})

test('Academic Source Map extracts IT Security academic units with source quotes', () => {
  const sourceMap = buildAcademicSourceMap(IT_SECURITY_SAMPLE_SOURCE)
  const titles = sourceMap.units.map((unit) => unit.title)

  assert.equal(sourceMap.validation.ok, true)
  for (const expected of [
    'IT Security definition',
    'InfoSec vs IT Sec',
    'CIA Triad',
    'Domains of IT Security',
    'Cybersecurity definitions',
    'Cybersecurity approach layers',
    'People / Process / Technology',
    'Unified Threat Management',
    'Importance of cybersecurity',
    'Challenges',
    'Impact of a Security Breach',
    'Types of attackers',
    'Vulnerability / Exploit / Breach',
    'Cybercrime / Disruption / Espionage',
    'Malware types',
    'Malware symptoms',
    'Infiltration methods',
    'Denial of service methods',
    'Blended attacks',
    'Impact reduction',
  ]) {
    assert.ok(titles.includes(expected), `missing ${expected}`)
  }

  const cia = sourceMap.units.find((unit) => unit.title === 'CIA Triad')
  assert.ok(cia)
  assert.equal(cia.kind, 'concept')
  assert.ok(cia.items.includes('Confidentiality'))
  assert.ok(cia.items.includes('Integrity'))
  assert.ok(cia.items.includes('Availability'))
  assert.ok(cia.importanceScore >= 90)
  assert.match(cia.sourceQuotes[0] ?? '', /Goal of IT Security/i)

  const terms = sourceMap.units.find((unit) => unit.title === 'Vulnerability / Exploit / Breach')
  assert.ok(terms)
  assert.match(terms.sourceQuotes[0] ?? '', /Vulnerability/i)
  assert.match(terms.sourceQuotes[0] ?? '', /Exploit/i)
  assert.match(terms.sourceQuotes[0] ?? '', /Breach/i)
})

test('Academic Source Map builds exam banks and rejects thin academic content', () => {
  const sourceMap = buildAcademicSourceMap(IT_SECURITY_SAMPLE_SOURCE)
  const weak = buildAcademicSourceMap('What is IT Security â€¢ A set of cyber security strategies that prevent unauthorized access.')
  const banks = sourceMap.banks

  assert.ok(banks)
  assert.ok((banks?.definitionBank.length ?? 0) >= 3)
  assert.ok((banks?.classificationBank.length ?? 0) >= 5)
  assert.ok((banks?.procedureBank.length ?? 0) >= 3)
  assert.ok((banks?.relationshipBank.length ?? 0) >= 5)
  assert.ok((banks?.likelyQuestionBank.length ?? 0) >= 12)
  assert.doesNotMatch(JSON.stringify(sourceMap.units.map((unit) => unit.title)), /Source Notes|Insiders Employees And Ex|Understand The|Communicate The Issue|Overwhelm Quantity|^\?\?\?/i)

  assert.equal(weak.validation.ok, false)
  assert.equal(weak.validation.reason, 'insufficient_academic_content')
})

test('Academic Source Map detects adaptive styles without regressing IT Security taxonomy', () => {
  const itSecurity = buildAcademicSourceMap(IT_SECURITY_SAMPLE_SOURCE)
  const arnis = buildAcademicSourceMap(PATHFIT_ARNIS_SAMPLE_SOURCE)

  assert.equal(itSecurity.sourceStyle, 'technical')
  assert.equal(itSecurity.disciplineCluster, 'computer-it-data-software')
  assert.ok(itSecurity.secondaryStyles?.includes('taxonomy-heavy'))
  assert.ok(itSecurity.units.some((unit) => unit.title === 'Domains of IT Security' && unit.unitType === 'classification' && unit.learningShape === 'classification'))
  assert.ok(itSecurity.units.some((unit) => unit.title === 'Malware types' && unit.items.includes('MiTM') && unit.learningShape === 'classification'))

  assert.equal(arnis.sourceStyle, 'procedural')
  assert.equal(arnis.disciplineCluster, 'physical-education-sports-performing-movement')
  assert.ok(arnis.secondaryStyles?.includes('classification-heavy'))
  assert.ok(arnis.secondaryStyles?.includes('timeline-heavy'))
  assert.ok(arnis.units.some((unit) => unit.title === 'Courtesy / Salutation' && unit.unitType === 'procedure' && unit.learningShape === 'procedure'))
  assert.ok(arnis.units.some((unit) => unit.title === 'Organizations / Timeline' && unit.unitType === 'timeline' && unit.learningShape === 'timeline'))
  assert.ok(arnis.units.some((unit) => unit.title === 'Equipment / Weapons' && unit.unitType === 'equipment' && unit.learningShape === 'equipment'))
  assert.ok(arnis.units.some((unit) => unit.title === 'Regional Systems' && unit.learningShape === 'classification'))
  assert.ok(arnis.units.some((unit) => unit.title === 'Main Groups' && unit.learningShape === 'classification'))
  assert.ok(arnis.units.some((unit) => unit.title === 'Stick Types' && unit.items.some((item) => /24 to 28 inches/.test(item))))
})

test('Academic Source Map preserves Arnis timeline and classification banks for fixture QA', () => {
  const arnis = buildAcademicSourceMap(PATHFIT_ARNIS_SAMPLE_SOURCE)
  const renderedBanks = JSON.stringify(arnis.banks)

  assert.equal(arnis.validation.ok, true)
  assert.ok((arnis.banks?.timelineBank.length ?? 0) >= 1)
  assert.ok((arnis.banks?.classificationBank.length ?? 0) >= 4)
  assert.ok((arnis.banks?.procedureBank.length ?? 0) >= 1)
  assert.match(renderedBanks, /NARAPHIL|WEKAF|i-ARNIS|Doce Pares/)
  assert.match(renderedBanks, /Regional Classifications|Regional Systems|Main Groups|Evolution \/ Classifications|Strike Types/)
  assert.match(renderedBanks, /Baston|Daga|Bangkaw/)
  assert.doesNotMatch(renderedBanks, /Source Notes|metadata|debug|\?\?\?\?/i)
})

test('Academic Source Map discipline clusters are broad hints while learning shapes stay primary', () => {
  const cases = [
    ['The nursing care plan records patient assessment, vital signs, diagnosis, intervention, and evaluation.', 'health-nursing-allied-health-medicine'],
    ['The case rule asks whether the court has jurisdiction and whether the statute creates liability for the offense.', 'law-criminal-justice-criminology-public-safety'],
    ['The financial statements classify assets, liabilities, revenue, cost, and management strategy.', 'business-accountancy-management-economics'],
    ['The lesson plan aligns curriculum objectives, classroom instruction, assessment, and learner outcomes.', 'education-pedagogy'],
    ['The poem passage develops a theme through imagery, rhetoric, culture, and communication choices.', 'arts-humanities-communication'],
    ['The geology lab uses an experiment, measurements, and an equation to analyze environmental science data.', 'natural-sciences-mathematics-geology-environmental-science'],
    ['The hotel front office handles guest reservations, housekeeping coordination, tourism destinations, and food service.', 'hospitality-tourism'],
    ['The ethics reading compares moral philosophy, theology, doctrine, virtue, and arguments about faith.', 'religion-theology-philosophy-ethics'],
    ['The structural engineering design uses building code standards, construction materials, and architecture constraints.', 'engineering-architecture-built-environment'],
  ] as const

  for (const [source, expected] of cases) {
    const profile = detectAcademicDisciplineClusters(source)
    assert.equal(profile.disciplineCluster, expected, source)
  }

  const mixed = buildAcademicSourceMap([
    'What is Cybersecurity? Cybersecurity protects systems and data.',
    'Troubleshooting Process 1. Identify the error 2. Isolate the component 3. Test the system 4. Document the fix.',
  ].join('\n'))

  assert.equal(mixed.disciplineCluster, 'computer-it-data-software')
  assert.ok(mixed.units.some((unit) => ['definition', 'troubleshooting', 'component-system', 'procedure'].includes(unit.learningShape ?? '')))
})

test('Academic Source Map extracts universal evidence relations without known headings', () => {
  const sourceMap = buildAcademicSourceMap([
    'Assets include cash, accounts receivable, inventory, and equipment.',
    '2018 - The standard was adopted by the board.',
    'Area Formula Area equals length times width.',
    'The court applies the statute when jurisdiction and evidence establish the offense.',
    'Nursing care includes assessment, intervention, and evaluation.',
    'Microscope - optical instrument used to magnify small specimens.',
  ].join('\n'))
  const relationTypes = new Set(sourceMap.relations?.map((relation) => relation.relationType))

  assert.equal(sourceMap.validation.ok, true)
  for (const expected of ['list_membership', 'timeline_milestone', 'formula_variable', 'rule_element', 'symptom_intervention', 'equipment_property']) {
    assert.ok(relationTypes.has(expected as never), `missing relation ${expected}`)
  }
  assert.ok(sourceMap.relations?.every((relation) => relation.sourceEvidence && relation.sourceUnitId && relation.answerText))
})

test('Source Map relation fallback saves useful limited content and rejects sparse source', () => {
  const generic = buildAcademicSourceMap([
    'Contract acceptance is an objective manifestation of assent to the offer terms.',
    'Remedies include damages, specific performance, and rescission.',
    '2020 - The revised civil code rules were adopted by the committee.',
    'Court procedure 1. File complaint 2. Serve summons 3. Present evidence 4. Await judgment.',
  ].join('\n'))
  const content = buildDeepLearnContentFromSourceMap(generic, 'Contract Law')

  assert.equal(generic.validation.ok, true)
  assert.ok(content)
  assert.equal(validateDeepLearnContentReadyForSave(content).ok, true)
  assert.match(JSON.stringify(content), /acceptance|Remedies|Court procedure/i)

  const sparse = buildAcademicSourceMap('Contract law is a body of rules.')
  assert.equal(sparse.validation.ok, false)
  assert.equal(buildDeepLearnContentFromSourceMap(sparse, 'Sparse Law'), null)
})

test('Source Map compact reviewer preserves PATHFit procedural units for save validation', () => {
  const sourceMap = buildAcademicSourceMap(PATHFIT_ARNIS_SAMPLE_SOURCE)
  const content = buildDeepLearnContentFromSourceMap(sourceMap, 'PATHFit Arnis')

  assert.ok(content)
  assert.equal(validateDeepLearnContentReadyForSave(content).ok, true)
  assert.ok(content.answerBank.some((item) => item.cue === 'Courtesy / Salutation' && /Attention stance|Return to ready stance/.test(item.answer.examSafe)))
  assert.ok(content.likelyQuizTargets.some((item) => item.target === 'Arrange the Arnis organizations and milestones chronologically.'))
  assert.ok(content.likelyQuizTargets.some((item) => item.target === 'Identify Arnis weapons and equipment.'))
  assert.doesNotMatch(JSON.stringify(content), /What is Historical Concept\?/i)
})

test('Academic Source Map grounding is bounded and preserves exact source quotes', () => {
  const grounding = buildAcademicSourceMapGrounding(IT_SECURITY_SAMPLE_SOURCE, 2600)

  assert.match(grounding, /Academic Source Map/i)
  assert.match(grounding, /CIA Triad/)
  assert.match(grounding, /Source quote: "Goal of IT Security/i)
  assert.match(grounding, /Closest source passages for exact wording/i)
  assert.ok(grounding.length <= 2600)
})

test('Deep Learn save validator rejects malformed headings before save', () => {
  const malformed = normalizeDeepLearnGeneratedContent({
    title: 'IT Security',
    overview: 'The source explains information security basics.',
    sections: [
      { heading: 'Cyber Security What', body: 'CIA includes confidentiality, integrity, and availability.' },
    ],
    answerBank: [answerBankItem(1)],
    identificationItems: [identificationItem(1)],
    likelyQuizTargets: [quizTargetItem(1)],
    cautionNotes: [],
  }, 'IT Security')

  const validation = validateDeepLearnContentReadyForSave(malformed)

  assert.equal(validation.ok, false)
})

test('Deep Learn save validator rejects leaked internal pipeline labels before save', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'IT Security',
    overview: 'The source explains information security basics.',
    sections: [
      { heading: 'Source Summary', body: 'CIA includes confidentiality, integrity, and availability.' },
    ],
    answerBank: [answerBankItem(1)],
    identificationItems: [identificationItem(1)],
    likelyQuizTargets: [quizTargetItem(1)],
    cautionNotes: [],
  }, 'IT Security')
  content.sections[0] = { heading: 'Source Summary', body: 'Reconstructed lists: CIA Triad.' }

  const validation = validateDeepLearnContentReadyForSave(content)

  assert.equal(validation.ok, false)
})

test('Deep Learn save validator rejects source-map bank prompts in identification items', () => {
  const leakedPrompts = [
    'Recall the exam meaning of Secure SDLC.',
    'Explain the source relationship.',
    'Explain the cause-effect relationship.',
    'Use the source formula.',
    'Classify the items under Development Phases.',
    'Explain the relationship inside Security Testing.',
    'Define Threat Modeling.',
  ]
  const content = normalizeDeepLearnGeneratedContent({
    title: 'SDLC',
    overview: 'The source explains secure software development lifecycle concepts.',
    sections: [
      {
        heading: 'Source Summary',
        body: 'The source explains secure software development lifecycle concepts, testing, threat modeling, and release controls for exam review.',
      },
      {
        heading: 'High-Yield First',
        body: 'Secure software development lifecycle review should focus on requirements, design, testing, deployment, and maintenance controls.',
      },
    ],
    answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3)],
    identificationItems: leakedPrompts.map((prompt, index) => ({
      ...identificationItem(index + 1),
      prompt,
      answer: {
        exact: `Source-map bank answer ${index + 1}`,
        examSafe: `Source-map bank answer ${index + 1}`,
        simplified: null,
      },
    })),
    likelyQuizTargets: [quizTargetItem(1), quizTargetItem(2), quizTargetItem(3)],
    cautionNotes: [],
  }, 'SDLC')

  const validation = validateDeepLearnContentReadyForSave(content)

  assert.equal(validation.ok, false)
  assert.equal(validation.reason, 'source_map_identification_leakage')
  assert.equal(validation.counts.identificationCount, 0)
})

test('Deep Learn save validator ignores internal fallback wording in caution notes', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'Academic Module',
    overview: 'The source explains academic concepts and procedures.',
    sections: [
      { heading: 'Source Summary', body: 'The source explains academic concepts and procedures for review.' },
      { heading: 'High-Yield First', body: 'Focus on definitions, steps, and checks from the source.' },
      { heading: 'Identification Review', body: 'Practice direct source prompts for key terms and procedures.' },
    ],
    answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3)],
    identificationItems: [identificationItem(1), identificationItem(2), identificationItem(3), identificationItem(4), identificationItem(5)],
    likelyQuizTargets: [quizTargetItem(1), quizTargetItem(2), quizTargetItem(3)],
    cautionNotes: [
      'Generated as compact reviewer because the source was long.',
      'Quick answers were too large to generate from fallback.',
    ],
  }, 'Academic Module')

  const validation = validateDeepLearnContentReadyForSave(content)

  assert.equal(validation.ok, true)
  assert.equal(validation.reason, null)
  assert.equal(validation.composerLeakageDiagnostics.cautionNotesIgnored, true)
})

test('Deep Learn save validator fails high-yield-only partial artifacts as insufficient structured artifacts', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'Movement Skills',
    overview: 'The source explains movement skills and learning checks.',
    sections: [
      { heading: 'Source Summary', body: 'The source explains movement skills, practice procedures, and safety checks.' },
      { heading: 'High-Yield First', body: 'Focus on procedures, terms, and safe execution from the source.' },
    ],
    answerBank: [],
    identificationItems: [],
    likelyQuizTargets: [],
    cautionNotes: [
      DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE,
      'Generated from fallback because the source was long.',
    ],
  }, 'Movement Skills')

  const validation = validateDeepLearnContentReadyForSave(content)

  assert.equal(validation.ok, false)
  assert.equal(validation.reason, 'insufficient_structured_artifacts')
  assert.notEqual(validation.reason, 'composer_leakage')
  assert.equal(validation.composerLeakageDiagnostics.cautionNotesIgnored, true)
})

test('Deep Learn save validator keeps legitimate Define identification items with real answers', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'Systems Notes',
    overview: 'The source explains system development lifecycle concepts.',
    sections: [
      { heading: 'Source Summary', body: 'The source explains system development lifecycle concepts and review checks.' },
      { heading: 'High-Yield First', body: 'Focus on definitions, phases, and evaluation checks.' },
    ],
    answerBank: [answerBankItem(1), answerBankItem(2), answerBankItem(3)],
    identificationItems: [
      {
        ...identificationItem(1),
        prompt: 'Define system development life cycle',
        answer: {
          exact: 'The system development life cycle is the organized process used to plan, build, test, deploy, and maintain a system.',
          examSafe: 'The system development life cycle is an organized process for planning, building, testing, deploying, and maintaining a system.',
          simplified: 'It is the step-by-step process for creating and maintaining a system.',
        },
      },
      identificationItem(2),
      identificationItem(3),
    ],
    likelyQuizTargets: [quizTargetItem(1), quizTargetItem(2), quizTargetItem(3)],
    cautionNotes: [],
  }, 'Systems Notes')

  const validation = validateDeepLearnContentReadyForSave(content)

  assert.equal(validation.ok, true)
  assert.equal(validation.counts.identificationCount, 3)
})

test('normalizeDeepLearnGeneratedContent strips internal pipeline wording from saved artifacts', () => {
  const content = normalizeDeepLearnGeneratedContent({
    title: 'IT Security',
    overview: 'Clean source summary fragments: The source explains layered defense.',
    sections: [
      { heading: 'Source Summary', body: 'Detected concepts: layered defense protects systems.' },
    ],
    answerBank: [answerBankItem(1)],
    identificationItems: [identificationItem(1)],
    likelyQuizTargets: [quizTargetItem(1)],
    cautionNotes: ['Normalized headings: review cleaned terms.'],
  }, 'IT Security')

  assert.doesNotMatch(JSON.stringify(content), /Clean source summary fragments|Detected concepts|Normalized headings/)
})

test('normalizeDeepLearnGeneratedContent enforces compact Study Pack output limits', () => {
  const generated = normalizeDeepLearnGeneratedContent({
    title: 'IT Security',
    overview: 'Information security overview.',
    sections: Array.from({ length: 8 }, (_, index) => ({
      heading: index === 0 ? 'Source Summary' : `Section ${index + 1}`,
      body: `Grounded body ${index + 1}.`,
    })),
    answerBank: Array.from({ length: 20 }, (_, index) => answerBankItem(index)),
    identificationItems: Array.from({ length: 20 }, (_, index) => identificationItem(index)),
    distinctions: Array.from({ length: 10 }, (_, index) => distinctionItem(index)),
    likelyQuizTargets: Array.from({ length: 10 }, (_, index) => quizTargetItem(index)),
    cautionNotes: [],
  }, 'IT Security') satisfies DeepLearnGeneratedContent

  assert.equal(generated.sections.length, 6)
  assert.equal(generated.sections[0]?.heading, 'Source Summary')
  assert.equal(generated.answerBank.length, 20)
  assert.equal(generated.identificationItems.length, 20)
  assert.equal(generated.distinctions.length, 6)
  assert.equal(generated.likelyQuizTargets.length, 10)
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

test('Deep Learn refinement refuses empty selected source text', () => {
  const result = selectDeepLearnRefinementGrounding({
    resource: createLearnResource({
      extractedText: null,
      extractedTextPreview: null,
      extractedCharCount: 0,
      whyItMatters: 'Stale module context should not be used.',
      linkedContext: 'Unrelated task context should not be used.',
    }),
    storedResource: createStoredResource({
      extractedText: null,
      extractedTextPreview: null,
      extractedCharCount: 0,
    }),
    canonicalResourceId: 'stored-resource-1',
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.message, DEEP_LEARN_REFINEMENT_BAD_SOURCE_MESSAGE)
  }
})

test('Deep Learn refinement refuses metadata refusal and debug text', () => {
  const text = [
    "I'm unable to transcribe text from images or scanned documents at this time.",
    'Document Title: 1.1-Data Organization.pdf',
    'Resource ID: 550e8400-e29b-41d4-a716-446655440000',
    'Extraction Quality: too short',
    'Grounding strategy used',
  ].join('\n')

  const result = selectDeepLearnRefinementGrounding({
    resource: createLearnResource({
      title: '1.1-Data Organization.pdf',
      extractedText: text,
      extractedTextPreview: text,
      extractedCharCount: text.length,
      extractionStatus: 'completed',
    }),
    storedResource: createStoredResource({
      title: '1.1-Data Organization.pdf',
      extractedText: text,
      extractedTextPreview: text,
      extractedCharCount: text.length,
      extractionStatus: 'completed',
    }),
    canonicalResourceId: 'stored-resource-1',
  })

  assert.equal(result.ok, false)
})

test('Deep Learn refinement accepts meaningful selected academic source text', () => {
  const text = buildLongText('Data organization explains OLTP, Online Transaction Processing, ODS, Operational Data Store, fields, records, and warehouse characteristics.')
  const result = selectDeepLearnRefinementGrounding({
    resource: createLearnResource({
      title: '1.1-Data Organization.pdf',
      extractedText: text,
      extractedTextPreview: text.slice(0, 420),
      extractedCharCount: text.length,
      extractionStatus: 'completed',
      whyItMatters: 'ERP SAP Learning Hub Gym Badge stale assignment context.',
      linkedContext: 'Unrelated module/course context.',
    }),
    storedResource: createStoredResource({
      title: '1.1-Data Organization.pdf',
      extractedText: text,
      extractedTextPreview: text.slice(0, 420),
      extractedCharCount: text.length,
      extractionStatus: 'completed',
    }),
    canonicalResourceId: 'stored-resource-1',
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.match(result.sourceText, /Data organization explains OLTP/i)
    assert.doesNotMatch(result.sourceText, /ERP|SAP Learning Hub|Gym Badge|Unrelated module/i)
  }
})

test('Deep Learn refinement model follows configured fallback order', () => {
  assert.equal(getDeepLearnRefinementModel({
    OPENAI_DEEP_LEARN_MODEL: '  gpt-5.1  ',
    OPENAI_MODEL: 'gpt-4o',
  } as unknown as NodeJS.ProcessEnv), 'gpt-5.1')
  assert.equal(getDeepLearnRefinementModel({
    OPENAI_MODEL: '  gpt-5-mini-custom  ',
  } as unknown as NodeJS.ProcessEnv), 'gpt-5-mini-custom')
  assert.equal(getDeepLearnRefinementModel({} as NodeJS.ProcessEnv), 'gpt-5-mini')
})

test('Deep Learn refinement action does not use hard-coded gpt-4o or empty source fallback', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile('actions/deep-learn.ts', 'utf8'))

  assert.doesNotMatch(source, /model:\s*['"`]gpt-4o['"`]/)
  assert.match(source, /resolveLearnResourceSelection/)
  assert.match(source, /selectDeepLearnRefinementGrounding/)
  assert.match(source, /Selected resource source text/)
  assert.doesNotMatch(source, /Source context:[\s\S]*extractedTextPreview \?\? ''/)
})

test('Deep Learn diagnostics select meaningful extracted_text over empty visual text', async () => {
  const extractedText = [
    'Data organization explains how facts are arranged into fields, records, files, and databases for efficient retrieval.',
    'A database management system controls storage, access, integrity, security, and backup of shared academic data.',
    'Relational tables use rows and columns, while primary keys identify each record and foreign keys connect related tables.',
    'Normalization reduces redundancy by splitting repeated groups into related tables with clear dependencies.',
    'Indexes speed up lookup operations, but they require storage and maintenance during inserts and updates.',
    'Good data organization improves accuracy, consistency, reporting, and decision making in information systems.',
  ].join('\n')
  const resource = createLearnResource({
    title: 'Data Organization.pdf',
    extractionStatus: 'completed',
    extractedText,
    extractedTextPreview: extractedText.slice(0, 300),
    extractedCharCount: extractedText.length,
    visualExtractionStatus: 'completed',
    visualExtractedText: '',
  })
  const storedResource = createStoredResource({
    title: 'Data Organization.pdf',
    extractionStatus: 'completed',
    extractedText,
    extractedCharCount: extractedText.length,
    visualExtractionStatus: 'completed',
    visualExtractedText: '',
  })

  const diagnostics = buildDeepLearnSourceDiagnostics(createContext(resource, storedResource), {
    queuedJobId: 'job-1',
    canonicalSourceId: storedResource.id,
  })

  assert.equal(diagnostics.queuedJobId, 'job-1')
  assert.equal(diagnostics.canonicalSourceId, storedResource.id)
  assert.equal(diagnostics.sourceFieldUsed, 'extracted_text')
  assert.ok(diagnostics.contentHash)
  assert.match(diagnostics.previewStart ?? '', /Data organization explains/)
  assert.doesNotMatch(diagnostics.previewStart ?? '', /UUID|metadata|debug/i)

  const promptInput = {
    ...createContext(resource, storedResource),
    promptGrounding: extractedText,
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful' as const,
      groundingStrategy: 'stored_extract' as const,
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: extractedText.length,
      sourceMap: buildAcademicSourceMap(extractedText),
    },
    generationMode: 'text' as const,
  }
  const content = await generateDeepLearnStructuredContentWithLegacyComposer(promptInput, createPreparedGrounding(), async (request) => {
    if (request.schemaName.includes('high_yield')) return jsonResponse({ title: 'Data Organization', overview: 'Data organization supports reliable database use.', sections: [] })
    if (request.schemaName.includes('identification')) return jsonResponse({ sections: [], identificationItems: [] })
    if (request.schemaName.includes('quick_answers')) return jsonResponse({ sections: [], answerBank: [] })
    return jsonResponse({ sections: [], distinctions: [], likelyQuizTargets: [], cautionNotes: [] })
  })

  assert.equal(validateDeepLearnContentReadyForSave(content.content).ok, true)
})

function getReviewerSourceFixture(id: string) {
  const fixture = reviewerSourceFixtures.find((item) => item.id === id)
  assert.ok(fixture, `Missing reviewer source fixture: ${id}`)
  return fixture
}

async function captureConsoleInfo(callback: () => Promise<void>) {
  const originalInfo = console.info
  const logs: unknown[][] = []
  console.info = (...args: unknown[]) => {
    logs.push(args)
  }
  try {
    await callback()
  } finally {
    console.info = originalInfo
  }
  return logs
}

function textResponse(markdown: string) {
  return {
    status: 'completed',
    output_text: markdown,
    incomplete_details: null,
  }
}

function buildClassicReviewerMarkdown(
  fixture: ReviewerSourceFixture,
  options: { title?: string; extraSections?: string[] } = {},
) {
  const title = options.title ?? fixture.title
  const sections = [...fixture.expectedMajorSections, ...(options.extraSections ?? [])]
  const sourceLines = fixture.extractedText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 40)
  const sourceDetail = sourceLines.slice(0, 18).join(' ')
  const completeSections = sections.map((section, index) => {
    const detail = sourceLines[index % sourceLines.length] ?? sourceDetail
    return [
      `### ${section}`,
      `- Key points: ${detail}`,
      `- Definitions: ${section} should be reviewed with the wording and listed details from the lesson.`,
      `- Important lists/classifications: ${sourceDetail.slice(0, 360)}`,
      `- Exam notes / likely asked details: Be able to identify, define, enumerate, and distinguish ${section} from nearby source concepts.`,
    ].join('\n')
  }).join('\n\n')
  const identification = sections
    .concat(sourceLines.slice(0, 12))
    .slice(0, 36)
    .map((section, index) => `${index + 1}. ${section} - ${sourceLines[index % sourceLines.length] ?? section}`)
    .join('\n')
  const mcqs = Array.from({ length: 18 }, (_, index) => {
    const section = sections[index % sections.length] ?? fixture.title
    return `${index + 1}. Which source detail is most connected to ${section}?\nA. ${sourceLines[index % sourceLines.length] ?? section}\nB. A different source section\nC. A nearby but unsupported choice\nD. A broad distractor\nAnswer: A. Explanation: The answer is stated in the selected source.`
  }).join('\n\n')
  const lists = sections.slice(0, 18).map((section, index) => `${index + 1}. Enumerate the important details under ${section}.`).join('\n')
  const timeline = /timeline|date|organization|phase|1975|1989|2009|2010/i.test(`${fixture.extractedText} ${sections.join(' ')}`)
    ? sections.filter((section) => /phase|timeline|organization|R\.?A\.?|date|1975|1989|2009|2010/i.test(section)).map((section) => `- ${section}`).join('\n') || '- Review the source dates and events in order.'
    : 'No dates or events are emphasized in the source.'
  const compare = /vs|distinguish|vulnerability|exploit|breach|InfoSec|IT Sec|style|classification/i.test(`${fixture.extractedText} ${sections.join(' ')}`)
    ? '- Compare related or confusable source concepts using the source definitions and classifications.'
    : 'No major compare/distinguish pair is emphasized in the source.'

  return [
    `# Reviewer: ${title}`,
    '',
    '## High-Yield Overview',
    `- ${fixture.extractedText.slice(0, 900)}`,
    '',
    '## Complete Exam Reviewer',
    completeSections,
    '',
    '## Identification Reviewer',
    identification,
    '',
    '## Multiple Choice Practice',
    mcqs,
    '',
    '## Enumeration / List Questions',
    lists,
    '',
    '## Timeline / Dates',
    timeline,
    '',
    '## Compare / Distinguish',
    compare,
    '',
    '## Final Quick Review',
    sections.slice(0, 24).map((section) => `- ${section}`).join('\n'),
  ].join('\n')
}

test('Reviewer generation uses only the classic Markdown path and logs quality diagnostics', async () => {
  const fixture = getReviewerSourceFixture('multi-phase-systems-analysis')
  const logs = await captureConsoleInfo(async () => {
    const result = await withTemporaryEnv({
      DEEP_LEARN_REVIEWER_GENERATION_MODE: 'structured_fact_card_compiler',
      DEEP_LEARN_REVIEWER_ONE_PASS_MODEL: 'gpt-5.4-classic',
      DEEP_LEARN_REVIEWER_ONE_PASS_REPAIR_MODEL: 'gpt-5.5-classic-repair',
    }, () => generateDeepLearnStructuredContent(
      createStructuredPromptInput(fixture.extractedText, fixture.title),
      createStructuredPreparedGrounding(fixture.extractedText),
      async (request) => {
        assert.equal(request.schemaName, 'deep_learn_reviewer_classic_markdown')
        assert.equal(request.model, 'gpt-5.4-classic')
        assert.match(request.promptText, /Do not return JSON/i)
        assert.doesNotMatch(request.promptText, /factCard|answerBank|Generate exactly|coverage-first/i)
        return textResponse(buildClassicReviewerMarkdown(fixture))
      },
      { diagnosticsContext: { queuedJobId: 'job-classic', canonicalSourceId: 'resource-classic', retryOfJobId: null } },
    ))

    assert.ok(result.content.reviewerMarkdown)
    assert.equal(result.content.answerBank.length, 0)
    assert.equal(result.content.identificationItems.length, 0)
    assert.equal(result.compactFallbackUsed, false)
  })

  const routing = logs.map((entry) => entry[1]).find((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && (entry as Record<string, unknown>).event === 'classic_markdown_reviewer_started'))
  assert.equal(routing?.generatorVersion, 'classic_markdown_reviewer_v1')
  assert.equal(routing?.qualityMode, 'classic-markdown-reviewer')

  const summary = logs.map((entry) => entry[1]).find((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && (entry as Record<string, unknown>).structuredCompilerUsed === false))
  assert.equal(summary?.qualityMode, 'classic-markdown-reviewer')
  assert.equal(summary?.structuredCompilerUsed, false)
  assert.equal(typeof summary?.reviewerMarkdownLength, 'number')
  assert.equal(typeof summary?.sourceCharCount, 'number')
  assert.equal(summary?.sourceWasTruncated, false)
})

test('Reviewer classic markdown covers SDLC Phase 1 through Phase 7', async () => {
  const fixture = getReviewerSourceFixture('multi-phase-systems-analysis')
  const result = await generateDeepLearnStructuredContent(
    createStructuredPromptInput(fixture.extractedText, fixture.title),
    createStructuredPreparedGrounding(fixture.extractedText),
    async () => textResponse(buildClassicReviewerMarkdown(fixture)),
  )

  const markdown = result.content.reviewerMarkdown ?? ''
  for (const section of fixture.expectedMajorSections) {
    assert.match(markdown, new RegExp(escapeRegExp(section), 'i'))
  }
  assert.doesNotThrow(() => validateDeepLearnContentReadyForSave(result.content))
})

test('Reviewer classic markdown saves IT Security source around 5908 chars without structured fields', async () => {
  const source = IT_SECURITY_SAMPLE_SOURCE.repeat(Math.ceil(5908 / IT_SECURITY_SAMPLE_SOURCE.length)).slice(0, 5908)
  const fixture = {
    ...getReviewerSourceFixture('taxonomy-heavy-security'),
    extractedText: source,
    expectedMajorSections: [
      'IT Security',
      'InfoSec vs IT Sec',
      'CIA Triad',
      'Domains of IT Security',
      'Cybersecurity',
      'People / Process / Technology',
      'Unified Threat Management',
      'Importance of Cybersecurity',
      'Challenges of Cybersecurity',
      'Impact of a Security Breach',
      'Types of Attackers',
      'Vulnerability / Exploit / Breach',
      'Cybersecurity Threat Types',
      'Malware Types',
      'Malware Symptoms',
      'Methods of Infiltration',
      'Denial of Service Methods',
      'SEO Poisoning',
      'Blended Attacks',
      'Impact Reduction',
    ],
  }
  const result = await generateDeepLearnStructuredContent(
    createStructuredPromptInput(source, 'Intro-To-IT-Security.pdf'),
    createStructuredPreparedGrounding(source),
    async () => textResponse(buildClassicReviewerMarkdown(fixture)),
  )

  const markdown = result.content.reviewerMarkdown ?? ''
  for (const expected of [
    'IT Security',
    'InfoSec vs IT Sec',
    'CIA Triad',
    'Domains of IT Security',
    'Cybersecurity',
    'People / Process / Technology',
    'Unified Threat Management',
    'Importance of Cybersecurity',
    'Challenges of Cybersecurity',
    'Impact of a Security Breach',
    'Types of Attackers',
    'Vulnerability / Exploit / Breach',
    'Cybersecurity Threat Types',
    'Malware Types',
    'Malware Symptoms',
    'Methods of Infiltration',
    'Denial of Service Methods',
    'SEO Poisoning',
    'Blended Attacks',
    'Impact Reduction',
  ]) {
    assert.match(markdown, new RegExp(escapeRegExp(expected), 'i'))
  }
  assert.equal(result.content.answerBank.length, 0)
  assert.equal(result.content.identificationItems.length, 0)
  assert.doesNotThrow(() => validateDeepLearnContentReadyForSave(result.content))
})

test('Reviewer classic markdown covers PATHFit Arnis exam areas', async () => {
  const fixture = getReviewerSourceFixture('short-martial-arts-module')
  const result = await generateDeepLearnStructuredContent(
    createStructuredPromptInput(PATHFIT_ARNIS_SAMPLE_SOURCE, 'PATHFit Arnis.pdf'),
    createStructuredPreparedGrounding(PATHFIT_ARNIS_SAMPLE_SOURCE),
    async () => textResponse(buildClassicReviewerMarkdown({
      ...fixture,
      extractedText: PATHFIT_ARNIS_SAMPLE_SOURCE,
      expectedMajorSections: [
        'Arnis',
        'RA 9850',
        'Historical Concept',
        'Evolution / Classifications',
        'Organizations / Timeline',
        'Main Groups',
        'Courtesy / Salutation',
        'Strike Types',
        'Arnis as a sport',
        'Equipment / Weapons',
        'Stick Types',
      ],
    })),
  )

  const markdown = result.content.reviewerMarkdown ?? ''
  for (const expected of [
    'Arnis',
    'RA 9850',
    'Historical Concept',
    'Evolution / Classifications',
    'Organizations / Timeline',
    'Main Groups',
    'Courtesy / Salutation',
    'Strike Types',
    'Arnis as a sport',
    'Equipment / Weapons',
    'Stick Types',
  ]) {
    assert.match(markdown, new RegExp(escapeRegExp(expected), 'i'))
  }
})

test('Reviewer classic markdown retries once for unusable Markdown', async () => {
  const fixture = getReviewerSourceFixture('multi-phase-systems-analysis')
  const calls: Array<{ schemaName: string; model?: string }> = []
  const result = await withTemporaryEnv({
    DEEP_LEARN_REVIEWER_ONE_PASS_MODEL: 'gpt-5.4-primary',
    DEEP_LEARN_REVIEWER_ONE_PASS_REPAIR_MODEL: 'gpt-5.5-repair',
  }, () => generateDeepLearnStructuredContent(
    createStructuredPromptInput(fixture.extractedText, fixture.title),
    createStructuredPreparedGrounding(fixture.extractedText),
    async (request) => {
      calls.push({ schemaName: request.schemaName, model: request.model })
      if (calls.length === 1) return textResponse('too short')
      return textResponse(buildClassicReviewerMarkdown(fixture))
    },
  ))

  assert.deepEqual(calls, [
    { schemaName: 'deep_learn_reviewer_classic_markdown', model: 'gpt-5.4-primary' },
    { schemaName: 'deep_learn_reviewer_classic_markdown', model: 'gpt-5.5-repair' },
  ])
  assert.ok(result.content.reviewerMarkdown)
})

test('Reviewer classic markdown rejects old placeholder/debug leakage and repairs once', async () => {
  const fixture = getReviewerSourceFixture('taxonomy-heavy-security')
  const calls: string[] = []
  const result = await withTemporaryEnv({
    DEEP_LEARN_REVIEWER_ONE_PASS_MODEL: 'gpt-5.4-primary',
    DEEP_LEARN_REVIEWER_ONE_PASS_REPAIR_MODEL: 'gpt-5.5-repair',
  }, () => generateDeepLearnStructuredContent(
    createStructuredPromptInput(fixture.extractedText, fixture.title),
    createStructuredPreparedGrounding(fixture.extractedText),
    async (request) => {
      calls.push(request.model ?? 'none')
      if (calls.length === 1) {
        return textResponse([
          `# Reviewer: ${fixture.title}`,
          '## High-Yield Overview',
          '- No compact answer bank was recovered from this source.',
          '## Complete Exam Reviewer',
          '- raw source',
          '## Identification Reviewer',
          '- parser failed',
          '## Multiple Choice Practice',
          '- repair payload',
          '## Enumeration / List Questions',
          '- metadata-only',
          '## Final Quick Review',
          '- recovered from this source',
        ].join('\n'))
      }
      return textResponse(buildClassicReviewerMarkdown(fixture))
    },
  ))

  assert.deepEqual(calls, ['gpt-5.4-primary', 'gpt-5.5-repair'])
  assert.ok(result.content.reviewerMarkdown)
  assert.doesNotMatch(result.content.reviewerMarkdown ?? '', /No compact answer bank was recovered|repair payload|raw source|metadata-only/i)
})

test('Reviewer source cleanup collapses duplicated full-source blocks', async () => {
  const fixture = getReviewerSourceFixture('taxonomy-heavy-security')
  const duplicatedSource = `${fixture.extractedText}\n\n${fixture.extractedText}`
  let capturedPrompt = ''
  await generateDeepLearnStructuredContent(
    createStructuredPromptInput(duplicatedSource, fixture.title),
    createStructuredPreparedGrounding(duplicatedSource),
    async (request) => {
      capturedPrompt = request.promptText
      return textResponse(buildClassicReviewerMarkdown(fixture))
    },
  )

  assert.match(capturedPrompt, /SELECTED ACADEMIC SOURCE TEXT:/)
  const sourceBody = capturedPrompt.split('SELECTED ACADEMIC SOURCE TEXT:')[1] ?? ''
  assert.ok(sourceBody.length < duplicatedSource.length * 0.75)
})

test('Reviewer validation failure triggers fallback repair and saves repaired markdown', async () => {
  const fixture = getReviewerSourceFixture('taxonomy-heavy-security')
  const source = IT_SECURITY_SAMPLE_SOURCE.repeat(Math.ceil(6200 / IT_SECURITY_SAMPLE_SOURCE.length)).slice(0, 6200)
  const calls: Array<{ model?: string; repairHint: boolean }> = []
  const result = await withTemporaryEnv({
    DEEP_LEARN_REVIEWER_ONE_PASS_MODEL: 'gpt-5.4-primary',
    DEEP_LEARN_REVIEWER_ONE_PASS_REPAIR_MODEL: 'gpt-5.5-repair',
  }, () => generateDeepLearnStructuredContent(
    createStructuredPromptInput(source, fixture.title),
    createStructuredPreparedGrounding(source),
    async (request) => {
      calls.push({
        model: request.model,
        repairHint: /Previous internal failure reason:/i.test(request.promptText),
      })
      if (calls.length === 1) {
        return textResponse([
          `# Reviewer: ${fixture.title}`,
          '## High-Yield Overview',
          '- Brief line only.',
          '## Complete Exam Reviewer',
          '- Too short to pass validation.',
          '## Identification Reviewer',
          '- a',
          '## Multiple Choice Practice',
          '- b',
          '## Enumeration / List Questions',
          '- c',
          '## Final Quick Review',
          '- d',
        ].join('\n'))
      }
      return textResponse(buildClassicReviewerMarkdown({ ...fixture, extractedText: source }))
    },
  ))

  assert.deepEqual(calls.map((entry) => entry.model), ['gpt-5.4-primary', 'gpt-5.5-repair'])
  assert.equal(calls[1]?.repairHint, true)
  assert.ok(result.content.reviewerMarkdown)
  assert.match(result.content.reviewerMarkdown ?? '', /^#\s*Reviewer:/m)
})

test('Reviewer repair failure returns clean student-facing incomplete message', async () => {
  const fixture = getReviewerSourceFixture('taxonomy-heavy-security')
  const source = IT_SECURITY_SAMPLE_SOURCE.repeat(Math.ceil(6200 / IT_SECURITY_SAMPLE_SOURCE.length)).slice(0, 6200)

  await assert.rejects(
    () => withTemporaryEnv({
      DEEP_LEARN_REVIEWER_ONE_PASS_MODEL: 'gpt-5.4-primary',
      DEEP_LEARN_REVIEWER_ONE_PASS_REPAIR_MODEL: 'gpt-5.5-repair',
    }, () => generateDeepLearnStructuredContent(
      createStructuredPromptInput(source, fixture.title),
      createStructuredPreparedGrounding(source),
      async () => textResponse('too short'),
    )),
    (error: unknown) => {
      assert.ok(error instanceof DeepLearnGenerationIncompleteError)
      assert.equal(error.reason, 'insufficient_reviewer_markdown')
      assert.equal(
        error.message,
        'Deep Learn could not build a complete Reviewer from this source.',
      )
      assert.doesNotMatch(error.message, /raw source|repair payload|parser failed|compact answer bank|likely quiz targets/i)
      return true
    },
  )
})

test('task_output model routing remains on task-specific mini defaults', () => {
  const source = readFileSync('app/api/task-output/route.ts', 'utf8')
  assert.match(source, /DEFAULT_TASK_OUTPUT_MODEL = 'gpt-5-mini'/)
  assert.match(source, /OPENAI_TASK_OUTPUT_MODEL/)
  assert.match(source, /OPENAI_DO_NOW_MODEL/)
  assert.doesNotMatch(source, /DEEP_LEARN_REVIEWER_COMPILER_MODEL|DEEP_LEARN_STRUCTURED_FALLBACK_MODEL/)
})
test('Deep Learn diagnostics select visual_extracted_text when extracted_text is metadata-only', () => {
  const weakExtract = 'File title: Lecture.pdf\nUUID: 11111111-1111-4111-8111-111111111111\nDebug: no readable text'
  const visualText = [
    'Photosynthesis is the process by which plants convert light energy into chemical energy stored in glucose.',
    'Chlorophyll absorbs light in the chloroplasts, while carbon dioxide and water are used as reactants.',
    'The light-dependent reactions produce ATP and NADPH, and the Calvin cycle uses them to build sugars.',
    'Oxygen is released as a byproduct when water molecules are split during the light reactions.',
    'Photosynthesis supports food chains because producers create organic molecules from inorganic materials.',
  ].join('\n')
  const resource = createLearnResource({
    title: 'Photosynthesis.pdf',
    extractionStatus: 'metadata_only',
    extractedText: weakExtract,
    extractedTextPreview: weakExtract,
    extractedCharCount: weakExtract.length,
    visualExtractionStatus: 'completed',
    visualExtractedText: visualText,
  })

  const diagnostics = buildDeepLearnSourceDiagnostics({
    resource,
    storedResource: createStoredResource({
      title: 'Photosynthesis.pdf',
      extractionStatus: 'metadata_only',
      extractedText: weakExtract,
      extractedCharCount: weakExtract.length,
      visualExtractionStatus: 'completed',
      visualExtractedText: visualText,
    }),
    module: createContext(resource, createStoredResource()).module,
    courseName: 'Biology',
  }, { queuedJobId: 'job-2' })

  assert.equal(diagnostics.sourceFieldUsed, 'visual_extracted_text')
  assert.match(diagnostics.previewStart ?? '', /Photosynthesis is the process/)
  assert.doesNotMatch(diagnostics.previewStart ?? '', /11111111|Debug|File title/i)
})

function createStructuredPromptInput(source: string, title: string): Parameters<typeof generateDeepLearnStructuredContent>[0] {
  return {
    ...createContext(createLearnResource({
      title,
      extractedText: source,
      extractedTextPreview: source.slice(0, 420),
      extractedCharCount: source.length,
      extractionStatus: 'completed',
    }), createStoredResource({
      title,
      extractedText: source,
      extractedTextPreview: source.slice(0, 420),
      extractedCharCount: source.length,
      extractionStatus: 'completed',
    })),
    promptGrounding: source,
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: source.length,
    },
    generationMode: 'text' as const,
  }
}

function createStructuredPreparedGrounding(source: string): Parameters<typeof generateDeepLearnStructuredContent>[1] {
  return {
    generationMode: 'text' as const,
    promptGrounding: source,
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract' as const,
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: source.length,
    },
    refreshedResource: null,
    scanFallbackInput: null,
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

function createPromptInput(): Parameters<typeof generateDeepLearnStructuredContent>[0] {
  const text = buildLongText('Information security explains confidentiality, integrity, availability, threats, vulnerabilities, and layered controls.')
  return {
    ...createContext(createLearnResource({
      title: 'IT Security PDF',
      extractedText: text,
      extractedTextPreview: text.slice(0, 420),
      extractedCharCount: text.length,
      extractionStatus: 'completed',
    }), createStoredResource({
      title: 'IT Security PDF',
      extractedText: text,
      extractedTextPreview: text.slice(0, 420),
      extractedCharCount: text.length,
      extractionStatus: 'completed',
    })),
    promptGrounding: text,
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: text.length,
    },
    generationMode: 'text' as const,
  }
}

function createItSecurityPromptInput(): Parameters<typeof generateDeepLearnStructuredContent>[0] {
  return {
    ...createContext(createLearnResource({
      title: 'Intro to IT Security.pdf',
      type: 'File',
      contentType: 'application/pdf',
      extension: 'pdf',
      normalizedSourceType: 'pdf',
      extractedText: IT_SECURITY_SAMPLE_SOURCE,
      extractedTextPreview: IT_SECURITY_SAMPLE_SOURCE.slice(0, 420),
      extractedCharCount: IT_SECURITY_SAMPLE_SOURCE.length,
      extractionStatus: 'completed',
      quality: 'usable',
      groundingLevel: 'strong',
      previewState: 'full_text_available',
      fullTextAvailable: true,
      storedTextLength: IT_SECURITY_SAMPLE_SOURCE.length,
      storedPreviewLength: 420,
      storedWordCount: IT_SECURITY_SAMPLE_SOURCE.split(/\s+/).length,
    }), createStoredResource({
      title: 'Intro to IT Security.pdf',
      resourceType: 'File',
      contentType: 'application/pdf',
      extension: 'pdf',
      extractedText: IT_SECURITY_SAMPLE_SOURCE,
      extractedTextPreview: IT_SECURITY_SAMPLE_SOURCE.slice(0, 420),
      extractedCharCount: IT_SECURITY_SAMPLE_SOURCE.length,
      extractionStatus: 'completed',
    })),
    promptGrounding: buildAcademicStructuredGrounding(IT_SECURITY_SAMPLE_SOURCE),
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: IT_SECURITY_SAMPLE_SOURCE.length,
      sourceMap: buildAcademicSourceMap(IT_SECURITY_SAMPLE_SOURCE),
    },
    generationMode: 'text' as const,
  }
}

function createPreparedGrounding(): Parameters<typeof generateDeepLearnStructuredContent>[1] {
  return {
    generationMode: 'text' as const,
    promptGrounding: 'Information security explains confidentiality, integrity, availability, threats, vulnerabilities, and layered controls.',
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract' as const,
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 3200,
    },
    refreshedResource: null,
    scanFallbackInput: null,
  }
}

function createItSecurityPreparedGrounding(): Parameters<typeof generateDeepLearnStructuredContent>[1] {
  return {
    generationMode: 'text' as const,
    promptGrounding: buildAcademicStructuredGrounding(IT_SECURITY_SAMPLE_SOURCE),
    sourceGrounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      sourceTextQuality: 'meaningful',
      groundingStrategy: 'stored_extract' as const,
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: IT_SECURITY_SAMPLE_SOURCE.length,
      sourceMap: buildAcademicSourceMap(IT_SECURITY_SAMPLE_SOURCE),
    },
    refreshedResource: null,
    scanFallbackInput: null,
  }
}

function jsonResponse(payload: unknown) {
  return {
    status: 'completed',
    output_text: JSON.stringify(payload),
    incomplete_details: null,
  }
}

const IT_SECURITY_SAMPLE_SOURCE = [
  'Intro to IT Security Module 1',
  'What is IT Security • A set of cyber security strategies that prevent unauthorized access • Focuses on protecting organizational assets against cyberattacks and other threats • InfoSec - processes and tools designed to protect sensitive business information • IT Sec - securing digital data through computer network security',
  'Goal of IT Security 1. Confidentiality 2. Integrity 3. Availability',
  'Domains of IT Security 1. Network Security 2. Internet Security 3. Endpoint Security 4. Cloud Security 5. Application Security 6. Information Security 7. Operational Security 8. Mobile Security 9. IoT Security 10. User Education 11. Cyber Security',
  'What is Cybersecurity all about? Cybersecurity involves multiple layers of protection spread across computers, networks, programs, and data. People, processes, and technology must complement one another. Unified threat management can accelerate detection, investigation, and remediation.',
  'Impact of a Security Breach Ruined Reputation, Vandalism, Theft, Revenue Lost, Damaged Intellectual Property',
  'What is Cybersecurity? • Protection of networked systems and data from unauthorized use or harm • Refers to techniques used to protect the integrity of an organization security architecture and safeguard its data against attack, damage, or unauthorized access',
  'Importance of cybersecurity • Increasingly sophisticated attacks • Widely available hacking tools • Compliance • Rising cost of breaches • Strategic board-level concern • Cyber crime is big business',
  'Challenges of Cybersecurity • Internet of Things • Rapidly Evolving Risks • Big and Confidential Data • Organized and State-sponsored Hacker Groups • Remote Working • High-speed Internet • BYOD',
  'Types of Attackers Insiders • Employees and ex-employees • Contract Staff • Trusted Partners Outsiders Organized Attackers • Cyber Criminals • Hacktivists • Terrorists • State-sponsored Hackers • Black hats • Grey hats • White hats Amateurs',
  'Definition of Terms • Vulnerability - Weaknesses or flaws in the hardware or software • Exploit - Method or tools used to take advantage vulnerability • Breach - Successful exploit if vulnerability',
  'Types of Cybersecurity Threats • Cybercrime - Efforts by bad actors to profit from their malicious attacks • Disruption - Attempts to disrupt operations by attacking IT and operational technology infrastructure • Espionage - Attacks backed by state agencies as part of espionage and military activity',
  'Types of Malware • Spyware • Adware • Bot • Rootkit • Scareware • Ransomware • Virus • Trojan Horse • Worm • MiTM',
  'Methods of Infiltration 1. Social Engineering • Pretexting • Tailgating • Phishing • Smishing • Vishing 2. Password Cracking • Brute-force • Network Sniffing • Social Engineering 3. Vulnerability Exploitation 4. Advanced Persistent Threats',
  'Symptoms of Malware - There is an increase in CPU usage - There is a decrease in computer speed - The computer freezes or crashes often - There is a decrease in Web browsing speed - There are unexplainable problems with network connections - Files are modified - Files are deleted - There is a presence of unknown files, programs, or desktop icons - There are unknown processes running - Email is being sent without the user knowledge or consent',
  'Methods to Deny Service - Overwhelm quantity of traffic - Send enormous quantity of data at a rate that cannot be handled - Maliciously formatted packets - Zombie - Infected Host - Botnet - Network of Infected Hosts - SEO Poisoning - Increase traffic to malicious websites',
  'Blended Attacks - Uses multiple techniques to compromise a target - Uses a hybrid of worms, Trojan horses, spyware, keyloggers, spam, and phishing schemes - DDoS combined with phishing emails',
  'Impact Reduction - Communicate the Issue - Be sincere and accountable - Provide details - Understand the cause of the breach - Take steps to avoid another similar breach in the future - Ensure all systems are clean - Educate employees, partners, and customers',
].join('\n')

const BULLET_HEAVY_IT_SECURITY_SOURCE = [
  'IT Security Exam Outline',
  'Confidentiality: information is protected from unauthorized access and disclosure.',
  'Integrity: data stays accurate, complete, and protected from improper modification.',
  'Availability: systems and data remain accessible to authorized users when needed.',
  'CIA triad: Confidentiality, Integrity, Availability.',
  'Malware: malicious software that damages systems, steals data, or disrupts operations.',
  'Virus: malware that attaches to files and spreads when the file runs.',
  'Trojan Horse: malware disguised as legitimate software.',
  'Worm: self-replicating malware that spreads across networks.',
  'Phishing: a social engineering attack that tricks users into revealing credentials.',
  'Denial of Service: an attack that overwhelms a service so legitimate users cannot access it.',
  'Symptoms of malware: slow computer speed, frequent crashes, unknown files, modified files, deleted files, unknown processes, and email sent without user consent.',
  'Methods of attack: social engineering, password cracking, vulnerability exploitation, malware infection, denial of service, and blended attacks.',
  'Impact reduction: communicate the issue, explain details, identify the cause, clean systems, and educate employees.',
].join('\n')

const SPARSE_RELATION_ARNIS_OUTLINE_SOURCE = [
  'Arnis PATHFit Exam Outline',
  '* Arnis Filipino martial art and sport using sticks blades and empty hand techniques for defense and competition.',
  '* RA 9850 declared Arnis the national martial art and sport of the Philippines in 2009.',
  '* Baston primary rattan stick used in Arnis practice for striking blocking and partner drills.',
  '* Daga training dagger used for short weapon practice and disarming drills.',
  '* Bangkaw six foot pole weapon used in long weapon training.',
  '* Doce Pares Cebu based Arnis organization connected with twelve methods and tournament practice.',
  '* NARAPHIL organization formed in 1975 to promote and standardize Arnis in the Philippines.',
  '* WEKAF international federation formed in 1989 to support Arnis competition rules.',
  '* Main classifications largo mano medio and corto describe long medium and close range fighting.',
  '* Regional classifications Balintawak Doce Pares Modern Arnis and Kalis Ilustrisimo identify systems.',
  '* Courtesy salutation attention stance weapon to chest bow and return to ready stance.',
  '* Strike targets head temple shoulder elbow knee torso and ribs for basic angle practice.',
  '* Important dates 1975 NARAPHIL formation 1989 WEKAF formation and 2009 RA 9850 approval.',
].join('\n')

const PATHFIT_ARNIS_SAMPLE_SOURCE = [
  'PATHFit Module 1 Arnis',
  'What is Arnis â€¢ Arnis is the Philippine national martial art and sport using sticks, bladed weapons, and empty-hand techniques.',
  'Aliases of Arnis â€¢ Eskrima â€¢ Kali â€¢ Garrote â€¢ Estoque',
  'Republic Act 9850 â€¢ RA 9850 declared Arnis as the national martial art and sport of the Philippines.',
  'Historical Concept â€¢ Arnis developed from indigenous fighting systems and preserved Filipino culture through practical self-defense.',
  'Evolution of Arnis â€¢ Classical Arnis â€¢ Modern Arnis â€¢ Sports Arnis â€¢ Anyo â€¢ Labanan',
  'Organizations and Timeline 1975 NARAPHIL promoted national organization 1986 ARPI supported national competitions 1989 WEKAF standardized Arnis sport rules 2010 i-ARNIS supported school-based implementation',
  'Organizations and Timeline 1970 Doce Pares Association rules were accepted by many Arnis clubs',
  'Regional Systems Pangasinan - KALIRONGAN; Tagalogs - PANANANDATA; Ilocanos - DIDYA/KABAROAN; Ibanags - PAGKALIKALI; Pampanguenos - SINAWALI; Visayans - KINAADMAN/PAGARADMAN/ESGRIMA/ESCRIMA',
  '3 Main Groups Northern Style - Arnis; Central Style - Arnis de Mano; Southern Style - Kali',
  'Stick Types Baston / Olisi / Yantok - 24 to 28 inches; Largo mano yantok - 28 to 36 inches; Dulo y Dulo - 4 to 7 inches',
  'Courtesy and Salutation 1. Attention stance 2. Ready stance 3. Bow 4. Salute 5. Return to ready stance',
  'Strike Types â€¢ Forehand strike â€¢ Backhand strike â€¢ Thrust â€¢ Diagonal strike â€¢ Horizontal strike â€¢ Vertical strike',
  'Equipment and Weapons â€¢ Baston - training stick â€¢ Daga - dagger â€¢ Bolo - bladed weapon â€¢ Espada y Daga - sword and dagger â€¢ Bangkaw - six-foot pole',
  'Stick Types â€¢ Solo Baston â€¢ Doble Baston â€¢ Sibat â€¢ Bangkaw',
  'Regional Classifications â€¢ Luzon styles â€¢ Visayans classifications â€¢ Mindanao systems',
].join('\n')

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

function answerBankItem(index: number) {
  return {
    cue: `Concept ${index}`,
    kind: 'term_definition',
    answer: {
      exact: `Exact course wording ${index}`,
      examSafe: `Exact course wording ${index}`,
      simplified: `Plain explanation ${index}`,
    },
    compactAnswer: {
      exact: `Exact course wording ${index}`,
      examSafe: `Exact course wording ${index}`,
      simplified: `Plain explanation ${index}`,
    },
    importance: 'high',
    sortKey: null,
    distractors: [],
    reviewText: `Concept ${index}`,
    draftExplanation: `Plain explanation ${index}`,
    sourceSnippet: `Exact course wording ${index}`,
    linkedDraftSectionId: null,
    supportingContext: `Plain explanation ${index}`,
    compareContext: null,
    simplifiedWording: `Plain explanation ${index}`,
    confusionNotes: [],
    relatedConcepts: [],
  }
}

function identificationItem(index: number) {
  return {
    prompt: `Prompt ${index}`,
    kind: 'term_definition',
    answer: {
      exact: `Identification answer ${index}`,
      examSafe: `Identification answer ${index}`,
      simplified: null,
    },
    importance: 'high',
    distractors: [],
    reviewText: `Prompt ${index}`,
    draftExplanation: null,
    sourceSnippet: `Identification answer ${index}`,
    linkedDraftSectionId: null,
    supportingContext: null,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: [],
  }
}

function distinctionItem(index: number) {
  return {
    conceptA: `Concept A ${index}`,
    conceptB: `Concept B ${index}`,
    difference: `Difference ${index}`,
    confusionNote: null,
    reviewText: `Concept A ${index} vs Concept B ${index}`,
    draftExplanation: `Difference ${index}`,
    sourceSnippet: `Difference ${index}`,
    linkedDraftSectionId: null,
    supportingContext: `Difference ${index}`,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: [],
  }
}

function quizTargetItem(index: number) {
  return {
    target: `Quiz target ${index}`,
    reason: `Reason ${index}`,
    importance: 'high',
    reviewText: `Quiz target ${index}`,
    draftExplanation: `Reason ${index}`,
    sourceSnippet: `Quiz target ${index}`,
    linkedDraftSectionId: null,
    supportingContext: `Reason ${index}`,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: [],
  }
}
