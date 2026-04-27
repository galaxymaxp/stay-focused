import {
  getModuleResourceCapabilityInfo,
  getNormalizedModuleResourceSourceType,
  type ModuleResourceCapabilityLike,
  type NormalizedModuleResourceSourceType,
} from '@/lib/module-resource-capability'
import { getModuleResourceQualityInfo } from '@/lib/module-resource-quality'
import type { ModuleSourceResource } from '@/lib/module-workspace'
import type { DeepLearnBlockedReason, DeepLearnReadiness, ModuleResource } from '@/lib/types'

export interface DeepLearnResourceReadiness {
  state: DeepLearnReadiness
  canonicalResourceId: string | null
  blockedReason: DeepLearnBlockedReason | null
  canGenerate: boolean
  shouldAttemptSourceFetch: boolean
  label: 'Text ready' | 'Partial text' | 'Scan fallback' | 'Unreadable'
  tone: 'accent' | 'warning' | 'muted'
  summary: string
  detail: string
}

export function classifyDeepLearnResourceReadiness(input: {
  resource: ModuleSourceResource
  storedResource: ModuleResource | null
  canonicalResourceId: string | null
}): DeepLearnResourceReadiness {
  const { resource, storedResource, canonicalResourceId } = input
  const sourceRecord = storedResource ?? resource

  if (!storedResource || !canonicalResourceId) {
    return buildUnreadableReadiness({
      canonicalResourceId,
      blockedReason: 'no_stored_resource',
      sourceNote: null,
      sourceType: getNormalizedModuleResourceSourceType(resource),
    })
  }

  const quality = getModuleResourceQualityInfo(sourceRecord)
  const hasGroundingText = Boolean(selectDeepLearnGroundingText(sourceRecord))
  const canFetchSource = canAttemptDeepLearnSourceFetch(storedResource)
  const explicitBlockedReason = detectExplicitDeepLearnBlockedReason(sourceRecord)

  if ((quality.quality === 'strong' || quality.quality === 'usable') && hasGroundingText) {
    return {
      state: 'text_ready',
      canonicalResourceId,
      blockedReason: null,
      canGenerate: true,
      shouldAttemptSourceFetch: false,
      label: 'Text ready',
      tone: 'accent',
      summary: 'Text is ready for an answer-first exam prep pass.',
      detail: quality.reason,
    }
  }

  if (sourceRecord.visualExtractionStatus === 'completed' && hasGroundingText) {
    return {
      state: 'text_ready',
      canonicalResourceId,
      blockedReason: null,
      canGenerate: true,
      shouldAttemptSourceFetch: false,
      label: 'Text ready',
      tone: 'accent',
      summary: 'Visual text is ready for an answer-first exam prep pass.',
      detail: 'Text was recovered through the visual extraction channel and can now ground Deep Learn.',
    }
  }

  if (explicitBlockedReason === 'external_link_only' || explicitBlockedReason === 'unsupported_source_type' || explicitBlockedReason === 'auth_required') {
    return buildUnreadableReadiness({
      canonicalResourceId,
      blockedReason: explicitBlockedReason,
      sourceNote: getDeepLearnSourceNote(sourceRecord),
      sourceType: getNormalizedModuleResourceSourceType(sourceRecord),
    })
  }

  if (requiresVisualExtraction(sourceRecord) && sourceRecord.visualExtractionStatus !== 'completed' && !hasGroundingText) {
    return buildUnreadableReadiness({
      canonicalResourceId,
      blockedReason: 'extraction_unusable_after_fetch',
      sourceNote: getDeepLearnSourceNote(sourceRecord),
      sourceType: getNormalizedModuleResourceSourceType(sourceRecord),
    })
  }

  if (isDeepLearnScanFallbackCapable(sourceRecord)) {
    return {
      state: 'scan_fallback',
      canonicalResourceId,
      blockedReason: null,
      canGenerate: true,
      shouldAttemptSourceFetch: canFetchSource,
      label: 'Scan fallback',
      tone: 'warning',
      summary: 'Parsed text is missing or thin, but scan fallback can still build an exam prep pack.',
      detail: hasGroundingText
        ? 'The stored extract is weak, so Deep Learn can keep the partial text and fall back to the original file if exact answers need scan-based recovery.'
        : 'No dependable parsed text is stored yet, so Deep Learn will try the original file with scan-aware fallback instead of hard-blocking.',
    }
  }

  if (hasGroundingText || canFetchSource) {
    return {
      state: 'partial_text',
      canonicalResourceId,
      blockedReason: null,
      canGenerate: true,
      shouldAttemptSourceFetch: canFetchSource,
      label: 'Partial text',
      tone: 'warning',
      summary: hasGroundingText
        ? 'Partial text is available, so Deep Learn can still extract answer-ready review items.'
        : 'Stored text is missing, but the original source can still be retried before generation.',
      detail: hasGroundingText
        ? 'The system will prefer compact, source-grounded answer units and may refetch the original source first if it can strengthen the extract.'
        : 'Deep Learn will retry the original source first, then fall back to whatever stable text it can recover.',
    }
  }

  return buildUnreadableReadiness({
    canonicalResourceId,
    blockedReason: explicitBlockedReason
      ?? (getModuleResourceCapabilityInfo(sourceRecord).capability === 'unsupported'
        ? 'unsupported_source_type'
        : 'no_source_path'),
    sourceNote: getDeepLearnSourceNote(sourceRecord),
    sourceType: getNormalizedModuleResourceSourceType(sourceRecord),
  })
}

export function buildDeepLearnBlockedReadiness(input: {
  canonicalResourceId?: string | null
  blockedReason: DeepLearnBlockedReason
  sourceNote?: string | null
  sourceType?: NormalizedModuleResourceSourceType | null
}): DeepLearnResourceReadiness {
  return buildUnreadableReadiness({
    canonicalResourceId: input.canonicalResourceId ?? null,
    blockedReason: input.blockedReason,
    sourceNote: input.sourceNote ?? null,
    sourceType: input.sourceType ?? null,
  })
}

export function canAttemptDeepLearnSourceFetch(resource: ModuleResource) {
  const sourceType = getNormalizedModuleResourceSourceType(resource)

  if (sourceType === 'external_url' || sourceType === 'external_tool' || sourceType === 'subheader' || sourceType === 'announcement' || sourceType === 'quiz') {
    return false
  }

  if (sourceType === 'module_item') {
    return Boolean(resource.htmlUrl || resource.sourceUrl)
  }

  return Boolean(resource.sourceUrl)
}

export function isDeepLearnScanFallbackCapable(resource: ModuleResourceCapabilityLike & {
  contentType?: string | null
  extension?: string | null
  sourceUrl?: string | null
  visualExtractionStatus?: ModuleResource['visualExtractionStatus']
  metadata?: Record<string, unknown> | null
}) {
  if (requiresVisualExtraction(resource) && resource.visualExtractionStatus !== 'completed') {
    return false
  }

  const sourceType = getNormalizedModuleResourceSourceType(resource)
  const contentType = resource.contentType?.toLowerCase() ?? ''
  const extension = resource.extension?.toLowerCase() ?? ''
  const hasSourcePath = Boolean(resource.sourceUrl?.trim())
  const isPdf = sourceType === 'pdf' || extension === 'pdf' || contentType.includes('pdf')
  const isImage = contentType.startsWith('image/')
    || extension === 'png'
    || extension === 'jpg'
    || extension === 'jpeg'
    || extension === 'webp'

  return hasSourcePath && (isPdf || isImage)
}

export function selectDeepLearnGroundingText(
  resource: Pick<ModuleResourceCapabilityLike, 'extractedText' | 'extractedTextPreview'> & {
    visualExtractionStatus?: ModuleResource['visualExtractionStatus']
    visualExtractedText?: string | null
  },
) {
  const extractedText = resource.extractedText?.trim() ?? ''
  if (extractedText) return extractedText

  const extractedPreview = resource.extractedTextPreview?.trim() ?? ''
  if (extractedPreview) return extractedPreview

  if (resource.visualExtractionStatus === 'completed') {
    return resource.visualExtractedText?.trim() ?? ''
  }

  return ''
}

export function detectDeepLearnBlockedReasonAfterSourceFetch(resource: ModuleResource): DeepLearnBlockedReason {
  const explicit = detectExplicitDeepLearnBlockedReason(resource)
  if (explicit) {
    return explicit
  }

  const quality = getModuleResourceQualityInfo(resource)
  if (!selectDeepLearnGroundingText(resource) || quality.quality === 'empty') {
    return 'extraction_unusable_after_fetch'
  }

  return 'source_retrieval_failed'
}

function buildUnreadableReadiness(input: {
  canonicalResourceId: string | null
  blockedReason: DeepLearnBlockedReason
  sourceNote: string | null
  sourceType: NormalizedModuleResourceSourceType | null
}): DeepLearnResourceReadiness {
  const message = describeDeepLearnBlockedReason({
    blockedReason: input.blockedReason,
    sourceNote: input.sourceNote,
    sourceType: input.sourceType,
  })

  return {
    state: 'unreadable',
    canonicalResourceId: input.canonicalResourceId,
    blockedReason: input.blockedReason,
    canGenerate: false,
    shouldAttemptSourceFetch: false,
    label: 'Unreadable',
    tone: 'muted',
    summary: message.summary,
    detail: message.detail,
  }
}

function detectExplicitDeepLearnBlockedReason(resource: ModuleResourceCapabilityLike): DeepLearnBlockedReason | null {
  const sourceType = getNormalizedModuleResourceSourceType(resource)
  const fallbackReason = getFallbackReason(resource)
  const sourceNote = getDeepLearnSourceNote(resource)

  if (fallbackReason === 'external_link_only' || sourceType === 'external_url' || sourceType === 'external_tool') {
    return 'external_link_only'
  }

  if (fallbackReason === 'unsupported_file_type' || sourceType === 'subheader' || sourceType === 'announcement' || sourceType === 'quiz') {
    return 'unsupported_source_type'
  }

  if (fallbackReason === 'canvas_resolution_required' || looksLikeAuthRequired(sourceNote)) {
    return 'auth_required'
  }

  if (fallbackReason === 'canvas_fetch_failed' || looksLikeSourceFetchFailure(sourceNote)) {
    return 'source_retrieval_failed'
  }

  if (fallbackReason === 'no_text_in_file' || fallbackReason === 'no_readable_text_found' || looksLikeNoReadableText(sourceNote)) {
    return 'extraction_unusable_after_fetch'
  }

  if (requiresVisualExtraction(resource)) {
    return 'extraction_unusable_after_fetch'
  }

  return null
}

function requiresVisualExtraction(resource: ModuleResourceCapabilityLike & {
  metadata?: Record<string, unknown> | null
  extractionError?: string | null
}) {
  const metadata = typeof resource.metadata === 'object' && resource.metadata !== null && !Array.isArray(resource.metadata)
    ? resource.metadata as Record<string, unknown>
    : {}
  const pdfExtraction = typeof metadata.pdfExtraction === 'object' && metadata.pdfExtraction !== null && !Array.isArray(metadata.pdfExtraction)
    ? metadata.pdfExtraction as Record<string, unknown>
    : {}

  return pdfExtraction.errorCode === 'pdf_image_only_possible'
    || /\bpdf_image_only_possible\b|\bimage-only\b|\bscanned\b/i.test(resource.extractionError ?? '')
}

function describeDeepLearnBlockedReason(input: {
  blockedReason: DeepLearnBlockedReason
  sourceNote: string | null
  sourceType: NormalizedModuleResourceSourceType | null
}) {
  const sourceNote = input.sourceNote
  const sourceTypeLabel = formatDeepLearnSourceType(input.sourceType)

  if (input.blockedReason === 'no_stored_resource') {
    return {
      summary: 'This item needs to be reconnected to its Canvas source before Deep Learn can save notes or quizzes.',
      detail: 'Open Canvas or use source repair so Stay Focused can reconnect the original item.',
    }
  }

  if (input.blockedReason === 'no_source_path') {
    return {
      summary: 'No fetchable source path is stored for this item.',
      detail: sourceNote
        ?? 'This item needs to be reconnected to its Canvas source before Deep Learn can save notes or quizzes.',
    }
  }

  if (input.blockedReason === 'unsupported_source_type') {
    return {
      summary: sourceTypeLabel === 'study'
        ? 'Deep Learn cannot read this source type yet.'
        : `Deep Learn cannot read this ${sourceTypeLabel} yet.`,
      detail: sourceNote
        ?? 'Stay Focused keeps the source visible and labels it as reference material instead of treating it like broken study text.',
    }
  }

  if (input.blockedReason === 'auth_required') {
    return {
      summary: 'Canvas or authenticated source access is still required.',
      detail: sourceNote
        ?? 'The current source still requires authenticated Canvas access or a working token before the original material can be recovered.',
    }
  }

  if (input.blockedReason === 'external_link_only') {
    return {
      summary: 'This source opens outside Canvas. Use the original link for now.',
      detail: sourceNote
        ?? 'Stay Focused can keep the original link available, but it cannot ground the destination content as a trustworthy exam prep pack yet.',
    }
  }

  if (input.blockedReason === 'source_retrieval_failed') {
    return {
      summary: 'The original source could not be recovered cleanly.',
      detail: sourceNote
        ?? 'The app could not fetch the original source strongly enough to ground a trustworthy exam prep pack.',
    }
  }

  return {
    summary: requiresVisualExtraction({ extractionError: sourceNote ?? undefined })
      ? 'No selectable text'
      : 'This file has little or no readable text. It may be scanned or image-only.',
    detail: sourceNote
      ?? 'This PDF appears scanned or image-based. OCR/visual extraction is required before Deep Learn can use it.',
  }
}

function looksLikeAuthRequired(message: string | null) {
  if (!message) return false
  return /\bcanvas auth is required\b|\bcheck canvas_api_token\b|\bneeds canvas api credentials\b|\bauthenticated canvas access\b|\b401\b|\b403\b/i.test(message)
}

function looksLikeSourceFetchFailure(message: string | null) {
  if (!message) return false
  return /\bno longer resolves\b|\bhttp 404\b|\brequest failed\b|\bfetch failed\b|\bresolution failed\b/i.test(message)
}

function looksLikeNoReadableText(message: string | null) {
  if (!message) return false
  return /\bno readable text\b|\bno usable text\b|\bno downloaded content\b|\bimage-based\b|\bscanned\b/i.test(message)
}

function getDeepLearnSourceNote(resource: ModuleResourceCapabilityLike) {
  if (typeof resource.extractionError === 'string' && resource.extractionError.trim()) {
    return resource.extractionError.trim()
  }

  const quality = getModuleResourceQualityInfo(resource)
  return quality.reason || null
}

function getFallbackReason(resource: ModuleResourceCapabilityLike & { fallbackReason?: string | null }) {
  if (typeof resource.fallbackReason === 'string' && resource.fallbackReason.trim()) {
    return resource.fallbackReason.trim()
  }

  const metadata = typeof resource.metadata === 'object' && resource.metadata !== null && !Array.isArray(resource.metadata)
    ? resource.metadata as Record<string, unknown>
    : {}
  const value = metadata.fallbackReason ?? metadata.fallbackState
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatDeepLearnSourceType(value: NormalizedModuleResourceSourceType | null | undefined) {
  if (value === 'page') return 'Canvas page'
  if (value === 'assignment') return 'Canvas assignment'
  if (value === 'discussion') return 'Canvas discussion'
  if (value === 'module_item') return 'Canvas-linked'
  if (value === 'pdf') return 'PDF'
  if (value === 'pptx') return 'slide deck'
  if (value === 'docx' || value === 'doc') return 'document'
  if (value === 'html') return 'HTML'
  if (value === 'text' || value === 'markdown' || value === 'csv') return 'text'
  if (value === 'external_url' || value === 'external_tool') return 'external-link'
  return 'study'
}
