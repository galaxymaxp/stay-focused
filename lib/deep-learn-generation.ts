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
import { reprocessStoredModuleResource } from '@/lib/module-resource-reprocess'
import { getModuleResourceQualityInfo, normalizeModuleResourceStudyText } from '@/lib/module-resource-quality'
import type { ModuleSourceResource } from '@/lib/module-workspace'
import { getStudySourceTypeLabel } from '@/lib/study-resource'
import type { Module, ModuleResource, Task } from '@/lib/types'
import type { DeepLearnBlockedReason, DeepLearnSourceGrounding } from '@/lib/types'

const DEFAULT_DEEP_LEARN_MODEL = 'gpt-5-mini'
const MAX_GROUNDING_CHARS = 12000
const DEEP_LEARN_MAX_OUTPUT_TOKENS = 16384

const DEEP_LEARN_SYSTEM_PROMPT = [
  'You create saved Deep Learn exam prep packs from academic source material.',
  'Optimize for answer-ready recall instead of narrative notes.',
  'Prioritize identification, multiple choice, timeline, law recognition, term-definition recall, and confusable exam targets.',
  'Preserve exact source terminology when it is legally, historically, technically, or academically testable.',
  'Keep every answer compact, source-grounded, and ready to reuse in quizzes.',
  'Do not invent facts, examples, certainty, or missing source details.',
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

interface DeepLearnGroundingDependencies {
  reprocessStoredModuleResource?: typeof reprocessStoredModuleResource
  downloadScanFallbackSource?: (resource: ModuleResource) => Promise<DeepLearnPreparedBinaryInput>
}

export async function generateDeepLearnNoteForResource(
  input: DeepLearnGenerationContext,
): Promise<DeepLearnGenerationResult> {
  const grounding = await buildDeepLearnGrounding(input)
  const promptText = buildDeepLearnPrompt({
    ...input,
    sourceGrounding: grounding.sourceGrounding,
    promptGrounding: grounding.promptGrounding,
    generationMode: grounding.generationMode,
  })

  const client = new OpenAI({
    apiKey: getRequiredDeepLearnApiKey(),
  })

  const response = grounding.generationMode === 'scan_fallback' && grounding.scanFallbackInput
    ? await client.responses.create({
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
        text: responseTextConfig(),
        max_output_tokens: DEEP_LEARN_MAX_OUTPUT_TOKENS,
      })
    : await client.responses.create({
        model: getDeepLearnModel(),
        store: false,
        instructions: DEEP_LEARN_SYSTEM_PROMPT,
        input: promptText,
        text: responseTextConfig(),
        max_output_tokens: DEEP_LEARN_MAX_OUTPUT_TOKENS,
      })

  if (response.status && response.status !== 'completed') {
    const reason = response.incomplete_details?.reason ?? response.status
    throw new Error(`Deep Learn generation did not complete (${reason}).`)
  }

  const rawText = response.output_text?.trim()
  if (!rawText) {
    throw new Error('Deep Learn generation returned an empty response.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('Deep Learn generation returned invalid JSON.')
  }

  return {
    content: normalizeDeepLearnGeneratedContent(parsed, input.resource.title),
    sourceGrounding: grounding.sourceGrounding,
    refreshedResource: grounding.refreshedResource,
  }
}

export async function buildDeepLearnGrounding(input: DeepLearnGenerationContext) {
  return buildDeepLearnGroundingWithDependencies(input)
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
      module: input.module,
      courseName: input.courseName,
      resource: surfaceResource,
      linkedTask: input.linkedTask,
      quality: finalQuality,
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
        module: input.module,
        courseName: input.courseName,
        resource: surfaceResource,
        linkedTask: input.linkedTask,
        quality: finalQuality,
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
      module: input.module,
      courseName: input.courseName,
      resource: input.resource,
      linkedTask: input.linkedTask,
      quality: currentQuality,
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

function buildDeepLearnPrompt(input: DeepLearnGenerationContext & {
  promptGrounding: string
  sourceGrounding: DeepLearnSourceGrounding
  generationMode: 'text' | 'scan_fallback'
}) {
  return [
    `Prompt version: ${DEEP_LEARN_PROMPT_VERSION}`,
    'Build a saved Deep Learn exam prep pack for a single study resource.',
    'Use only the selected resource extracted text as factual grounding. Do not use module summaries, course context, assignment metadata, deadlines, prior packs, or surrounding Canvas/module context as study facts.',
    '',
    'Resource context:',
    `- Title: ${input.resource.title}`,
    `- Source type: ${input.sourceGrounding.sourceType ?? input.resource.type}`,
    `- Module: ${input.module.title}`,
    `- Course: ${input.courseName}`,
    '',
    'Grounding status:',
    `- Extraction quality: ${input.sourceGrounding.extractionQuality ?? 'unknown'}`,
    `- Grounding strategy: ${input.sourceGrounding.groundingStrategy}`,
    `- Generation mode: ${input.generationMode}`,
    `- Used AI fallback path: ${input.sourceGrounding.usedAiFallback ? 'yes' : 'no'}`,
    `- Source note: ${input.sourceGrounding.qualityReason ?? 'No quality note.'}`,
    `- Source warning: ${input.sourceGrounding.warning ?? 'None.'}`,
    '',
    'Best available source grounding:',
    input.promptGrounding,
    '',
    'Output requirements:',
    '- Make answerBank the primary output. Each item should be a compact answerable unit, not a paragraph.',
    '- Favor one-line exam answers such as date -> event, law -> effect, term -> definition, place -> meaning, province -> capital, person -> role, and count recall.',
    '- identificationItems should read like direct quiz prompts with compact answers.',
    '- likelyQuizTargets must rank high-yield items first instead of flattening everything.',
    '- Keep support sections short and secondary. Do not turn the output into a mini textbook.',
    '- If the evidence is partial, still extract what is clearly askable instead of refusing to help.',
    '- Keep distractors plausible but wrong according to the source.',
    '- Use sortKey only when a date or chronology is explicit enough to support timeline review.',
    '- For every review item, include reviewText, draftExplanation, sourceSnippet, and linkedDraftSectionId so Review can preview the deeper Draft/Structure support.',
    '- linkedDraftSectionId should be a short slug for the support section that best backs the item, or null when no section matches.',
    '- For every review item, include supportingContext, compareContext, simplifiedWording, confusionNotes, and relatedConcepts.',
    '- Use compareContext only when a contrast or neighboring concept helps prevent mistakes; otherwise return null.',
    '- Use confusionNotes for common wrong answers, traps, or look-alike terms; use an empty array when none are justified.',
    '- relatedConcepts should contain only source-grounded nearby concepts, not invented recommendations.',
  ].join('\n')
}

function buildPromptGrounding(input: {
  module: Module
  courseName: string
  resource: ModuleSourceResource
  linkedTask: Task | null
  quality: ReturnType<typeof getModuleResourceQualityInfo>
  bestText: string
  scanFallback: boolean
}) {
  const contextBlock = [
    `Resource title: ${input.resource.title}`,
    `Resource id: ${input.resource.id}`,
    `Quality note: ${input.quality.reason}`,
    input.scanFallback ? 'Scan fallback is active because dependable parsed text was not available.' : null,
  ].filter(Boolean).join('\n')

  const sourceBlock = input.bestText
    ? truncateForModel(input.bestText, MAX_GROUNDING_CHARS)
    : 'The original file will be provided directly because dependable parsed text was not stored.'

  return [contextBlock, sourceBlock].filter(Boolean).join('\n\n')
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

function responseTextConfig() {
  return {
    format: {
      type: 'json_schema' as const,
      name: 'deep_learn_exam_prep_pack',
      strict: true,
      schema: DEEP_LEARN_RESPONSE_SCHEMA,
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
