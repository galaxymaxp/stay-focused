import OpenAI from 'openai'
import type { Module, ModuleResource, Task } from '@/lib/types'
import { getModuleResourceQualityInfo, normalizeModuleResourceStudyText } from '@/lib/module-resource-quality'
import { reprocessStoredModuleResource, shouldReprocessWeakModuleResource } from '@/lib/module-resource-reprocess'
import {
  DEEP_LEARN_PROMPT_VERSION,
  normalizeDeepLearnGeneratedContent,
  type DeepLearnGeneratedContent,
} from '@/lib/deep-learn'
import type { ModuleSourceResource } from '@/lib/module-workspace'
import type { DeepLearnSourceGrounding } from '@/lib/types'
import { getStudySourceTypeLabel } from '@/lib/study-resource'

const DEFAULT_DEEP_LEARN_MODEL = 'gpt-5-mini'
const MAX_GROUNDING_CHARS = 12000

const DEEP_LEARN_SYSTEM_PROMPT = [
  'You create saved Deep Learn study notes from academic source material.',
  'Preserve exact source terminology when it matters.',
  'Keep official names, labels, legal terms, technical vocabulary, and academically testable wording intact.',
  'Explain exact terms clearly instead of replacing them with vague paraphrases.',
  'Do not invent facts, examples, certainty, or missing source details.',
  'If the grounding is weak or partial, surface that explicitly in cautionNotes and in the note sections.',
  'Avoid filler, motivation, generic AI summary language, and broad textbook fluff.',
  'Make the note readable for a normal student and useful for later quiz generation.',
  'Return only JSON that matches the requested schema.',
].join(' ')

const DEEP_LEARN_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'overview',
    'sections',
    'coreTerms',
    'keyFacts',
    'distinctions',
    'likelyQuizPoints',
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
    coreTerms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'explanation', 'importance', 'preserveExactTerm'],
        properties: {
          term: { type: 'string' },
          explanation: { type: 'string' },
          importance: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          preserveExactTerm: { type: 'boolean' },
        },
      },
    },
    keyFacts: {
      type: 'array',
      items: { type: 'string' },
    },
    distinctions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['conceptA', 'conceptB', 'difference'],
        properties: {
          conceptA: { type: 'string' },
          conceptB: { type: 'string' },
          difference: { type: 'string' },
        },
      },
    },
    likelyQuizPoints: {
      type: 'array',
      items: { type: 'string' },
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

export async function generateDeepLearnNoteForResource(
  input: DeepLearnGenerationContext,
): Promise<DeepLearnGenerationResult> {
  const grounding = await buildDeepLearnGrounding(input)
  if (!grounding.promptGrounding.trim()) {
    throw new Error('Source grounding is still too weak to produce a trustworthy Deep Learn note for this resource.')
  }

  const promptText = buildDeepLearnPrompt({
    ...input,
    sourceGrounding: grounding.sourceGrounding,
    promptGrounding: grounding.promptGrounding,
  })

  const client = new OpenAI({
    apiKey: getRequiredDeepLearnApiKey(),
  })

  const response = await client.responses.create({
    model: getDeepLearnModel(),
    store: false,
    instructions: DEEP_LEARN_SYSTEM_PROMPT,
    input: promptText,
    text: {
      format: {
        type: 'json_schema',
        name: 'deep_learn_note',
        strict: true,
        schema: DEEP_LEARN_RESPONSE_SCHEMA,
      },
      verbosity: 'medium',
    },
    max_output_tokens: 5000,
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
  const currentQuality = getModuleResourceQualityInfo(input.resource)
  let surfaceResource = input.resource
  let refreshedResource: ModuleResource | null = null
  let finalQuality = currentQuality
  let groundingStrategy: DeepLearnSourceGrounding['groundingStrategy'] = currentQuality.quality === 'strong' || currentQuality.quality === 'usable'
    ? 'stored_extract'
    : 'insufficient'

  if (shouldReprocessWeakModuleResource(input.storedResource) && hasSourceRefetchCandidate(input.storedResource)) {
    try {
      const reprocessed = await reprocessStoredModuleResource(input.storedResource, {
        triggeredBy: 'learn',
      })

      refreshedResource = {
        ...input.storedResource,
        extractionStatus: reprocessed.update.extractionStatus,
        extractedText: reprocessed.update.extractedText,
        extractedTextPreview: reprocessed.update.extractedTextPreview,
        extractedCharCount: reprocessed.update.extractedCharCount,
        extractionError: reprocessed.update.extractionError,
        metadata: reprocessed.update.metadata,
      }
      surfaceResource = {
        ...surfaceResource,
        extractionStatus: refreshedResource.extractionStatus,
        extractedText: refreshedResource.extractedText,
        extractedTextPreview: refreshedResource.extractedTextPreview,
        extractedCharCount: refreshedResource.extractedCharCount,
        extractionError: refreshedResource.extractionError,
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
      groundingStrategy = 'source_refetch'
    } catch {
      // Keep the existing resource state and let the note prompt stay explicit about the weakness.
    }
  }

  const bestText = selectBestGroundingText(surfaceResource)
  if (!bestText && groundingStrategy === 'insufficient') {
    groundingStrategy = 'context_only'
  }

  const promptGrounding = buildPromptGrounding({
    module: input.module,
    courseName: input.courseName,
    resource: surfaceResource,
    linkedTask: input.linkedTask,
    quality: finalQuality,
    bestText,
  })

  const sourceGrounding: DeepLearnSourceGrounding = {
    sourceType: getStudySourceTypeLabel({
      type: surfaceResource.type,
      kind: surfaceResource.kind,
      extension: surfaceResource.extension,
      contentType: surfaceResource.contentType,
    }),
    extractionQuality: finalQuality.quality,
    groundingStrategy: promptGrounding.trim()
      ? groundingStrategy === 'insufficient'
        ? 'context_only'
        : groundingStrategy
      : 'insufficient',
    usedAiFallback: finalQuality.quality !== 'strong' && finalQuality.quality !== 'usable',
    qualityReason: finalQuality.reason,
    warning: surfaceResource.extractionError ?? surfaceResource.qualityReason ?? null,
    charCount: bestText.length,
  }

  return {
    promptGrounding,
    sourceGrounding,
    refreshedResource,
  }
}

function buildDeepLearnPrompt(input: DeepLearnGenerationContext & {
  promptGrounding: string
  sourceGrounding: DeepLearnSourceGrounding
}) {
  const moduleSummary = input.module.summary?.trim() || 'No module summary was stored.'
  const linkedTaskSummary = input.linkedTask
    ? `${input.linkedTask.title}${input.linkedTask.deadline ? ` (deadline: ${input.linkedTask.deadline})` : ''}${input.linkedTask.details ? ` - ${input.linkedTask.details}` : ''}`
    : 'No directly matched task.'

  return [
    `Prompt version: ${DEEP_LEARN_PROMPT_VERSION}`,
    'Build a saved Deep Learn note for a single study resource.',
    '',
    'Resource context:',
    `- Title: ${input.resource.title}`,
    `- Source type: ${input.sourceGrounding.sourceType ?? input.resource.type}`,
    `- Module: ${input.module.title}`,
    `- Course: ${input.courseName}`,
    `- Why it matters: ${input.resource.whyItMatters ?? 'Not explicitly stored.'}`,
    `- Linked context: ${input.resource.linkedContext ?? 'None stored.'}`,
    `- Matched task: ${linkedTaskSummary}`,
    '',
    'Grounding status:',
    `- Extraction quality: ${input.sourceGrounding.extractionQuality ?? 'unknown'}`,
    `- Grounding strategy: ${input.sourceGrounding.groundingStrategy}`,
    `- Used AI fallback path: ${input.sourceGrounding.usedAiFallback ? 'yes' : 'no'}`,
    `- Source note: ${input.sourceGrounding.qualityReason ?? 'No quality note.'}`,
    `- Source warning: ${input.sourceGrounding.warning ?? 'None.'}`,
    '',
    'Module summary:',
    moduleSummary,
    '',
    'Best available source grounding:',
    input.promptGrounding,
    '',
    'Output requirements:',
    '- Preserve exact terms when they are academically, legally, or technically important.',
    '- Explain exact terms clearly instead of replacing them with vague simpler wording.',
    '- Keep the note quizable.',
    '- Use cautionNotes to mark weak grounding, partial evidence, or missing certainty.',
    '- Keep sections readable and direct. No motivational fluff.',
    '- If the source is weak, say that clearly instead of pretending it is complete.',
  ].join('\n')
}

function buildPromptGrounding(input: {
  module: Module
  courseName: string
  resource: ModuleSourceResource
  linkedTask: Task | null
  quality: ReturnType<typeof getModuleResourceQualityInfo>
  bestText: string
}) {
  const contextBlock = [
    `Resource title: ${input.resource.title}`,
    `Module: ${input.module.title}`,
    `Course: ${input.courseName}`,
    input.resource.whyItMatters ? `Why it matters: ${input.resource.whyItMatters}` : null,
    input.resource.linkedContext ? `Linked context: ${input.resource.linkedContext}` : null,
    input.linkedTask?.title ? `Matched task: ${input.linkedTask.title}` : null,
    `Quality note: ${input.quality.reason}`,
  ].filter(Boolean).join('\n')

  const sourceBlock = input.bestText
    ? truncateForModel(input.bestText, MAX_GROUNDING_CHARS)
    : ''

  return [contextBlock, sourceBlock].filter(Boolean).join('\n\n')
}

function selectBestGroundingText(resource: ModuleSourceResource) {
  const normalizedText = normalizeModuleResourceStudyText(resource.extractedText ?? resource.extractedTextPreview ?? '')
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

function hasSourceRefetchCandidate(resource: ModuleResource) {
  return Boolean(resource.sourceUrl || resource.htmlUrl || resource.extractedTextPreview)
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
