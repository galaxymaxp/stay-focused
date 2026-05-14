import OpenAI from 'openai'
import { downloadCanvasBinarySource, normalizeCanvasUrl } from '@/lib/canvas'
import {
  DEEP_LEARN_PROMPT_VERSION,
  normalizeDeepLearnGeneratedContent,
  type DeepLearnGeneratedContent,
} from '@/lib/deep-learn'
import {
  buildDeepLearnBlockedReadiness,
  canAttemptDeepLearnSourceFetch,
  classifyDeepLearnResourceReadiness,
  detectDeepLearnBlockedReasonAfterSourceFetch,
  isDeepLearnScanFallbackCapable,
  selectDeepLearnGroundingText,
} from '@/lib/deep-learn-readiness'
import { classifyExtractedTextQuality, isMeaningfulDeepLearnSourceText, BAD_OCR_BLOCKED_MESSAGE } from '@/lib/extracted-text-quality'
import { reprocessStoredModuleResource } from '@/lib/module-resource-reprocess'
import { getModuleResourceQualityInfo, normalizeModuleResourceStudyText } from '@/lib/module-resource-quality'
import type { ModuleSourceResource } from '@/lib/module-workspace'
import { getStudySourceTypeLabel } from '@/lib/study-resource'
import type { Module, ModuleResource, Task } from '@/lib/types'
import type { DeepLearnBlockedReason, DeepLearnSourceGrounding } from '@/lib/types'

const DEFAULT_DEEP_LEARN_MODEL = 'gpt-5-mini'
const MAX_GROUNDING_CHARS = 12000
export const DEEP_LEARN_MAX_OUTPUT_TOKENS = 10000
export const DEEP_LEARN_COMPACT_MAX_OUTPUT_TOKENS = 10000
export const DEEP_LEARN_OUTPUT_TOO_LARGE_MESSAGE = 'The model response limit was reached even after compact fallback. Try a smaller source or split the module.'
export const DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE = 'Deep Learn could not build enough structured study content from this source. Try a smaller source or split the module.'
const DEEP_LEARN_STAGE_TIMEOUT_MS = 120000
const DEEP_LEARN_COMPACT_CAUTION_NOTE = 'Generated as a compact reviewer because the source was long.'

const DEEP_LEARN_SYSTEM_PROMPT = [
  'You create saved Deep Learn Study Packs from academic source material.',
  'Study Pack is for understanding and application; Reviewer is for memorization and exact source wording; Quiz is for practice.',
  'Optimize this generation for a compact Study Pack plus structured source-faithful items that Reviewer and Quiz can reuse.',
  'Prioritize identification, multiple choice, timeline, law recognition, term-definition recall, and confusable exam targets.',
  'Use a two-layer output model: exact source wording first for memorization, then separate plain-English explanation only when helpful.',
  'For terms, definitions, enumerations, listed items, formulas, and process steps, preserve source wording as closely as possible in wording.exact and wording.examSafe.',
  'Do not replace a source definition with a broad tutor paraphrase; put any simplification in wording.simplified, simplifiedWording, or draftExplanation.',
  'Keep every answer compact, source-grounded, and easy for a student to reuse in quizzes.',
  'Do not invent facts, examples, certainty, or missing source details.',
  'Do not turn course titles, course codes, academic year labels, schedules, room links, or instructor/admin metadata into study content unless the source is only an administrative course overview.',
  'Do not label plain definitions, symptoms, or concept relationships as formulas unless the source shows a real quantitative equation or calculation pattern.',
  'If grounding is partial or scan-based, say that clearly in cautionNotes.',
  'Support sections are secondary and should stay short.',
  'Return only JSON that matches the requested schema.',
].join(' ')

const DEEP_LEARN_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'overview',
    'sections',
    'answerBank',
    'identificationItems',
    'distinctions',
    'likelyQuizTargets',
    'cautionNotes',
  ],
  properties: {
    title: { type: 'string' },
    overview: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'body'],
        properties: {
          heading: { type: 'string' },
          body: { type: 'string' },
        },
      },
    },
    answerBank: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cue', 'kind', 'answer', 'compactAnswer', 'importance', 'sortKey', 'distractors', 'reviewText', 'draftExplanation', 'sourceSnippet', 'linkedDraftSectionId', 'supportingContext', 'compareContext', 'simplifiedWording', 'confusionNotes', 'relatedConcepts'],
        properties: {
          cue: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['date_event', 'law_effect', 'term_definition', 'place_meaning', 'province_capital', 'person_role', 'count', 'timeline', 'compare', 'fact'],
          },
          answer: wordingSchema(),
          compactAnswer: wordingSchema(),
          importance: importanceSchema(),
          sortKey: { type: ['string', 'null'] },
          distractors: {
            type: 'array',
            items: { type: 'string' },
          },
          ...reviewLinkSchemaProperties(),
        },
      },
    },
    identificationItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt', 'kind', 'answer', 'importance', 'distractors', 'reviewText', 'draftExplanation', 'sourceSnippet', 'linkedDraftSectionId', 'supportingContext', 'compareContext', 'simplifiedWording', 'confusionNotes', 'relatedConcepts'],
        properties: {
          prompt: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['date_event', 'law_effect', 'term_definition', 'place_meaning', 'province_capital', 'person_role', 'count', 'timeline', 'compare', 'fact'],
          },
          answer: wordingSchema(),
          importance: importanceSchema(),
          distractors: {
            type: 'array',
            items: { type: 'string' },
          },
          ...reviewLinkSchemaProperties(),
        },
      },
    },
    distinctions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['conceptA', 'conceptB', 'difference', 'confusionNote', 'reviewText', 'draftExplanation', 'sourceSnippet', 'linkedDraftSectionId', 'supportingContext', 'compareContext', 'simplifiedWording', 'confusionNotes', 'relatedConcepts'],
        properties: {
          conceptA: { type: 'string' },
          conceptB: { type: 'string' },
          difference: { type: 'string' },
          confusionNote: { type: ['string', 'null'] },
          ...reviewLinkSchemaProperties(),
        },
      },
    },
    likelyQuizTargets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['target', 'reason', 'importance', 'reviewText', 'draftExplanation', 'sourceSnippet', 'linkedDraftSectionId', 'supportingContext', 'compareContext', 'simplifiedWording', 'confusionNotes', 'relatedConcepts'],
        properties: {
          target: { type: 'string' },
          reason: { type: 'string' },
          importance: importanceSchema(),
          ...reviewLinkSchemaProperties(),
        },
      },
    },
    cautionNotes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

function getDeepLearnStageDefinitions(): DeepLearnStageDefinition[] {
  return [
    {
      key: 'high_yield',
      schemaName: 'deep_learn_high_yield_stage',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'overview', 'sections'],
        properties: {
          title: { type: 'string' },
          overview: { type: 'string' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['heading', 'body'],
              properties: {
                heading: { type: 'string' },
                body: { type: 'string' },
              },
            },
          },
        },
      },
      fullMaxOutputTokens: 2800,
      compactMaxOutputTokens: 1800,
      microMaxOutputTokens: 900,
      fullProgress: 40,
      compactProgress: 42,
      microProgress: 44,
    },
    {
      key: 'identification',
      schemaName: 'deep_learn_identification_stage',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['sections', 'identificationItems'],
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['heading', 'body'],
              properties: {
                heading: { type: 'string' },
                body: { type: 'string' },
              },
            },
          },
          identificationItems: identificationItemsSchema(),
        },
      },
      fullMaxOutputTokens: 3200,
      compactMaxOutputTokens: 2200,
      microMaxOutputTokens: 1100,
      fullProgress: 55,
      compactProgress: 57,
      microProgress: 59,
    },
    {
      key: 'quick_answers',
      schemaName: 'deep_learn_quick_answers_stage',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['sections', 'answerBank'],
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['heading', 'body'],
              properties: {
                heading: { type: 'string' },
                body: { type: 'string' },
              },
            },
          },
          answerBank: answerBankSchema(),
        },
      },
      fullMaxOutputTokens: 4200,
      compactMaxOutputTokens: 2600,
      microMaxOutputTokens: 1200,
      fullProgress: 70,
      compactProgress: 72,
      microProgress: 74,
    },
    {
      key: 'distinctions',
      schemaName: 'deep_learn_distinctions_stage',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['sections', 'distinctions', 'likelyQuizTargets', 'cautionNotes'],
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['heading', 'body'],
              properties: {
                heading: { type: 'string' },
                body: { type: 'string' },
              },
            },
          },
          distinctions: distinctionsSchema(),
          likelyQuizTargets: likelyQuizTargetsSchema(),
          cautionNotes: cautionNotesSchema(),
        },
      },
      fullMaxOutputTokens: 2600,
      compactMaxOutputTokens: 1800,
      microMaxOutputTokens: 900,
      fullProgress: 80,
      compactProgress: 80,
      microProgress: 82,
    },
  ]
}

export interface DeepLearnGenerationContext {
  module: Module
  courseName: string
  resource: ModuleSourceResource
  storedResource: ModuleResource
  linkedTask: Task | null
}

export interface DeepLearnGenerationResult {
  content: DeepLearnGeneratedContent
  sourceGrounding: DeepLearnSourceGrounding
  refreshedResource: ModuleResource | null
  compactFallbackUsed: boolean
}

interface DeepLearnPreparedBinaryInput {
  inputType: 'file' | 'image'
  contentType: string | null
  filename: string
  fileData: string
}

interface DeepLearnPreparedGrounding {
  generationMode: 'text' | 'scan_fallback'
  promptGrounding: string
  sourceGrounding: DeepLearnSourceGrounding
  refreshedResource: ModuleResource | null
  scanFallbackInput: DeepLearnPreparedBinaryInput | null
}

interface DeepLearnPromptInput extends DeepLearnGenerationContext {
  promptGrounding: string
  sourceGrounding: DeepLearnSourceGrounding
  generationMode: 'text' | 'scan_fallback'
}

interface DeepLearnGenerationProgressUpdate {
  progress: number
  statusMessage: string
  stage: 'compacting_source' | 'high_yield' | 'identification' | 'quick_answers' | 'distinctions' | 'compact_fallback'
  compactFallbackUsed?: boolean
}

interface DeepLearnResponseLike {
  status?: string | null
  output_text?: string | null
  incomplete_details?: {
    reason?: string | null
  } | null
}

interface DeepLearnResponseRequest {
  grounding: DeepLearnPreparedGrounding
  promptText: string
  maxOutputTokens: number
  schemaName: string
  schema: Record<string, unknown>
}

type DeepLearnResponseCreator = (request: DeepLearnResponseRequest) => Promise<DeepLearnResponseLike>

interface DeepLearnGenerationOptions {
  onProgress?: (update: DeepLearnGenerationProgressUpdate) => Promise<void> | void
}

type DeepLearnStageKey = 'high_yield' | 'identification' | 'quick_answers' | 'distinctions'
type DeepLearnFallbackLevel = 'full' | 'compact' | 'micro'

interface DeepLearnStageDefinition {
  key: DeepLearnStageKey
  schemaName: string
  schema: Record<string, unknown>
  fullMaxOutputTokens: number
  compactMaxOutputTokens: number
  microMaxOutputTokens: number
  fullProgress: number
  compactProgress: number
  microProgress: number
}

interface DeepLearnStageErrorOptions {
  stage: DeepLearnStageKey
  reason: string
  level: DeepLearnFallbackLevel
  kind: 'size' | 'timeout' | 'provider' | 'invalid_json' | 'empty'
  partialOutput?: Record<string, unknown> | null
}

export class DeepLearnGenerationBlockedError extends Error {
  blockedReason: DeepLearnBlockedReason
  refreshedResource: ModuleResource | null
  sourceGrounding: DeepLearnSourceGrounding

  constructor(input: {
    message: string
    blockedReason: DeepLearnBlockedReason
    refreshedResource: ModuleResource | null
    sourceGrounding: DeepLearnSourceGrounding
  }) {
    super(input.message)
    this.name = 'DeepLearnGenerationBlockedError'
    this.blockedReason = input.blockedReason
    this.refreshedResource = input.refreshedResource
    this.sourceGrounding = input.sourceGrounding
  }
}

export class DeepLearnGenerationIncompleteError extends Error {
  reason: string

  constructor(reason: string) {
    super(buildDeepLearnIncompleteMessage(reason))
    this.name = 'DeepLearnGenerationIncompleteError'
    this.reason = reason
  }
}

export class DeepLearnGeneratedContentValidationError extends Error {
  constructor(message = DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE) {
    super(message)
    this.name = 'DeepLearnGeneratedContentValidationError'
  }
}

class DeepLearnGenerationStageError extends Error {
  stage: DeepLearnStageKey
  reason: string
  level: DeepLearnFallbackLevel
  kind: 'size' | 'timeout' | 'provider' | 'invalid_json' | 'empty'
  partialOutput: Record<string, unknown> | null

  constructor(options: DeepLearnStageErrorOptions) {
    super(buildDeepLearnStageFailureMessage(options))
    this.name = 'DeepLearnGenerationStageError'
    this.stage = options.stage
    this.reason = options.reason
    this.level = options.level
    this.kind = options.kind
    this.partialOutput = options.partialOutput ?? null
  }
}

interface DeepLearnGroundingDependencies {
  reprocessStoredModuleResource?: typeof reprocessStoredModuleResource
  downloadScanFallbackSource?: (resource: ModuleResource) => Promise<DeepLearnPreparedBinaryInput>
}

export async function generateDeepLearnNoteForResource(
  input: DeepLearnGenerationContext,
  options: DeepLearnGenerationOptions = {},
): Promise<DeepLearnGenerationResult> {
  const grounding = await buildDeepLearnGrounding(input)
  if (grounding.generationMode === 'text' && !isMeaningfulDeepLearnSourceText({
    text: grounding.promptGrounding,
    title: input.resource.title,
  })) {
    throw new DeepLearnGenerationBlockedError({
      message: BAD_OCR_BLOCKED_MESSAGE,
      blockedReason: 'extraction_unusable_after_fetch',
      refreshedResource: grounding.refreshedResource,
      sourceGrounding: grounding.sourceGrounding,
    })
  }
  await options.onProgress?.({
    progress: 25,
    statusMessage: 'Compacting readable source text for staged Deep Learn generation.',
    stage: 'compacting_source',
  })

  const promptInput: DeepLearnPromptInput = {
    ...input,
    sourceGrounding: grounding.sourceGrounding,
    promptGrounding: grounding.promptGrounding,
    generationMode: grounding.generationMode,
  }

  const client = new OpenAI({
    apiKey: getRequiredDeepLearnApiKey(),
  })

  const { content, compactFallbackUsed } = await generateDeepLearnStructuredContent(
    promptInput,
    grounding,
    (request) => createDeepLearnResponse(client, request),
    options,
  )

  return {
    content,
    sourceGrounding: grounding.sourceGrounding,
    refreshedResource: grounding.refreshedResource,
    compactFallbackUsed,
  }
}

export async function buildDeepLearnGrounding(input: DeepLearnGenerationContext) {
  return buildDeepLearnGroundingWithDependencies(input)
}

export async function generateDeepLearnStructuredContent(
  input: DeepLearnPromptInput,
  grounding: DeepLearnPreparedGrounding,
  createResponse: DeepLearnResponseCreator,
  options: DeepLearnGenerationOptions = {},
): Promise<{ content: DeepLearnGeneratedContent; compactFallbackUsed: boolean }> {
  try {
    const content = await runDeepLearnStagePlan(input, grounding, createResponse, 'full', options)
    return { content, compactFallbackUsed: false }
  } catch (error) {
    if (!(error instanceof DeepLearnGenerationStageError) || error.kind !== 'size') {
      throw error
    }

    console.warn('[deep-learn-generation] retrying staged fallback', {
      stage: error.stage,
      level: 'compact',
      previousLevel: error.level,
      kind: error.kind,
      reason: error.reason,
    })
    await options.onProgress?.({
      progress: 32,
      statusMessage: 'The source is long, so Deep Learn is switching to a compact reviewer pass.',
      stage: 'compact_fallback',
      compactFallbackUsed: true,
    })

    try {
      const content = await runDeepLearnStagePlan(input, grounding, createResponse, 'compact', options, {
        startStage: error.stage,
        seedOutput: error.partialOutput,
      })
      return { content, compactFallbackUsed: true }
    } catch (compactError) {
      if (!(compactError instanceof DeepLearnGenerationStageError) || compactError.kind !== 'size') {
        throw compactError
      }

      console.warn('[deep-learn-generation] retrying staged fallback', {
        stage: compactError.stage,
        level: 'micro',
        previousLevel: compactError.level,
        kind: compactError.kind,
        reason: compactError.reason,
      })
      await options.onProgress?.({
        progress: 36,
        statusMessage: 'Deep Learn is saving a smaller compact reviewer from the strongest source points.',
        stage: 'compact_fallback',
        compactFallbackUsed: true,
      })

      try {
        const content = await runDeepLearnStagePlan(input, grounding, createResponse, 'micro', options, {
          startStage: compactError.stage,
          seedOutput: compactError.partialOutput,
        })
        return { content, compactFallbackUsed: true }
      } catch (microError) {
        if (microError instanceof DeepLearnGenerationStageError && microError.kind === 'size') {
          console.warn('[deep-learn-generation] saving minimal fallback after staged size limit', {
            stage: microError.stage,
            level: 'minimal',
            previousLevel: microError.level,
            kind: microError.kind,
            reason: microError.reason,
          })
          const content = buildMinimalDeepLearnFallback(input, microError.partialOutput ?? compactError.partialOutput ?? error.partialOutput)
          assertDeepLearnContentReadyForSave(content)
          return { content, compactFallbackUsed: true }
        }
        throw microError
      }
    }
  }
}

export async function buildDeepLearnGroundingWithDependencies(
  input: DeepLearnGenerationContext,
  dependencies: DeepLearnGroundingDependencies = {},
): Promise<DeepLearnPreparedGrounding> {
  const reprocessStoredModuleResourceImpl = dependencies.reprocessStoredModuleResource ?? reprocessStoredModuleResource
  const downloadScanFallbackSourceImpl = dependencies.downloadScanFallbackSource ?? downloadDeepLearnScanFallbackSource
  const readiness = classifyDeepLearnResourceReadiness({
    resource: input.resource,
    storedResource: input.storedResource,
    canonicalResourceId: input.storedResource.id,
  })
  const currentQuality = getModuleResourceQualityInfo(input.resource)
  let surfaceResource = input.resource
  let refreshedResource: ModuleResource | null = null
  let finalQuality = currentQuality
  let groundingStrategy: DeepLearnSourceGrounding['groundingStrategy'] = readiness.state === 'text_ready'
    ? 'stored_extract'
    : readiness.state === 'scan_fallback'
      ? 'scan_fallback'
      : 'insufficient'
  let recoveryWarning: string | null = null

  if (readiness.state === 'unreadable') {
    throw new DeepLearnGenerationBlockedError({
      message: readiness.detail,
      blockedReason: readiness.blockedReason ?? 'no_source_path',
      refreshedResource: null,
      sourceGrounding: buildDeepLearnSourceGrounding(surfaceResource, finalQuality, 'insufficient', readiness.detail),
    })
  }

  if (readiness.shouldAttemptSourceFetch && canAttemptDeepLearnSourceFetch(input.storedResource)) {
    try {
      const reprocessed = await reprocessStoredModuleResourceImpl(input.storedResource, {
        triggeredBy: 'learn',
      })

      refreshedResource = {
        ...input.storedResource,
        extractionStatus: reprocessed.update.extractionStatus,
        extractedText: reprocessed.update.extractedText,
        extractedTextPreview: reprocessed.update.extractedTextPreview,
        extractedCharCount: reprocessed.update.extractedCharCount,
        extractionError: reprocessed.update.extractionError,
        visualExtractionStatus: reprocessed.update.visualExtractionStatus,
        visualExtractedText: reprocessed.update.visualExtractedText,
        visualExtractionError: reprocessed.update.visualExtractionError,
        pageCount: reprocessed.update.pageCount,
        pagesProcessed: reprocessed.update.pagesProcessed,
        extractionProvider: reprocessed.update.extractionProvider,
        metadata: reprocessed.update.metadata,
      }
      surfaceResource = {
        ...surfaceResource,
        extractionStatus: refreshedResource.extractionStatus,
        extractedText: refreshedResource.extractedText,
        extractedTextPreview: refreshedResource.extractedTextPreview,
        extractedCharCount: refreshedResource.extractedCharCount,
        extractionError: refreshedResource.extractionError,
        visualExtractionStatus: refreshedResource.visualExtractionStatus,
        visualExtractedText: refreshedResource.visualExtractedText,
        visualExtractionError: refreshedResource.visualExtractionError,
        pageCount: refreshedResource.pageCount,
        pagesProcessed: refreshedResource.pagesProcessed,
        extractionProvider: refreshedResource.extractionProvider,
        fallbackReason: typeof refreshedResource.metadata.fallbackReason === 'string'
          ? refreshedResource.metadata.fallbackReason
          : surfaceResource.fallbackReason,
        previewState: typeof refreshedResource.metadata.previewState === 'string'
          ? refreshedResource.metadata.previewState as ModuleSourceResource['previewState']
          : surfaceResource.previewState,
        fullTextAvailable: typeof refreshedResource.metadata.fullTextAvailable === 'boolean'
          ? refreshedResource.metadata.fullTextAvailable
          : surfaceResource.fullTextAvailable,
        storedTextLength: typeof refreshedResource.metadata.storedTextLength === 'number'
          ? refreshedResource.metadata.storedTextLength
          : surfaceResource.storedTextLength,
        storedPreviewLength: typeof refreshedResource.metadata.storedPreviewLength === 'number'
          ? refreshedResource.metadata.storedPreviewLength
          : surfaceResource.storedPreviewLength,
        storedWordCount: typeof refreshedResource.metadata.storedWordCount === 'number'
          ? refreshedResource.metadata.storedWordCount
          : surfaceResource.storedWordCount,
      }
      finalQuality = getModuleResourceQualityInfo(surfaceResource)
      groundingStrategy = selectDeepLearnGroundingText(surfaceResource)
        ? 'source_refetch'
        : isDeepLearnScanFallbackCapable(refreshedResource)
          ? 'scan_fallback'
          : groundingStrategy
    } catch (error) {
      recoveryWarning = error instanceof Error
        ? error.message
        : 'Source retrieval failed before Deep Learn could recover stronger evidence.'
    }
  }

  const bestText = selectBestGroundingText(surfaceResource)
  if (bestText) {
    const promptGrounding = buildPromptGrounding({
      bestText,
      scanFallback: false,
    })

    const sourceGrounding = buildDeepLearnSourceGrounding(surfaceResource, finalQuality, groundingStrategy === 'insufficient' ? 'stored_extract' : groundingStrategy, recoveryWarning)
    sourceGrounding.charCount = bestText.length

    return {
      generationMode: 'text',
      promptGrounding,
      sourceGrounding,
      refreshedResource,
      scanFallbackInput: null,
    }
  }

  const scanFallbackResource = refreshedResource ?? input.storedResource
  if (isDeepLearnScanFallbackCapable(scanFallbackResource)) {
    try {
      const scanFallbackInput = await downloadScanFallbackSourceImpl(scanFallbackResource)
      const promptGrounding = buildPromptGrounding({
        bestText: '',
        scanFallback: true,
      })
      const sourceGrounding = buildDeepLearnSourceGrounding(surfaceResource, finalQuality, 'scan_fallback', recoveryWarning)

      return {
        generationMode: 'scan_fallback',
        promptGrounding,
        sourceGrounding,
        refreshedResource,
        scanFallbackInput,
      }
    } catch (error) {
      recoveryWarning = error instanceof Error
        ? error.message
        : 'Scan fallback could not download the original file.'
    }
  }

  if (recoveryWarning && selectDeepLearnGroundingText(input.resource)) {
    const fallbackText = selectBestGroundingText(input.resource)
    const promptGrounding = buildPromptGrounding({
      bestText: fallbackText,
      scanFallback: false,
    })
    const sourceGrounding = buildDeepLearnSourceGrounding(input.resource, currentQuality, 'stored_extract', recoveryWarning)
    sourceGrounding.charCount = fallbackText.length

    return {
      generationMode: 'text',
      promptGrounding,
      sourceGrounding,
      refreshedResource,
      scanFallbackInput: null,
    }
  }

  const blockedReason = detectDeepLearnBlockedReasonAfterSourceFetch(refreshedResource ?? input.storedResource)
  const blocked = buildDeepLearnBlockedReadiness({
    canonicalResourceId: input.storedResource.id,
    blockedReason,
    sourceNote: recoveryWarning ?? getDeepLearnSourceNote(surfaceResource, refreshedResource ?? input.storedResource, finalQuality),
    sourceType: input.storedResource.resourceType.toLowerCase().includes('page')
      ? 'page'
      : null,
  })

  throw new DeepLearnGenerationBlockedError({
    message: blocked.detail,
    blockedReason,
    refreshedResource,
    sourceGrounding: buildDeepLearnSourceGrounding(
      surfaceResource,
      finalQuality,
      groundingStrategy === 'scan_fallback' ? 'scan_fallback' : 'insufficient',
      blocked.detail,
    ),
  })
}

async function runDeepLearnStagePlan(
  input: DeepLearnPromptInput,
  grounding: DeepLearnPreparedGrounding,
  createResponse: DeepLearnResponseCreator,
  level: DeepLearnFallbackLevel,
  options: DeepLearnGenerationOptions,
  resume: {
    startStage?: DeepLearnStageKey
    seedOutput?: Record<string, unknown> | null
  } = {},
) {
  const stageOutput: Record<string, unknown> = {
    title: input.resource.title,
    overview: '',
    sections: [],
    answerBank: [],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [],
    cautionNotes: [],
    ...(resume.seedOutput ?? {}),
  }
  const stages = getDeepLearnStageDefinitions()
  const startIndex = resume.startStage
    ? Math.max(0, stages.findIndex((stage) => stage.key === resume.startStage))
    : 0

  for (const stage of stages.slice(startIndex)) {
    await options.onProgress?.({
      progress: getDeepLearnStageProgress(stage, level),
      statusMessage: buildDeepLearnStageStatusMessage(stage.key, level),
      stage: stage.key,
      compactFallbackUsed: level !== 'full',
    })

    try {
      const raw = await createStageResponse(
        input,
        grounding,
        stage,
        level,
        createResponse,
      )
      const parsed = parseStageResponse(raw, stage, level)
      mergeDeepLearnStageOutput(stageOutput, parsed)
      if (level !== 'full') trimDeepLearnStageOutput(stageOutput, level)
    } catch (error) {
      if (error instanceof DeepLearnGenerationStageError) {
        error.partialOutput = cloneStageOutput(stageOutput)
      }
      throw error
    }
  }

  const normalized = normalizeDeepLearnGeneratedContent(stageOutput, input.resource.title)
  const content = level === 'full' ? normalized : trimDeepLearnContent(normalized, level)
  assertDeepLearnContentReadyForSave(content)
  return content
}

export function validateDeepLearnContentReadyForSave(content: DeepLearnGeneratedContent) {
  const answerBankCount = content.answerBank.filter(hasMeaningfulAnswerBankItem).length
  const identificationCount = content.identificationItems.filter(hasMeaningfulIdentificationItem).length
  const quizTargetCount = content.likelyQuizTargets.filter(hasMeaningfulQuizTarget).length
  const hasStructuredStudyArtifacts = answerBankCount > 0
    && identificationCount > 0
    && quizTargetCount > 0

  if (!hasStructuredStudyArtifacts) {
    return {
      ok: false as const,
      message: DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE,
      counts: { answerBankCount, identificationCount, quizTargetCount },
    }
  }

  return {
    ok: true as const,
    message: null,
    counts: { answerBankCount, identificationCount, quizTargetCount },
  }
}

export function assertDeepLearnContentReadyForSave(content: DeepLearnGeneratedContent) {
  const validation = validateDeepLearnContentReadyForSave(content)
  if (!validation.ok) {
    throw new DeepLearnGeneratedContentValidationError(validation.message)
  }
}

export function buildDeepLearnPrompt(input: DeepLearnPromptInput, options: { compact?: boolean } = {}) {
  const compactRequirements = options.compact
    ? [
        '',
        'Compact retry limits:',
        '- Generate a shorter Study Pack now. Do not try to cover every source detail.',
        '- Study Pack sections: exactly these six headings or fewer: Source Summary, Big Picture, Key Concepts, Concept Relationships, Apply It, What to Study First.',
        '- Key Concepts: no more than 8.',
        '- Relationships/comparisons: no more than 3.',
        '- Application examples: no more than 2.',
        '- Reviewer reusable items: no more than 10 answerBank items and no more than 8 identificationItems.',
        '- likelyQuizTargets no more than 5; distinctions no more than 4.',
        '- Keep every explanation to one or two short sentences.',
      ]
    : []

  return [
    `Prompt version: ${DEEP_LEARN_PROMPT_VERSION}`,
    'Build a saved Deep Learn Study Pack for a single study resource.',
    'Use only the selected resource extracted text as factual grounding. Do not use module summaries, course context, assignment metadata, deadlines, prior packs, or surrounding Canvas/module context as study facts.',
    '',
    'Selected resource source text:',
    input.promptGrounding,
    '',
    'Output requirements:',
    '- Make answerBank the primary output. Each item should be a short student-facing answer, not a paragraph.',
    '- Keep the Study Pack compact: overview plus no more than 6 main support sections. Focus on Source Summary, Big Picture, Key Concepts, Concept Relationships, Apply It, and What to Study First.',
    '- Do not generate Reviewer, Quiz, Study Sheet, Cram Sheet, and Source Summary as separate documents in this pass.',
    '- Reviewer will reuse answerBank and identificationItems: preserve exact source wording first for definitions, enumerations, lists, formulas, terms, and quick recall.',
    '- Quiz will reuse exact wording for definition answers and Study Pack relationships for application questions; each quiz item must have a source basis.',
    '- Default output limits: answerBank 12 to 16 items, identificationItems no more than 16, likelyQuizTargets no more than 6, distinctions no more than 6, application examples no more than 3.',
    '- Favor one-line exam answers such as date -> event, law -> effect, term -> definition, place -> meaning, province -> capital, person -> role, and count recall.',
    '- For definitions and listed items, wording.exact must keep the teacher/source wording nearly 1:1. wording.examSafe should stay the same unless only tiny cleanup is needed.',
    '- Put plain-English explanations only in wording.simplified, simplifiedWording, draftExplanation, or supportingContext. Never blend them into wording.exact.',
    '- sourceSnippet should contain the closest exact source phrase that backs the item, especially for definitions and lists.',
    '- identificationItems should read like natural direct quiz prompts with compact answers.',
    '- likelyQuizTargets must rank high-yield items first instead of flattening everything.',
    '- Keep support sections short and secondary. Do not turn the output into a mini textbook.',
    '- If the evidence is partial, still extract what is clearly askable instead of refusing to help.',
    '- Keep distractors plausible but wrong according to the source.',
    '- Use sortKey only when a date or chronology is explicit enough to support timeline review.',
    '- Prioritize academic concepts, definitions, processes, comparisons, examples, formulas, calculations, listed topics, and learning outcomes.',
    '- Avoid course title, course code, academic year, credits, meeting schedule, room links, and instructor/admin labels unless the source contains only course overview facts.',
    '- Only treat something as a formula when the source shows a real quantitative equation, symbolic relationship, variable relationship, unit-bearing relationship, or calculation instruction.',
    '- Clean raw extraction labels before returning headings or cues: "IT Security -> definition" becomes "IT Security"; "what-is-it-security" becomes "IT Security"; "goals-cia" becomes "CIA Triad" if the source supports that heading.',
    '- For every review item, include reviewText, draftExplanation, sourceSnippet, and linkedDraftSectionId so Review can preview the deeper Draft/Structure support.',
    '- linkedDraftSectionId should be a short slug for the support section that best backs the item, or null when no section matches.',
    '- For every review item, include supportingContext, compareContext, simplifiedWording, confusionNotes, and relatedConcepts.',
    '- Use compareContext only when a contrast or neighboring concept helps prevent mistakes; otherwise return null.',
    '- Use confusionNotes for common wrong answers, traps, or look-alike terms; use an empty array when none are justified.',
    '- relatedConcepts should contain only source-grounded nearby concepts, not invented recommendations.',
    ...compactRequirements,
  ].join('\n')
}

function buildDeepLearnStagePrompt(
  input: DeepLearnPromptInput,
  stage: DeepLearnStageKey,
  options: { compact?: boolean; level?: DeepLearnFallbackLevel } = {},
) {
  const level = options.level ?? (options.compact ? 'compact' : 'full')
  const compact = level !== 'full'
  const compactInstruction = level === 'micro'
    ? 'Micro fallback is active. Return only short structured arrays with the strongest source-backed items. Do not write long explanations or prose-heavy sections.'
    : level === 'compact'
    ? 'Compact fallback is active. Keep bodies tight, keep only the highest-yield items, and prefer fewer stronger facts over broad coverage.'
    : 'Normal staged generation is active. Keep coverage grounded and useful, but still concise.'

  const stageRequirements = {
    high_yield: [
      'Build only the first stage of the Study Pack.',
      'Return title, overview, and sections only.',
      'sections must contain exactly these headings in order: Source Summary, High-Yield First.',
      level === 'micro'
        ? '- High-Yield First must contain no more than 5 short bullets total. Source Summary must be 1 short sentence.'
        : compact
        ? '- Source Summary and High-Yield First should each stay within 2 short paragraphs or 4 compact bullet-style lines.'
        : '- Source Summary and High-Yield First should stay concise and exam-focused, not textbook-length.',
      '- Do not return answerBank, identificationItems, distinctions, likelyQuizTargets, or cautionNotes in this stage.',
    ],
    identification: [
      'Build only the Identification Review stage.',
      'Return sections plus identificationItems only.',
      'sections must contain exactly one heading: Identification Review.',
      level === 'micro'
        ? '- identificationItems: no more than 8 key terms or direct prompts. Keep answers to one sentence.'
        : compact
        ? '- identificationItems: 4 to 6 strongest direct term/prompt items only.'
        : '- identificationItems: 8 to 12 direct source-grounded prompt/answer items.',
      '- The section body should summarize the strongest key terms without duplicating every answer verbatim.',
    ],
    quick_answers: [
      'Build only the Quick-Answer Blocks stage.',
      'Return sections plus answerBank only.',
      'sections must contain exactly one heading: Quick-Answer Blocks.',
      level === 'micro'
        ? '- answerBank: no more than 6 Quick Q&A items. Keep each answer to one sentence.'
        : compact
        ? '- answerBank: 6 to 8 strongest quick-answer items only.'
        : '- answerBank: 10 to 14 grounded quick-answer items.',
      '- Prefer definitions, processes, formulas, examples, and one-line exam answers.',
    ],
    distinctions: [
      'Build only the distinctions and likely-quiz-target stage.',
      'Return sections, distinctions, likelyQuizTargets, and cautionNotes only.',
      'sections may contain up to two headings in order: Distinctions, Likely Quiz Targets.',
      level === 'micro'
        ? '- distinctions: omit unless one short source-backed distinction is essential. likelyQuizTargets: no more than 5. cautionNotes: no more than 2.'
        : compact
        ? '- distinctions: no more than 3. likelyQuizTargets: no more than 4. cautionNotes: no more than 3.'
        : '- distinctions: 3 to 6. likelyQuizTargets: 4 to 6. cautionNotes: no more than 4.',
      '- Use cautionNotes only for grounded uncertainty, partial OCR, confusing wording, or source gaps that could cost points.',
    ],
  } satisfies Record<DeepLearnStageKey, string[]>

  return [
    `Prompt version: ${DEEP_LEARN_PROMPT_VERSION}`,
    `Deep Learn staged generation: ${stage}.`,
    'Use only the selected resource extracted text as factual grounding. Do not use module summaries, course context, assignment metadata, deadlines, prior packs, or surrounding Canvas/module context as study facts.',
    compactInstruction,
    '',
    'Selected resource source text:',
    input.promptGrounding,
    '',
    'Shared grounding rules:',
    '- Preserve exact source wording first for definitions, enumerations, lists, formulas, and explicit distinctions.',
    '- Keep every returned item compact, source-faithful, and reusable for Reviewer and Quiz.',
    '- Do not invent facts, examples, certainty, or missing steps.',
    '- Clean raw extraction labels before using them as headings or prompts.',
    '- If evidence is partial, keep the item but reflect that uncertainty in cautionNotes or simplified wording.',
    ...(level === 'micro' ? [
      '',
      'Micro fallback hard limits:',
      '- High-Yield First: max 5 bullets.',
      '- Key Terms: max 8 terms through identificationItems.',
      '- Quick Q&A: max 6 questions through answerBank.',
      '- Likely Quiz Targets: max 5 bullets.',
      '- Caution Notes: max 2 bullets.',
      '- No prose-heavy support sections. No long explanations.',
    ] : []),
    '',
    'Stage requirements:',
    ...stageRequirements[stage],
  ].join('\n')
}

async function createStageResponse(
  input: DeepLearnPromptInput,
  grounding: DeepLearnPreparedGrounding,
  stage: DeepLearnStageDefinition,
  level: DeepLearnFallbackLevel,
  createResponse: DeepLearnResponseCreator,
) {
  return withTimeout(
    createResponse({
      grounding,
      promptText: buildDeepLearnStagePrompt(input, stage.key, { level }),
      maxOutputTokens: getDeepLearnStageMaxOutputTokens(stage, level),
      schemaName: stage.schemaName,
      schema: stage.schema,
    }),
    DEEP_LEARN_STAGE_TIMEOUT_MS,
    new DeepLearnGenerationStageError({
      stage: stage.key,
      reason: `stage timed out after ${Math.round(DEEP_LEARN_STAGE_TIMEOUT_MS / 1000)} seconds`,
      level,
      kind: 'timeout',
    }),
  ).catch((error) => {
    if (error instanceof DeepLearnGenerationStageError) throw error
    throw new DeepLearnGenerationStageError({
      stage: stage.key,
      reason: error instanceof Error ? error.message : 'provider request failed',
      level,
      kind: 'provider',
    })
  })
}

function parseStageResponse(
  response: DeepLearnResponseLike,
  stage: DeepLearnStageDefinition,
  level: DeepLearnFallbackLevel,
) {
  if (response.status && response.status !== 'completed') {
    const reason = response.incomplete_details?.reason ?? response.status
    throw new DeepLearnGenerationStageError({
      stage: stage.key,
      reason,
      level,
      kind: isMaxOutputTokenReason(reason) ? 'size' : 'provider',
    })
  }

  const rawText = response.output_text?.trim()
  if (!rawText) {
    throw new DeepLearnGenerationStageError({
      stage: stage.key,
      reason: 'empty response',
      level,
      kind: 'empty',
    })
  }

  try {
    return JSON.parse(rawText) as Record<string, unknown>
  } catch {
    throw new DeepLearnGenerationStageError({
      stage: stage.key,
      reason: 'invalid JSON',
      level,
      kind: 'invalid_json',
    })
  }
}

function mergeDeepLearnStageOutput(target: Record<string, unknown>, parsed: Record<string, unknown>) {
  if (typeof parsed.title === 'string') target.title = parsed.title
  if (typeof parsed.overview === 'string') target.overview = parsed.overview

  const mergedSections = [
    ...(Array.isArray(target.sections) ? target.sections : []),
    ...(Array.isArray(parsed.sections) ? parsed.sections : []),
  ]
  target.sections = mergedSections

  for (const key of ['answerBank', 'identificationItems', 'distinctions', 'likelyQuizTargets', 'cautionNotes'] as const) {
    if (!Array.isArray(parsed[key])) continue
    const existing = Array.isArray(target[key]) ? target[key] : []
    target[key] = [...existing, ...parsed[key]]
  }
}

function getDeepLearnStageProgress(stage: DeepLearnStageDefinition, level: DeepLearnFallbackLevel) {
  if (level === 'micro') return stage.microProgress
  if (level === 'compact') return stage.compactProgress
  return stage.fullProgress
}

function getDeepLearnStageMaxOutputTokens(stage: DeepLearnStageDefinition, level: DeepLearnFallbackLevel) {
  if (level === 'micro') return stage.microMaxOutputTokens
  if (level === 'compact') return stage.compactMaxOutputTokens
  return stage.fullMaxOutputTokens
}

function cloneStageOutput(value: Record<string, unknown>) {
  return {
    title: value.title,
    overview: value.overview,
    sections: Array.isArray(value.sections) ? [...value.sections] : [],
    answerBank: Array.isArray(value.answerBank) ? [...value.answerBank] : [],
    identificationItems: Array.isArray(value.identificationItems) ? [...value.identificationItems] : [],
    distinctions: Array.isArray(value.distinctions) ? [...value.distinctions] : [],
    likelyQuizTargets: Array.isArray(value.likelyQuizTargets) ? [...value.likelyQuizTargets] : [],
    cautionNotes: Array.isArray(value.cautionNotes) ? [...value.cautionNotes] : [],
  }
}

function trimDeepLearnStageOutput(output: Record<string, unknown>, level: Exclude<DeepLearnFallbackLevel, 'full'>) {
  const limits = getFallbackLimits(level)
  if (Array.isArray(output.sections)) output.sections = output.sections.slice(0, limits.sections)
  if (Array.isArray(output.answerBank)) output.answerBank = output.answerBank.slice(0, limits.answerBank)
  if (Array.isArray(output.identificationItems)) output.identificationItems = output.identificationItems.slice(0, limits.identificationItems)
  if (Array.isArray(output.distinctions)) output.distinctions = output.distinctions.slice(0, limits.distinctions)
  if (Array.isArray(output.likelyQuizTargets)) output.likelyQuizTargets = output.likelyQuizTargets.slice(0, limits.likelyQuizTargets)
  if (Array.isArray(output.cautionNotes)) output.cautionNotes = output.cautionNotes.slice(0, limits.cautionNotes)
}

function trimDeepLearnContent(
  content: DeepLearnGeneratedContent,
  level: Exclude<DeepLearnFallbackLevel, 'full'>,
): DeepLearnGeneratedContent {
  const limits = getFallbackLimits(level)
  const cautionNotes = uniqueStringList([
    DEEP_LEARN_COMPACT_CAUTION_NOTE,
    ...(content.cautionNotes ?? []),
  ]).slice(0, limits.cautionNotes)

  return {
    ...content,
    sections: content.sections.slice(0, limits.sections).map((section) => ({
      ...section,
      body: level === 'micro' ? trimSectionBody(section.body, section.heading) : section.body,
    })),
    answerBank: content.answerBank.slice(0, limits.answerBank),
    identificationItems: content.identificationItems.slice(0, limits.identificationItems),
    distinctions: content.distinctions.slice(0, limits.distinctions),
    likelyQuizTargets: content.likelyQuizTargets.slice(0, limits.likelyQuizTargets),
    cautionNotes,
  }
}

function getFallbackLimits(level: Exclude<DeepLearnFallbackLevel, 'full'>) {
  return level === 'micro'
    ? {
        sections: 5,
        answerBank: 6,
        identificationItems: 8,
        distinctions: 1,
        likelyQuizTargets: 5,
        cautionNotes: 2,
      }
    : {
        sections: 6,
        answerBank: 10,
        identificationItems: 8,
        distinctions: 4,
        likelyQuizTargets: 5,
        cautionNotes: 3,
      }
}

function trimSectionBody(body: string, heading: string) {
  const lines = body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (/high-yield/i.test(heading)) return lines.slice(0, 5).join('\n') || truncateForModel(body, 520)
  if (/source summary/i.test(heading)) return truncateForModel(body, 260)
  return lines.slice(0, 3).join('\n') || truncateForModel(body, 420)
}

function uniqueStringList(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.replace(/\s+/g, ' ').trim()
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue
    seen.add(trimmed.toLowerCase())
    result.push(trimmed)
  }
  return result
}

function buildMinimalDeepLearnFallback(
  input: DeepLearnPromptInput,
  partialOutput: Record<string, unknown> | null,
) {
  const sourceSentences = extractStudySentences(input.promptGrounding)
  const summary = sourceSentences[0] ?? truncateForModel(input.promptGrounding, 240)
  const highYieldBullets = sourceSentences.slice(1, 6).map((sentence) => `- ${sentence}`)
  const derivedArtifacts = buildMinimalReviewerArtifacts(sourceSentences, input.resource.title)
  const fallbackOutput: Record<string, unknown> = {
    ...(partialOutput ?? {}),
    title: typeof partialOutput?.title === 'string' ? partialOutput.title : input.resource.title,
    overview: typeof partialOutput?.overview === 'string' && partialOutput.overview.trim()
      ? partialOutput.overview
      : summary,
    sections: [
      ...(Array.isArray(partialOutput?.sections) ? partialOutput.sections : []),
      { heading: 'Source Summary', body: summary },
      {
        heading: 'High-Yield First',
        body: highYieldBullets.length > 0
          ? highYieldBullets.join('\n')
          : '- Review the selected source directly for the strongest terms and definitions.',
      },
    ],
    answerBank: mergeFallbackArray(partialOutput?.answerBank, derivedArtifacts.answerBank),
    identificationItems: mergeFallbackArray(partialOutput?.identificationItems, derivedArtifacts.identificationItems),
    likelyQuizTargets: mergeFallbackArray(partialOutput?.likelyQuizTargets, derivedArtifacts.likelyQuizTargets),
    cautionNotes: uniqueStringList([
      ...(Array.isArray(partialOutput?.cautionNotes) ? partialOutput.cautionNotes.filter((item): item is string => typeof item === 'string') : []),
      DEEP_LEARN_COMPACT_CAUTION_NOTE,
    ]),
  }
  return trimDeepLearnContent(
    normalizeDeepLearnGeneratedContent(fallbackOutput, input.resource.title),
    'micro',
  )
}

function extractStudySentences(sourceText: string) {
  return sourceText
    .replace(/\[[^\]]*source excerpt[^\]]*\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 280)
    .filter((sentence) => !/^(?:course|module|file|source|extraction|grounding|metadata)\s*[:\-]/i.test(sentence))
    .slice(0, 12)
}

function buildMinimalReviewerArtifacts(sourceSentences: string[], fallbackTitle: string) {
  const usableSentences = sourceSentences.length > 0
    ? sourceSentences
    : [`${fallbackTitle} contains source material that should be reviewed directly for key terms and direct recall.`]
  const termCandidates = uniqueStringList(usableSentences.flatMap(extractTermCandidates)).slice(0, 6)
  const artifactSentences = usableSentences.slice(0, Math.max(3, Math.min(6, usableSentences.length)))

  const identificationItems = artifactSentences.slice(0, 5).map((sentence, index) => {
    const term = termCandidates[index] ?? buildSentenceCue(sentence, fallbackTitle)
    return {
      prompt: `Identify or explain: ${term}`,
      kind: 'term_definition' as const,
      answer: wordingFromSentence(sentence),
      importance: index < 3 ? 'high' as const : 'medium' as const,
      distractors: [],
      reviewText: term,
      draftExplanation: sentence,
      sourceSnippet: sentence,
      linkedDraftSectionId: null,
      supportingContext: sentence,
      compareContext: null,
      simplifiedWording: sentence,
      confusionNotes: [],
      relatedConcepts: termCandidates.filter((candidate) => candidate !== term).slice(0, 3),
    }
  })

  const answerBank = artifactSentences.slice(0, 6).map((sentence, index) => {
    const cue = termCandidates[index] ?? buildSentenceCue(sentence, fallbackTitle)
    return {
      cue,
      kind: 'fact' as const,
      answer: wordingFromSentence(sentence),
      compactAnswer: wordingFromSentence(truncateForModel(sentence, 180)),
      importance: index < 3 ? 'high' as const : 'medium' as const,
      sortKey: null,
      distractors: [],
      reviewText: cue,
      draftExplanation: sentence,
      sourceSnippet: sentence,
      linkedDraftSectionId: null,
      supportingContext: sentence,
      compareContext: null,
      simplifiedWording: sentence,
      confusionNotes: [],
      relatedConcepts: termCandidates.filter((candidate) => candidate !== cue).slice(0, 3),
    }
  })

  const likelyQuizTargets = artifactSentences.slice(0, 5).map((sentence, index) => {
    const target = termCandidates[index] ?? buildSentenceCue(sentence, fallbackTitle)
    return {
      target,
      reason: truncateForModel(sentence, 190),
      importance: index < 3 ? 'high' as const : 'medium' as const,
      reviewText: target,
      draftExplanation: sentence,
      sourceSnippet: sentence,
      linkedDraftSectionId: null,
      supportingContext: sentence,
      compareContext: null,
      simplifiedWording: sentence,
      confusionNotes: [],
      relatedConcepts: termCandidates.filter((candidate) => candidate !== target).slice(0, 3),
    }
  })

  return { answerBank, identificationItems, likelyQuizTargets }
}

function mergeFallbackArray(existing: unknown, derived: unknown[]) {
  return [
    ...(Array.isArray(existing) ? existing : []),
    ...derived,
  ]
}

function extractTermCandidates(sentence: string) {
  const candidates = new Set<string>()
  const beforeDefinition = sentence.match(/\b([A-Z][A-Za-z][A-Za-z\s/()-]{2,48})\s+(?:is|are|refers to|means|involves|includes|consists of)\b/g)
  for (const match of beforeDefinition ?? []) {
    const cleaned = match.replace(/\s+(?:is|are|refers to|means|involves|includes|consists of)$/i, '').trim()
    if (cleaned.length >= 3) candidates.add(cleaned)
  }
  const acronyms = sentence.match(/\b[A-Z]{2,8}\b/g) ?? []
  for (const acronym of acronyms) candidates.add(acronym)
  const nounish = sentence.match(/\b(?:confidentiality|integrity|availability|threats?|vulnerabilities|controls?|records?|fields?|database|organization|security|processing|warehouse|exercise|activity|recovery)\b/gi) ?? []
  for (const value of nounish) candidates.add(value.toLowerCase())
  return [...candidates]
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 3 && value.length <= 60)
}

function buildSentenceCue(sentence: string, fallbackTitle: string) {
  const words = sentence
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 5)
    .join(' ')
  return words || fallbackTitle
}

function wordingFromSentence(sentence: string) {
  const text = truncateForModel(sentence, 220)
  return {
    exact: text,
    examSafe: text,
    simplified: null,
  }
}

function hasMeaningfulAnswerBankItem(item: unknown) {
  if (!item || typeof item !== 'object') return false
  const record = item as { cue?: unknown; answer?: { exact?: unknown; examSafe?: unknown; simplified?: unknown } }
  return hasMeaningfulText(record.cue)
    && hasMeaningfulText(record.answer?.exact ?? record.answer?.examSafe ?? record.answer?.simplified)
}

function hasMeaningfulIdentificationItem(item: unknown) {
  if (!item || typeof item !== 'object') return false
  const record = item as { prompt?: unknown; answer?: { exact?: unknown; examSafe?: unknown; simplified?: unknown } }
  return hasMeaningfulText(record.prompt)
    && hasMeaningfulText(record.answer?.exact ?? record.answer?.examSafe ?? record.answer?.simplified)
}

function hasMeaningfulQuizTarget(item: unknown) {
  if (!item || typeof item !== 'object') return false
  const record = item as { target?: unknown; reason?: unknown }
  return hasMeaningfulText(record.target) && hasMeaningfulText(record.reason)
}

function hasMeaningfulText(value: unknown) {
  return typeof value === 'string' && value.replace(/\s+/g, ' ').trim().length >= 8
}

async function createDeepLearnResponse(
  client: OpenAI,
  request: DeepLearnResponseRequest,
) {
  const { grounding, promptText, maxOutputTokens, schema, schemaName } = request

  return grounding.generationMode === 'scan_fallback' && grounding.scanFallbackInput
    ? client.responses.create({
        model: getDeepLearnModel(),
        store: false,
        instructions: DEEP_LEARN_SYSTEM_PROMPT,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: promptText },
            grounding.scanFallbackInput.inputType === 'image'
              ? {
                  type: 'input_image',
                  detail: 'high',
                  image_url: `data:${grounding.scanFallbackInput.contentType ?? 'image/png'};base64,${grounding.scanFallbackInput.fileData}`,
                }
              : {
                  type: 'input_file',
                  filename: grounding.scanFallbackInput.filename,
                  file_data: grounding.scanFallbackInput.fileData,
                },
          ],
        }],
        text: responseTextConfig(schemaName, schema),
        max_output_tokens: maxOutputTokens,
      })
    : client.responses.create({
        model: getDeepLearnModel(),
        store: false,
        instructions: DEEP_LEARN_SYSTEM_PROMPT,
        input: promptText,
        text: responseTextConfig(schemaName, schema),
        max_output_tokens: maxOutputTokens,
      })
}

function isMaxOutputTokenReason(reason: string) {
  return reason.toLowerCase().includes('max_output_tokens')
}

function buildPromptGrounding(input: {
  bestText: string
  scanFallback: boolean
}) {
  const sourceBlock = input.bestText
    ? compactGroundingForModel(input.bestText, MAX_GROUNDING_CHARS)
    : 'The original file will be provided directly because dependable parsed text was not stored.'

  return sourceBlock
}

function selectBestGroundingText(resource: ModuleSourceResource) {
  const normalizedText = normalizeModuleResourceStudyText(selectDeepLearnGroundingText(resource))
  if (!normalizedText) return ''

  return normalizedText
}

function truncateForModel(value: string, maxChars: number) {
  if (value.length <= maxChars) return value

  const clipped = value.slice(0, maxChars)
  const breakIndex = Math.max(
    clipped.lastIndexOf('\n\n'),
    clipped.lastIndexOf('. '),
  )

  return clipped.slice(0, breakIndex > 280 ? breakIndex + 1 : maxChars).trim()
}

function compactGroundingForModel(value: string, maxChars: number) {
  if (value.length <= maxChars) return value

  const chunks = chunkGroundingText(value, 3600)
  if (chunks.length <= 2) return truncateForModel(value, maxChars)

  const first = chunks[0] ?? ''
  const middle = chunks[Math.floor(chunks.length / 2)] ?? ''
  const last = chunks[chunks.length - 1] ?? ''
  const selected = [
    '[Source excerpt 1: beginning]',
    truncateForModel(first, 3800),
    '',
    `[Source excerpt 2: middle of ${chunks.length} chunks]`,
    truncateForModel(middle, 3600),
    '',
    '[Source excerpt 3: end]',
    truncateForModel(last, 3600),
  ].join('\n')

  return truncateForModel(selected, maxChars)
}

function chunkGroundingText(value: string, targetChars: number) {
  const paragraphs = value
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return [value]
  const units = paragraphs.flatMap((paragraph) => {
    if (paragraph.length <= targetChars) return [paragraph]
    const sentences = paragraph.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean)
    return sentences.length > 1 ? sentences : [paragraph]
  })

  const chunks: string[] = []
  let current = ''
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > targetChars) {
      chunks.push(current.trim())
      current = unit
      continue
    }
    current = current ? `${current}\n\n${unit}` : unit
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

function getRequiredDeepLearnApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.')
  }

  return apiKey
}

function getDeepLearnModel() {
  return process.env.OPENAI_DEEP_LEARN_MODEL?.trim()
    || process.env.OPENAI_MODEL?.trim()
    || DEFAULT_DEEP_LEARN_MODEL
}

function buildDeepLearnSourceGrounding(
  resource: ModuleSourceResource,
  quality: ReturnType<typeof getModuleResourceQualityInfo>,
  groundingStrategy: DeepLearnSourceGrounding['groundingStrategy'],
  warning?: string | null,
): DeepLearnSourceGrounding {
  return {
    sourceType: getStudySourceTypeLabel({
      type: resource.type,
      kind: resource.kind,
      extension: resource.extension,
      contentType: resource.contentType,
    }),
    extractionQuality: quality.quality,
    sourceTextQuality: classifyExtractedTextQuality({
      text: selectDeepLearnGroundingText(resource),
      title: resource.title,
    }).quality,
    groundingStrategy,
    usedAiFallback: groundingStrategy === 'scan_fallback' || (quality.quality !== 'strong' && quality.quality !== 'usable'),
    qualityReason: quality.reason,
    warning: warning ?? resource.extractionError ?? resource.qualityReason ?? null,
    charCount: 0,
  }
}

function getDeepLearnSourceNote(
  resource: ModuleSourceResource,
  storedResource: ModuleResource,
  quality: ReturnType<typeof getModuleResourceQualityInfo>,
) {
  return resource.extractionError
    ?? storedResource.extractionError
    ?? resource.qualityReason
    ?? quality.reason
    ?? null
}

function buildDeepLearnStageStatusMessage(stage: DeepLearnStageKey, level: DeepLearnFallbackLevel) {
  const prefix = level === 'micro'
    ? 'Generating micro reviewer sections'
    : level === 'compact'
      ? 'Generating compact reviewer sections'
      : 'Generating study pack sections'
  if (stage === 'high_yield') return `${prefix}: High-Yield First.`
  if (stage === 'identification') return `${prefix}: Identification Review.`
  if (stage === 'quick_answers') return `${prefix}: Quick-Answer Blocks.`
  return `${prefix}: Distinctions and Likely Quiz Targets.`
}

function buildDeepLearnStageFailureMessage(options: DeepLearnStageErrorOptions) {
  const stageLabel = {
    high_yield: 'High-Yield First',
    identification: 'Identification Review',
    quick_answers: 'Quick-Answer Blocks',
    distinctions: 'Distinctions and Likely Quiz Targets',
  }[options.stage]

  if (options.kind === 'size') {
    const levelLabel = options.level === 'micro'
      ? 'micro fallback'
      : options.level === 'compact'
        ? 'compact fallback'
        : 'normal generation'
    return `${stageLabel} exceeded the model response size limit during ${levelLabel}.`
  }

  if (options.kind === 'timeout') {
    return `${stageLabel} timed out before Deep Learn could finish it.`
  }

  if (options.kind === 'invalid_json') {
    return `${stageLabel} returned malformed structured output.`
  }

  if (options.kind === 'empty') {
    return `${stageLabel} returned no structured output.`
  }

  return `${stageLabel} failed during Deep Learn generation: ${options.reason}.`
}

function buildDeepLearnIncompleteMessage(reason: string) {
  const parts = reason.split(':')
  const stageKey = (parts.length >= 3 ? parts[1] : parts[0]) as DeepLearnStageKey | undefined
  const stageLabel = stageKey
    ? {
        high_yield: 'High-Yield First',
        identification: 'Identification Review',
        quick_answers: 'Quick-Answer Blocks',
        distinctions: 'Distinctions and Likely Quiz Targets',
      }[stageKey]
    : null
  return stageLabel
    ? `${DEEP_LEARN_OUTPUT_TOO_LARGE_MESSAGE} Stage: ${stageLabel}.`
    : DEEP_LEARN_OUTPUT_TOO_LARGE_MESSAGE
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, error: Error) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(error), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

function responseTextConfig(schemaName: string, schema: Record<string, unknown>) {
  return {
    format: {
      type: 'json_schema' as const,
      name: schemaName,
      strict: true,
      schema,
    },
    verbosity: 'low' as const,
  }
}

function wordingSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['exact', 'examSafe', 'simplified'],
    properties: {
      exact: { type: ['string', 'null'] },
      examSafe: { type: 'string' },
      simplified: { type: ['string', 'null'] },
    },
  }
}

function answerBankSchema() {
  return DEEP_LEARN_RESPONSE_SCHEMA.properties.answerBank
}

function identificationItemsSchema() {
  return DEEP_LEARN_RESPONSE_SCHEMA.properties.identificationItems
}

function distinctionsSchema() {
  return DEEP_LEARN_RESPONSE_SCHEMA.properties.distinctions
}

function likelyQuizTargetsSchema() {
  return DEEP_LEARN_RESPONSE_SCHEMA.properties.likelyQuizTargets
}

function cautionNotesSchema() {
  return DEEP_LEARN_RESPONSE_SCHEMA.properties.cautionNotes
}

function reviewLinkSchemaProperties() {
  return {
    reviewText: { type: 'string' },
    draftExplanation: { type: ['string', 'null'] },
    sourceSnippet: { type: ['string', 'null'] },
    linkedDraftSectionId: { type: ['string', 'null'] },
    supportingContext: { type: ['string', 'null'] },
    compareContext: { type: ['string', 'null'] },
    simplifiedWording: { type: ['string', 'null'] },
    confusionNotes: {
      type: 'array',
      items: { type: 'string' },
    },
    relatedConcepts: {
      type: 'array',
      items: { type: 'string' },
    },
  }
}

function importanceSchema() {
  return {
    type: 'string',
    enum: ['high', 'medium', 'low'],
  }
}

async function downloadDeepLearnScanFallbackSource(resource: ModuleResource): Promise<DeepLearnPreparedBinaryInput> {
  const sourceUrl = resource.sourceUrl?.trim()
  if (!sourceUrl) {
    throw new Error('No stored source URL is available for scan fallback.')
  }

  const downloaded = shouldUseCanvasBinaryDownload(sourceUrl)
    ? await downloadCanvasBinarySource(sourceUrl)
    : await downloadGenericBinarySource(sourceUrl)

  const contentType = downloaded.contentType?.toLowerCase() ?? null
  const extension = resource.extension?.toLowerCase() ?? inferExtensionFromContentType(contentType)
  const filename = ensureFileExtension(resource.title, extension)

  if (contentType?.startsWith('image/')) {
    return {
      inputType: 'image',
      contentType,
      filename,
      fileData: downloaded.buffer.toString('base64'),
    }
  }

  return {
    inputType: 'file',
    contentType,
    filename,
    fileData: downloaded.buffer.toString('base64'),
  }
}

function shouldUseCanvasBinaryDownload(sourceUrl: string) {
  const canvasBaseUrl = process.env.CANVAS_API_URL?.trim() || process.env.CANVAS_API_BASE_URL?.trim()
  if (!canvasBaseUrl) return false

  try {
    const targetHost = new URL(sourceUrl, `${normalizeCanvasUrl(canvasBaseUrl)}/`).host
    const canvasHost = new URL(`${normalizeCanvasUrl(canvasBaseUrl)}/`).host
    return targetHost === canvasHost
  } catch {
    return false
  }
}

async function downloadGenericBinarySource(url: string) {
  const response = await fetch(url, {
    next: { revalidate: 0 },
  })

  if (!response.ok) {
    throw new Error(`Source download failed with HTTP ${response.status}.`)
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
    url,
  }
}

function inferExtensionFromContentType(contentType: string | null) {
  if (!contentType) return 'pdf'
  if (contentType.includes('pdf')) return 'pdf'
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  if (contentType.includes('webp')) return 'webp'
  return 'pdf'
}

function ensureFileExtension(title: string, extension: string | null | undefined) {
  const trimmedTitle = title.trim() || 'deep-learn-source'
  if (!extension) return trimmedTitle
  if (trimmedTitle.toLowerCase().endsWith(`.${extension}`)) return trimmedTitle
  return `${trimmedTitle}.${extension}`
}
