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
    return buildBlockedReadiness({
      canonicalResourceId,
      blockedReason: 'no_stored_resource',
      sourceNote: null,
      sourceType: getNormalizedModuleResourceSourceType(resource),
    })
  }

  const quality = getModuleResourceQualityInfo(sourceRecord)
  const hasGroundingText = Boolean(selectDeepLearnGroundingText(sourceRecord))

  if ((quality.quality === 'strong' || quality.quality === 'usable') && hasGroundingText) {
    return {
      state: 'ready',
      canonicalResourceId,
      blockedReason: null,
      canGenerate: true,
      summary: 'Deep Learn can generate now from the stored source evidence.',
      detail: quality.reason,
    }
  }

  const blockedReason = detectExplicitDeepLearnBlockedReason(sourceRecord)
  if (blockedReason) {
    return buildBlockedReadiness({
      canonicalResourceId,
      blockedReason,
      sourceNote: getDeepLearnSourceNote(sourceRecord),
      sourceType: getNormalizedModuleResourceSourceType(sourceRecord),
    })
  }

  if (canAttemptDeepLearnSourceFetch(storedResource)) {
    return {
      state: 'via_source_fetch',
      canonicalResourceId,
      blockedReason: null,
      canGenerate: true,
      summary: 'Deep Learn needs a stronger source fetch before it can write a trustworthy note.',
      detail: hasGroundingText
        ? 'The stored extract is still weak, so Deep Learn will retry the original source before generating the note.'
        : 'The stored record has too little readable text right now, so Deep Learn will try the original source before giving up.',
    }
  }

  return buildBlockedReadiness({
    canonicalResourceId,
    blockedReason: getModuleResourceCapabilityInfo(sourceRecord).capability === 'unsupported'
      ? 'unsupported_source_type'
      : 'no_source_path',
    sourceNote: getDeepLearnSourceNote(sourceRecord),
    sourceType: getNormalizedModuleResourceSourceType(sourceRecord),
  })
}

export function buildDeepLearnBlockedReadiness(input: {
  canonicalResourceId?: string | null
  blockedReason: DeepLearnBlockedReason
  sourceNote?: string | null
  sourceType?: NormalizedModuleResourceSourceType | null
  sourceFetchAttempted?: boolean
}): DeepLearnResourceReadiness {
  return buildBlockedReadiness({
    canonicalResourceId: input.canonicalResourceId ?? null,
    blockedReason: input.blockedReason,
    sourceNote: input.sourceNote ?? null,
    sourceType: input.sourceType ?? null,
    sourceFetchAttempted: input.sourceFetchAttempted ?? false,
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

export function selectDeepLearnGroundingText(
  resource: Pick<ModuleResourceCapabilityLike, 'extractedText' | 'extractedTextPreview'>,
) {
  const extractedText = resource.extractedText?.trim() ?? ''
  if (extractedText) return extractedText

  return resource.extractedTextPreview?.trim() ?? ''
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

function buildBlockedReadiness(input: {
  canonicalResourceId: string | null
  blockedReason: DeepLearnBlockedReason
  sourceNote: string | null
  sourceType: NormalizedModuleResourceSourceType | null
  sourceFetchAttempted?: boolean
}): DeepLearnResourceReadiness {
  const message = describeDeepLearnBlockedReason({
    blockedReason: input.blockedReason,
    sourceNote: input.sourceNote,
    sourceType: input.sourceType,
    sourceFetchAttempted: input.sourceFetchAttempted ?? false,
  })

  return {
    state: 'blocked',
    canonicalResourceId: input.canonicalResourceId,
    blockedReason: input.blockedReason,
    canGenerate: false,
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

  return null
}

function describeDeepLearnBlockedReason(input: {
  blockedReason: DeepLearnBlockedReason
  sourceNote: string | null
  sourceType: NormalizedModuleResourceSourceType | null
  sourceFetchAttempted: boolean
}) {
  const sourceNote = input.sourceNote
  const sourceTypeLabel = formatDeepLearnSourceType(input.sourceType)

  if (input.blockedReason === 'no_stored_resource') {
    return {
      summary: 'Deep Learn is blocked until this Learn item has a synced resource row.',
      detail: 'This resource is visible in Learn, but it still does not map to a stored module resource record, so Deep Learn cannot save or reopen a stable note for it yet.',
    }
  }

  if (input.blockedReason === 'no_source_path') {
    return {
      summary: 'Deep Learn is blocked because no fetchable source path is stored for this item.',
      detail: sourceNote
        ?? 'The synced resource record does not currently include a Canvas API URL, file URL, or resolvable module-item target that Deep Learn can retrieve.',
    }
  }

  if (input.blockedReason === 'unsupported_source_type') {
    return {
      summary: `Deep Learn is blocked because this ${sourceTypeLabel} source type is not readable here yet.`,
      detail: sourceNote
        ?? 'Stay Focused keeps the source visible, but this type of item still sits outside the readable Deep Learn extraction path.',
    }
  }

  if (input.blockedReason === 'auth_required') {
    return {
      summary: 'Deep Learn needs Canvas or authenticated source access before it can fetch this item.',
      detail: sourceNote
        ?? 'The current source still requires authenticated Canvas access or a working token before the original material can be recovered.',
    }
  }

  if (input.blockedReason === 'external_link_only') {
    return {
      summary: 'Deep Learn is blocked because this item only resolves to an external link.',
      detail: sourceNote
        ?? 'Stay Focused can keep the original link available, but it cannot fetch and ground the destination content yet.',
    }
  }

  if (input.blockedReason === 'source_retrieval_failed') {
    return {
      summary: input.sourceFetchAttempted
        ? 'Deep Learn tried the original source, but retrieval failed.'
        : 'Deep Learn is blocked because the original source retrieval already failed.',
      detail: sourceNote
        ?? 'The app could not fetch the original source strongly enough to ground a trustworthy note.',
    }
  }

  return {
    summary: input.sourceFetchAttempted
      ? 'Deep Learn fetched the original source, but the recovered text is still unusable.'
      : 'Deep Learn is blocked because the source still has no usable extracted text.',
    detail: sourceNote
      ?? 'The original source was available, but the retrieval still did not surface enough readable text to support a trustworthy note.',
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
