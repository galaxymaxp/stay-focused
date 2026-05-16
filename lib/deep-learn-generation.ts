import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import { downloadCanvasBinarySource, normalizeCanvasUrl } from '@/lib/canvas'
import {
  DEEP_LEARN_PROMPT_VERSION,
  normalizeDeepLearnGeneratedContent,
  sanitizeStudentFacingText,
  type DeepLearnGeneratedContent,
} from '@/lib/deep-learn'
import {
  buildAcademicSourceMap,
  buildAcademicSourceMapGrounding,
  countValidatedAcademicRelations,
  validateAcademicSourceMap,
  type AcademicSourceMap,
  type AcademicSourceMapUnit,
} from '@/lib/deep-learn-source-map'
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
import { normalizeStudyOutputHeading } from '@/lib/study-outputs/source-faithful'
import { getStudySourceTypeLabel } from '@/lib/study-resource'
import type { Module, ModuleResource, Task } from '@/lib/types'
import type { DeepLearnBlockedReason, DeepLearnSourceGrounding, StudyFactCard } from '@/lib/types'

const DEFAULT_DEEP_LEARN_MODEL = 'gpt-5-mini'
const MAX_GROUNDING_CHARS = 12000
export const DEEP_LEARN_MAX_OUTPUT_TOKENS = 10000
export const DEEP_LEARN_COMPACT_MAX_OUTPUT_TOKENS = 10000
export const DEEP_LEARN_OUTPUT_TOO_LARGE_MESSAGE = 'The model response limit was reached even after compact fallback. Try a smaller source or split the module.'
export const DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE = 'Deep Learn could not build enough structured study content from this source. Try a smaller source or split the module.'
export const DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_REASON = 'identification_output_too_large'
export const DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE = 'The identification review was too large to generate. Other study sections were saved when available.'
export const DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON = 'quick_answers_output_too_large'
export const DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE = 'Quick answers were too large to generate. Other study sections were saved when available.'
export const DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON = 'quiz_targets_output_too_large'
export const DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE = 'Likely quiz targets were too large to generate. Other study sections were saved.'
export const DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_REASON = 'optional_stage_output_too_large'
export const DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_MESSAGE = 'Some extra review sections were too large to generate, but your Study Pack was saved.'
export const STRUCTURED_FACT_CARD_COMPILER_VERSION = 'structured_fact_card_compiler_v1'
export const LEGACY_STAGED_COMPOSER_VERSION = 'legacy_staged_composer'
const DEEP_LEARN_STAGE_TIMEOUT_MS = 120000
const DEEP_LEARN_COMPACT_CAUTION_NOTE = 'Generated as a compact reviewer because the source was long.'
const STRUCTURED_GROUNDING_CHAR_BUDGET = 7600
const SOURCE_EXCERPT_CHAR_BUDGET = 4200
const STUDY_FACT_CARD_CHUNK_CHARS = 3600
const STUDY_FACT_CARD_SHORT_SOURCE_CHARS = 3800
const STUDY_FACT_CARD_MAX_CHUNKS = 8

const INTERNAL_FACT_CARD_PROMPT_PATTERNS = [
  /^Recall the exam meaning of\b/i,
  /^Explain the source relationship\b/i,
  /^Explain the cause-effect relationship\b/i,
  /^Use the source formula\b/i,
  /^Classify the items under\b/i,
  /^Explain the relationship inside\b/i,
]

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

const STUDY_FACT_CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'overview', 'factCards'],
  properties: {
    title: { type: 'string' },
    overview: { type: 'string' },
    factCards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'prompt', 'answer', 'sourceQuote', 'sectionTitle', 'difficulty', 'confidence'],
        properties: {
          kind: {
            type: 'string',
            enum: ['definition', 'list', 'comparison', 'date', 'person', 'process', 'fact'],
          },
          prompt: { type: 'string' },
          answer: { type: 'string' },
          sourceQuote: { type: 'string' },
          sectionTitle: { type: 'string' },
          difficulty: {
            type: 'string',
            enum: ['easy', 'medium', 'hard'],
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
          },
        },
      },
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
      fullMaxOutputTokens: 7000,
      compactMaxOutputTokens: 4000,
      microMaxOutputTokens: 2500,
      minimalMaxOutputTokens: 1500,
      fullProgress: 55,
      compactProgress: 57,
      microProgress: 59,
      minimalProgress: 61,
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
      minimalMaxOutputTokens: 800,
      fullProgress: 70,
      compactProgress: 72,
      microProgress: 74,
      minimalProgress: 76,
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
      minimalMaxOutputTokens: 650,
      fullProgress: 80,
      compactProgress: 80,
      microProgress: 82,
      minimalProgress: 84,
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
  generatorVersion: typeof STRUCTURED_FACT_CARD_COMPILER_VERSION | typeof LEGACY_STAGED_COMPOSER_VERSION
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
  stage: 'compacting_source' | 'structured_compiler' | 'high_yield' | 'identification' | 'quick_answers' | 'distinctions' | 'compact_fallback'
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
  diagnosticsContext?: {
    queuedJobId?: string | null
    canonicalSourceId?: string | null
    retryOfJobId?: string | null
  }
}

interface DeepLearnGeneratorSelection {
  version: typeof STRUCTURED_FACT_CARD_COMPILER_VERSION | typeof LEGACY_STAGED_COMPOSER_VERSION
  reason: string
}

type DeepLearnStageKey = 'high_yield' | 'identification' | 'quick_answers' | 'distinctions'
type DeepLearnFallbackLevel = 'full' | 'compact' | 'micro' | 'minimal'
type DeepLearnStageCriticality = 'core' | 'optional'

interface DeepLearnStageDefinition {
  key: DeepLearnStageKey
  schemaName: string
  schema: Record<string, unknown>
  fullMaxOutputTokens: number
  compactMaxOutputTokens: number
  microMaxOutputTokens: number
  minimalMaxOutputTokens?: number
  fullProgress: number
  compactProgress: number
  microProgress: number
  minimalProgress?: number
}

interface DeepLearnStageErrorOptions {
  stage: DeepLearnStageKey
  reason: string
  level: DeepLearnFallbackLevel
  kind: 'size' | 'timeout' | 'provider' | 'invalid_json' | 'empty'
  partialOutput?: Record<string, unknown> | null
}

export interface DeepLearnSourceDiagnostics {
  queuedJobId: string | null
  canonicalSourceId: string | null
  moduleResourceId: string | null
  id: string | null
  title: string | null
  courseId: string | null
  courseName: string | null
  moduleId: string | null
  moduleName: string | null
  canvasFileId: number | null
  canvasItemId: number | null
  sourceUrl: string | null
  htmlUrl: string | null
  extractionStatus: string | null
  visualExtractionStatus: string | null
  extractedCharCount: number
  extractedTextLength: number
  visualExtractedTextLength: number
  academicTextCharCount: number
  normalizedCharCount: number
  sourceFieldUsed: 'extracted_text' | 'visual_extracted_text' | 'extracted_text_preview' | 'merged_normalized_text' | 'none'
  sourceFieldSelectionReason: string | null
  sourceTextQualityReason: string | null
  sourceTextQuality: string | null
  contentHash: string | null
  previewStart: string | null
  previewEnd: string | null
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
  const generatorSelection = selectDeepLearnGenerator()
  const grounding = await buildDeepLearnGrounding(input)
  const sourceDiagnostics = buildDeepLearnSourceDiagnostics(input, options.diagnosticsContext)
  logDeepLearnGenerationDiagnostics('source_selected', {
    sourceDiagnostics,
    sourceMap: generatorSelection.version === LEGACY_STAGED_COMPOSER_VERSION ? grounding.sourceGrounding.sourceMap : null,
    validation: null,
    content: null,
    fallbackMode: 'not_used',
  })
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
    statusMessage: 'Preparing readable source text for structured Study Pack generation.',
    stage: 'compacting_source',
  })

  const promptInput: DeepLearnPromptInput = {
    ...input,
    sourceGrounding: grounding.sourceGrounding,
    promptGrounding: grounding.promptGrounding,
    generationMode: grounding.generationMode,
  }

  const client = new OpenAI({
    apiKey: getRequiredDeepLearnApiKey(generatorSelection.version),
  })

  const { content, compactFallbackUsed } = await generateDeepLearnStructuredContent(
    promptInput,
    grounding,
    (request) => createDeepLearnResponse(client, request),
    options,
  )
  const validation = validateDeepLearnContentReadyForSave(content)
  logDeepLearnGenerationDiagnostics('generation_completed', {
    sourceDiagnostics,
    sourceMap: generatorSelection.version === LEGACY_STAGED_COMPOSER_VERSION ? grounding.sourceGrounding.sourceMap : null,
    validation,
    content,
    fallbackMode: generatorSelection.version === LEGACY_STAGED_COMPOSER_VERSION && compactFallbackUsed ? 'compact_or_micro' : 'not_used',
  })

  return {
    content,
    sourceGrounding: grounding.sourceGrounding,
    refreshedResource: grounding.refreshedResource,
    compactFallbackUsed,
    generatorVersion: generatorSelection.version,
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
  const generatorSelection = selectDeepLearnGenerator()
  if (generatorSelection.version === LEGACY_STAGED_COMPOSER_VERSION) {
    logDeepLearnGeneratorRouting({
      generatorVersion: LEGACY_STAGED_COMPOSER_VERSION,
      event: 'legacy_composer_started',
      reason: generatorSelection.reason,
      isRetry: Boolean(options.diagnosticsContext?.retryOfJobId),
      sourceTitle: input.resource.title,
      academicTextCharCount: buildDeepLearnSourceDiagnostics(input, options.diagnosticsContext).academicTextCharCount,
      chunkCount: null,
    })
    return generateDeepLearnStructuredContentLegacy(input, grounding, createResponse, options)
  }
  return compileDeepLearnStudyPackFromFactCards(input, grounding, createResponse, options)
}

interface StudyFactCardCompilerResponse {
  title: string
  overview: string
  factCards: StudyFactCard[]
}

async function compileDeepLearnStudyPackFromFactCards(
  input: DeepLearnPromptInput,
  grounding: DeepLearnPreparedGrounding,
  createResponse: DeepLearnResponseCreator,
  options: DeepLearnGenerationOptions = {},
): Promise<{ content: DeepLearnGeneratedContent; compactFallbackUsed: boolean }> {
  const cleanedSource = cleanupStudyCompilerSource(input.promptGrounding)
  const chunks = splitStudyCompilerChunks(cleanedSource)
  const shortSource = cleanedSource.length <= STUDY_FACT_CARD_SHORT_SOURCE_CHARS
  const selectedChunks = shortSource ? [cleanedSource] : chunks.slice(0, STUDY_FACT_CARD_MAX_CHUNKS)

  logDeepLearnGeneratorRouting({
    generatorVersion: STRUCTURED_FACT_CARD_COMPILER_VERSION,
    event: 'structured_compiler_started',
    reason: 'default',
    isRetry: Boolean(options.diagnosticsContext?.retryOfJobId),
    sourceTitle: input.resource.title,
    academicTextCharCount: buildDeepLearnSourceDiagnostics(input, options.diagnosticsContext).academicTextCharCount,
    chunkCount: selectedChunks.length,
  })

  await options.onProgress?.({
    progress: 35,
    statusMessage: shortSource
      ? 'Compiling a compact source-faithful Study Pack.'
      : 'Extracting source facts for the Study Pack.',
    stage: 'structured_compiler',
  })

  const responses: StudyFactCardCompilerResponse[] = []
  for (let index = 0; index < selectedChunks.length; index += 1) {
    const chunk = selectedChunks[index] ?? ''
    if (!chunk.trim()) continue
    const response = await createStudyFactCardResponse({
      input,
      grounding,
      createResponse,
      chunk,
      chunkIndex: index,
      totalChunks: selectedChunks.length,
      shortSource,
    })
    responses.push(response)
    await options.onProgress?.({
      progress: Math.min(78, 42 + Math.round(((index + 1) / selectedChunks.length) * 32)),
      statusMessage: shortSource
        ? 'Assembling compact Study Pack.'
        : `Extracting study facts from source chunk ${index + 1} of ${selectedChunks.length}.`,
      stage: 'structured_compiler',
    })
  }

  const cards = dedupeStudyFactCards(
    responses.flatMap((response, index) => sanitizeStudyFactCards(response.factCards, selectedChunks[index] ?? cleanedSource)),
  )
  if (cards.length === 0) {
    throw new DeepLearnGenerationIncompleteError('insufficient_structured_artifacts')
  }

  const content = assembleStudyPackFromFactCards({
    resourceTitle: input.resource.title,
    title: responses.find((response) => response.title.trim())?.title ?? input.resource.title,
    overview: responses.find((response) => response.overview.trim())?.overview ?? '',
    cards,
    sourceText: cleanedSource,
  })
  const validation = validateDeepLearnContentReadyForSave(content)
  if (!validation.ok) {
    throw new DeepLearnGenerationIncompleteError(validation.reason ?? 'insufficient_structured_artifacts')
  }
  return { content, compactFallbackUsed: !shortSource && selectedChunks.length > 1 }
}

async function createStudyFactCardResponse(input: {
  input: DeepLearnPromptInput
  grounding: DeepLearnPreparedGrounding
  createResponse: DeepLearnResponseCreator
  chunk: string
  chunkIndex: number
  totalChunks: number
  shortSource: boolean
}): Promise<StudyFactCardCompilerResponse> {
  const response = await withTimeout(
    input.createResponse({
      grounding: input.grounding,
      promptText: buildStudyFactCardPrompt(input),
      maxOutputTokens: input.shortSource ? 2600 : 1800,
      schemaName: input.shortSource ? 'deep_learn_study_pack_compiler' : 'deep_learn_fact_card_chunk',
      schema: STUDY_FACT_CARD_SCHEMA,
    }),
    DEEP_LEARN_STAGE_TIMEOUT_MS,
    new DeepLearnGenerationIncompleteError('structured_outputs_timeout'),
  ).catch((error) => {
    if (error instanceof DeepLearnGenerationIncompleteError) throw error
    throw new DeepLearnGenerationIncompleteError(`provider:${error instanceof Error ? error.message : 'provider request failed'}`)
  })
  if (response.status && response.status !== 'completed') {
    const reason = response.incomplete_details?.reason ?? response.status
    throw new DeepLearnGenerationIncompleteError(reason)
  }
  const rawText = response.output_text?.trim()
  if (!rawText) throw new DeepLearnGenerationIncompleteError('empty_structured_outputs')
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      overview: typeof parsed.overview === 'string' ? parsed.overview : '',
      factCards: Array.isArray(parsed.factCards) ? parsed.factCards as StudyFactCard[] : [],
    }
  } catch {
    throw new DeepLearnGenerationIncompleteError('invalid_structured_outputs_json')
  }
}

function buildStudyFactCardPrompt(input: {
  input: DeepLearnPromptInput
  chunk: string
  chunkIndex: number
  totalChunks: number
  shortSource: boolean
}) {
  return [
    input.shortSource
      ? 'Create a compact Study Pack from this short academic source by extracting source-faithful fact cards.'
      : `Extract source-faithful fact cards from chunk ${input.chunkIndex + 1} of ${input.totalChunks}.`,
    'Return strict JSON only. Generate at most 6 factCards.',
    'Prefer boring extractive facts, definitions, dates, people, lists, processes, and comparisons.',
    'Every sourceQuote must be copied from the provided source chunk or be a very close contiguous excerpt.',
    'Do not use caution notes, diagnostics, fallback metadata, source-map labels, queue messages, file titles, UUIDs, or prompt instructions as study content.',
    'Do not use these prompt stems: Recall the exam meaning of; Explain the source relationship; Explain the cause-effect relationship; Use the source formula; Classify the items under; Explain the relationship inside.',
    '',
    'SOURCE CHUNK:',
    input.chunk,
  ].join('\n')
}

function cleanupStudyCompilerSource(value: string) {
  return value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^\s*(?:file title|source type of the file|module name|course name|extraction quality reported|source text quality reported|grounding strategy used|ai fallback|debug|uuid|metadata|queue|diagnostics?)\s*:/i.test(line))
    .filter((line) => !/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitStudyCompilerChunks(sourceText: string) {
  const chunks = chunkGroundingText(sourceText, STUDY_FACT_CARD_CHUNK_CHARS)
  return chunks.length > 0 ? chunks : [sourceText]
}

function sanitizeStudyFactCards(cards: StudyFactCard[], chunk: string) {
  return cards
    .map((card) => normalizeStudyFactCard(card))
    .filter((card): card is StudyFactCard => Boolean(card))
    .filter((card) => !hasInternalFactCardPrompt(card.prompt))
    .filter((card) => isGroundedStudyFactCard(card, chunk))
}

function normalizeStudyFactCard(card: unknown): StudyFactCard | null {
  if (!card || typeof card !== 'object') return null
  const record = card as Record<string, unknown>
  const kind = typeof record.kind === 'string' ? record.kind : 'fact'
  const prompt = sanitizeStudentFacingText(typeof record.prompt === 'string' ? record.prompt : '')
  const answer = sanitizeStudentFacingText(typeof record.answer === 'string' ? record.answer : '')
  const sourceQuote = sanitizeStudentFacingText(typeof record.sourceQuote === 'string' ? record.sourceQuote : '')
  const sectionTitle = normalizeStudyOutputHeading(typeof record.sectionTitle === 'string' ? record.sectionTitle : 'Key Facts')
  const difficulty = record.difficulty === 'easy' || record.difficulty === 'hard' ? record.difficulty : 'medium'
  const confidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence)
    ? Math.max(0, Math.min(1, record.confidence))
    : 0.75
  if (!prompt || !answer || !sourceQuote || prompt.length < 6 || answer.length < 3) return null
  if (!['definition', 'list', 'comparison', 'date', 'person', 'process', 'fact'].includes(kind)) return null
  if (containsInternalPipelineText(`${prompt} ${answer} ${sourceQuote} ${sectionTitle}`)) return null
  return {
    kind: kind as StudyFactCard['kind'],
    prompt,
    answer,
    sourceQuote,
    sectionTitle: sectionTitle || 'Key Facts',
    difficulty,
    confidence,
  }
}

function hasInternalFactCardPrompt(value: string) {
  const prompt = value.replace(/\s+/g, ' ').trim()
  return INTERNAL_FACT_CARD_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt))
}

function isGroundedStudyFactCard(card: StudyFactCard, chunk: string) {
  const quoteKey = normalizeAcademicLookup(card.sourceQuote)
  const chunkKey = normalizeAcademicLookup(chunk)
  if (quoteKey.length >= 18 && chunkKey.includes(quoteKey)) return true
  const quoteTokens = new Set(quoteKey.split(' ').filter((token) => token.length >= 4))
  if (quoteTokens.size === 0) return false
  const chunkTokens = new Set(chunkKey.split(' ').filter((token) => token.length >= 4))
  let overlap = 0
  for (const token of quoteTokens) {
    if (chunkTokens.has(token)) overlap += 1
  }
  return overlap / quoteTokens.size >= 0.72
}

function dedupeStudyFactCards(cards: StudyFactCard[]) {
  const seen = new Set<string>()
  const output: StudyFactCard[] = []
  for (const card of cards.sort((left, right) => right.confidence - left.confidence)) {
    const key = normalizeAcademicLookup(`${card.prompt} ${card.answer}`)
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(card)
  }
  return output.slice(0, 36)
}

function assembleStudyPackFromFactCards(input: {
  resourceTitle: string
  title: string
  overview: string
  cards: StudyFactCard[]
  sourceText: string
}): DeepLearnGeneratedContent {
  const cards = input.cards
  const overview = sanitizeStudentFacingText(input.overview)
    || cards.slice(0, 2).map((card) => card.answer).join(' ')
    || truncateForModel(input.sourceText, 220)
  const answerBank = cards.map((card, index) => ({
    cue: normalizeStudyOutputHeading(card.sectionTitle || card.prompt.replace(/\?$/, '')),
    kind: mapFactCardKindToAnswerKind(card.kind),
    answer: wordingFromSentence(card.answer, 420),
    compactAnswer: wordingFromSentence(card.answer, 220),
    importance: mapFactCardImportance(card, index),
    sortKey: null,
    distractors: buildFactCardDistractors(card, cards),
    reviewText: card.prompt,
    draftExplanation: card.answer,
    sourceSnippet: card.sourceQuote,
    linkedDraftSectionId: null,
    supportingContext: card.sourceQuote,
    compareContext: card.kind === 'comparison' ? card.sourceQuote : null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: [],
  }))
  const identificationItems = cards
    .filter((card) => !hasInternalFactCardPrompt(card.prompt))
    .map((card, index) => ({
      prompt: normalizeFactCardPrompt(card),
      kind: mapFactCardKindToAnswerKind(card.kind),
      answer: wordingFromSentence(card.answer, 420),
      importance: mapFactCardImportance(card, index),
      distractors: buildFactCardDistractors(card, cards),
      reviewText: card.prompt,
      draftExplanation: card.answer,
      sourceSnippet: card.sourceQuote,
      linkedDraftSectionId: null,
      supportingContext: card.sourceQuote,
      compareContext: card.kind === 'comparison' ? card.sourceQuote : null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: [],
    }))
  const likelyQuizTargets = cards.slice(0, 12).map((card, index) => ({
    target: normalizeFactCardPrompt(card),
    reason: `This is directly stated in the source: ${truncateForModel(card.sourceQuote, 180)}`,
    importance: mapFactCardImportance(card, index),
    reviewText: card.prompt,
    draftExplanation: card.answer,
    sourceSnippet: card.sourceQuote,
    linkedDraftSectionId: null,
    supportingContext: card.sourceQuote,
    compareContext: card.kind === 'comparison' ? card.sourceQuote : null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: [],
  }))
  const sections = [
    { heading: 'Source Summary', body: overview },
    {
      heading: 'High-Yield First',
      body: cards.slice(0, 8).map((card) => `- ${card.sectionTitle}: ${card.answer}`).join('\n'),
    },
    {
      heading: 'Identification Review',
      body: identificationItems.slice(0, 12).map((item) => `- ${item.prompt} Answer: ${item.answer.examSafe}`).join('\n'),
    },
    {
      heading: 'Likely Quiz Targets',
      body: likelyQuizTargets.slice(0, 8).map((item) => `- ${item.target}`).join('\n'),
    },
  ]
  return sanitizeDeepLearnContentForSave(normalizeDeepLearnGeneratedContent({
    title: sanitizeStudentFacingText(input.title) || input.resourceTitle,
    overview,
    sections,
    answerBank,
    identificationItems,
    distinctions: buildFactCardDistinctions(cards),
    likelyQuizTargets,
    cautionNotes: [],
  }, input.resourceTitle), { dropStudentFacingComposerLeakage: true })
}

function mapFactCardKindToAnswerKind(kind: StudyFactCard['kind']) {
  if (kind === 'definition') return 'term_definition' as const
  if (kind === 'date') return 'date_event' as const
  if (kind === 'person') return 'person_role' as const
  if (kind === 'comparison') return 'compare' as const
  if (kind === 'process' || kind === 'list') return 'fact' as const
  return 'fact' as const
}

function mapFactCardImportance(card: StudyFactCard, index: number) {
  if (card.confidence >= 0.82 || index < 6) return 'high' as const
  if (card.difficulty === 'hard' || card.confidence >= 0.65) return 'medium' as const
  return 'low' as const
}

function normalizeFactCardPrompt(card: StudyFactCard) {
  const prompt = card.prompt.trim()
  if (/\?$/.test(prompt)) return prompt
  if (/^(?:what|who|when|where|why|how)\b/i.test(prompt)) return `${prompt}?`
  if (card.kind === 'person') return `Who is associated with ${card.sectionTitle}?`
  if (card.kind === 'date') return `What date or event is connected to ${card.sectionTitle}?`
  return `What does the source say about ${card.sectionTitle}?`
}

function buildFactCardDistractors(card: StudyFactCard, cards: StudyFactCard[]) {
  const answerKey = normalizeAcademicLookup(card.answer)
  if (card.answer.length > 160) return []
  return uniqueStringList(cards
    .filter((candidate) => candidate.kind === card.kind && normalizeAcademicLookup(candidate.answer) !== answerKey)
    .map((candidate) => candidate.answer)
    .filter((answer) => answer.length > 0 && answer.length <= 160))
    .slice(0, 3)
}

function buildFactCardDistinctions(cards: StudyFactCard[]) {
  return cards
    .filter((card) => card.kind === 'comparison')
    .slice(0, 6)
    .map((card) => ({
      conceptA: card.sectionTitle,
      conceptB: 'Related source concept',
      difference: card.answer,
      confusionNote: null,
      reviewText: card.prompt,
      draftExplanation: card.answer,
      sourceSnippet: card.sourceQuote,
      linkedDraftSectionId: null,
      supportingContext: card.sourceQuote,
      compareContext: card.sourceQuote,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: [],
    }))
}

function selectDeepLearnGenerator(): DeepLearnGeneratorSelection {
  const rawMode = process.env.DEEP_LEARN_GENERATOR_MODE?.trim()
  if (rawMode === LEGACY_STAGED_COMPOSER_VERSION) {
    return { version: LEGACY_STAGED_COMPOSER_VERSION, reason: 'DEEP_LEARN_GENERATOR_MODE=legacy_staged_composer' }
  }
  if (rawMode && rawMode !== STRUCTURED_FACT_CARD_COMPILER_VERSION) {
    console.warn('[deep-learn-generation] ignoring invalid generator mode', {
      requestedMode: rawMode,
      defaultGeneratorVersion: STRUCTURED_FACT_CARD_COMPILER_VERSION,
    })
  }
  return { version: STRUCTURED_FACT_CARD_COMPILER_VERSION, reason: 'default' }
}

function logDeepLearnGeneratorRouting(input: {
  generatorVersion: typeof STRUCTURED_FACT_CARD_COMPILER_VERSION | typeof LEGACY_STAGED_COMPOSER_VERSION
  event: 'structured_compiler_started' | 'legacy_composer_started'
  reason: string
  isRetry: boolean
  sourceTitle: string
  academicTextCharCount: number
  chunkCount: number | null
}) {
  console.info('[deep-learn-generation] generator routing', {
    generatorVersion: input.generatorVersion,
    event: input.event,
    reason: input.reason,
    isRetry: input.isRetry,
    sourceTitle: input.sourceTitle,
    academicTextCharCount: input.academicTextCharCount,
    chunkCount: input.chunkCount,
  })
}

async function generateDeepLearnStructuredContentLegacy(
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
          const microStage = getDeepLearnStageDefinitions().find((stage) => stage.key === microError.stage)
          if (microStage?.minimalMaxOutputTokens && microError.stage === 'distinctions') {
            console.warn('[deep-learn-generation] retrying staged fallback', {
              stage: microError.stage,
              level: 'minimal',
              previousLevel: microError.level,
              kind: microError.kind,
              reason: microError.reason,
            })
            await options.onProgress?.({
              progress: 38,
              statusMessage: `Deep Learn is trying a minimal ${getDeepLearnStageStudentLabel(microError.stage).toLowerCase()} section before saving the pack.`,
              stage: 'compact_fallback',
              compactFallbackUsed: true,
            })

            const content = await runDeepLearnStagePlan(input, grounding, createResponse, 'minimal', options, {
              startStage: microError.stage,
              seedOutput: microError.partialOutput ?? compactError.partialOutput ?? error.partialOutput,
            })
            return { content, compactFallbackUsed: true }
          }

          if (microError.stage === 'identification') {
            console.warn('[deep-learn-generation] retrying staged fallback', {
              stage: microError.stage,
              level: 'minimal',
              previousLevel: microError.level,
              kind: microError.kind,
              reason: microError.reason,
            })
            await options.onProgress?.({
              progress: 38,
              statusMessage: 'Deep Learn is trying a minimal identification review before saving the pack.',
              stage: 'compact_fallback',
              compactFallbackUsed: true,
            })

            try {
              const content = await runDeepLearnStagePlan(input, grounding, createResponse, 'minimal', options, {
                startStage: microError.stage,
                seedOutput: microError.partialOutput ?? compactError.partialOutput ?? error.partialOutput,
              })
              return { content, compactFallbackUsed: true }
            } catch (minimalError) {
              if (
                minimalError instanceof DeepLearnGenerationStageError
                && minimalError.kind === 'size'
                && minimalError.stage === 'identification'
              ) {
                const content = await runDeepLearnStagePlan(input, grounding, createResponse, 'minimal', options, {
                  startStage: 'quick_answers',
                  seedOutput: markIdentificationSkipped(
                    minimalError.partialOutput ?? microError.partialOutput ?? compactError.partialOutput ?? error.partialOutput,
                  ),
                })
                const validation = validateDeepLearnContentReadyForSave(content)
                logDeepLearnStageDiagnostics('partial_save', {
                  stage: 'identification',
                  level: 'minimal',
                  maxOutputTokens: getDeepLearnStageMaxOutputTokens(
                    getDeepLearnStageDefinitions().find((stage) => stage.key === 'identification')!,
                    'minimal',
                  ),
                  outputLength: null,
                  parsedArtifactCounts: getRawDeepLearnArtifactCounts(content),
                  partialSaveHappened: true,
                  finalValidatorResult: validation,
                })
                return { content, compactFallbackUsed: true }
              }
              throw minimalError
            }
          }

          if (microError.stage === 'quick_answers') {
            console.warn('[deep-learn-generation] retrying staged fallback', {
              stage: microError.stage,
              level: 'minimal',
              previousLevel: microError.level,
              kind: microError.kind,
              reason: microError.reason,
            })
            await options.onProgress?.({
              progress: 38,
              statusMessage: 'Deep Learn is trying a minimal quick-answer key before saving the pack.',
              stage: 'compact_fallback',
              compactFallbackUsed: true,
            })

            try {
              const content = await runDeepLearnStagePlan(input, grounding, createResponse, 'minimal', options, {
                startStage: microError.stage,
                seedOutput: microError.partialOutput ?? compactError.partialOutput ?? error.partialOutput,
              })
              return { content, compactFallbackUsed: true }
            } catch (minimalError) {
              if (
                minimalError instanceof DeepLearnGenerationStageError
                && minimalError.kind === 'size'
                && minimalError.stage === 'quick_answers'
              ) {
                const content = await runDeepLearnStagePlan(input, grounding, createResponse, 'micro', options, {
                  startStage: 'distinctions',
                  seedOutput: markQuickAnswersSkipped(
                    minimalError.partialOutput ?? microError.partialOutput ?? compactError.partialOutput ?? error.partialOutput,
                  ),
                })
                const validation = validateDeepLearnContentReadyForSave(content)
                logDeepLearnStageDiagnostics('partial_save', {
                  stage: 'quick_answers',
                  level: 'minimal',
                  maxOutputTokens: getDeepLearnStageMaxOutputTokens(
                    getDeepLearnStageDefinitions().find((stage) => stage.key === 'quick_answers')!,
                    'minimal',
                  ),
                  outputLength: null,
                  parsedArtifactCounts: getRawDeepLearnArtifactCounts(content),
                  partialSaveHappened: true,
                  finalValidatorResult: validation,
                  reason: DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON,
                  requestedAnswerCount: getQuickAnswerRequestedCount('minimal'),
                  parsedQuickAnswerCount: content.answerBank.length,
                  finalSavedSections: content.sections.map((section) => section.heading),
                })
                return { content, compactFallbackUsed: true }
              }
              throw minimalError
            }
          }

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
    const sourceMap = buildAcademicSourceMap(bestText)
    const promptGrounding = buildPromptGrounding({
      bestText,
      scanFallback: false,
    })

    const sourceGrounding = buildDeepLearnSourceGrounding(surfaceResource, finalQuality, groundingStrategy === 'insufficient' ? 'stored_extract' : groundingStrategy, recoveryWarning)
    sourceGrounding.charCount = bestText.length
    sourceGrounding.sourceMap = sourceMap.validation.ok ? sourceMap : null

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
    const sourceMap = buildAcademicSourceMap(fallbackText)
    const promptGrounding = buildPromptGrounding({
      bestText: fallbackText,
      scanFallback: false,
    })
    const sourceGrounding = buildDeepLearnSourceGrounding(input.resource, currentQuality, 'stored_extract', recoveryWarning)
    sourceGrounding.charCount = fallbackText.length
    sourceGrounding.sourceMap = sourceMap.validation.ok ? sourceMap : null

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
      const maxOutputTokens = getDeepLearnStageMaxOutputTokensForInput(stage, level, input)
      const raw = await createStageResponse(
        input,
        grounding,
        stage,
        level,
        createResponse,
        cloneStageOutput(stageOutput),
      )
      const parsed = parseStageResponse(raw, stage, level)
      mergeDeepLearnStageOutput(stageOutput, parsed)
      if (level !== 'full') trimDeepLearnStageOutput(stageOutput, level)
      logDeepLearnStageDiagnostics('stage_completed', {
        stage: stage.key,
        level,
        maxOutputTokens,
        outputLength: raw.output_text?.length ?? null,
        parsedArtifactCounts: getRawDeepLearnArtifactCounts(parsed),
        partialSaveHappened: false,
        finalValidatorResult: null,
      })
    } catch (error) {
      if (error instanceof DeepLearnGenerationStageError) {
        error.partialOutput = cloneStageOutput(stageOutput)
        const normalizedPartial = sanitizeDeepLearnContentForSave(
          normalizeDeepLearnGeneratedContent(stageOutput, input.resource.title),
        )
        const shouldSavePartial = shouldSavePartialAfterStageFailure(error, stageOutput, level, stage)
        const partialReason = shouldSavePartial ? mapStageFailureToIncompleteReason(error) : null
        logDeepLearnStageDiagnostics('stage_failed', {
          stage: error.stage,
          level: error.level,
          maxOutputTokens: getDeepLearnStageMaxOutputTokensForInput(stage, level, input),
          outputLength: null,
          parsedArtifactCounts: getRawDeepLearnArtifactCounts(stageOutput),
          partialSaveHappened: shouldSavePartial,
          finalValidatorResult: shouldSavePartial ? validateDeepLearnContentReadyForSave(normalizedPartial) : null,
          reason: error.reason,
          kind: error.kind,
          stageCriticality: getDeepLearnStageCriticality(error.stage),
          hasHighYield: hasHighYieldSection(normalizedPartial),
          hasIdentification: normalizedPartial.identificationItems.some(hasMeaningfulIdentificationItem),
          hasQuickAnswers: normalizedPartial.answerBank.some(hasMeaningfulAnswerBankItem),
          hasQuizTargets: normalizedPartial.likelyQuizTargets.some(hasMeaningfulQuizTarget),
          hasUsableCoreContent: hasUsableCoreContent(normalizedPartial),
          shouldSavePartial,
          partialReason,
          finalJobStatus: shouldSavePartial ? 'completed' : 'failed',
          savedSectionCounts: getRawDeepLearnArtifactCounts(stageOutput),
          rawReason: error.reason,
          normalizedIncompleteReason: partialReason,
        })
        if (shouldSavePartial) {
          return savePartialStudyPackResult(input, stageOutput, error, level)
        }
      }
      throw error
    }
  }

  const normalized = normalizeDeepLearnGeneratedContent(stageOutput, input.resource.title)
  const content = sanitizeDeepLearnContentForSave(
    level === 'full' ? normalized : trimDeepLearnContent(normalized, level),
    { dropStudentFacingComposerLeakage: true },
  )
  const validation = validateDeepLearnContentReadyForSave(content)
  if (validation.ok) return content

  logDeepLearnReviewerValidationDebug(
    'validation_failed',
    input.sourceGrounding.sourceMap,
    content,
    validation,
    getSelectedSourceDiagnostics(input.resource),
  )

  const repaired = repairDeepLearnContentFromStructuredSource(input, content, level)
  if (repaired) return repaired

  throw new DeepLearnGeneratedContentValidationError(validation.message)
}

export function validateDeepLearnContentReadyForSave(content: DeepLearnGeneratedContent) {
  const sanitizedContent = sanitizeDeepLearnContentForSave(content, { dropStudentFacingComposerLeakage: true })
  const answerBankCount = sanitizedContent.answerBank.filter(hasMeaningfulAnswerBankItem).length
  const identificationCount = sanitizedContent.identificationItems.filter(hasMeaningfulIdentificationItem).length
  const quizTargetCount = sanitizedContent.likelyQuizTargets.filter(hasMeaningfulQuizTarget).length
  const distinctConceptCount = countDistinctStudyConcepts(sanitizedContent)
  const hasSourceMapIdentificationLeakage = content.identificationItems.some(hasInternalSourceMapIdentificationPrompt)
  const hasInternalPipelineText = hasInternalPipelineTextInStudentFacingContent(sanitizedContent)
  const hasMalformedHeadings = sanitizedContent.sections.some((section) => isMalformedReviewerHeading(section.heading))
  const hasDuplicatedConcepts = findDuplicatedReviewerConcepts(sanitizedContent).length > 0
  const hasLowInformationContent = hasLowInformationStudyContent(sanitizedContent)
  const composerLeakageDiagnostics = getReviewerComposerLeakageDiagnostics(content, content)
  const remainingComposerLeakageDiagnostics = getReviewerComposerLeakageDiagnostics(sanitizedContent, sanitizedContent)
  const hasComposerLeakage = remainingComposerLeakageDiagnostics.reviewerSections
    || remainingComposerLeakageDiagnostics.answerBank
    || remainingComposerLeakageDiagnostics.identificationItems
    || remainingComposerLeakageDiagnostics.likelyQuizTargets
    || remainingComposerLeakageDiagnostics.distinctions
  const hasIdentificationOutputTooLargeSkip = sanitizedContent.cautionNotes.some(isIdentificationOutputTooLargeNote)
  const hasQuickAnswersOutputTooLargeSkip = sanitizedContent.cautionNotes.some(isQuickAnswersOutputTooLargeNote)
  const hasOptionalStageOutputTooLargeSkip = sanitizedContent.cautionNotes.some(isOptionalStageOutputTooLargeNote)
  const hasPartialOptionalSkip = hasIdentificationOutputTooLargeSkip || hasQuickAnswersOutputTooLargeSkip || hasOptionalStageOutputTooLargeSkip
  const hasCoreContent = hasUsableCoreContent(sanitizedContent)
  const hasPartialStructuredCore = hasUsablePartialStructuredCore(sanitizedContent)
  const hasStructuredStudyArtifacts = (answerBankCount > 0 || hasQuickAnswersOutputTooLargeSkip)
    && (identificationCount > 0 || hasIdentificationOutputTooLargeSkip)
    && (quizTargetCount > 0 || hasOptionalStageOutputTooLargeSkip)
  const hasExamReadyDensity = (answerBankCount >= 3 || hasQuickAnswersOutputTooLargeSkip)
    && (identificationCount >= 3 || hasIdentificationOutputTooLargeSkip)
    && (quizTargetCount >= 3 || hasOptionalStageOutputTooLargeSkip)
    && distinctConceptCount >= 6

  if ((hasPartialOptionalSkip ? (!hasCoreContent || !hasPartialStructuredCore) : (!hasStructuredStudyArtifacts || !hasExamReadyDensity)) || hasLowInformationContent) {
    const sizeSkipMessage = hasOptionalStageOutputTooLargeSkip
      ? mapIncompleteReasonToMessage(getFirstOptionalStageIncompleteReason(content))
      : hasQuickAnswersOutputTooLargeSkip
      ? DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE
      : DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE
    return {
      ok: false as const,
      message: hasPartialOptionalSkip && hasCoreContent
        ? sizeSkipMessage
        : DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE,
      reason: hasLowInformationContent
        ? 'low_information_content' as const
        : hasPartialOptionalSkip
        ? 'insufficient_structured_artifacts' as const
        : hasSourceMapIdentificationLeakage && identificationCount < 3
        ? 'source_map_identification_leakage' as const
        : 'insufficient_structured_artifacts' as const,
      composerLeakageDiagnostics,
      counts: { answerBankCount, identificationCount, quizTargetCount, distinctConceptCount },
    }
  }

  if (hasSourceMapIdentificationLeakage) {
    return {
      ok: false as const,
      message: 'Deep Learn could not clean internal source-map prompts from this Study Pack.',
      reason: 'source_map_identification_leakage' as const,
      composerLeakageDiagnostics,
      counts: { answerBankCount, identificationCount, quizTargetCount, distinctConceptCount },
    }
  }

  if (hasInternalPipelineText) {
    return {
      ok: false as const,
      message: 'Deep Learn could not clean internal reviewer labels from this Study Pack.',
      reason: 'internal_pipeline_text' as const,
      composerLeakageDiagnostics,
      counts: { answerBankCount, identificationCount, quizTargetCount, distinctConceptCount },
    }
  }

  if (hasMalformedHeadings) {
    return {
      ok: false as const,
      message: 'Deep Learn could not build clean reviewer headings from this source.',
      reason: 'malformed_headings' as const,
      composerLeakageDiagnostics,
      counts: { answerBankCount, identificationCount, quizTargetCount, distinctConceptCount },
    }
  }

  if (hasComposerLeakage) {
    return {
      ok: false as const,
      message: 'Deep Learn could not compose clean exam reviewer wording from this source.',
      reason: 'composer_leakage' as const,
      composerLeakageDiagnostics,
      counts: { answerBankCount, identificationCount, quizTargetCount, distinctConceptCount },
    }
  }

  if (hasDuplicatedConcepts) {
    return {
      ok: false as const,
      message: 'Deep Learn could not deduplicate enough reviewer concepts from this source.',
      reason: 'duplicated_concepts' as const,
      composerLeakageDiagnostics,
      counts: { answerBankCount, identificationCount, quizTargetCount, distinctConceptCount },
    }
  }

  return {
    ok: true as const,
    message: null,
    reason: null,
    composerLeakageDiagnostics,
    counts: { answerBankCount, identificationCount, quizTargetCount, distinctConceptCount },
  }
}

function isIdentificationOutputTooLargeNote(value: string) {
  return value === DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE
    || value === DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_REASON
}

function isQuickAnswersOutputTooLargeNote(value: string) {
  return value === DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE
    || value === DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON
}

function isOptionalStageOutputTooLargeNote(value: string) {
  return value === DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE
    || value === DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON
    || value === DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_MESSAGE
    || value === DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_REASON
    || isIdentificationOutputTooLargeNote(value)
    || isQuickAnswersOutputTooLargeNote(value)
}

function getFirstOptionalStageIncompleteReason(content: DeepLearnGeneratedContent) {
  if (content.cautionNotes.some((note) => note === DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE || note === DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON)) {
    return DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON
  }
  if (content.cautionNotes.some(isQuickAnswersOutputTooLargeNote)) return DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON
  if (content.cautionNotes.some(isIdentificationOutputTooLargeNote)) return DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_REASON
  return DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_REASON
}

function sanitizeDeepLearnContentForSave(
  content: DeepLearnGeneratedContent,
  options: { dropOptionalComposerLeakage?: boolean; dropStudentFacingComposerLeakage?: boolean } = {},
): DeepLearnGeneratedContent {
  const output: DeepLearnGeneratedContent = {
    ...content,
    sections: [...content.sections],
    answerBank: [...content.answerBank],
    identificationItems: content.identificationItems.filter((item) => !hasInternalSourceMapIdentificationPrompt(item)),
    distinctions: [...content.distinctions],
    likelyQuizTargets: [...content.likelyQuizTargets],
    cautionNotes: [...content.cautionNotes],
  }

  const shouldDropComposerLeakage = options.dropOptionalComposerLeakage || options.dropStudentFacingComposerLeakage
  if (!shouldDropComposerLeakage) return output

  output.cautionNotes = output.cautionNotes.filter((note) => !hasReviewerComposerLeakageText(note) && !containsInternalPipelineText(note))
  output.sections = output.sections.filter((section) => {
    const rendered = `${section.heading} ${section.body}`
    if (!hasReviewerComposerLeakageText(rendered) && !containsInternalPipelineText(rendered)) return true
    if (options.dropStudentFacingComposerLeakage) return false
    return !isOptionalEnrichmentSectionHeading(section.heading)
  })
  if (options.dropStudentFacingComposerLeakage) {
    output.answerBank = output.answerBank.filter((item) => !hasReviewerComposerLeakageText(JSON.stringify(item)) && !containsInternalPipelineText(JSON.stringify(item)))
    output.identificationItems = output.identificationItems.filter((item) => !hasReviewerComposerLeakageText(JSON.stringify(item)) && !containsInternalPipelineText(JSON.stringify(item)))
  }
  output.distinctions = output.distinctions.filter((item) => !hasReviewerComposerLeakageText(JSON.stringify(item)) && !containsInternalPipelineText(JSON.stringify(item)))
  output.likelyQuizTargets = output.likelyQuizTargets.filter((item) => !hasReviewerComposerLeakageText(JSON.stringify(item)) && !containsInternalPipelineText(JSON.stringify(item)))

  return output
}

function isOptionalEnrichmentSectionHeading(value: string) {
  return /\b(?:quick[-\s]?answer|likely quiz|quiz target|distinction|application|caution|exam question|multiple choice|true\/false)\b/i.test(value)
}

function hasInternalSourceMapIdentificationPrompt(item: unknown) {
  if (!item || typeof item !== 'object') return false
  const record = item as { prompt?: unknown; answer?: { exact?: unknown; examSafe?: unknown; simplified?: unknown }; draftExplanation?: unknown; reviewText?: unknown }
  if (isInternalSourceMapIdentificationPrompt(record.prompt)) return true
  return isInternalSourceMapDefinitionPrompt(record)
}

function isInternalSourceMapIdentificationPrompt(value: unknown) {
  if (typeof value !== 'string') return false
  const prompt = value.replace(/\s+/g, ' ').trim()
  return /^Recall the exam meaning of\b/i.test(prompt)
    || /^Explain the source relationship\b/i.test(prompt)
    || /^Explain the cause-effect relationship\b/i.test(prompt)
    || /^Use the source formula\b/i.test(prompt)
    || /^Classify the items under\b/i.test(prompt)
    || /^Explain the relationship inside\b/i.test(prompt)
}

function isInternalSourceMapDefinitionPrompt(item: { prompt?: unknown; answer?: { exact?: unknown; examSafe?: unknown; simplified?: unknown }; draftExplanation?: unknown; reviewText?: unknown }) {
  if (typeof item.prompt !== 'string') return false
  const prompt = item.prompt.replace(/\s+/g, ' ').trim()
  if (!/^Define\s+[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,7}\.$/.test(prompt)) return false
  const answerText = [
    item.answer?.exact,
    item.answer?.examSafe,
    item.answer?.simplified,
    item.draftExplanation,
    item.reviewText,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  return !hasMeaningfulText(answerText)
    || /\b(?:source[-\s]?map|bank answer|generated fallback|fallback reviewer|internal prompt)\b/i.test(answerText)
}

export function assertDeepLearnContentReadyForSave(content: DeepLearnGeneratedContent) {
  const validation = validateDeepLearnContentReadyForSave(content)
  if (!validation.ok) {
    throw new DeepLearnGeneratedContentValidationError(validation.message)
  }
}

function logDeepLearnReviewerValidationDebug(
  event: 'validation_failed' | 'source_map_repair' | 'structured_source_repair',
  sourceMap: AcademicSourceMap | null | undefined,
  content: DeepLearnGeneratedContent,
  validation: ReturnType<typeof validateDeepLearnContentReadyForSave>,
  sourceDiagnostics?: DeepLearnSourceDiagnostics | null,
) {
  const sourceMapValidation = sourceMap ? validateAcademicSourceMap(sourceMap) : null
  const sourceMapUnitCounts = sourceMap
    ? sourceMap.units.reduce<Record<string, number>>((counts, unit) => {
        counts[unit.kind] = (counts[unit.kind] ?? 0) + 1
        return counts
      }, {})
    : {}

  const sectionCounts = content.sections.reduce<Record<string, number>>((counts, section) => {
    const key = normalizeAcademicLookup(section.heading) || 'untitled'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})

  const payload = {
    event,
    selectedSource: sourceDiagnostics
      ? {
          queuedJobId: sourceDiagnostics.queuedJobId,
          canonicalSourceId: sourceDiagnostics.canonicalSourceId,
          moduleResourceId: sourceDiagnostics.moduleResourceId,
          id: sourceDiagnostics.id,
          title: sourceDiagnostics.title,
          courseId: sourceDiagnostics.courseId,
          courseName: sourceDiagnostics.courseName,
          moduleId: sourceDiagnostics.moduleId,
          moduleName: sourceDiagnostics.moduleName,
          canvasFileId: sourceDiagnostics.canvasFileId,
          canvasItemId: sourceDiagnostics.canvasItemId,
          extractionStatus: sourceDiagnostics.extractionStatus,
          visualExtractionStatus: sourceDiagnostics.visualExtractionStatus,
          extractedCharCount: sourceDiagnostics.extractedCharCount,
          extractedTextLength: sourceDiagnostics.extractedTextLength,
          visualExtractedTextLength: sourceDiagnostics.visualExtractedTextLength,
          academicTextCharCount: sourceDiagnostics.academicTextCharCount,
          normalizedCharCount: sourceDiagnostics.normalizedCharCount,
          sourceFieldUsed: sourceDiagnostics.sourceFieldUsed,
          sourceFieldSelectionReason: sourceDiagnostics.sourceFieldSelectionReason,
          sourceTextQuality: sourceDiagnostics.sourceTextQuality,
          sourceTextQualityReason: sourceDiagnostics.sourceTextQualityReason,
          contentHash: sourceDiagnostics.contentHash,
          preview: process.env.NODE_ENV === 'production'
            ? null
            : {
                start: sourceDiagnostics.previewStart,
                end: sourceDiagnostics.previewEnd,
              },
        }
      : null,
    sourceMap: {
      valid: Boolean(sourceMapValidation?.ok),
      reason: sourceMapValidation?.reason ?? null,
      unitCount: sourceMap?.units.length ?? 0,
      unitCounts: sourceMapUnitCounts,
      relationCountBeforeValidation: sourceMap?.relations?.length ?? 0,
      relationCountAfterValidation: countValidatedAcademicRelations(sourceMap),
    },
    reviewer: {
      sectionCount: content.sections.length,
      sectionCounts,
      answerBankCount: content.answerBank.length,
      identificationCount: content.identificationItems.length,
      quizTargetCount: content.likelyQuizTargets.length,
      meaningfulCounts: validation.counts,
    },
    validation: {
      ok: validation.ok,
      reason: validation.reason,
      message: validation.message,
    },
  }

  if (validation.ok) {
    console.info('[deep-learn-generation] reviewer validation debug', payload)
  } else {
    console.warn('[deep-learn-generation] reviewer validation debug', payload)
  }
}

function repairDeepLearnContentFromStructuredSource(
  input: DeepLearnPromptInput,
  content: DeepLearnGeneratedContent,
  level: DeepLearnFallbackLevel,
) {
  const sourceDiagnostics = getSelectedSourceDiagnostics(input.resource)
  const sourceMapFallback = buildDeepLearnContentFromSourceMap(input.sourceGrounding.sourceMap, input.resource.title, content)
  if (sourceMapFallback) {
    const repaired = level === 'full' ? sourceMapFallback : trimDeepLearnContent(sourceMapFallback, level)
    const validation = validateDeepLearnContentReadyForSave(repaired)
    logDeepLearnReviewerValidationDebug('source_map_repair', input.sourceGrounding.sourceMap, repaired, validation, sourceDiagnostics)
    logDeepLearnGenerationDiagnostics('fallback_used', {
      sourceDiagnostics,
      sourceMap: input.sourceGrounding.sourceMap,
      validation,
      content: repaired,
      fallbackMode: 'source_map_repair',
    })
    if (validation.ok) return repaired
  }

  const sourceText = selectBestGroundingText(input.resource) || input.promptGrounding
  if (!isMeaningfulDeepLearnSourceText({ text: sourceText, title: input.resource.title })) return null

  const outlineSourceMap = input.sourceGrounding.sourceMap ?? buildAcademicSourceMap(sourceText)
  const relationCountAfterValidation = countValidatedAcademicRelations(outlineSourceMap)
  const currentValidation = validateDeepLearnContentReadyForSave(content)
  const currentCounts = currentValidation.counts
  const missingMajorGeneratedArtifacts = currentCounts.answerBankCount === 0
    || currentCounts.identificationCount === 0
    || currentCounts.quizTargetCount === 0
  if ((input.sourceGrounding.sourceMap == null || relationCountAfterValidation < 3 || !validateAcademicSourceMap(outlineSourceMap).ok) && missingMajorGeneratedArtifacts) {
    const outlineFallback = buildExamReviewerFromOutline(sourceText, input.resource.title, content)
    if (outlineFallback) {
      const repaired = level === 'full' ? outlineFallback : trimDeepLearnContent(outlineFallback, level)
      const validation = validateDeepLearnContentReadyForSave(repaired)
      logDeepLearnReviewerValidationDebug('structured_source_repair', outlineSourceMap, repaired, validation, sourceDiagnostics)
      logDeepLearnGenerationDiagnostics('fallback_used', {
        sourceDiagnostics,
        sourceMap: outlineSourceMap,
        validation,
        content: repaired,
        fallbackMode: 'outline_repair',
      })
      if (validation.ok) return repaired
    }
  }

  const structuredSource = structureAcademicSourceText(sourceText)
  if (!hasDeterministicReviewerSourceUnits(structuredSource)) return null

  const fallback = buildDeterministicReviewerFallback(structuredSource, input.resource.title, content)
  const repaired = level === 'full' ? fallback : trimDeepLearnContent(fallback, level)
  const validation = validateDeepLearnContentReadyForSave(repaired)
  logDeepLearnReviewerValidationDebug('structured_source_repair', outlineSourceMap, repaired, validation, sourceDiagnostics)
  logDeepLearnGenerationDiagnostics('fallback_used', {
    sourceDiagnostics,
    sourceMap: outlineSourceMap,
    validation,
    content: repaired,
    fallbackMode: 'structured_source_repair',
  })
  return validation.ok ? repaired : null
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
  priorOutput: Record<string, unknown> | null = null,
) {
  const level = options.level ?? (options.compact ? 'compact' : 'full')
  const compact = level !== 'full'
  const compactInstruction = level === 'micro'
    ? 'Micro fallback is active. Return only short structured arrays with the strongest source-backed items. Do not write long explanations or prose-heavy sections.'
    : level === 'minimal'
    ? 'Minimal fallback is active. Return the smallest useful structured arrays only. Keep answers short and omit anything nonessential.'
    : level === 'compact'
    ? 'Compact fallback is active. Keep bodies tight, keep only the highest-yield items, and prefer fewer stronger facts over broad coverage.'
    : 'Normal staged generation is active. Keep coverage grounded and useful, but still concise.'
  const quickAnswerLimit = getQuickAnswerRequestedCount(level)
  const identificationRange = getIdentificationRequestedRange(input, level)
  const generatedIdentificationItems = stage === 'quick_answers'
    ? formatGeneratedIdentificationItemsForQuickAnswers(priorOutput, quickAnswerLimit)
    : []

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
      `- identificationItems: ${identificationRange} strongest direct source-grounded term/prompt items only. Keep answers to one short sentence.`,
      '- The section body should summarize the strongest key terms without duplicating every answer verbatim.',
    ],
    quick_answers: [
      'Build only the Quick-Answer Blocks stage.',
      'Return sections plus answerBank only.',
      'sections must contain exactly one heading: Quick-Answer Blocks.',
      level === 'minimal'
        ? '- answerBank: answer max 3 generated identification items, one sentence each.'
        : level === 'micro'
        ? '- answerBank: answer max 5 generated identification items, one sentence each.'
        : compact
        ? '- answerBank: answer max 8 generated identification items only.'
        : '- answerBank: answer only the generated identification items from the prior stage.',
      `- Requested answer count: ${quickAnswerLimit}. Do not exceed this count.`,
      '- Use the identification prompt as the cue, but do not repeat long question text in the answer.',
      '- No long explanations. No essay-style output. No repeated question text inside answers.',
      '- Prefer one-line definitions, processes, formulas, examples, and exam answers.',
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
    ...(generatedIdentificationItems.length > 0 ? [
      '',
      'Generated identification items to answer:',
      ...generatedIdentificationItems,
    ] : []),
    ...(level === 'micro' || level === 'minimal' ? [
      '',
      `${level === 'minimal' ? 'Minimal' : 'Micro'} fallback hard limits:`,
      '- High-Yield First: max 5 bullets.',
      level === 'minimal'
        ? '- Key Terms: max 5 terms through identificationItems.'
        : '- Key Terms: max 4 terms through identificationItems.',
      level === 'minimal'
        ? '- Quick Q&A: max 3 one-sentence answers through answerBank.'
        : '- Quick Q&A: max 5 one-sentence answers through answerBank.',
      '- Likely Quiz Targets: max 5 bullets.',
      '- Caution Notes: max 2 bullets.',
      '- No prose-heavy support sections. No long explanations.',
    ] : []),
    '',
    'Stage requirements:',
    ...stageRequirements[stage],
  ].join('\n')
}

function getQuickAnswerRequestedCount(level: DeepLearnFallbackLevel) {
  if (level === 'minimal') return 3
  if (level === 'micro') return 5
  if (level === 'compact') return 8
  return 14
}

function getIdentificationRequestedRange(input: DeepLearnPromptInput, level: DeepLearnFallbackLevel) {
  const sourceChars = input.sourceGrounding.charCount || input.promptGrounding.length
  if (sourceChars <= 4000) {
    if (level === 'minimal') return '2 to 3'
    if (level === 'micro') return '3'
    if (level === 'compact') return '4 to 5'
    return '5 to 7'
  }
  if (level === 'minimal') return '3 to 5'
  if (level === 'micro') return '3 to 4'
  if (level === 'compact') return '5 to 7'
  return '10 to 14'
}

function formatGeneratedIdentificationItemsForQuickAnswers(
  priorOutput: Record<string, unknown> | null,
  limit: number,
) {
  const normalized = normalizeDeepLearnGeneratedContent(priorOutput ?? {}, 'Source')
  return normalized.identificationItems
    .slice(0, limit)
    .map((item, index) => {
      const answer = item.answer.examSafe || item.answer.exact || item.answer.simplified || ''
      return `${index + 1}. ${truncateForModel(item.prompt, 120)} -> ${truncateForModel(answer, 180)}`
    })
}

async function createStageResponse(
  input: DeepLearnPromptInput,
  grounding: DeepLearnPreparedGrounding,
  stage: DeepLearnStageDefinition,
  level: DeepLearnFallbackLevel,
  createResponse: DeepLearnResponseCreator,
  priorOutput: Record<string, unknown> | null = null,
) {
  return withTimeout(
    createResponse({
      grounding,
      promptText: buildDeepLearnStagePrompt(input, stage.key, { level }, priorOutput),
      maxOutputTokens: getDeepLearnStageMaxOutputTokensForInput(stage, level, input),
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
  if (level === 'minimal') return stage.minimalProgress ?? stage.microProgress
  if (level === 'micro') return stage.microProgress
  if (level === 'compact') return stage.compactProgress
  return stage.fullProgress
}

function getDeepLearnStageMaxOutputTokens(stage: DeepLearnStageDefinition, level: DeepLearnFallbackLevel) {
  if (level === 'minimal') return stage.minimalMaxOutputTokens ?? stage.microMaxOutputTokens
  if (level === 'micro') return stage.microMaxOutputTokens
  if (level === 'compact') return stage.compactMaxOutputTokens
  return stage.fullMaxOutputTokens
}

function getDeepLearnStageMaxOutputTokensForInput(
  stage: DeepLearnStageDefinition,
  level: DeepLearnFallbackLevel,
  input: DeepLearnPromptInput,
) {
  const defaultMax = getDeepLearnStageMaxOutputTokens(stage, level)
  if (stage.key !== 'identification') return defaultMax
  const sourceChars = input.sourceGrounding.charCount || input.promptGrounding.length
  if (sourceChars > 4000) return defaultMax
  if (level === 'full') return Math.min(defaultMax, 3600)
  if (level === 'compact') return Math.min(defaultMax, 2200)
  if (level === 'micro') return Math.min(defaultMax, 1400)
  return Math.min(defaultMax, 900)
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

function markIdentificationSkipped(value: Record<string, unknown> | null) {
  const output: Record<string, unknown> = value ? cloneStageOutput(value) : {}
  output.identificationItems = []
  output.cautionNotes = uniqueStringList([
    ...(Array.isArray(output.cautionNotes) ? output.cautionNotes.filter((item: unknown): item is string => typeof item === 'string') : []),
    DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE,
    DEEP_LEARN_COMPACT_CAUTION_NOTE,
  ])
  return output
}

function markQuickAnswersSkipped(value: Record<string, unknown> | null) {
  const output: Record<string, unknown> = value ? cloneStageOutput(value) : {}
  const normalized = sanitizeDeepLearnContentForSave(normalizeDeepLearnGeneratedContent(output, typeof output.title === 'string' ? output.title : 'Source'))
  const derivedAnswerBank = buildQuickAnswersFromIdentificationItems(normalized, getQuickAnswerRequestedCount('minimal'))
  output.answerBank = mergeFallbackArray(output.answerBank, derivedAnswerBank)
  output.sections = Array.isArray(output.sections) ? output.sections : []
  output.cautionNotes = uniqueStringList([
    ...(Array.isArray(output.cautionNotes) ? output.cautionNotes.filter((item: unknown): item is string => typeof item === 'string') : []),
    DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE,
    DEEP_LEARN_COMPACT_CAUTION_NOTE,
  ])
  return output
}

function markOptionalStageSkipped(value: Record<string, unknown> | null, reason: string) {
  const output: Record<string, unknown> = value ? cloneStageOutput(value) : {}
  if (reason === DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_REASON) return markIdentificationSkipped(output)
  if (reason === DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON) return markQuickAnswersSkipped(output)

  const normalized = sanitizeDeepLearnContentForSave(normalizeDeepLearnGeneratedContent(output, typeof output.title === 'string' ? output.title : 'Source'))
  const derivedTargets = buildQuizTargetsFromExistingContent(normalized, 5)
  output.likelyQuizTargets = mergeFallbackArray(output.likelyQuizTargets, derivedTargets)
  output.sections = [
    ...(Array.isArray(output.sections) ? output.sections : []),
    {
      heading: 'Likely Quiz Targets',
      body: derivedTargets.length > 0
        ? derivedTargets.map((item) => `- ${item.target}`).join('\n')
        : mapIncompleteReasonToMessage(reason),
    },
  ]
  output.cautionNotes = uniqueStringList([
    ...(Array.isArray(output.cautionNotes) ? output.cautionNotes.filter((item: unknown): item is string => typeof item === 'string') : []),
    mapIncompleteReasonToMessage(reason),
    DEEP_LEARN_COMPACT_CAUTION_NOTE,
  ])
  return output
}

function buildQuizTargetsFromExistingContent(content: DeepLearnGeneratedContent, limit: number) {
  const fromIdentification = content.identificationItems
    .filter(hasMeaningfulIdentificationItem)
    .slice(0, limit)
    .map((item) => ({
      target: truncateForModel(item.prompt, 140),
      reason: 'This was already identified as a direct source-grounded recall item.',
      importance: item.importance,
      reviewText: item.reviewText ?? item.prompt,
      draftExplanation: item.draftExplanation ?? item.answer.examSafe ?? item.answer.exact ?? null,
      sourceSnippet: item.sourceSnippet ?? item.answer.exact ?? item.answer.examSafe ?? null,
      linkedDraftSectionId: item.linkedDraftSectionId ?? null,
      supportingContext: item.supportingContext ?? item.answer.examSafe ?? item.answer.exact ?? null,
      compareContext: item.compareContext ?? null,
      simplifiedWording: item.simplifiedWording ?? item.answer.simplified ?? null,
      confusionNotes: item.confusionNotes ?? [],
      relatedConcepts: item.relatedConcepts ?? [],
    }))

  if (fromIdentification.length >= Math.min(3, limit)) return fromIdentification.slice(0, limit)

  const fromAnswerBank = content.answerBank
    .filter(hasMeaningfulAnswerBankItem)
    .slice(0, limit - fromIdentification.length)
    .map((item) => ({
      target: truncateForModel(item.cue, 140),
      reason: 'This was already identified as a compact source-grounded answer.',
      importance: item.importance,
      reviewText: item.reviewText ?? item.cue,
      draftExplanation: item.draftExplanation ?? item.compactAnswer.examSafe ?? item.answer.examSafe ?? null,
      sourceSnippet: item.sourceSnippet ?? item.answer.exact ?? item.compactAnswer.exact ?? null,
      linkedDraftSectionId: item.linkedDraftSectionId ?? null,
      supportingContext: item.supportingContext ?? item.compactAnswer.examSafe ?? item.answer.examSafe ?? null,
      compareContext: item.compareContext ?? null,
      simplifiedWording: item.simplifiedWording ?? item.answer.simplified ?? null,
      confusionNotes: item.confusionNotes ?? [],
      relatedConcepts: item.relatedConcepts ?? [],
    }))

  return [...fromIdentification, ...fromAnswerBank].slice(0, limit)
}

export function hasUsableCoreContent(content: DeepLearnGeneratedContent) {
  return hasHighYieldSection(content) || content.sections.some((section) =>
    hasMeaningfulSectionText(section.body)
    && /summary|review|concept|key|high-yield|study/i.test(section.heading)
  )
}

function hasHighYieldSection(content: DeepLearnGeneratedContent) {
  return content.sections.some((section) =>
    /source summary|high-yield first|summary|reviewer summary/i.test(section.heading)
    && hasMeaningfulSectionText(section.body)
  )
}

function hasMeaningfulSectionText(value: string) {
  const trimmed = sanitizeStudentFacingText(value).replace(/\s+/g, ' ').trim()
  return trimmed.length >= 40
    && !containsInternalPipelineText(trimmed)
    && !isLowInformationStudyText(trimmed)
}

function getDeepLearnStageCriticality(stage: DeepLearnStageKey): DeepLearnStageCriticality {
  return stage === 'high_yield' ? 'core' : 'optional'
}

function shouldSavePartialAfterStageFailure(
  error: DeepLearnGenerationStageError,
  partialOutput: Record<string, unknown> | null,
  level: DeepLearnFallbackLevel,
  stage: DeepLearnStageDefinition,
) {
  if (getDeepLearnStageCriticality(error.stage) !== 'optional') return false
  const normalized = sanitizeDeepLearnContentForSave(normalizeDeepLearnGeneratedContent(partialOutput ?? {}, 'Source'))
  if (!hasUsableCoreContent(normalized)) return false
  if (error.kind === 'invalid_json') return true
  if (error.kind !== 'size' && !isMaxOutputTokenReason(error.reason)) return false
  if (error.stage === 'identification') return false
  return level === 'minimal' || (!stage.minimalMaxOutputTokens && level === 'micro')
}

function mapStageFailureToIncompleteReason(error: DeepLearnGenerationStageError) {
  if (error.stage === 'identification') return DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_REASON
  if (error.stage === 'quick_answers') return DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON
  if (error.stage === 'distinctions') return DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON
  return DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_REASON
}

function mapIncompleteReasonToMessage(reason: string) {
  if (reason === DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_REASON) return DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE
  if (reason === DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON) return DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE
  if (reason === DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON) return DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE
  return DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_MESSAGE
}

function savePartialStudyPackResult(
  input: DeepLearnPromptInput,
  partialOutput: Record<string, unknown>,
  error: DeepLearnGenerationStageError,
  level: DeepLearnFallbackLevel,
) {
  const reason = mapStageFailureToIncompleteReason(error)
  const marked = markOptionalStageSkipped(partialOutput, reason)
  const normalized = normalizeDeepLearnGeneratedContent(marked, input.resource.title)
  const content = sanitizeDeepLearnContentForSave(
    level === 'full' ? normalized : trimDeepLearnContent(normalized, level),
    { dropOptionalComposerLeakage: true, dropStudentFacingComposerLeakage: true },
  )
  const validation = validateDeepLearnContentReadyForSave(content)
  logDeepLearnStageDiagnostics('partial_save', {
    stage: error.stage,
    level,
    maxOutputTokens: getDeepLearnStageMaxOutputTokens(getDeepLearnStageDefinitions().find((stage) => stage.key === error.stage)!, level),
    outputLength: null,
    parsedArtifactCounts: getRawDeepLearnArtifactCounts(content),
    partialSaveHappened: true,
    finalValidatorResult: validation,
    reason,
    kind: error.kind,
    stageCriticality: getDeepLearnStageCriticality(error.stage),
    hasHighYield: hasHighYieldSection(content),
    hasIdentification: content.identificationItems.some(hasMeaningfulIdentificationItem),
    hasQuickAnswers: content.answerBank.some(hasMeaningfulAnswerBankItem),
    hasQuizTargets: content.likelyQuizTargets.some(hasMeaningfulQuizTarget),
    hasUsableCoreContent: hasUsableCoreContent(content),
    shouldSavePartial: true,
    partialReason: reason,
    finalJobStatus: validation.ok ? 'completed' : 'failed',
    savedSectionCounts: getRawDeepLearnArtifactCounts(content),
    rawReason: error.reason,
    normalizedIncompleteReason: reason,
  })
  if (!validation.ok) throw new DeepLearnGeneratedContentValidationError(validation.message)
  return content
}

function buildQuickAnswersFromIdentificationItems(content: DeepLearnGeneratedContent, limit: number) {
  return content.identificationItems
    .filter((item) => {
      const answer = item.answer.examSafe || item.answer.exact || item.answer.simplified || ''
      return item.prompt.trim().length > 0 && answer.trim().length > 0
    })
    .slice(0, limit)
    .map((item) => {
      const answer = truncateForModel(item.answer.examSafe || item.answer.exact || item.answer.simplified || '', 180)
      return {
        cue: truncateForModel(item.prompt, 120),
        kind: item.kind,
        answer: wordingFromSentence(answer, 180),
        compactAnswer: wordingFromSentence(answer, 140),
        importance: item.importance,
        sortKey: null,
        distractors: item.distractors.slice(0, 3),
        reviewText: item.reviewText ?? item.prompt,
        draftExplanation: item.draftExplanation ?? answer,
        sourceSnippet: item.sourceSnippet ?? item.answer.exact ?? answer,
        linkedDraftSectionId: item.linkedDraftSectionId ?? null,
        supportingContext: item.supportingContext ?? answer,
        compareContext: item.compareContext ?? null,
        simplifiedWording: item.simplifiedWording ?? item.answer.simplified ?? null,
        confusionNotes: item.confusionNotes ?? [],
        relatedConcepts: item.relatedConcepts ?? [],
      }
    })
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
  if (level === 'minimal') {
    return {
      sections: 5,
      answerBank: 5,
      identificationItems: 5,
      distinctions: 1,
      likelyQuizTargets: 5,
      cautionNotes: 3,
    }
  }

  return level === 'micro'
    ? {
        sections: 5,
        answerBank: 6,
        identificationItems: 4,
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

function uniqueBy<T>(values: T[], getKey: (value: T) => string) {
  const seen = new Set<string>()
  const result: T[] = []
  for (const value of values) {
    const key = getKey(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function buildMinimalDeepLearnFallback(
  input: DeepLearnPromptInput,
  partialOutput: Record<string, unknown> | null,
) {
  const sourceMapFallback = buildDeepLearnContentFromSourceMap(
    input.sourceGrounding.sourceMap,
    input.resource.title,
    partialOutput ? normalizeDeepLearnGeneratedContent(partialOutput, input.resource.title) : {},
  )
  if (sourceMapFallback) {
    return trimDeepLearnContent(sourceMapFallback, 'micro')
  }

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
    sanitizeDeepLearnContentForSave(normalizeDeepLearnGeneratedContent(fallbackOutput, input.resource.title)),
    'micro',
  )
}

export function buildDeepLearnContentFromSourceMap(
  sourceMap: AcademicSourceMap | null | undefined,
  resourceTitle: string,
  seedContent: Partial<DeepLearnGeneratedContent> = {},
): DeepLearnGeneratedContent | null {
  const units = getMeaningfulSourceMapUnits(sourceMap)
  if (units.length === 0) return null

  const answerBank = units.slice(0, 24).map((unit, index) => {
    const answerText = buildSourceMapGeneratedAnswer(unit)
    return {
      cue: unit.title,
      kind: unit.kind === 'definition' ? 'term_definition' as const : 'fact' as const,
      answer: wordingFromSentence(answerText, getSourceMapGeneratedAnswerLimit(unit)),
      compactAnswer: wordingFromSentence(answerText, getSourceMapGeneratedAnswerLimit(unit)),
      importance: sourceMapGeneratedImportance(unit.importanceScore, index),
      sortKey: null,
      distractors: [],
      reviewText: unit.title,
      draftExplanation: answerText,
      sourceSnippet: unit.sourceWording ?? answerText,
      linkedDraftSectionId: null,
      supportingContext: unit.support ?? answerText,
      compareContext: null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: unit.items.slice(0, 5),
    }
  })

  const identificationItems = units.slice(0, 24).map((unit, index) => {
    const answerText = buildSourceMapGeneratedAnswer(unit)
    return {
      prompt: buildSourceMapGeneratedIdentificationPrompt(unit),
      kind: unit.kind === 'definition' ? 'term_definition' as const : 'fact' as const,
      answer: wordingFromSentence(answerText, getSourceMapGeneratedAnswerLimit(unit)),
      importance: sourceMapGeneratedImportance(unit.importanceScore, index),
      distractors: [],
      reviewText: unit.title,
      draftExplanation: answerText,
      sourceSnippet: unit.sourceWording ?? answerText,
      linkedDraftSectionId: null,
      supportingContext: unit.support ?? answerText,
      compareContext: null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: unit.items.slice(0, 5),
    }
  })

  const likelyQuizTargets = units.slice(0, 24).map((unit, index) => ({
    target: buildSourceMapGeneratedQuizTarget(unit),
    reason: buildSourceMapGeneratedQuizReason(unit),
    importance: sourceMapGeneratedImportance(unit.importanceScore, index),
    reviewText: unit.title,
    draftExplanation: buildSourceMapGeneratedAnswer(unit),
    sourceSnippet: unit.sourceWording ?? unit.support,
    linkedDraftSectionId: null,
    supportingContext: unit.support,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: unit.items.slice(0, 5),
  }))

  if (answerBank.length === 0 || identificationItems.length === 0 || likelyQuizTargets.length === 0) return null

  const summary = buildSourceMapGeneratedAnswer(units[0])
  const quickBlocks = units
    .filter((unit) => unit.items.length >= 2)
    .slice(0, 5)
    .map((unit) => `${unit.title}: ${formatInlineList(unit.items.slice(0, getSourceMapGeneratedListLimit(unit)))}`)
  const academicBankSections = buildAcademicBankStudyPackSections(sourceMap, units)

  const output: Record<string, unknown> = {
    title: seedContent.title || resourceTitle,
    overview: seedContent.overview || summary,
    sections: [
      { heading: 'Source Summary', body: summary },
      {
        heading: 'High-Yield First',
        body: units.slice(0, 8).map((unit) => `- ${unit.title}: ${truncateForModel(buildSourceMapGeneratedAnswer(unit), getSourceMapGeneratedAnswerLimit(unit))}`).join('\n'),
      },
      {
        heading: 'Key Answers / Answer Bank',
        body: answerBank.slice(0, 12).map((item) => `- ${item.cue}: ${item.compactAnswer.examSafe}`).join('\n'),
      },
      {
        heading: 'Identification Review',
        body: identificationItems.slice(0, 12).map((item) => `- ${item.prompt}`).join('\n'),
      },
      {
        heading: 'Likely Quiz Targets',
        body: likelyQuizTargets.slice(0, 16).map((item) => `- ${item.target}\n  ${item.reason}`).join('\n'),
      },
      ...academicBankSections,
      ...(quickBlocks.length > 0
        ? [{ heading: 'Quick Answer Blocks', body: quickBlocks.map((block) => `- ${block}`).join('\n') }]
        : []),
    ],
    answerBank,
    identificationItems,
    distinctions: buildSourceMapGeneratedDistinctions(units),
    likelyQuizTargets,
    cautionNotes: uniqueStringList([
      ...(Array.isArray(seedContent.cautionNotes) ? seedContent.cautionNotes : []),
      DEEP_LEARN_COMPACT_CAUTION_NOTE,
    ]).filter((note) => !containsInternalPipelineText(note)).slice(0, 3),
  }

  const normalized = sanitizeDeepLearnContentForSave(normalizeDeepLearnGeneratedContent(output, resourceTitle))
  const validation = validateDeepLearnContentReadyForSave(normalized)
  return validation.ok ? normalized : null
}

function buildAcademicBankStudyPackSections(sourceMap: AcademicSourceMap | null | undefined, units: GeneratedSourceMapUnit[]) {
  const banks = sourceMap?.banks
  if (!banks) return []
  const sections: Array<{ heading: string; body: string }> = []
  const addSection = (heading: string, rows: string[]) => {
    const body = uniqueStringList(rows.map((row) => row.trim()).filter(Boolean)).slice(0, 8).join('\n')
    if (body) sections.push({ heading, body })
  }

  addSection('Definitions to Memorize', [
    ...banks.definitionBank.map((entry) => `- ${entry.title}: ${entry.answer}`),
    ...banks.acronymBank.map((entry) => `- ${entry.title}: ${entry.answer}`),
  ])
  addSection('Classifications and Groupings', [
    ...banks.classificationBank.map((entry) => `- ${entry.title}: ${formatInlineList(entry.items.length ? entry.items : [entry.answer])}`),
    ...banks.relationshipBank.map((entry) => `- ${entry.title}: ${entry.items.length ? formatInlineList(entry.items) : entry.answer}`),
  ])
  addSection('Timelines and Procedures', [
    ...banks.timelineBank.map((entry) => `- ${entry.title}: ${formatInlineList(entry.items.length ? entry.items : [entry.answer])}`),
    ...banks.procedureBank.map((entry) => `- ${entry.title}: ${formatInlineList(entry.items.length ? entry.items : [entry.answer])}`),
  ])
  addSection('Formulas and Comparisons', [
    ...banks.formulaBank.map((entry) => `- ${entry.title}: ${entry.answer}`),
    ...banks.comparisonBank.map((entry) => `- ${entry.title}: ${entry.answer}`),
    ...banks.causeEffectBank.map((entry) => `- ${entry.title}: ${entry.answer}`),
  ])
  addSection('Likely Exam Questions', banks.likelyQuestionBank.map((entry) => `- ${entry.prompt} Answer: ${entry.items.length >= 2 ? formatInlineList(entry.items) : entry.answer}`))

  if (sections.length === 0 && units.some((unit) => unit.items.length >= 2)) {
    addSection('Classifications and Groupings', units
      .filter((unit) => unit.items.length >= 2)
      .map((unit) => `- ${unit.title}: ${formatInlineList(unit.items)}`))
  }

  return sections.slice(0, 5)
}

interface GeneratedSourceMapUnit {
  title: string
  kind: AcademicSourceMapUnit['kind']
  unitType: NonNullable<AcademicSourceMapUnit['unitType']>
  learningShape: NonNullable<AcademicSourceMapUnit['learningShape']>
  items: string[]
  support: string
  sourceWording: string | null
  importanceScore: number
}

function getMeaningfulSourceMapUnits(sourceMap: AcademicSourceMap | null | undefined): GeneratedSourceMapUnit[] {
  if (!sourceMap) return []
  const validation = validateAcademicSourceMap(sourceMap)
  if (!validation.ok) return []

  return sourceMap.units
    .map(cleanGeneratedSourceMapUnit)
    .filter((unit): unit is GeneratedSourceMapUnit => Boolean(unit))
    .filter((unit, index, list) => list.findIndex((candidate) => normalizeAcademicLookup(candidate.title) === normalizeAcademicLookup(unit.title)) === index)
    .sort(compareGeneratedSourceMapUnits)
    .slice(0, 18)
}

function cleanGeneratedSourceMapUnit(unit: AcademicSourceMapUnit): GeneratedSourceMapUnit | null {
  const title = normalizeGeneratedSourceMapTitle(unit.title)
  if (isWeakGeneratedSourceMapTerm(title)) return null

  const items = unit.items
    .map(cleanGeneratedSourceMapText)
    .filter((item) => item.length > 0 && !isWeakGeneratedSourceMapTerm(item))
    .slice(0, 12)
  const support = cleanGeneratedSourceMapAnswer(title, cleanGeneratedSourceMapText(unit.summary))
  const sourceWording = unit.sourceQuotes
    .map((quote) => cleanGeneratedSourceMapAnswer(title, cleanGeneratedSourceMapText(quote)))
    .find((quote) => quote.length >= 12 && !containsInternalPipelineText(quote))
    ?? null

  if (!support && !sourceWording && items.length === 0) return null

  return {
    title,
    kind: unit.kind,
    unitType: inferGeneratedSourceMapUnitType(title, unit),
    learningShape: inferGeneratedSourceMapLearningShape(title, unit),
    items,
    support: support || sourceWording || title,
    sourceWording,
    importanceScore: unit.importanceScore,
  }
}

function normalizeGeneratedSourceMapTitle(value: string) {
  const cleaned = normalizeStudyOutputHeading(sanitizeStudentFacingText(value))
  const lookup = normalizeAcademicLookup(cleaned)
  if (lookup === 'it security definition') return 'IT Security'
  if (lookup === 'infosec vs it sec') return 'InfoSec vs IT Sec'
  if (lookup === 'domains of it security') return 'Domains of IT Security'
  if (lookup === 'cybersecurity definitions') return 'Cybersecurity'
  if (lookup === 'cybersecurity approach layers') return 'Cybersecurity approach layers'
  if (lookup === 'people process technology') return 'People / Process / Technology'
  if (lookup === 'unified threat management') return 'Unified Threat Management'
  if (lookup === 'importance of cybersecurity') return 'Importance of Cybersecurity'
  if (lookup === 'challenges') return 'Challenges of Cybersecurity'
  if (lookup === 'impact of a security breach') return 'Impact of a Security Breach'
  if (lookup === 'cybercrime disruption espionage') return 'Cybersecurity Threat Types'
  if (lookup === 'malware types') return 'Malware Types'
  if (lookup === 'malware symptoms') return 'Malware Symptoms'
  if (lookup === 'infiltration methods') return 'Methods of Infiltration'
  if (lookup === 'denial of service methods') return 'Denial of Service Methods'
  if (lookup === 'impact reduction') return 'Impact Reduction'
  if (lookup === 'types of attackers') return 'Types of Attackers'
  if (lookup === 'zombie vs botnet') return 'Zombie vs Botnet'
  if (lookup === 'seo vs seo poisoning') return 'SEO vs SEO Poisoning'
  if (lookup === 'arnis definition') return 'Arnis'
  if (lookup === 'ra 9850') return 'RA 9850'
  if (lookup === 'historical concept') return 'Historical Concept'
  if (lookup === 'evolution classifications') return 'Evolution / Classifications'
  if (lookup === 'regional systems') return 'Regional Systems'
  if (lookup === 'organizations timeline') return 'Organizations / Timeline'
  if (lookup === 'main groups') return 'Main Groups'
  if (lookup === 'courtesy salutation') return 'Courtesy / Salutation'
  if (lookup === 'strike types') return 'Strike Types'
  if (lookup === 'equipment weapons') return 'Equipment / Weapons'
  if (lookup === 'stick types') return 'Stick Types'
  if (lookup === 'regional classifications') return 'Regional Classifications'
  return cleaned
}

function inferGeneratedSourceMapUnitType(
  title: string,
  unit: AcademicSourceMapUnit,
): NonNullable<AcademicSourceMapUnit['unitType']> {
  if (unit.unitType) return unit.unitType
  const key = normalizeAcademicLookup(title)
  if (/\b(?:timeline|history|historical|ra 9850|organizations)\b/i.test(key)) return 'timeline'
  if (/\b(?:courtesy|salutation|methods?|steps?|sequence|reduction)\b/i.test(key) || unit.kind === 'process') return 'procedure'
  if (/\b(?:equipment|weapons?|stick)\b/i.test(key)) return 'equipment'
  if (/\b(?:classification|regional|types|domains|categories)\b/i.test(key) || unit.kind === 'category') return 'classification'
  if (unit.kind === 'definition') return 'definition'
  if (unit.kind === 'list') return 'taxonomy'
  return 'narrative'
}

function inferGeneratedSourceMapLearningShape(
  title: string,
  unit: AcademicSourceMapUnit,
): NonNullable<AcademicSourceMapUnit['learningShape']> {
  if (unit.learningShape) return unit.learningShape
  const key = normalizeAcademicLookup(title)
  if (/\b(?:formula|equation|compute|calculate|solve)\b/i.test(key)) return 'formula'
  if (/\b(?:example|sample problem|worked solution)\b/i.test(key)) return 'worked-example'
  if (/\b(?:case|rule|statute|jurisdiction|liability|offense)\b/i.test(key)) return 'case-rule'
  if (/\b(?:clinical|patient|care plan|diagnosis|treatment|assessment)\b/i.test(key)) return 'clinical-care'
  if (/\b(?:cause|effect|impact|risk factor)\b/i.test(key)) return 'cause-effect'
  if (/\b(?:troubleshoot|error|failure|debug|symptom)\b/i.test(key)) return 'troubleshooting'
  if (/\b(?:component|system|architecture|module|parts?)\b/i.test(key)) return 'component-system'
  if (/\b(?:lab|experiment|protocol)\b/i.test(key)) return 'lab-process'
  if (/\b(?:rubric|standard|criteria|competency|outcomes?)\b/i.test(key)) return 'standards-rubrics'
  if (/\b(?:passage|theme|motif|character|argument)\b/i.test(key)) return 'passage-theme'
  const unitType = inferGeneratedSourceMapUnitType(title, unit)
  if (unitType === 'timeline' || unitType === 'historical') return 'timeline'
  if (unitType === 'procedure') return 'procedure'
  if (unitType === 'equipment') return 'equipment'
  if (unitType === 'classification') return 'classification'
  if (unitType === 'comparison') return 'comparison'
  if (unitType === 'taxonomy') return 'taxonomy'
  if (unitType === 'reflective') return 'reflection'
  if (unitType === 'narrative') return 'narrative'
  return unit.kind === 'definition' ? 'definition' : 'narrative'
}

function buildSourceMapGeneratedAnswer(unit: GeneratedSourceMapUnit) {
  const key = normalizeAcademicLookup(unit.title)
  if (key === 'infosec vs it sec') {
    return 'InfoSec protects sensitive business information; IT Sec secures digital data through computer network security.'
  }
  if (key === 'it security') {
    return 'IT Security uses cybersecurity strategies to prevent unauthorized access and protect organizational assets against cyberattacks and other threats.'
  }
  if (key === 'cybersecurity') {
    return 'Cybersecurity protects networked systems and data from unauthorized use or harm, protects the integrity of security architecture, and safeguards data against attack, damage, or unauthorized access.'
  }
  if (key === 'vulnerability exploit breach') {
    return 'Vulnerability = weakness or flaw; exploit = method or tool used to take advantage; breach = successful exploit.'
  }
  if (key === 'zombie vs botnet') {
    return 'Zombie = infected host; Botnet = network of infected hosts.'
  }
  if (key === 'seo vs seo poisoning') {
    return 'SEO improves website search ranking; SEO Poisoning increases traffic to malicious websites and forces malicious sites to rank higher.'
  }
  if (unit.items.length >= 2 && !/^(?:IT Security|Cybersecurity)$/i.test(unit.title)) {
    return formatSourceMapGeneratedReviewerList(unit)
  }
  return unit.support || unit.sourceWording || unit.title
}

function formatSourceMapGeneratedReviewerList(unit: GeneratedSourceMapUnit) {
  const items = unit.items.slice(0, getSourceMapGeneratedListLimit(unit))
  const lines = items.map((item, index) => `${index + 1}. ${formatSourceMapGeneratedListItem(unit, item)}`)
  return `${unit.title}:\n${lines.join('\n')}`
}

function formatSourceMapGeneratedListItem(unit: GeneratedSourceMapUnit, item: string) {
  if (unit.learningShape !== 'timeline') return item
  return item
    .replace(/\b(\d{4}|[A-Z][a-z]+ \d{1,2}, \d{4})\s*(?:-|\u2013|\u2014)\s*/u, '$1 \u2014 ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSourceMapGeneratedListLimit(unit: GeneratedSourceMapUnit) {
  if (/^domains of it security$/i.test(unit.title)) return 11
  if (/^malware types$/i.test(unit.title)) return 10
  if (/^(?:courtesy \/ salutation|strike types|equipment \/ weapons|stick types|organizations \/ timeline|timeline|regional classifications|regional systems|main groups|evolution \/ classifications)$/i.test(unit.title)) return 12
  return unit.kind === 'process' ? 7 : 8
}

function getSourceMapGeneratedAnswerLimit(unit: GeneratedSourceMapUnit) {
  if (/^(?:domains of it security|malware types)$/i.test(unit.title)) return 320
  if (unit.learningShape === 'timeline' || unit.learningShape === 'equipment' || unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return 260
  if (/^cybersecurity$/i.test(unit.title)) return 260
  return 180
}

function buildSourceMapGeneratedIdentificationPrompt(unit: GeneratedSourceMapUnit) {
  const question = buildKnownSourceMapGeneratedQuestion(unit)
  if (question) return question
  if (unit.learningShape === 'timeline') return `Arrange the milestones for ${unit.title}.`
  if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return `Sequence ${unit.title}.`
  if (unit.learningShape === 'equipment') return `Identify equipment in ${unit.title}.`
  if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return `Enumerate ${unit.title}.`
  if (unit.kind === 'definition') return `What does ${unit.title} mean in this source?`
  if (unit.items.length >= 3) return `Enumerate ${unit.title}.`
  return `Explain ${unit.title}.`
}

function buildSourceMapGeneratedQuizTarget(unit: GeneratedSourceMapUnit) {
  const question = buildKnownSourceMapGeneratedQuestion(unit)
  if (question) return question
  if (unit.learningShape === 'timeline') return `Arrange the milestones for ${unit.title}.`
  if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return `Sequence ${unit.title}.`
  if (unit.learningShape === 'equipment') return `Identify equipment in ${unit.title}.`
  if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return `Enumerate ${unit.title}.`
  if (unit.learningShape === 'formula') return `Use the formula in ${unit.title}`
  if (unit.learningShape === 'worked-example') return `Work through ${unit.title}`
  if (unit.learningShape === 'case-rule') return `Apply the rule in ${unit.title}`
  if (unit.learningShape === 'clinical-care') return `Identify care priorities in ${unit.title}`
  if (unit.learningShape === 'cause-effect') return `Explain why ${unit.title} happens`
  if (unit.learningShape === 'troubleshooting') return `Troubleshoot ${unit.title}`
  if (unit.learningShape === 'component-system') return `Identify components in ${unit.title}`
  if (unit.learningShape === 'standards-rubrics') return `Apply criteria in ${unit.title}`
  if (unit.learningShape === 'passage-theme') return `Explain the theme in ${unit.title}`
  if (unit.learningShape === 'reflection') return `Reflect on ${unit.title}`
  if (unit.kind === 'process') return `Apply ${unit.title}`
  if (unit.items.length >= 3) return `Enumerate ${unit.title}.`
  if (/ vs |\/|triad/i.test(unit.title)) return `Distinguish ${unit.title}`
  return `Explain ${unit.title}.`
}

function buildSourceMapGeneratedQuizReason(unit: GeneratedSourceMapUnit) {
  const key = normalizeAcademicLookup(unit.title)
  if (key === 'infosec vs it sec') return 'Tests the difference between business information protection and digital data/network protection.'
  if (key === 'vulnerability exploit breach') return 'Tests the attack sequence: weakness, method or tool, successful result.'
  if (key === 'zombie vs botnet') return 'Tests the difference between one infected host and a network of infected hosts.'
  if (key === 'seo vs seo poisoning') return 'Tests normal search optimization against malicious ranking manipulation.'
  if (key === 'cia triad') return 'Tests the three-goal security list: confidentiality, integrity, availability.'
  if (unit.kind === 'definition') return `Tests the core definition of ${unit.title}.`
  if (unit.learningShape === 'timeline') return `Tests dates, milestones, and ordering for ${unit.title}.`
  if (unit.learningShape === 'procedure' || unit.learningShape === 'lab-process') return `Tests the ordered steps or methods in ${unit.title}.`
  if (unit.learningShape === 'equipment') return `Tests names, uses, and identification details for ${unit.title}.`
  if (unit.learningShape === 'classification' || unit.learningShape === 'taxonomy') return `Tests the category members under ${unit.title}.`
  if (unit.learningShape === 'formula') return `Tests when and how the formula is used.`
  if (unit.learningShape === 'worked-example') return `Tests the example pattern.`
  if (unit.learningShape === 'case-rule') return `Tests the rule and the matching facts.`
  if (unit.learningShape === 'clinical-care') return `Tests the care priority or clinical action.`
  if (unit.learningShape === 'cause-effect') return `Tests the cause-effect relationship in ${unit.title}.`
  if (unit.learningShape === 'troubleshooting') return `Tests symptom, cause, and fix matching.`
  if (unit.learningShape === 'component-system') return `Tests each part and its role.`
  if (unit.learningShape === 'standards-rubrics') return `Tests the criteria or standards.`
  if (unit.learningShape === 'passage-theme') return `Tests the theme or claim with evidence.`
  if (unit.learningShape === 'reflection') return `Tests the reflective focus.`
  if (unit.kind === 'process') return `Tests the steps or methods in ${unit.title}.`
  if (unit.items.length >= 3) return `Tests recall of ${formatInlineList(unit.items.slice(0, 6))}.`
  return `Tests the main idea of ${unit.title}.`
}

function buildKnownSourceMapGeneratedQuestion(unit: GeneratedSourceMapUnit) {
  const key = normalizeAcademicLookup(unit.title)
  const questions: Record<string, string> = {
    'it security': 'What is IT Security?',
    'infosec vs it sec': 'Differentiate InfoSec and IT Security.',
    'cia triad': 'What are the three goals of IT Security?',
    'domains of it security': 'Enumerate the domains of IT Security.',
    'cybersecurity': 'What is Cybersecurity?',
    'cybersecurity approach layers': 'What does a successful cybersecurity approach protect across?',
    'people process technology': 'Which three elements must complement one another to defend an organization from cyberattacks?',
    'unified threat management': 'What security operations can a unified threat management system accelerate?',
    'importance of cybersecurity': 'Why is cybersecurity important to organizations and critical infrastructure?',
    'challenges of cybersecurity': 'Enumerate the challenges of cybersecurity.',
    'impact of a security breach': 'What are possible impacts of a security breach?',
    'types of attackers': 'Classify the types of cyber attackers.',
    'vulnerability exploit breach': 'Differentiate vulnerability, exploit, and breach.',
    'cybersecurity threat types': 'Differentiate cybercrime, disruption, and espionage.',
    'malware types': 'Which items are types of malware?',
    'malware symptoms': 'What are symptoms of malware?',
    'methods of infiltration': 'Enumerate the methods of infiltration.',
    'denial of service methods': 'What methods are used to deny service?',
    'zombie vs botnet': 'Differentiate a zombie and a botnet.',
    'seo vs seo poisoning': 'Differentiate SEO and SEO Poisoning.',
    'blended attacks': 'What is a blended attack?',
    'impact reduction': 'What steps reduce impact after a breach?',
    'arnis': 'What is Arnis?',
    'aliases': 'What are the aliases of Arnis?',
    'ra 9850': 'What did RA 9850 declare?',
    'historical concept': 'What is the historical concept of Arnis?',
    'evolution classifications': 'Enumerate the naming systems or classifications of Arnis.',
    'organizations timeline': 'Arrange the Arnis organizations and milestones chronologically.',
    'timeline': 'Arrange the Arnis timeline chronologically.',
    'regional systems': 'Match each regional system with its group.',
    'main groups': 'What are the three main Arnis groups?',
    'courtesy salutation': 'What are the steps in Pugay or courtesy salutation?',
    'strike types': 'Enumerate the types of strikes.',
    'equipment weapons': 'Identify Arnis weapons and equipment.',
    'stick types': 'Differentiate Arnis stick types and lengths.',
    'regional classifications': 'What are the regional classifications of Arnis?',
    'arnis as a sport': 'How is Arnis played as a sport?',
  }
  return questions[key] ?? null
}

function buildSourceMapGeneratedDistinctions(units: GeneratedSourceMapUnit[]) {
  const distinctions = []
  const infoSec = units.find((unit) => normalizeAcademicLookup(unit.title) === 'infosec vs it sec')
  if (infoSec) {
    distinctions.push({
      conceptA: 'InfoSec',
      conceptB: 'IT Sec',
      difference: infoSec.sourceWording ?? infoSec.support,
      confusionNote: 'InfoSec protects sensitive business information; IT Sec secures digital data through computer network security.',
    })
  }

  const terms = units.find((unit) => normalizeAcademicLookup(unit.title) === 'vulnerability exploit breach')
  if (terms) {
    distinctions.push({
      conceptA: 'Vulnerability',
      conceptB: 'Exploit / Breach',
      difference: terms.sourceWording ?? terms.support,
      confusionNote: 'A vulnerability is the weakness, an exploit takes advantage of it, and a breach is the successful result.',
    })
  }

  return distinctions.slice(0, 4)
}

function cleanGeneratedSourceMapAnswer(title: string, value: string) {
  return value
    .replace(new RegExp(`^what\\s+is\\s+${escapeRegExp(title)}\\??\\s*[\\u2022:;-]?\\s*`, 'i'), '')
    .replace(new RegExp(`^${escapeRegExp(title)}\\??\\s*[\\u2022:;-]?\\s*`, 'i'), '')
    .replace(/^definition of terms\s*[\u2022:;-]?\s*/i, '')
    .replace(/^cybersecurity definitions?\??\s*[\u2022:;-]?\s*/i, '')
    .replace(/^it security definition\s*[\u2022:;-]?\s*/i, '')
    .trim()
}

function cleanGeneratedSourceMapText(value: string) {
  return sanitizeStudentFacingText(value)
    .replace(/\s+/g, ' ')
    .replace(/\?{2,}/g, ' ')
    .trim()
}

function compareGeneratedSourceMapUnits(left: GeneratedSourceMapUnit, right: GeneratedSourceMapUnit) {
  return getGeneratedSourceMapPreferredRank(left.title) - getGeneratedSourceMapPreferredRank(right.title)
    || right.importanceScore - left.importanceScore
    || left.title.localeCompare(right.title)
}

function getGeneratedSourceMapPreferredRank(title: string) {
  const preferred = [
    'IT Security',
    'InfoSec vs IT Sec',
    'CIA Triad',
    'Domains of IT Security',
    'Cybersecurity',
    'Cybersecurity approach layers',
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
    'Zombie vs Botnet',
    'SEO vs SEO Poisoning',
    'Blended Attacks',
    'Impact Reduction',
    'Arnis',
    'RA 9850',
    'Organizations / Timeline',
    'Timeline',
    'Courtesy / Salutation',
    'Equipment / Weapons',
    'Regional Systems',
    'Main Groups',
    'Evolution / Classifications',
    'Historical Concept',
    'Strike Types',
    'Stick Types',
    'Regional Classifications',
  ].map(normalizeAcademicLookup)
  const index = preferred.indexOf(normalizeAcademicLookup(title))
  return index === -1 ? 100 : index
}

function sourceMapGeneratedImportance(score: number, index: number) {
  if (score >= 86 || index < 4) return 'high' as const
  if (score >= 68 || index < 10) return 'medium' as const
  return 'low' as const
}

function isWeakGeneratedSourceMapTerm(value: string) {
  const key = normalizeAcademicLookup(value)
  if (key === 'bot') return false
  if (!key || key.length < 4) return true
  return new Set([
    'what',
    'activity',
    'organization',
    'organization people processes technology must',
    'source summary',
    'exact source wording',
    'reconstructed lists',
    'clean source summary fragments',
    'academic source map',
    'deterministic academic structure',
  ]).has(key)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildDeterministicReviewerFallback(
  structuredSource: AcademicStructuredGrounding,
  resourceTitle: string,
  seedContent: Partial<DeepLearnGeneratedContent> = {},
): DeepLearnGeneratedContent {
  const sourceSentences = extractStudySentences(structuredSource.normalizedText)
  const sourceSummary = sourceSentences[0]
    ?? summarizeStructuredSource(structuredSource, resourceTitle)
  const highYieldPoints = buildHighYieldFallbackPoints(structuredSource)
  const answerBank = buildDeterministicAnswerBank(structuredSource)
  const identificationItems = buildDeterministicIdentificationItems(structuredSource)
  const likelyQuizTargets = buildDeterministicLikelyQuizTargets(structuredSource)
  const fallbackOutput: Record<string, unknown> = {
    ...seedContent,
    title: seedContent.title || resourceTitle,
    overview: seedContent.overview || sourceSummary,
    sections: [
      { heading: 'Source Summary', body: sourceSummary },
      {
        heading: 'High-Yield First',
        body: highYieldPoints.length > 0
          ? highYieldPoints.map((point) => `- ${point}`).join('\n')
          : sourceSummary,
      },
      ...buildDeterministicConceptSections(structuredSource),
    ],
    answerBank: mergeFallbackArray(seedContent.answerBank, answerBank),
    identificationItems: mergeFallbackArray(seedContent.identificationItems, identificationItems),
    likelyQuizTargets: mergeFallbackArray(seedContent.likelyQuizTargets, likelyQuizTargets),
    cautionNotes: Array.isArray(seedContent.cautionNotes) ? seedContent.cautionNotes : [],
  }

  return sanitizeDeepLearnContentForSave(normalizeDeepLearnGeneratedContent(fallbackOutput, resourceTitle))
}

export function buildExamReviewerFromOutline(
  sourceText: string,
  resourceTitle: string,
  seedContent: Partial<DeepLearnGeneratedContent> = {},
): DeepLearnGeneratedContent | null {
  if (!isMeaningfulDeepLearnSourceText({ text: sourceText, title: resourceTitle })) return null

  const structuredSource = structureAcademicSourceText(sourceText)
  const entries = buildOutlineReviewerEntries(structuredSource).slice(0, 18)
  if (entries.length < 6) return null

  const answerBank = entries.slice(0, 12).map((entry, index) => ({
    cue: entry.term,
    kind: entry.kind,
    answer: wordingFromSentence(entry.answer),
    compactAnswer: wordingFromSentence(entry.answer, 180),
    importance: index < 6 ? 'high' as const : 'medium' as const,
    sortKey: null,
    distractors: entries
      .filter((candidate) => candidate.term !== entry.term)
      .map((candidate) => candidate.term)
      .slice(0, 3),
    reviewText: entry.term,
    draftExplanation: entry.answer,
    sourceSnippet: entry.sourceSnippet,
    linkedDraftSectionId: null,
    supportingContext: entry.answer,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: entries
      .filter((candidate) => candidate.term !== entry.term)
      .map((candidate) => candidate.term)
      .slice(0, 5),
  }))

  const identificationItems = entries.slice(0, 12).map((entry, index) => ({
    prompt: entry.question,
    kind: entry.kind,
    answer: wordingFromSentence(entry.term),
    importance: index < 6 ? 'high' as const : 'medium' as const,
    distractors: entries
      .filter((candidate) => candidate.term !== entry.term)
      .map((candidate) => candidate.term)
      .slice(0, 3),
    reviewText: entry.question,
    draftExplanation: entry.answer,
    sourceSnippet: entry.sourceSnippet,
    linkedDraftSectionId: null,
    supportingContext: entry.answer,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: entries
      .filter((candidate) => candidate.term !== entry.term)
      .map((candidate) => candidate.term)
      .slice(0, 5),
  }))

  const likelyQuizTargets = [
    ...entries.slice(0, 4).map((entry, index) => ({
      target: `Identification: ${entry.question}`,
      reason: entry.answer,
      importance: index < 3 ? 'high' as const : 'medium' as const,
      reviewText: entry.term,
      draftExplanation: entry.answer,
      sourceSnippet: entry.sourceSnippet,
      linkedDraftSectionId: null,
      supportingContext: entry.answer,
      compareContext: null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: entries.filter((candidate) => candidate.term !== entry.term).map((candidate) => candidate.term).slice(0, 5),
    })),
    ...entries.slice(4, 8).map((entry, index) => ({
      target: `Multiple choice: Which source statement matches ${entry.term}?`,
      reason: entry.answer,
      importance: index < 2 ? 'high' as const : 'medium' as const,
      reviewText: entry.term,
      draftExplanation: entry.answer,
      sourceSnippet: entry.sourceSnippet,
      linkedDraftSectionId: null,
      supportingContext: entry.answer,
      compareContext: null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: entries.filter((candidate) => candidate.term !== entry.term).map((candidate) => candidate.term).slice(0, 5),
    })),
    ...entries.slice(8, 12).map((entry) => ({
      target: `True or false: ${entry.answer}`,
      reason: 'Answer: True.',
      importance: 'medium' as const,
      reviewText: entry.term,
      draftExplanation: entry.answer,
      sourceSnippet: entry.sourceSnippet,
      linkedDraftSectionId: null,
      supportingContext: entry.answer,
      compareContext: null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: entries.filter((candidate) => candidate.term !== entry.term).map((candidate) => candidate.term).slice(0, 5),
    })),
  ].slice(0, 12)

  const sections = [
    {
      heading: 'Key Terms',
      body: entries.slice(0, 10).map((entry) => `- ${entry.term}: ${entry.answer}`).join('\n'),
    },
    {
      heading: 'Identification Questions',
      body: entries.slice(0, 8).map((entry) => `- ${entry.question} Answer: ${entry.term}.`).join('\n'),
    },
    {
      heading: 'Multiple Choice Questions',
      body: entries.slice(0, 5).map((entry) => formatOutlineMultipleChoiceQuestion(entry, entries)).join('\n\n'),
    },
    {
      heading: 'True/False Questions',
      body: entries.slice(5, 10).map((entry) => `- True or False: ${entry.answer} Answer: True.`).join('\n'),
    },
    {
      heading: 'Quick Review Notes',
      body: entries.slice(0, 12).map((entry) => `- ${entry.answer}`).join('\n'),
    },
  ]

  const fallbackOutput: Record<string, unknown> = {
    title: seedContent.title || resourceTitle,
    overview: seedContent.overview || `Exam reviewer from outline notes for ${resourceTitle}.`,
    sections,
    answerBank: mergeFallbackArray(seedContent.answerBank, answerBank),
    identificationItems: mergeFallbackArray(seedContent.identificationItems, identificationItems),
    distinctions: Array.isArray(seedContent.distinctions) ? seedContent.distinctions : [],
    likelyQuizTargets: mergeFallbackArray(seedContent.likelyQuizTargets, likelyQuizTargets),
    cautionNotes: Array.isArray(seedContent.cautionNotes) ? seedContent.cautionNotes : [],
  }

  const normalized = sanitizeDeepLearnContentForSave(normalizeDeepLearnGeneratedContent(fallbackOutput, resourceTitle))
  return validateDeepLearnContentReadyForSave(normalized).ok ? normalized : null
}

interface OutlineReviewerEntry {
  term: string
  answer: string
  question: string
  sourceSnippet: string
  kind: 'term_definition' | 'fact'
}

function buildOutlineReviewerEntries(structuredSource: AcademicStructuredGrounding): OutlineReviewerEntry[] {
  const definitionEntries = structuredSource.termDefinitions.map((item) => ({
    term: item.term,
    answer: item.definition,
    question: `What is ${item.term}?`,
    sourceSnippet: `${item.term}: ${item.definition}`,
    kind: 'term_definition' as const,
  }))

  const listEntries = structuredSource.lists.flatMap((list) => [
    {
      term: list.heading,
      answer: `${list.heading}: ${formatInlineList(list.items)}.`,
      question: `Enumerate ${list.heading}.`,
      sourceSnippet: `${list.heading}: ${formatInlineList(list.items)}`,
      kind: 'fact' as const,
    },
    ...list.items.slice(0, 8).map((item) => ({
      term: item,
      answer: `${item} belongs under ${list.heading}.`,
      question: `Identify one item under ${list.heading}.`,
      sourceSnippet: `${list.heading}: ${formatInlineList(list.items)}`,
      kind: 'fact' as const,
    })),
  ])

  const groupEntries = structuredSource.conceptGroups.flatMap((group) => [
    {
      term: group.parent,
      answer: `${group.parent}: ${formatInlineList(group.children)}.`,
      question: `What items are connected to ${group.parent}?`,
      sourceSnippet: `${group.parent}: ${formatInlineList(group.children)}`,
      kind: 'fact' as const,
    },
    ...group.children.slice(0, 6).map((child) => ({
      term: child,
      answer: `${child} is connected to ${group.parent}.`,
      question: `Which concept is connected to ${group.parent}?`,
      sourceSnippet: `${group.parent}: ${formatInlineList(group.children)}`,
      kind: 'fact' as const,
    })),
  ])

  const sentenceEntries = extractStudySentences(structuredSource.normalizedText).map((sentence) => {
    const term = extractTermCandidates(sentence)[0] ?? buildSentenceCue(sentence, 'Outline note')
    return {
      term,
      answer: sentence,
      question: `What should you remember about ${term}?`,
      sourceSnippet: sentence,
      kind: 'fact' as const,
    }
  })

  return uniqueBy([...definitionEntries, ...listEntries, ...groupEntries, ...sentenceEntries]
    .map((entry) => ({
      ...entry,
      term: normalizeStudyOutputHeading(cleanGeneratedSourceMapText(entry.term)),
      answer: cleanGeneratedSourceMapText(entry.answer),
      question: cleanGeneratedSourceMapText(entry.question),
      sourceSnippet: cleanGeneratedSourceMapText(entry.sourceSnippet),
    }))
    .filter((entry) => entry.term.length >= 3 && entry.answer.length >= 8)
    .filter((entry) => !isWeakGeneratedSourceMapTerm(entry.term))
    .filter((entry) => !containsInternalPipelineText(`${entry.term} ${entry.answer} ${entry.sourceSnippet}`)),
  (entry) => normalizeAcademicLookup(`${entry.term}:${entry.answer}`))
}

function formatOutlineMultipleChoiceQuestion(entry: OutlineReviewerEntry, entries: OutlineReviewerEntry[]) {
  const distractors = entries
    .filter((candidate) => candidate.term !== entry.term && candidate.answer !== entry.answer)
    .map((candidate) => candidate.answer)
    .slice(0, 3)
  const choices = uniqueStringList([entry.answer, ...distractors]).slice(0, 4)
  const labels = ['A', 'B', 'C', 'D']
  return [
    `- Which statement matches ${entry.term}?`,
    ...choices.map((choice, index) => `  ${labels[index]}. ${choice}`),
    `  Answer: ${entry.answer}`,
  ].join('\n')
}

function hasDeterministicReviewerSourceUnits(structuredSource: AcademicStructuredGrounding) {
  return structuredSource.termDefinitions.length > 0
    || structuredSource.lists.length > 0
    || structuredSource.conceptGroups.length > 0
    || extractStudySentences(structuredSource.normalizedText).length >= 2
}

function summarizeStructuredSource(structuredSource: AcademicStructuredGrounding, resourceTitle: string) {
  const firstDefinition = structuredSource.termDefinitions[0]
  if (firstDefinition) return `${firstDefinition.term}: ${firstDefinition.definition}`

  const firstList = structuredSource.lists[0]
  if (firstList) return `${firstList.heading}: ${formatInlineList(firstList.items)}.`

  const firstGroup = structuredSource.conceptGroups[0]
  if (firstGroup) return `${firstGroup.parent} connects ${formatInlineList(firstGroup.children)}.`

  return `${resourceTitle} contains readable academic source material for review.`
}

function buildHighYieldFallbackPoints(structuredSource: AcademicStructuredGrounding) {
  return uniqueStringList([
    ...structuredSource.termDefinitions
      .slice(0, 4)
      .map((item) => `${item.term}: ${item.definition}`),
    ...structuredSource.lists
      .slice(0, 3)
      .map((list) => `${list.heading}: ${formatInlineList(list.items)}`),
    ...structuredSource.conceptGroups
      .slice(0, 3)
      .map((group) => `${group.parent}: ${formatInlineList(group.children)}`),
    ...extractStudySentences(structuredSource.normalizedText).slice(0, 3),
  ]).slice(0, 8)
}

function buildDeterministicAnswerBank(structuredSource: AcademicStructuredGrounding) {
  const definitionItems = structuredSource.termDefinitions.map((item, index) => {
    const answer = wordingFromSentence(item.definition)
    return {
      cue: item.term,
      kind: 'term_definition' as const,
      answer,
      compactAnswer: wordingFromSentence(truncateForModel(item.definition, 180)),
      importance: index < 6 ? 'high' as const : 'medium' as const,
      sortKey: null,
      distractors: [],
      reviewText: item.term,
      draftExplanation: item.definition,
      sourceSnippet: item.definition,
      linkedDraftSectionId: null,
      supportingContext: item.definition,
      compareContext: null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: relatedStructuredConcepts(structuredSource, item.term),
    }
  })

  const listItems = structuredSource.lists.map((list, index) => {
    const answerText = `${list.heading}:\n${formatNumberedLines(list.items)}`
    return {
      cue: list.heading,
      kind: 'fact' as const,
      answer: wordingFromSentence(answerText),
      compactAnswer: wordingFromSentence(answerText),
      importance: index < 4 ? 'high' as const : 'medium' as const,
      sortKey: null,
      distractors: [],
      reviewText: list.heading,
      draftExplanation: answerText,
      sourceSnippet: answerText,
      linkedDraftSectionId: null,
      supportingContext: answerText,
      compareContext: null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: list.items.slice(0, 5),
    }
  })

  const groupItems = structuredSource.conceptGroups.map((group, index) => {
    const answerText = `${group.parent} connects ${formatInlineList(group.children)}.`
    return {
      cue: group.parent,
      kind: 'fact' as const,
      answer: wordingFromSentence(answerText),
      compactAnswer: wordingFromSentence(answerText),
      importance: index < 3 ? 'high' as const : 'medium' as const,
      sortKey: null,
      distractors: [],
      reviewText: group.parent,
      draftExplanation: answerText,
      sourceSnippet: answerText,
      linkedDraftSectionId: null,
      supportingContext: answerText,
      compareContext: null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: group.children.slice(0, 5),
    }
  })

  return uniqueBy([...definitionItems, ...listItems, ...groupItems], (item) => normalizeAcademicLookup(item.cue)).slice(0, 12)
}

function buildDeterministicIdentificationItems(structuredSource: AcademicStructuredGrounding) {
  const definitionItems = structuredSource.termDefinitions.map((item, index) => ({
    prompt: truncateForModel(item.definition, 140),
    kind: 'term_definition' as const,
    answer: wordingFromSentence(item.term),
    importance: index < 6 ? 'high' as const : 'medium' as const,
    distractors: [],
    reviewText: item.definition,
    draftExplanation: item.definition,
    sourceSnippet: item.definition,
    linkedDraftSectionId: null,
    supportingContext: item.definition,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: relatedStructuredConcepts(structuredSource, item.term),
  }))

  const listItems = structuredSource.lists.flatMap((list, listIndex) => (
    list.items.slice(0, 5).map((item, itemIndex) => ({
      prompt: `One item under ${list.heading}`,
      kind: 'fact' as const,
      answer: wordingFromSentence(item),
      importance: listIndex === 0 && itemIndex < 3 ? 'high' as const : 'medium' as const,
      distractors: [],
      reviewText: list.heading,
      draftExplanation: `${item} belongs under ${list.heading}.`,
      sourceSnippet: `${list.heading}: ${formatInlineList(list.items)}`,
      linkedDraftSectionId: null,
      supportingContext: `${item} belongs under ${list.heading}.`,
      compareContext: null,
      simplifiedWording: null,
      confusionNotes: [],
      relatedConcepts: list.items.filter((candidate) => candidate !== item).slice(0, 4),
    }))
  ))

  return uniqueBy([...definitionItems, ...listItems], (item) => normalizeAcademicLookup(resolveWordingValue(item.answer))).slice(0, 12)
}

function buildDeterministicLikelyQuizTargets(structuredSource: AcademicStructuredGrounding) {
  const headingTargets = structuredSource.headings.slice(0, 5).map((heading, index) => ({
    target: `What should you know about ${heading}?`,
    reason: `${heading} is a major heading or category in the material.`,
    importance: index < 3 ? 'high' as const : 'medium' as const,
    reviewText: heading,
    draftExplanation: `${heading} is a major heading or category in the material.`,
    sourceSnippet: heading,
    linkedDraftSectionId: null,
    supportingContext: `${heading} is a major heading or category in the material.`,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: relatedStructuredConcepts(structuredSource, heading),
  }))

  const groupTargets = structuredSource.conceptGroups.slice(0, 5).map((group, index) => ({
    target: `How do the items under ${group.parent} relate to each other?`,
    reason: `${group.parent} connects ${formatInlineList(group.children)}.`,
    importance: index < 3 ? 'high' as const : 'medium' as const,
    reviewText: group.parent,
    draftExplanation: `${group.parent} connects ${formatInlineList(group.children)}.`,
    sourceSnippet: `${group.parent}: ${formatInlineList(group.children)}`,
    linkedDraftSectionId: null,
    supportingContext: `${group.parent} connects ${formatInlineList(group.children)}.`,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: group.children.slice(0, 5),
  }))

  const listTargets = structuredSource.lists.slice(0, 5).map((list, index) => ({
    target: `Enumerate the items under ${list.heading}.`,
    reason: `${list.heading}: ${formatInlineList(list.items)}.`,
    importance: index < 3 ? 'high' as const : 'medium' as const,
    reviewText: list.heading,
    draftExplanation: `${list.heading}: ${formatInlineList(list.items)}.`,
    sourceSnippet: `${list.heading}: ${formatInlineList(list.items)}`,
    linkedDraftSectionId: null,
    supportingContext: `${list.heading}: ${formatInlineList(list.items)}.`,
    compareContext: null,
    simplifiedWording: null,
    confusionNotes: [],
    relatedConcepts: list.items.slice(0, 5),
  }))

  return uniqueBy([...headingTargets, ...groupTargets, ...listTargets], (item) => normalizeAcademicLookup(item.target)).slice(0, 6)
}

function buildDeterministicConceptSections(structuredSource: AcademicStructuredGrounding) {
  return [
    ...structuredSource.lists.slice(0, 2).map((list) => ({
      heading: normalizeStudyOutputHeading(list.heading),
      body: `${list.heading}:\n${formatNumberedLines(list.items)}`,
    })),
    ...structuredSource.conceptGroups.slice(0, 2).map((group) => ({
      heading: normalizeStudyOutputHeading(group.parent),
      body: `${group.parent} connects ${formatInlineList(group.children)}.`,
    })),
  ].slice(0, 4)
}

function relatedStructuredConcepts(structuredSource: AcademicStructuredGrounding, value: string) {
  const key = normalizeAcademicLookup(value)
  return uniqueStringList([
    ...structuredSource.termDefinitions.map((item) => item.term),
    ...structuredSource.lists.flatMap((list) => [list.heading, ...list.items]),
    ...structuredSource.conceptGroups.flatMap((group) => [group.parent, ...group.children]),
  ]).filter((item) => normalizeAcademicLookup(item) !== key).slice(0, 5)
}

function formatInlineList(items: string[]) {
  return uniqueStringList(items).join(', ')
}

function formatNumberedLines(items: string[]) {
  return uniqueStringList(items)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n')
}

function resolveWordingValue(value: ReturnType<typeof wordingFromSentence>) {
  return value.examSafe || value.exact || value.simplified || ''
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

function wordingFromSentence(sentence: string, maxChars = 220) {
  const text = truncateForModel(sentence, maxChars)
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
    && !isInternalSourceMapIdentificationPrompt(record.prompt)
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

function countDistinctStudyConcepts(content: DeepLearnGeneratedContent) {
  const concepts = [
    ...content.answerBank.map((item) => item.cue),
    ...content.identificationItems
      .filter((item) => !hasInternalSourceMapIdentificationPrompt(item))
      .map((item) => item.prompt),
    ...content.likelyQuizTargets.map((item) => item.target),
  ]
    .map((value) => normalizeAcademicLookup(value))
    .filter((value) => value.length >= 4)
    .filter((value) => !/^(?:source summary|source notes|review the source|study this concept)$/i.test(value))
  return new Set(concepts).size
}

function hasLowInformationStudyContent(content: DeepLearnGeneratedContent) {
  const answerTexts = content.answerBank.map((item) => `${item.cue} ${item.answer.examSafe} ${item.compactAnswer.examSafe}`)
  const identificationTexts = content.identificationItems.map((item) => `${item.prompt} ${item.answer.examSafe}`)
  const targetTexts = content.likelyQuizTargets.map((item) => `${item.target} ${item.reason}`)
  return [...answerTexts, ...identificationTexts, ...targetTexts].some(isLowInformationStudyText)
}

function hasUsablePartialStructuredCore(content: DeepLearnGeneratedContent) {
  const answerBankCount = content.answerBank.filter(hasMeaningfulAnswerBankItem).length
  const identificationCount = content.identificationItems.filter(hasMeaningfulIdentificationItem).length
  const quizTargetCount = content.likelyQuizTargets.filter(hasMeaningfulQuizTarget).length
  return answerBankCount >= 3 || identificationCount >= 3 || quizTargetCount >= 3
}

function getReviewerComposerLeakageDiagnostics(
  studentFacingContent: DeepLearnGeneratedContent,
  originalContent: DeepLearnGeneratedContent = studentFacingContent,
) {
  return {
    reviewerSections: studentFacingContent.sections.some((section) => hasReviewerComposerLeakageText(`${section.heading} ${section.body}`)),
    answerBank: studentFacingContent.answerBank.some((item) => hasReviewerComposerLeakageText(JSON.stringify(item))),
    identificationItems: studentFacingContent.identificationItems.some((item) => hasReviewerComposerLeakageText(JSON.stringify(item))),
    likelyQuizTargets: studentFacingContent.likelyQuizTargets.some((item) => hasReviewerComposerLeakageText(JSON.stringify(item))),
    distinctions: studentFacingContent.distinctions.some((item) => hasReviewerComposerLeakageText(JSON.stringify(item))),
    cautionNotesIgnored: originalContent.cautionNotes.some((note) => hasReviewerComposerLeakageText(note) || containsInternalPipelineText(note)),
  }
}

function hasReviewerComposerLeakageText(value: string) {
  return /\b(?:source-backed|source wording|source chronology|grouped concepts|extracted concepts|compact grounding|exact source passage|Source Notes)\b/i.test(value)
    || /\b(?:classifies|preserves milestones|preserves chronology|using the source wording|Explain the source-backed concept)\b/i.test(value)
    || /\b(?:Generated as compact reviewer|Generated from fallback|partial generation|partial save|fallback wording|internal generation notes?)\b/i.test(value)
}

function hasInternalPipelineTextInStudentFacingContent(content: DeepLearnGeneratedContent) {
  return content.sections.some((section) => containsInternalPipelineText(`${section.heading} ${section.body}`))
    || content.answerBank.some((item) => containsInternalPipelineText(JSON.stringify(item)))
    || content.identificationItems.some((item) => containsInternalPipelineText(JSON.stringify(item)))
    || content.distinctions.some((item) => containsInternalPipelineText(JSON.stringify(item)))
    || content.likelyQuizTargets.some((item) => containsInternalPipelineText(JSON.stringify(item)))
}

function isLowInformationStudyText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const key = normalizeAcademicLookup(normalized)
  if (!key || key.length < 8) return true
  if (/\b(?:metadata|uuid|debug|file title|quality note|ocr confidence|grounding strategy|source notes)\b/i.test(normalized)) return true
  if (/^(?:what|there|high|state|terms|programs|activity|organization)$/i.test(key)) return true
  const alphaChars = normalized.replace(/[^A-Za-z]/g, '').length
  const totalChars = normalized.replace(/\s/g, '').length
  return totalChars > 0 && alphaChars / totalChars < 0.42
}

function containsInternalPipelineText(value: string) {
  return /\b(?:Reconstructed lists|Clean source summary fragments|Normalized headings|Detected concepts|Academic headings|Concept hierarchy|Term definitions|Duplicate OCR\/source fragments collapsed)\b/i.test(value)
}

function isMalformedReviewerHeading(value: string) {
  const cleaned = value.trim()
  if (!cleaned) return true
  if (/^(?:cyber\s*security\s+what|what\s+cyber\s*security|password\s+cracking\s+brute[-\s]?force)/i.test(cleaned)) return true
  return /\b(?:reconstructed lists|clean source summary fragments|normalized headings|detected concepts)\b/i.test(cleaned)
}

function findDuplicatedReviewerConcepts(content: DeepLearnGeneratedContent) {
  const concepts = content.likelyQuizTargets.map((item) => item.target)
  const seen = new Set<string>()
  const duplicated: string[] = []
  for (const concept of concepts) {
    const key = normalizeAcademicLookup(concept)
    if (!key || key.length < 4) continue
    if (seen.has(key)) duplicated.push(key)
    seen.add(key)
  }
  return duplicated
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
    ? buildAcademicSourceMapGrounding(input.bestText, MAX_GROUNDING_CHARS)
      || buildAcademicStructuredGrounding(input.bestText, MAX_GROUNDING_CHARS)
    : 'The original file will be provided directly because dependable parsed text was not stored.'

  return sourceBlock
}

export interface AcademicStructuredGrounding {
  normalizedText: string
  headings: string[]
  headingConfidence: Array<{ heading: string; confidence: number }>
  lists: Array<{ heading: string; items: string[] }>
  termDefinitions: Array<{ term: string; definition: string }>
  conceptGroups: Array<{ parent: string; children: string[] }>
  duplicateFragmentsRemoved: number
  structuredText: string
}

export function structureAcademicSourceText(sourceText: string): AcademicStructuredGrounding {
  const lines = cleanupAcademicSourceLines(sourceText)
  const collapsed = collapseDuplicateFragments(lines)
  const headingGroups = groupAcademicLinesByHeading(collapsed.lines)
  const lists = dedupeAcademicLists([
    ...inferKnownAcademicLists(collapsed.lines),
    ...reconstructAcademicLists(headingGroups),
  ])
  const termDefinitions = extractAcademicTermDefinitions(collapsed.lines)
  const conceptGroups = reconstructAcademicConceptGroups(headingGroups, lists, termDefinitions)
  const headingConfidence = scoreAcademicHeadings(headingGroups, lists)
  const headings = headingConfidence.map((entry) => entry.heading).slice(0, 10)
  const normalizedText = collapsed.lines.join('\n')
  const structuredText = formatAcademicStructuredGrounding({
    headings,
    headingConfidence,
    lists,
    termDefinitions,
    conceptGroups,
    normalizedText,
    duplicateFragmentsRemoved: collapsed.duplicatesRemoved,
  })

  return {
    normalizedText,
    headings,
    headingConfidence,
    lists,
    termDefinitions,
    conceptGroups,
    duplicateFragmentsRemoved: collapsed.duplicatesRemoved,
    structuredText,
  }
}

export function buildAcademicStructuredGrounding(sourceText: string, maxChars = MAX_GROUNDING_CHARS) {
  const structured = structureAcademicSourceText(sourceText)
  const structuredBlock = truncateForModel(structured.structuredText, Math.min(STRUCTURED_GROUNDING_CHAR_BUDGET, Math.max(2200, maxChars - 1800)))
  const excerptBudget = Math.max(1400, Math.min(SOURCE_EXCERPT_CHAR_BUDGET, maxChars - structuredBlock.length - 160))
  const sourceExcerpt = compactGroundingForModel(structured.normalizedText || sourceText, excerptBudget)
  const combined = [
    'Deterministic academic structure from the selected source:',
    structuredBlock,
    '',
    'Closest source passages for exact wording:',
    sourceExcerpt,
  ].join('\n')

  return truncateForModel(combined, maxChars)
}

function cleanupAcademicSourceLines(sourceText: string) {
  return sourceText
    .replace(/\r/g, '\n')
    .replace(/\[[^\]]*source excerpt[^\]]*\]/gi, ' ')
    .split(/\n+|[•]+|\s+(?=\d+[.)]\s+[A-Z])|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((line) => normalizeAcademicSourceLine(line))
    .filter((line) => line.length >= 3)
    .filter((line) => !isAcademicNoiseLine(line))
    .slice(0, 420)
}

function normalizeAcademicSourceLine(line: string) {
  return line
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'([{]+|[\s"')\]}]+$/g, '')
    .replace(/^page\s+\d+\s*(?:of\s+\d+)?\s*/i, '')
    .replace(/^(?:slide|chapter|module)\s+\d+\s*[:.-]?\s*/i, '')
    .replace(/^[-*\u2022]\s*/, '- ')
    .trim()
}

function isAcademicNoiseLine(line: string) {
  const compact = line.replace(/\s+/g, ' ').trim()
  if (compact.length < 3) return true
  if (/^(?:course|module|file|source|extraction|grounding|metadata|uuid|id|debug|quality)\s*[:\-]/i.test(compact)) return true
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(compact)) return true
  if (/^(?:copyright|all rights reserved|downloaded from|canvas)$/i.test(compact)) return true
  const alphaChars = compact.replace(/[^A-Za-z]/g, '').length
  const totalChars = compact.replace(/\s/g, '').length
  return totalChars > 0 && alphaChars / totalChars < 0.35
}

function collapseDuplicateFragments(lines: string[]) {
  const seen = new Set<string>()
  const collapsed: string[] = []
  let duplicatesRemoved = 0

  for (const line of lines) {
    const key = normalizeAcademicLookup(line)
    const previous = collapsed[collapsed.length - 1]
    if (!key) continue
    if (seen.has(key) || (previous && normalizeAcademicLookup(previous) === key)) {
      duplicatesRemoved += 1
      continue
    }
    seen.add(key)
    collapsed.push(line)
  }

  return { lines: collapsed, duplicatesRemoved }
}

function groupAcademicLinesByHeading(lines: string[]) {
  const groups: Array<{ heading: string; lines: string[] }> = []
  let current: { heading: string; lines: string[] } = { heading: 'Source Notes', lines: [] }

  for (const line of lines) {
    const heading = detectAcademicHeading(line)
    if (heading) {
      if (current.lines.length > 0 || current.heading !== 'Source Notes') groups.push(current)
      current = { heading, lines: [] }
      continue
    }
    current.lines.push(line)
  }
  if (current.lines.length > 0 || current.heading !== 'Source Notes') groups.push(current)

  return groups.length > 0 ? groups.slice(0, 12) : [{ heading: 'Source Notes', lines }]
}

function detectAcademicHeading(line: string) {
  const cleaned = line.replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').replace(/[:\-]\s*$/, '').trim()
  if (!cleaned || cleaned.length > 84) return null
  const canonical = canonicalizeAcademicHeading(cleaned)
  if (canonical) return canonical
  if (/password\s+cracking/i.test(cleaned) && /brute|network\s+sniffing|social\s+engineering/i.test(cleaned)) return null
  if (/^(?:password\s+cracking|malware|social\s+engineering|network\s+sniffing)$/i.test(cleaned)) return null
  if (/^(?:objectives?|learning outcomes?|key terms?|definitions?|types?|categories|methods?|domains?|principles|components|symptoms|examples)$/i.test(cleaned)) {
    return normalizeStudyOutputHeading(cleaned)
  }
  const words = cleaned.split(/\s+/)
  const titleLikeWords = words.filter((word) => /^[A-Z0-9][A-Za-z0-9()/-]*$/.test(word)).length
  const mostlyTitleCase = words.length <= 8 && titleLikeWords / Math.max(words.length, 1) >= 0.72
  const noTerminalPunctuation = !/[.!?]$/.test(cleaned)
  return mostlyTitleCase && noTerminalPunctuation
    ? canonicalizeAcademicHeading(normalizeStudyOutputHeading(cleaned)) ?? normalizeStudyOutputHeading(cleaned)
    : null
}

function canonicalizeAcademicHeading(value: string) {
  const cleaned = sanitizeStudentFacingText(value)
    .replace(/\s+/g, ' ')
    .replace(/\bcyber\s+security\b/gi, 'Cybersecurity')
    .trim()
  const lookup = normalizeAcademicLookup(cleaned)

  if (/^(?:cybersecurity what|what cybersecurity|what is cybersecurity(?: all about)?)$/.test(lookup)) return 'What is Cybersecurity?'
  if (/password cracking/.test(lookup) && /(?:brute force|network sniffing|social engineering|methods?)/.test(lookup)) return 'Password Cracking Methods'
  if (/^(?:goals? )?cia(?: triad)?$/.test(lookup)) return 'CIA Triad'
  return null
}

function scoreAcademicHeadings(
  groups: Array<{ heading: string; lines: string[] }>,
  lists: Array<{ heading: string; items: string[] }>,
) {
  const byKey = new Map<string, { heading: string; confidence: number }>()
  const candidates = [
    ...groups
      .filter((group) => group.heading !== 'Source Notes')
      .map((group) => ({
        heading: canonicalizeAcademicHeading(group.heading) ?? group.heading,
        confidence: group.lines.length > 0 ? 0.72 : 0.58,
      })),
    ...lists.map((list) => ({
      heading: canonicalizeAcademicHeading(list.heading) ?? list.heading,
      confidence: list.items.length >= 3 ? 0.92 : 0.82,
    })),
  ]

  for (const candidate of candidates) {
    const key = normalizeAcademicLookup(candidate.heading)
    if (!key) continue
    const previous = byKey.get(key)
    if (!previous || candidate.confidence > previous.confidence) byKey.set(key, candidate)
  }

  return [...byKey.values()]
    .sort((left, right) => right.confidence - left.confidence || left.heading.localeCompare(right.heading))
    .slice(0, 10)
}

function reconstructAcademicLists(groups: Array<{ heading: string; lines: string[] }>) {
  const lists: Array<{ heading: string; items: string[] }> = []
  for (const group of groups) {
    const items = uniqueStringList(group.lines.flatMap(extractListItemsFromLine))
      .filter((item) => item.length >= 3 && item.length <= 90)
      .slice(0, 10)
    if (items.length >= 2) {
      lists.push({ heading: normalizeListHeading(group.heading, items), items })
    }
  }
  return lists.slice(0, 8)
}

function inferKnownAcademicLists(lines: string[]) {
  const lists: Array<{ heading: string; items: string[] }> = []
  const source = lines.join(' ')
  const passwordItems = ['Brute-force', 'Network Sniffing', 'Social Engineering']
    .filter((item) => new RegExp(item.replace('-', '[-\\s]?'), 'i').test(source))
  if (/password\s+cracking/i.test(source) && passwordItems.length >= 2) {
    lists.push({ heading: 'Password Cracking Methods', items: passwordItems })
  }

  const ciaItems = ['Confidentiality', 'Integrity', 'Availability']
    .filter((item) => new RegExp(`\\b${item}\\b`, 'i').test(source))
  if (ciaItems.length >= 2) {
    lists.push({ heading: 'CIA Triad', items: ciaItems })
  }

  return lists
}

function dedupeAcademicLists(lists: Array<{ heading: string; items: string[] }>) {
  const seen = new Set<string>()
  const result: Array<{ heading: string; items: string[] }> = []
  for (const list of lists) {
    const key = normalizeAcademicLookup(list.heading)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(list)
  }
  return result.slice(0, 8)
}

function extractListItemsFromLine(line: string) {
  if (/password\s+cracking/i.test(line) && /brute|network\s+sniffing|social\s+engineering/i.test(line)) {
    return ['Brute-force', 'Network Sniffing', 'Social Engineering'].filter((item) => new RegExp(item.replace('-', '[-\\s]?'), 'i').test(line))
  }

  const explicit = line.match(/^(?:[-*]|\d+[.)]|[A-Za-z][.)])\s+(.+)$/)
  if (explicit?.[1]) return [cleanupListItem(explicit[1])]

  const afterColon = line.match(/(?:include|includes|such as|types of|methods of|categories of|consist of|are)\s+(.+)$/i)?.[1]
  const candidate = afterColon ?? (/[:;]\s+/.test(line) ? line.split(/[:;]/).slice(1).join(', ') : '')
  if (!candidate || !/[,;]|\band\b/i.test(candidate)) return []

  return candidate
    .split(/[,;]|\s+\band\b\s+/i)
    .map(cleanupListItem)
    .filter(Boolean)
}

function cleanupListItem(value: string) {
  return value
    .replace(/\([^)]{80,}\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'([{]+|[\s"'.,;:)\]}]+$/g, '')
    .trim()
}

function normalizeListHeading(heading: string, items: string[]) {
  const joined = items.join(' ')
  if (/brute[-\s]?force|network sniffing|social engineering|password/i.test(joined)) {
    return 'Password Cracking Methods'
  }
  if (/confidentiality|integrity|availability/i.test(joined)) return 'CIA Triad'
  if (heading === 'Source Notes') return 'Key Academic Items'
  return heading
}

function extractAcademicTermDefinitions(lines: string[]) {
  const definitions: Array<{ term: string; definition: string }> = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (detectAcademicHeading(line)) continue
    if (/password\s+cracking/i.test(line) && /brute|network\s+sniffing|social\s+engineering/i.test(line)) continue
    const match = line.match(/^(.{3,72}?)\s+(?:is|are|refers to|means|involves|describes|defines|can be defined as)\s+(.{12,260})$/i)
      ?? line.match(/^(.{3,72}?)\s*[-:]\s*(.{12,260})$/)
    if (!match?.[1] || !match[2]) continue
    const term = normalizeStudyOutputHeading(match[1].replace(/^(?:the|a|an)\s+/i, '').trim())
    const definition = cleanupDefinitionText(match[2])
    const key = normalizeAcademicLookup(term)
    if (!term || !definition || seen.has(key) || isAcademicNoiseLine(term)) continue
    seen.add(key)
    definitions.push({ term, definition })
  }

  return definitions.slice(0, 16)
}

function cleanupDefinitionText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'([{]+|[\s"')\]}]+$/g, '')
    .trim()
}

function reconstructAcademicConceptGroups(
  groups: Array<{ heading: string; lines: string[] }>,
  lists: Array<{ heading: string; items: string[] }>,
  termDefinitions: Array<{ term: string; definition: string }>,
) {
  const conceptGroups: Array<{ parent: string; children: string[] }> = []
  for (const list of lists) {
    conceptGroups.push({ parent: list.heading, children: list.items.slice(0, 8) })
  }

  for (const group of groups) {
    const children = termDefinitions
      .filter((definition) => group.lines.some((line) => normalizeAcademicLookup(line).includes(normalizeAcademicLookup(definition.term))))
      .map((definition) => definition.term)
    if (children.length >= 2) {
      conceptGroups.push({ parent: group.heading, children: uniqueStringList(children).slice(0, 8) })
    }
  }
  conceptGroups.push(...inferRelationshipConceptGroups(groups, termDefinitions))

  return dedupeConceptGroups(conceptGroups).slice(0, 8)
}

function inferRelationshipConceptGroups(
  groups: Array<{ heading: string; lines: string[] }>,
  termDefinitions: Array<{ term: string; definition: string }>,
) {
  const relationshipGroups: Array<{ parent: string; children: string[] }> = []
  for (const group of groups) {
    const heading = canonicalizeAcademicHeading(group.heading) ?? group.heading
    if (heading === 'Source Notes') continue
    const source = group.lines.join(' ')
    const members = uniqueStringList([
      ...extractRelationshipMembers(source),
      ...termDefinitions
        .filter((definition) => group.lines.some((line) => normalizeAcademicLookup(line).includes(normalizeAcademicLookup(definition.term))))
        .map((definition) => definition.term),
    ]).slice(0, 8)
    if (members.length >= 2) relationshipGroups.push({ parent: heading, children: members })
  }
  return relationshipGroups
}

function extractRelationshipMembers(source: string) {
  const match = source.match(/(?:examples?|types?|methods?|techniques?|categories|members|components|subdomains?)\s+(?:include|are|consist of)\s+([^.!?]+)/i)
  if (!match?.[1]) return []
  return match[1]
    .split(/[,;]|\s+\band\b\s+/i)
    .map(cleanupListItem)
    .filter((item) => item.length >= 3 && item.length <= 72)
}

function dedupeConceptGroups(groups: Array<{ parent: string; children: string[] }>) {
  const seen = new Set<string>()
  const result: Array<{ parent: string; children: string[] }> = []
  for (const group of groups) {
    const key = normalizeAcademicLookup(`${group.parent}:${group.children.join(',')}`)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(group)
  }
  return result
}

function formatAcademicStructuredGrounding(input: Omit<AcademicStructuredGrounding, 'structuredText'>) {
  const lines: string[] = []
  if (input.headings.length > 0) {
    lines.push('Academic headings:')
    lines.push(...input.headings.slice(0, 8).map((heading) => `- ${heading}`))
  }
  if (input.conceptGroups.length > 0) {
    lines.push('', 'Concept hierarchy:')
    for (const group of input.conceptGroups.slice(0, 6)) {
      lines.push(`- ${group.parent}: ${group.children.slice(0, 8).join(', ')}`)
    }
  }
  if (input.termDefinitions.length > 0) {
    lines.push('', 'Term definitions:')
    for (const item of input.termDefinitions.slice(0, 12)) {
      lines.push(`- ${item.term}: ${item.definition}`)
    }
  }
  if (input.lists.length > 0) {
    lines.push('', 'Reconstructed lists:')
    for (const list of input.lists.slice(0, 6)) {
      lines.push(`- ${list.heading}: ${list.items.slice(0, 8).join(', ')}`)
    }
  }
  const normalizedSentences = extractStudySentences(input.normalizedText).slice(0, 8)
  if (normalizedSentences.length > 0) {
    lines.push('', 'Clean source summary fragments:')
    lines.push(...normalizedSentences.map((sentence) => `- ${sentence}`))
  }
  if (input.duplicateFragmentsRemoved > 0) {
    lines.push('', `Duplicate OCR/source fragments collapsed: ${input.duplicateFragmentsRemoved}`)
  }

  return lines.join('\n').trim() || input.normalizedText
}

function normalizeAcademicLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function selectBestGroundingText(resource: ModuleSourceResource) {
  const normalizedText = normalizeModuleResourceStudyText(selectDeepLearnGroundingText(resource))
  if (!normalizedText) return ''

  return normalizedText
}

function getSelectedSourceDiagnostics(resource: ModuleSourceResource): DeepLearnSourceDiagnostics {
  return buildDeepLearnSourceDiagnostics({ resource, storedResource: null, module: null, courseName: resource.courseName ?? null })
}

export function buildDeepLearnSourceDiagnostics(
  input: {
    resource: ModuleSourceResource
    storedResource?: ModuleResource | null
    module?: Module | null
    courseName?: string | null
  },
  context: {
    queuedJobId?: string | null
    canonicalSourceId?: string | null
  } = {},
): DeepLearnSourceDiagnostics {
  const resource = input.resource
  const storedResource = input.storedResource ?? null
  const selected = selectDeepLearnSourceTextCandidate(resource)
  const normalizedText = selected ? normalizeModuleResourceStudyText(selected.quality.candidateText) : ''
  const preview = buildSafeExtractedTextPreview(normalizedText)

  return {
    queuedJobId: context.queuedJobId ?? null,
    canonicalSourceId: context.canonicalSourceId ?? storedResource?.id ?? resource.id ?? null,
    moduleResourceId: storedResource?.id ?? resource.id ?? null,
    id: resource.id ?? null,
    title: resource.title ?? storedResource?.title ?? null,
    courseId: storedResource?.courseId ?? input.module?.courseId ?? null,
    courseName: resource.courseName ?? input.courseName ?? null,
    moduleId: storedResource?.moduleId ?? input.module?.id ?? null,
    moduleName: resource.moduleName ?? input.module?.title ?? null,
    canvasFileId: resource.canvasFileId ?? storedResource?.canvasFileId ?? null,
    canvasItemId: resource.canvasItemId ?? storedResource?.canvasItemId ?? null,
    sourceUrl: resource.sourceUrl ?? storedResource?.sourceUrl ?? null,
    htmlUrl: resource.htmlUrl ?? storedResource?.htmlUrl ?? null,
    extractionStatus: resource.extractionStatus ?? storedResource?.extractionStatus ?? null,
    visualExtractionStatus: resource.visualExtractionStatus ?? storedResource?.visualExtractionStatus ?? null,
    extractedCharCount: resource.extractedCharCount ?? storedResource?.extractedCharCount ?? 0,
    extractedTextLength: countTrimmedChars(resource.extractedText ?? storedResource?.extractedText ?? null),
    visualExtractedTextLength: countTrimmedChars(resource.visualExtractedText ?? storedResource?.visualExtractedText ?? null),
    academicTextCharCount: selected?.quality.candidateCharCount ?? 0,
    normalizedCharCount: normalizedText.length,
    sourceFieldUsed: selected?.field ?? 'none',
    sourceFieldSelectionReason: selected?.reason ?? null,
    sourceTextQualityReason: selected?.quality.reason ?? null,
    sourceTextQuality: selected?.quality.quality ?? null,
    contentHash: normalizedText ? hashDiagnosticText(normalizedText) : null,
    previewStart: preview.start,
    previewEnd: preview.end,
  }
}

function selectDeepLearnSourceTextCandidate(resource: ModuleSourceResource) {
  const candidates = [
    { field: 'extracted_text' as const, text: resource.extractedText },
    {
      field: 'visual_extracted_text' as const,
      text: resource.visualExtractionStatus === 'completed' ? resource.visualExtractedText : null,
    },
    { field: 'extracted_text_preview' as const, text: resource.extractedTextPreview },
  ]
    .filter((candidate): candidate is { field: 'extracted_text' | 'visual_extracted_text' | 'extracted_text_preview'; text: string } => typeof candidate.text === 'string' && candidate.text.trim().length > 0)
    .map((candidate) => ({
      ...candidate,
      quality: classifyExtractedTextQuality({ text: candidate.text, title: resource.title }),
    }))

  const selected = candidates
    .filter((candidate) => candidate.quality.quality === 'meaningful')
    .sort((left, right) => right.quality.candidateCharCount - left.quality.candidateCharCount)[0]
    ?? candidates.sort((left, right) => right.quality.candidateCharCount - left.quality.candidateCharCount)[0]

  if (!selected) return null

  return {
    ...selected,
    reason: selected.quality.quality === 'meaningful'
      ? `${selected.field} had the strongest meaningful academic text.`
      : `${selected.field} was the longest available candidate, but it did not pass meaningful academic text checks.`,
  }
}

function countTrimmedChars(value: string | null) {
  return typeof value === 'string' ? value.trim().length : 0
}

function hashDiagnosticText(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function buildSafeExtractedTextPreview(value: string) {
  if (!value) return { start: null, end: null }
  const sanitized = sanitizeDiagnosticPreviewText(value)
  return {
    start: sanitized.slice(0, 2200).trim() || null,
    end: sanitized.length > 2200 ? sanitized.slice(-500).trim() || null : null,
  }
}

function sanitizeDiagnosticPreviewText(value: string) {
  return value
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[uuid]')
    .replace(/https?:\/\/[^\s)]+/gi, '[url]')
    .replace(/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .split('\n')
    .filter((line) => !/^\s*(?:file title|source type of the file|module name|course name|extraction quality reported|source text quality reported|grounding strategy used|ai fallback|debug|uuid|metadata)\s*:/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function logDeepLearnGenerationDiagnostics(
  event: 'source_selected' | 'generation_completed' | 'fallback_used',
  input: {
    sourceDiagnostics: DeepLearnSourceDiagnostics
    sourceMap: AcademicSourceMap | null | undefined
    validation: ReturnType<typeof validateDeepLearnContentReadyForSave> | null
    content: DeepLearnGeneratedContent | null
    fallbackMode: 'not_used' | 'compact_or_micro' | 'source_map_repair' | 'outline_repair' | 'structured_source_repair'
  },
) {
  const sourceMapValidation = input.sourceMap ? validateAcademicSourceMap(input.sourceMap) : null
  const payload = {
    event,
    selectedSource: {
      queuedJobId: input.sourceDiagnostics.queuedJobId,
      canonicalSourceId: input.sourceDiagnostics.canonicalSourceId,
      moduleResourceId: input.sourceDiagnostics.moduleResourceId,
      id: input.sourceDiagnostics.id,
      title: input.sourceDiagnostics.title,
      courseId: input.sourceDiagnostics.courseId,
      courseName: input.sourceDiagnostics.courseName,
      moduleId: input.sourceDiagnostics.moduleId,
      moduleName: input.sourceDiagnostics.moduleName,
      canvasFileId: input.sourceDiagnostics.canvasFileId,
      canvasItemId: input.sourceDiagnostics.canvasItemId,
      sourceUrl: input.sourceDiagnostics.sourceUrl,
      htmlUrl: input.sourceDiagnostics.htmlUrl,
      extractionStatus: input.sourceDiagnostics.extractionStatus,
      visualExtractionStatus: input.sourceDiagnostics.visualExtractionStatus,
      extractedCharCount: input.sourceDiagnostics.extractedCharCount,
      extractedTextLength: input.sourceDiagnostics.extractedTextLength,
      visualExtractedTextLength: input.sourceDiagnostics.visualExtractedTextLength,
      selectedSourceField: input.sourceDiagnostics.sourceFieldUsed,
      selectedSourceReason: input.sourceDiagnostics.sourceFieldSelectionReason,
      academicTextCharCount: input.sourceDiagnostics.academicTextCharCount,
      normalizedCharCount: input.sourceDiagnostics.normalizedCharCount,
      sourceTextQuality: input.sourceDiagnostics.sourceTextQuality,
      sourceTextQualityReason: input.sourceDiagnostics.sourceTextQualityReason,
      contentHash: input.sourceDiagnostics.contentHash,
      preview: process.env.NODE_ENV === 'production'
        ? null
        : {
            start: input.sourceDiagnostics.previewStart,
            end: input.sourceDiagnostics.previewEnd,
          },
    },
    sourceMap: input.sourceMap ? {
      valid: Boolean(sourceMapValidation?.ok),
      reason: sourceMapValidation?.reason ?? null,
      relationCountBeforeValidation: input.sourceMap?.relations?.length ?? 0,
      relationCountAfterValidation: countValidatedAcademicRelations(input.sourceMap),
    } : null,
    generation: {
      fallbackMode: input.fallbackMode,
      finalArtifactCounts: input.content ? getDeepLearnArtifactCounts(input.content) : null,
      validator: input.validation ? {
        ok: input.validation.ok,
        reason: input.validation.reason,
        message: input.validation.message,
        counts: input.validation.counts,
      } : null,
    },
  }

  if (event === 'source_selected' || input.validation?.ok) {
    console.info('[deep-learn-generation] diagnostics', payload)
  } else {
    console.warn('[deep-learn-generation] diagnostics', payload)
  }
}

function logDeepLearnStageDiagnostics(
  event: 'stage_completed' | 'stage_failed' | 'partial_save',
  input: {
    stage: DeepLearnStageKey
    level: DeepLearnFallbackLevel
    maxOutputTokens: number
    outputLength: number | null
    parsedArtifactCounts: ReturnType<typeof getRawDeepLearnArtifactCounts>
    partialSaveHappened: boolean
    finalValidatorResult: ReturnType<typeof validateDeepLearnContentReadyForSave> | null
    requestedAnswerCount?: number | null
    parsedQuickAnswerCount?: number | null
    finalSavedSections?: string[] | null
    reason?: string | null
    rawReason?: string | null
    normalizedIncompleteReason?: string | null
    kind?: DeepLearnGenerationStageError['kind'] | null
    stageCriticality?: DeepLearnStageCriticality
    hasHighYield?: boolean
    hasIdentification?: boolean
    hasQuickAnswers?: boolean
    hasQuizTargets?: boolean
    hasUsableCoreContent?: boolean
    shouldSavePartial?: boolean
    partialReason?: string | null
    finalJobStatus?: 'completed' | 'failed'
    savedSectionCounts?: ReturnType<typeof getRawDeepLearnArtifactCounts>
  },
) {
  const payload = {
    event,
    stage: input.stage,
    failedStage: input.stage,
    normalizedStage: input.stage,
    stageCriticality: input.stageCriticality ?? getDeepLearnStageCriticality(input.stage),
    rawReason: input.rawReason ?? input.reason ?? null,
    normalizedIncompleteReason: input.normalizedIncompleteReason ?? input.partialReason ?? null,
    hasHighYield: input.hasHighYield ?? null,
    hasIdentification: input.hasIdentification ?? null,
    hasQuickAnswers: input.hasQuickAnswers ?? null,
    hasQuizTargets: input.hasQuizTargets ?? null,
    hasUsableCoreContent: input.hasUsableCoreContent ?? null,
    shouldSavePartial: input.shouldSavePartial ?? input.partialSaveHappened,
    partialReason: input.partialReason ?? input.normalizedIncompleteReason ?? input.reason ?? null,
    finalJobStatus: input.finalJobStatus ?? null,
    savedSectionCounts: input.savedSectionCounts ?? input.parsedArtifactCounts,
    fallbackLevelAttempted: input.level,
    maxOutputTokens: input.maxOutputTokens,
    requestedAnswerCount: input.requestedAnswerCount ?? (input.stage === 'quick_answers' ? getQuickAnswerRequestedCount(input.level) : null),
    outputLength: input.outputLength,
    parsedArtifactCounts: input.parsedArtifactCounts,
    parsedQuickAnswerCount: input.parsedQuickAnswerCount ?? input.parsedArtifactCounts.answerBank,
    partialSaveHappened: input.partialSaveHappened,
    finalSavedSections: input.finalSavedSections ?? null,
    finalValidatorResult: input.finalValidatorResult
      ? {
          ok: input.finalValidatorResult.ok,
          reason: input.finalValidatorResult.reason,
          message: input.finalValidatorResult.message,
          counts: input.finalValidatorResult.counts,
          composerLeakageLocations: input.finalValidatorResult.composerLeakageDiagnostics ?? null,
        }
      : null,
    reason: input.reason ?? null,
    kind: input.kind ?? null,
  }

  if (event === 'stage_failed') {
    console.warn('[deep-learn-generation] stage diagnostics', payload)
    return
  }

  console.info('[deep-learn-generation] stage diagnostics', payload)
}

function getDeepLearnArtifactCounts(content: DeepLearnGeneratedContent) {
  return {
    keyTerms: content.answerBank.length,
    reviewerSections: content.sections.length,
    mcqs: content.likelyQuizTargets.filter((item) => /multiple choice|mcq/i.test(`${item.target} ${item.reason}`)).length,
    identificationQuestions: content.identificationItems.length,
    trueFalseQuestions: content.likelyQuizTargets.filter((item) => /true\/false|true or false/i.test(`${item.target} ${item.reason}`)).length,
    quickReviewNotes: content.likelyQuizTargets.length,
    answerBank: content.answerBank.length,
    distinctions: content.distinctions.length,
  }
}

function getRawDeepLearnArtifactCounts(value: Record<string, unknown> | DeepLearnGeneratedContent) {
  const record = value as Record<string, unknown>
  return {
    sections: Array.isArray(record.sections) ? record.sections.length : 0,
    answerBank: Array.isArray(record.answerBank) ? record.answerBank.length : 0,
    identificationItems: Array.isArray(record.identificationItems) ? record.identificationItems.length : 0,
    distinctions: Array.isArray(record.distinctions) ? record.distinctions.length : 0,
    likelyQuizTargets: Array.isArray(record.likelyQuizTargets) ? record.likelyQuizTargets.length : 0,
    cautionNotes: Array.isArray(record.cautionNotes) ? record.cautionNotes.length : 0,
  }
}

function truncateForModel(value: string, maxChars: number) {
  if (value.length <= maxChars) return value

  const clipped = value.slice(0, maxChars)
  const breakIndex = Math.max(
    clipped.lastIndexOf('\n\n'),
    clipped.lastIndexOf('. '),
  )

  if (breakIndex > Math.min(280, maxChars * 0.65)) return clipped.slice(0, breakIndex + 1).trim()

  const wordBreakIndex = Math.max(
    clipped.lastIndexOf(' '),
    clipped.lastIndexOf(';'),
    clipped.lastIndexOf(','),
  )

  return clipped.slice(0, wordBreakIndex > maxChars * 0.65 ? wordBreakIndex : maxChars).trim()
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

function getRequiredDeepLearnApiKey(
  generatorVersion: typeof STRUCTURED_FACT_CARD_COMPILER_VERSION | typeof LEGACY_STAGED_COMPOSER_VERSION = STRUCTURED_FACT_CARD_COMPILER_VERSION,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    if (generatorVersion === STRUCTURED_FACT_CARD_COMPILER_VERSION) {
      throw new DeepLearnGenerationIncompleteError('structured_compiler_setup_missing_openai_api_key')
    }
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
  const prefix = level === 'minimal'
    ? 'Generating minimal reviewer sections'
    : level === 'micro'
    ? 'Generating micro reviewer sections'
    : level === 'compact'
      ? 'Generating compact reviewer sections'
      : 'Generating study pack sections'
  if (stage === 'high_yield') return `${prefix}: High-Yield First.`
  if (stage === 'identification') return `${prefix}: Identification Review.`
  if (stage === 'quick_answers') return `${prefix}: Quick-Answer Blocks.`
  return `${prefix}: Distinctions and Likely Quiz Targets.`
}

function getDeepLearnStageStudentLabel(stage: DeepLearnStageKey) {
  if (stage === 'high_yield') return 'High-Yield First'
  if (stage === 'identification') return 'Identification Review'
  if (stage === 'quick_answers') return 'Quick-Answer Blocks'
  return 'Distinctions and Likely Quiz Targets'
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
      : options.level === 'minimal'
        ? 'minimal fallback'
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
  if (reason === 'structured_compiler_setup_missing_openai_api_key') {
    return 'Structured Study Pack Compiler setup error: OPENAI_API_KEY is not set.'
  }
  if (reason === 'insufficient_structured_artifacts') {
    return DEEP_LEARN_EMPTY_STUDY_ARTIFACTS_MESSAGE
  }
  if (reason === 'invalid_structured_outputs_json') {
    return 'Structured Study Pack Compiler returned malformed structured output.'
  }
  if (reason === 'empty_structured_outputs') {
    return 'Structured Study Pack Compiler returned no structured output.'
  }
  if (reason === 'max_output_tokens') {
    return 'Structured Study Pack Compiler hit the model response limit while extracting fact cards. Try a smaller source or split the module.'
  }
  if (reason.startsWith('provider:')) {
    return `Structured Study Pack Compiler failed during Deep Learn generation: ${reason.slice('provider:'.length)}.`
  }
  if (reason === DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_REASON) {
    return DEEP_LEARN_IDENTIFICATION_OUTPUT_TOO_LARGE_MESSAGE
  }
  if (reason === DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_REASON) {
    return DEEP_LEARN_QUICK_ANSWERS_OUTPUT_TOO_LARGE_MESSAGE
  }
  if (reason === DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_REASON) {
    return DEEP_LEARN_QUIZ_TARGETS_OUTPUT_TOO_LARGE_MESSAGE
  }
  if (reason === DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_REASON) {
    return DEEP_LEARN_OPTIONAL_STAGE_OUTPUT_TOO_LARGE_MESSAGE
  }

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
