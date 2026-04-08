import { isCanvasPageResourceType } from './study-resource'
import type { ModuleResourceCapability, ModuleResourceExtractionStatus } from './types'

export type NormalizedModuleResourceSourceType =
  | 'pdf'
  | 'pptx'
  | 'docx'
  | 'doc'
  | 'text'
  | 'markdown'
  | 'csv'
  | 'html'
  | 'page'
  | 'assignment'
  | 'discussion'
  | 'quiz'
  | 'announcement'
  | 'external_url'
  | 'external_tool'
  | 'subheader'
  | 'file'
  | 'module_item'
  | 'unknown'

export interface ModuleResourceCapabilityLike {
  type?: string | null
  resourceType?: string | null
  extension?: string | null
  contentType?: string | null
  extractionStatus?: ModuleResourceExtractionStatus | null
  extractedText?: string | null
  extractedTextPreview?: string | null
  extractedCharCount?: number | null
  extractionError?: string | null
  metadata?: Record<string, unknown> | null
}

export interface ModuleResourceCapabilityInfo {
  normalizedSourceType: NormalizedModuleResourceSourceType
  capability: ModuleResourceCapability
  capabilityLabel: 'Supported' | 'Partial' | 'Unsupported' | 'Failed'
  capabilityTone: 'accent' | 'warning' | 'muted' | 'danger'
  hasReadableText: boolean
  readableCharCount: number
  isLinkOnly: boolean
  reason: string
}

const LINK_ONLY_SOURCE_TYPES = new Set<NormalizedModuleResourceSourceType>([
  'external_url',
  'external_tool',
  'subheader',
  'module_item',
])

export function getModuleResourceCapabilityInfo(resource: ModuleResourceCapabilityLike): ModuleResourceCapabilityInfo {
  const normalizedSourceType = getNormalizedModuleResourceSourceType(resource)
  const hasReadableText = hasReadableModuleResourceText(resource)
  const readableCharCount = getReadableModuleResourceCharCount(resource)
  const extractionStatus = normalizeExtractionStatus(resource.extractionStatus)
  const isLinkOnly = LINK_ONLY_SOURCE_TYPES.has(normalizedSourceType)
  const capability = resolveModuleResourceCapability({
    normalizedSourceType,
    extractionStatus,
    hasReadableText,
    metadataCapability: normalizeCapability(resource.metadata?.capability),
  })

  return {
    normalizedSourceType,
    capability,
    capabilityLabel: labelForModuleResourceCapability(capability),
    capabilityTone: toneForModuleResourceCapability(capability),
    hasReadableText,
    readableCharCount,
    isLinkOnly,
    reason: buildCapabilityReason({
      resource,
      normalizedSourceType,
      capability,
      extractionStatus,
      hasReadableText,
      readableCharCount,
      isLinkOnly,
    }),
  }
}

export function getNormalizedModuleResourceSourceType(
  resource: Pick<ModuleResourceCapabilityLike, 'type' | 'resourceType' | 'extension' | 'contentType' | 'metadata'>,
): NormalizedModuleResourceSourceType {
  const metadataSourceType = normalizeNormalizedSourceType(resource.metadata?.normalizedSourceType)
  if (metadataSourceType) {
    return metadataSourceType
  }

  const rawType = getRawResourceType(resource).toLowerCase()
  const extension = resource.extension?.toLowerCase() ?? null
  const contentType = resource.contentType?.toLowerCase() ?? null

  if (isCanvasPageResourceType(rawType)) return 'page'
  if (rawType.includes('assignment')) return 'assignment'
  if (rawType.includes('discussion')) return 'discussion'
  if (rawType.includes('quiz')) return 'quiz'
  if (rawType.includes('announcement')) return 'announcement'
  if (rawType.includes('external tool')) return 'external_tool'
  if (rawType.includes('external url') || rawType === 'externalurl' || rawType.includes('external')) return 'external_url'
  if (rawType.includes('subheader')) return 'subheader'

  if (extension === 'pdf' || contentType?.includes('pdf')) return 'pdf'
  if (extension === 'pptx' || contentType?.includes('presentation')) return 'pptx'
  if (extension === 'docx' || contentType?.includes('wordprocessingml.document')) return 'docx'
  if (extension === 'doc' || contentType?.includes('msword')) return 'doc'
  if (extension === 'txt' || contentType?.startsWith('text/plain')) return 'text'
  if (extension === 'md' || contentType?.includes('markdown')) return 'markdown'
  if (extension === 'csv' || contentType?.includes('csv')) return 'csv'
  if (extension === 'html' || extension === 'htm' || contentType?.includes('text/html')) return 'html'
  if (rawType.includes('file')) return 'file'
  if (rawType.includes('module')) return 'module_item'

  return 'unknown'
}

export function hasReadableModuleResourceText(resource: Pick<ModuleResourceCapabilityLike, 'extractedText' | 'extractedTextPreview'>) {
  return Boolean(resource.extractedText?.trim() || resource.extractedTextPreview?.trim())
}

export function getReadableModuleResourceCharCount(
  resource: Pick<ModuleResourceCapabilityLike, 'extractedCharCount' | 'extractedText' | 'extractedTextPreview'>,
) {
  if (typeof resource.extractedCharCount === 'number' && resource.extractedCharCount > 0) {
    return resource.extractedCharCount
  }

  return (resource.extractedText?.trim() ?? resource.extractedTextPreview?.trim() ?? '').length
}

export function labelForModuleResourceCapability(capability: ModuleResourceCapability) {
  if (capability === 'supported') return 'Supported'
  if (capability === 'partial') return 'Partial'
  if (capability === 'unsupported') return 'Unsupported'
  return 'Failed'
}

export function toneForModuleResourceCapability(capability: ModuleResourceCapability) {
  if (capability === 'supported') return 'accent'
  if (capability === 'partial') return 'warning'
  if (capability === 'unsupported') return 'muted'
  return 'danger'
}

export function formatNormalizedModuleResourceSourceType(value: NormalizedModuleResourceSourceType) {
  if (value === 'docx') return 'DOCX'
  if (value === 'doc') return 'DOC'
  if (value === 'pdf') return 'PDF'
  if (value === 'pptx') return 'PPTX'
  if (value === 'csv') return 'CSV'
  if (value === 'html') return 'HTML'
  if (value === 'text') return 'TXT'
  if (value === 'markdown') return 'Markdown'
  if (value === 'page') return 'Canvas Page'
  if (value === 'assignment') return 'Canvas Assignment'
  if (value === 'discussion') return 'Canvas Discussion'
  if (value === 'quiz') return 'Canvas Quiz'
  if (value === 'announcement') return 'Announcement'
  if (value === 'external_url') return 'External URL'
  if (value === 'external_tool') return 'External tool'
  if (value === 'subheader') return 'Module subheader'
  if (value === 'module_item') return 'Module item'
  if (value === 'file') return 'Generic file'
  return 'Unknown'
}

function resolveModuleResourceCapability(input: {
  normalizedSourceType: NormalizedModuleResourceSourceType
  extractionStatus: ModuleResourceExtractionStatus
  hasReadableText: boolean
  metadataCapability: ModuleResourceCapability | null
}) {
  if (input.extractionStatus === 'failed') return 'failed'
  if (input.extractionStatus === 'unsupported') return 'unsupported'
  if (input.extractionStatus === 'extracted' && input.hasReadableText) return 'supported'

  if (input.extractionStatus === 'metadata_only' || input.extractionStatus === 'empty' || input.extractionStatus === 'pending') {
    return LINK_ONLY_SOURCE_TYPES.has(input.normalizedSourceType) ? 'unsupported' : 'partial'
  }

  if (input.metadataCapability) {
    return input.metadataCapability
  }

  if (LINK_ONLY_SOURCE_TYPES.has(input.normalizedSourceType)) {
    return 'unsupported'
  }

  return input.hasReadableText ? 'supported' : 'partial'
}

function buildCapabilityReason(input: {
  resource: ModuleResourceCapabilityLike
  normalizedSourceType: NormalizedModuleResourceSourceType
  capability: ModuleResourceCapability
  extractionStatus: ModuleResourceExtractionStatus
  hasReadableText: boolean
  readableCharCount: number
  isLinkOnly: boolean
}) {
  const sourceNoun = isCanvasPageResourceType(getRawResourceType(input.resource)) ? 'page' : 'resource'
  const storedNote = input.resource.extractionError?.trim()

  if (input.capability === 'supported' && input.hasReadableText) {
    return input.readableCharCount > 0
      ? `Readable text is persisted for this ${sourceNoun} (${input.readableCharCount.toLocaleString()} characters).`
      : `Readable text is persisted for this ${sourceNoun}.`
  }

  if (input.extractionStatus === 'pending') {
    return storedNote || `Extraction has not completed for this ${sourceNoun} yet.`
  }

  if (input.capability === 'failed') {
    return storedNote || `Stay Focused could not prepare readable text for this ${sourceNoun} during the last extraction attempt.`
  }

  if (input.capability === 'unsupported') {
    if (storedNote) return storedNote
    if (input.isLinkOnly) {
      return `This ${sourceNoun} is link-only in Stay Focused right now. The app can route you back to Canvas, but it cannot read the content into the shared text pipeline.`
    }

    return `This ${sourceNoun} type is not readable in the current extraction pipeline, so Stay Focused keeps it explicit instead of inventing study text.`
  }

  if (input.extractionStatus === 'empty') {
    return storedNote || `The ${sourceNoun} was read, but no usable text was found.`
  }

  if (input.extractionStatus === 'metadata_only') {
    return storedNote || `Only metadata and module context are stored for this ${sourceNoun} right now.`
  }

  return storedNote || `This ${sourceNoun} is only partially usable in the shared study pipeline right now.`
}

function normalizeCapability(value: unknown): ModuleResourceCapability | null {
  return value === 'supported' || value === 'partial' || value === 'unsupported' || value === 'failed'
    ? value
    : null
}

function normalizeExtractionStatus(value: unknown): ModuleResourceExtractionStatus {
  return value === 'pending'
    || value === 'extracted'
    || value === 'metadata_only'
    || value === 'unsupported'
    || value === 'empty'
    || value === 'failed'
    ? value
    : 'metadata_only'
}

function normalizeNormalizedSourceType(value: unknown): NormalizedModuleResourceSourceType | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()

  return normalized === 'pdf'
    || normalized === 'pptx'
    || normalized === 'docx'
    || normalized === 'doc'
    || normalized === 'text'
    || normalized === 'markdown'
    || normalized === 'csv'
    || normalized === 'html'
    || normalized === 'page'
    || normalized === 'assignment'
    || normalized === 'discussion'
    || normalized === 'quiz'
    || normalized === 'announcement'
    || normalized === 'external_url'
    || normalized === 'external_tool'
    || normalized === 'subheader'
    || normalized === 'file'
    || normalized === 'module_item'
    || normalized === 'unknown'
    ? normalized
    : null
}

function getRawResourceType(resource: Pick<ModuleResourceCapabilityLike, 'type' | 'resourceType'>) {
  return resource.type ?? resource.resourceType ?? 'Resource'
}
