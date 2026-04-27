import {
  extractCanvasFileContent,
  extractCanvasStructuredHtmlContent,
  normalizeExtension,
} from './canvas-resource-extraction'
import type { ModuleResourceExtractionStatus } from './types'

export type NormalizedCanvasContentSourceType =
  | 'assignment'
  | 'discussion'
  | 'announcement'
  | 'page'
  | 'module_item'
  | 'file'
  | 'external_link'
  | 'unknown'

export type NormalizedCanvasContentAttachmentSourceType =
  | 'canvas_file'
  | 'external_link'
  | 'attachment'
  | 'unknown'

export type NormalizedCanvasContentExtractionStatus =
  | 'success'
  | 'partial'
  | 'no_text'
  | 'unsupported'
  | 'failed'

export type CanvasContentFallbackState =
  | 'loading'
  | 'preview_only'
  | 'canvas_resolution_required'
  | 'canvas_fetch_failed'
  | 'unsupported_file_type'
  | 'no_text_in_file'
  | 'no_readable_text_found'
  | 'extraction_failed'
  | 'attachment_only'
  | 'external_link_only'
  | null

export type CanvasContentRecommendationStrength = 'strong' | 'weak' | 'fallback'

export type CanvasContentPreviewState =
  | 'full_text_available'
  | 'preview_only'
  | 'no_text_available'

export interface NormalizedCanvasContentAttachment {
  name: string | null
  url: string | null
  mimeType: string | null
  sourceType: NormalizedCanvasContentAttachmentSourceType
}

export interface NormalizedCanvasContent {
  title: string | null
  sourceType: NormalizedCanvasContentSourceType
  mimeType: string | null
  textContent: string
  attachments: NormalizedCanvasContentAttachment[]
  dueAt: string | null
  postedAt: string | null
  moduleId: string | null
  courseId: string | null
  warnings: string[]
  extractionStatus: NormalizedCanvasContentExtractionStatus
  fallbackState: CanvasContentFallbackState
  recommendationStrength: CanvasContentRecommendationStrength
}

export interface CanvasContentSectionInput {
  label: string
  html?: string | null
  text?: string | null
}

export interface CanvasContentAttachmentInput {
  name?: string | null
  url?: string | null
  mimeType?: string | null
  sourceType?: NormalizedCanvasContentAttachmentSourceType | null
  canvasFileId?: number | null
}

export interface CanvasFileContentInput {
  url?: string | null
  title?: string | null
  mimeType?: string | null
  extension?: string | null
  buffer?: Buffer | null
}

export interface ResolveCanvasContentInput {
  title?: string | null
  sourceType: NormalizedCanvasContentSourceType
  mimeType?: string | null
  extension?: string | null
  sections?: CanvasContentSectionInput[]
  attachments?: CanvasContentAttachmentInput[]
  file?: CanvasFileContentInput | null
  dueAt?: string | null
  postedAt?: string | null
  moduleId?: string | number | null
  courseId?: string | number | null
}

export interface ResolvedCanvasBinarySource {
  buffer: Buffer
  contentType: string | null
  title?: string | null
  extension?: string | null
}

export interface ResolveCanvasAttachmentDownloadInput {
  url: string | null
  title: string | null
  mimeType: string | null
  canvasFileId: number | null
}

export interface ResolveCanvasContentDependencies {
  downloadAttachment?: (
    input: ResolveCanvasAttachmentDownloadInput,
  ) => Promise<ResolvedCanvasBinarySource>
}

export interface PersistedCanvasContentResult {
  extractionStatus: ModuleResourceExtractionStatus
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  metadataPatch: Record<string, unknown>
}

export interface ResolveCanvasContentResult {
  content: NormalizedCanvasContent
  persisted: PersistedCanvasContentResult
}

interface ResolvedAttachmentDiagnostic {
  name: string | null
  url: string | null
  mimeType: string | null
  sourceType: NormalizedCanvasContentAttachmentSourceType
  canvasFileId: number | null
  extractionStatus: NormalizedCanvasContentExtractionStatus
  extractedText: string
  warnings: string[]
  fallbackState: CanvasContentFallbackState
  metadataPatch: Record<string, unknown>
}

interface DirectContentResolution {
  extractionStatus: NormalizedCanvasContentExtractionStatus
  textContent: string
  warnings: string[]
}

interface FileContentResolution {
  mimeType: string | null
  textContent: string
  warnings: string[]
  extractionStatus: NormalizedCanvasContentExtractionStatus
  fallbackState: CanvasContentFallbackState
  metadataPatch: Record<string, unknown>
}

export async function resolveCanvasContentForWorkspaceItem(
  input: ResolveCanvasContentInput,
  dependencies: ResolveCanvasContentDependencies = {},
): Promise<ResolveCanvasContentResult> {
  const normalizedTitle = trimToNull(input.file?.title ?? input.title)
  const normalizedMimeType = trimToNull(input.file?.mimeType ?? input.mimeType)
  const attachments = dedupeAttachments([
    ...normalizeAttachments(input.attachments),
    ...extractAttachmentsFromSections(input.sections),
  ])

  if (input.sourceType === 'file') {
    const fileResult = await resolveFileContent(input, dependencies)
    const content: NormalizedCanvasContent = {
      title: trimToNull(input.file?.title ?? input.title),
      sourceType: 'file',
      mimeType: trimToNull(fileResult.mimeType ?? normalizedMimeType),
      textContent: fileResult.textContent,
      attachments: [],
      dueAt: trimToNull(input.dueAt),
      postedAt: trimToNull(input.postedAt),
      moduleId: normalizeOptionalIdentifier(input.moduleId),
      courseId: normalizeOptionalIdentifier(input.courseId),
      warnings: fileResult.warnings,
      extractionStatus: fileResult.extractionStatus,
      fallbackState: fileResult.fallbackState,
      recommendationStrength: deriveRecommendationStrength({
        extractionStatus: fileResult.extractionStatus,
        hasReadableText: Boolean(fileResult.textContent),
      }),
    }

    return {
      content,
      persisted: buildPersistedCanvasContentResult(content, {
        attachmentDiagnostics: [],
        metadataPatch: fileResult.metadataPatch,
      }),
    }
  }

  const direct = await resolveDirectStructuredContent(input)
  const effectiveDirect: DirectContentResolution = {
    ...direct,
    textContent: removeAttachmentReferenceOnlyBodyText(direct.textContent, attachments),
  }
  const attachmentDiagnostics = await Promise.all(
    attachments.map((attachment) => resolveAttachmentReadableContent(attachment, dependencies)),
  )
  const attachmentTextBlocks = attachmentDiagnostics
    .filter((attachment) => Boolean(attachment.extractedText))
    .map((attachment) => formatAttachmentTextBlock(attachment))

  const combinedText = cleanCanvasContentText([
    effectiveDirect.textContent,
    ...attachmentTextBlocks,
  ].filter(Boolean).join('\n\n'))

  let warnings = uniqueWarnings([
    ...effectiveDirect.warnings,
    ...attachmentDiagnostics.flatMap((attachment) => attachment.warnings),
  ])
  const fallbackState = resolveFallbackState({
    input,
    direct: effectiveDirect,
    attachmentDiagnostics,
    hasReadableText: Boolean(combinedText),
  })
  if (fallbackState === 'attachment_only') {
    warnings = uniqueWarnings([
      ...warnings,
      'Readable content came from Canvas-linked attachments rather than the body itself.',
    ])
  }
  const extractionStatus = resolveNormalizedExtractionStatus({
    input,
    direct: effectiveDirect,
    attachmentDiagnostics,
    hasReadableText: Boolean(combinedText),
    fallbackState,
  })

  const content: NormalizedCanvasContent = {
    title: normalizedTitle,
    sourceType: input.sourceType,
    mimeType: normalizedMimeType,
    textContent: combinedText,
    attachments: attachments.map((attachment) => ({
      name: attachment.name,
      url: attachment.url,
      mimeType: attachment.mimeType,
      sourceType: attachment.sourceType,
    })),
    dueAt: trimToNull(input.dueAt),
    postedAt: trimToNull(input.postedAt),
    moduleId: normalizeOptionalIdentifier(input.moduleId),
    courseId: normalizeOptionalIdentifier(input.courseId),
    warnings,
    extractionStatus,
    fallbackState,
    recommendationStrength: deriveRecommendationStrength({
      extractionStatus,
      hasReadableText: Boolean(combinedText),
    }),
  }

  return {
    content,
    persisted: buildPersistedCanvasContentResult(content, {
      attachmentDiagnostics,
      metadataPatch: {},
    }),
  }
}

export function buildCanvasContentPlaceholderResult(input: {
  title?: string | null
  sourceType: NormalizedCanvasContentSourceType
  mimeType?: string | null
  attachments?: NormalizedCanvasContentAttachment[]
  dueAt?: string | null
  postedAt?: string | null
  moduleId?: string | number | null
  courseId?: string | number | null
  warnings?: string[]
  extractionStatus: NormalizedCanvasContentExtractionStatus
  fallbackState: CanvasContentFallbackState
  recommendationStrength?: CanvasContentRecommendationStrength
}): ResolveCanvasContentResult {
  const content: NormalizedCanvasContent = {
    title: trimToNull(input.title),
    sourceType: input.sourceType,
    mimeType: trimToNull(input.mimeType),
    textContent: '',
    attachments: input.attachments ?? [],
    dueAt: trimToNull(input.dueAt),
    postedAt: trimToNull(input.postedAt),
    moduleId: normalizeOptionalIdentifier(input.moduleId),
    courseId: normalizeOptionalIdentifier(input.courseId),
    warnings: uniqueWarnings(input.warnings ?? []),
    extractionStatus: input.extractionStatus,
    fallbackState: input.fallbackState,
    recommendationStrength: input.recommendationStrength
      ?? deriveRecommendationStrength({
        extractionStatus: input.extractionStatus,
        hasReadableText: false,
      }),
  }

  return {
    content,
    persisted: buildPersistedCanvasContentResult(content, {
      attachmentDiagnostics: [],
      metadataPatch: {},
    }),
  }
}

function normalizeOptionalIdentifier(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized || null
}

async function resolveFileContent(
  input: ResolveCanvasContentInput,
  dependencies: ResolveCanvasContentDependencies,
): Promise<FileContentResolution> {
  const file = input.file
  if (!file) {
    return {
      mimeType: input.mimeType ?? null,
      textContent: '',
      warnings: ['This Canvas file record is missing the file payload required for extraction.'],
      extractionStatus: 'failed' as const,
      fallbackState: 'extraction_failed' as const,
      metadataPatch: {},
    }
  }

  const title = trimToNull(file.title ?? input.title) ?? 'Canvas file'
  const extension = trimToNull(file.extension ?? input.extension) ?? normalizeExtension(null, title)
  const mimeType = trimToNull(file.mimeType ?? input.mimeType)

  let buffer = file.buffer ?? null
  let resolvedMimeType = mimeType
  let resolvedTitle = trimToNull(file.title ?? input.title)
  let resolvedExtension = extension

  if (!buffer) {
    if (!file.url || !dependencies.downloadAttachment) {
      return {
        mimeType: resolvedMimeType,
        textContent: '',
        warnings: ['This Canvas file has no downloaded content yet, so Stay Focused cannot extract readable text from it.'],
        extractionStatus: 'failed' as const,
        fallbackState: 'extraction_failed' as const,
        metadataPatch: {},
      }
    }

    const downloaded = await dependencies.downloadAttachment({
      url: file.url,
      title: resolvedTitle,
      mimeType: resolvedMimeType,
      canvasFileId: null,
    })

    buffer = downloaded.buffer
    resolvedMimeType = trimToNull(downloaded.contentType ?? resolvedMimeType)
    resolvedTitle = trimToNull(downloaded.title ?? resolvedTitle)
    resolvedExtension = trimToNull(downloaded.extension ?? resolvedExtension) ?? normalizeExtension(null, resolvedTitle ?? title)
  }

  const extracted = await extractCanvasFileContent({
    buffer,
    title: resolvedTitle ?? title,
    extension: resolvedExtension,
    contentType: resolvedMimeType,
  })

  return {
    mimeType: resolvedMimeType,
    textContent: extracted.extractedText?.trim() ?? '',
    warnings: uniqueWarnings([extracted.extractionError]),
    extractionStatus: mapLowLevelExtractionStatus(extracted.extractionStatus),
    fallbackState: resolveLowLevelFallbackState(extracted.extractionStatus, 'file'),
    metadataPatch: extracted.metadataPatch ?? {},
  }
}

async function resolveDirectStructuredContent(input: ResolveCanvasContentInput): Promise<DirectContentResolution> {
  const sections = (input.sections ?? [])
    .map((section) => ({
      label: section.label,
      html: trimToNull(section.html),
      text: trimToNull(section.text),
    }))
    .filter((section) => Boolean(section.html || section.text))

  if (sections.length === 0) {
    return {
      extractionStatus: input.sourceType === 'external_link' ? 'unsupported' : 'no_text',
      textContent: '',
      warnings: [],
    }
  }

  const extracted = await extractCanvasStructuredHtmlContent({
    title: trimToNull(input.title) ?? 'Canvas content',
    sections,
    emptyMessage: buildEmptyBodyMessage(input.sourceType),
  })

  return {
    extractionStatus: mapLowLevelExtractionStatus(extracted.extractionStatus),
    textContent: extracted.extractedText?.trim() ?? '',
    warnings: uniqueWarnings([extracted.extractionError]),
  }
}

async function resolveAttachmentReadableContent(
  attachment: CanvasContentAttachmentInput & {
    name: string | null
    url: string | null
    mimeType: string | null
    sourceType: NormalizedCanvasContentAttachmentSourceType
    canvasFileId: number | null
  },
  dependencies: ResolveCanvasContentDependencies,
): Promise<ResolvedAttachmentDiagnostic> {
  if (attachment.sourceType === 'external_link') {
    return {
      name: attachment.name,
      url: attachment.url,
      mimeType: attachment.mimeType,
      sourceType: 'external_link',
      canvasFileId: attachment.canvasFileId,
      extractionStatus: 'unsupported',
      extractedText: '',
      warnings: [buildExternalLinkWarning(attachment)],
      fallbackState: 'external_link_only',
      metadataPatch: {},
    }
  }

  if (!attachment.url) {
    return {
      name: attachment.name,
      url: null,
      mimeType: attachment.mimeType,
      sourceType: attachment.sourceType,
      canvasFileId: attachment.canvasFileId,
      extractionStatus: 'failed',
      extractedText: '',
      warnings: ['A linked attachment was detected, but Canvas did not provide a usable URL for it.'],
      fallbackState: 'extraction_failed',
      metadataPatch: {},
    }
  }

  if (!dependencies.downloadAttachment) {
    return {
      name: attachment.name,
      url: attachment.url,
      mimeType: attachment.mimeType,
      sourceType: attachment.sourceType,
      canvasFileId: attachment.canvasFileId,
      extractionStatus: 'failed',
      extractedText: '',
      warnings: [buildAttachmentDownloadUnavailableWarning(attachment)],
      fallbackState: 'extraction_failed',
      metadataPatch: {},
    }
  }

  try {
    const downloaded = await dependencies.downloadAttachment({
      url: attachment.url,
      title: attachment.name,
      mimeType: attachment.mimeType,
      canvasFileId: attachment.canvasFileId,
    })
    const resolvedTitle = trimToNull(downloaded.title ?? attachment.name) ?? 'Canvas attachment'
    const resolvedMimeType = trimToNull(downloaded.contentType ?? attachment.mimeType)
    const resolvedExtension = trimToNull(downloaded.extension) ?? normalizeExtension(null, resolvedTitle)
    const extracted = await extractCanvasFileContent({
      buffer: downloaded.buffer,
      title: resolvedTitle,
      extension: resolvedExtension,
      contentType: resolvedMimeType,
    })

    return {
      name: resolvedTitle,
      url: attachment.url,
      mimeType: resolvedMimeType,
      sourceType: attachment.sourceType,
      canvasFileId: attachment.canvasFileId,
      extractionStatus: mapLowLevelExtractionStatus(extracted.extractionStatus),
      extractedText: extracted.extractedText?.trim() ?? '',
      warnings: uniqueWarnings([extracted.extractionError]),
      fallbackState: resolveLowLevelFallbackState(extracted.extractionStatus, 'attachment'),
      metadataPatch: extracted.metadataPatch ?? {},
    }
  } catch (error) {
    return {
      name: attachment.name,
      url: attachment.url,
      mimeType: attachment.mimeType,
      sourceType: attachment.sourceType,
      canvasFileId: attachment.canvasFileId,
      extractionStatus: 'failed',
      extractedText: '',
      warnings: [error instanceof Error ? error.message : 'Attachment extraction failed.'],
      fallbackState: 'extraction_failed',
      metadataPatch: {},
    }
  }
}

function buildPersistedCanvasContentResult(
  content: NormalizedCanvasContent,
  context: {
    attachmentDiagnostics: ResolvedAttachmentDiagnostic[]
    metadataPatch: Record<string, unknown>
  },
): PersistedCanvasContentResult {
  const extractedText = trimToNull(content.textContent)
  const extractedTextPreview = extractedText ? extractedText.slice(0, 420) : null
  const previewState = inferCanvasContentPreviewState(extractedText, extractedTextPreview)
  const metadataPatch = {
    ...context.metadataPatch,
    normalizedContentStatus: content.extractionStatus,
    fallbackState: content.fallbackState,
    fallbackReason: content.fallbackState,
    recommendationStrength: content.recommendationStrength,
    attachmentCount: content.attachments.length,
    attachmentReadableCount: context.attachmentDiagnostics.filter((attachment) => Boolean(attachment.extractedText)).length,
    attachmentCanvasFileCount: content.attachments.filter((attachment) => attachment.sourceType === 'canvas_file').length,
    attachmentExternalLinkCount: content.attachments.filter((attachment) => attachment.sourceType === 'external_link').length,
    storedTextLength: extractedText?.length ?? 0,
    storedPreviewLength: extractedTextPreview?.length ?? 0,
    storedWordCount: countCanvasContentWords(extractedText),
    previewState,
    fullTextAvailable: previewState === 'full_text_available',
    attachments: context.attachmentDiagnostics.map((attachment) => ({
      name: attachment.name,
      url: attachment.url,
      mimeType: attachment.mimeType,
      sourceType: attachment.sourceType,
      extractionStatus: attachment.extractionStatus,
      fallbackState: attachment.fallbackState,
      hasReadableText: Boolean(attachment.extractedText),
      canvasFileId: attachment.canvasFileId,
      extractionMetadata: attachment.metadataPatch,
    })),
  }

  return {
    extractionStatus: mapNormalizedToModuleResourceStatus(content),
    extractedText,
    extractedTextPreview,
    extractedCharCount: extractedText?.length ?? 0,
    extractionError: buildWarningSummary(content.warnings),
    metadataPatch,
  }
}

function mapNormalizedToModuleResourceStatus(content: NormalizedCanvasContent): ModuleResourceExtractionStatus {
  if (content.textContent.trim()) {
    return 'extracted'
  }

  if (content.extractionStatus === 'unsupported') {
    return 'unsupported'
  }

  if (content.extractionStatus === 'failed') {
    return 'failed'
  }

  if (content.extractionStatus === 'partial') {
    return 'metadata_only'
  }

  return 'empty'
}

function mapLowLevelExtractionStatus(
  extractionStatus: 'pending' | 'extracted' | 'completed' | 'metadata_only' | 'unsupported' | 'empty' | 'failed',
): NormalizedCanvasContentExtractionStatus {
  if (extractionStatus === 'extracted' || extractionStatus === 'completed') return 'success'
  if (extractionStatus === 'unsupported') return 'unsupported'
  if (extractionStatus === 'failed') return 'failed'
  if (extractionStatus === 'pending' || extractionStatus === 'metadata_only') return 'partial'
  return 'no_text'
}

function resolveLowLevelFallbackState(
  extractionStatus: 'pending' | 'extracted' | 'completed' | 'metadata_only' | 'unsupported' | 'empty' | 'failed',
  context: 'file' | 'attachment',
): CanvasContentFallbackState {
  if (extractionStatus === 'pending') return 'loading'
  if (extractionStatus === 'unsupported') return 'unsupported_file_type'
  if (extractionStatus === 'failed') return 'extraction_failed'
  if (extractionStatus === 'empty') return context === 'file' || context === 'attachment'
    ? 'no_text_in_file'
    : 'no_readable_text_found'
  return null
}

function resolveNormalizedExtractionStatus(input: {
  input: ResolveCanvasContentInput
  direct: DirectContentResolution
  attachmentDiagnostics: ResolvedAttachmentDiagnostic[]
  hasReadableText: boolean
  fallbackState: CanvasContentFallbackState
}): NormalizedCanvasContentExtractionStatus {
  if (input.hasReadableText) {
    const hasPartialSignals = input.direct.extractionStatus === 'failed'
      || input.attachmentDiagnostics.some((attachment) =>
        attachment.extractionStatus === 'failed'
        || attachment.extractionStatus === 'unsupported'
        || attachment.extractionStatus === 'no_text')

    return hasPartialSignals ? 'partial' : 'success'
  }

  if (input.fallbackState === 'external_link_only' || input.fallbackState === 'unsupported_file_type') {
    return 'unsupported'
  }

  if (input.fallbackState === 'extraction_failed') {
    return 'failed'
  }

  if (input.direct.extractionStatus === 'unsupported' && input.input.sourceType === 'external_link') {
    return 'unsupported'
  }

  return input.attachmentDiagnostics.length > 0 && input.direct.extractionStatus === 'success'
    ? 'partial'
    : 'no_text'
}

function resolveFallbackState(input: {
  input: ResolveCanvasContentInput
  direct: DirectContentResolution
  attachmentDiagnostics: ResolvedAttachmentDiagnostic[]
  hasReadableText: boolean
}): CanvasContentFallbackState {
  const hasReadableAttachmentText = input.attachmentDiagnostics.some((attachment) => Boolean(attachment.extractedText))
  const hasCanvasFileAttachment = input.attachmentDiagnostics.some((attachment) => attachment.sourceType === 'canvas_file')
  const hasExternalAttachment = input.attachmentDiagnostics.some((attachment) => attachment.sourceType === 'external_link')
  const hasFailedAttachment = input.attachmentDiagnostics.some((attachment) => attachment.extractionStatus === 'failed')
  const hasUnsupportedAttachment = input.attachmentDiagnostics.some((attachment) => attachment.extractionStatus === 'unsupported')
  const hasNoTextAttachment = input.attachmentDiagnostics.some((attachment) => attachment.extractionStatus === 'no_text')
  const hasNoTextFileAttachment = input.attachmentDiagnostics.some((attachment) => attachment.fallbackState === 'no_text_in_file')

  if (input.hasReadableText && !input.direct.textContent && hasReadableAttachmentText) {
    return 'attachment_only'
  }

  if (!input.hasReadableText && (input.input.sourceType === 'external_link' || (hasExternalAttachment && !hasCanvasFileAttachment))) {
    return 'external_link_only'
  }

  if (!input.hasReadableText && hasUnsupportedAttachment && !hasReadableAttachmentText) {
    return 'unsupported_file_type'
  }

  if (!input.hasReadableText && (input.direct.extractionStatus === 'failed' || hasFailedAttachment)) {
    return 'extraction_failed'
  }

  if (!input.hasReadableText && hasNoTextFileAttachment) {
    return 'no_text_in_file'
  }

  if (!input.hasReadableText && (input.direct.extractionStatus === 'no_text' || hasNoTextAttachment || hasCanvasFileAttachment)) {
    return 'no_readable_text_found'
  }

  return null
}

function deriveRecommendationStrength(input: {
  extractionStatus: NormalizedCanvasContentExtractionStatus
  hasReadableText: boolean
}): CanvasContentRecommendationStrength {
  if (input.hasReadableText) return 'strong'
  if (input.extractionStatus === 'partial' || input.extractionStatus === 'no_text') return 'weak'
  return 'fallback'
}

function normalizeAttachments(attachments: CanvasContentAttachmentInput[] | undefined) {
  return (attachments ?? [])
    .map((attachment) => ({
      name: trimToNull(attachment.name),
      url: trimToNull(attachment.url),
      mimeType: trimToNull(attachment.mimeType),
      sourceType: attachment.sourceType ?? detectAttachmentSourceType(attachment.url),
      canvasFileId: normalizeCanvasFileId(attachment.canvasFileId ?? extractCanvasFileId(attachment.url)),
    }))
    .filter((attachment) => Boolean(attachment.name || attachment.url))
}

function dedupeAttachments(
  attachments: Array<{
    name: string | null
    url: string | null
    mimeType: string | null
    sourceType: NormalizedCanvasContentAttachmentSourceType
    canvasFileId: number | null
  }>,
) {
  const deduped = new Map<string, typeof attachments[number]>()

  for (const attachment of attachments) {
    const key = `${attachment.url ?? ''}::${attachment.name ?? ''}`
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, attachment)
      continue
    }

    deduped.set(key, {
      ...existing,
      name: existing.name ?? attachment.name,
      url: existing.url ?? attachment.url,
      mimeType: existing.mimeType ?? attachment.mimeType,
      sourceType: preferredAttachmentSourceType(existing.sourceType, attachment.sourceType),
      canvasFileId: existing.canvasFileId ?? attachment.canvasFileId,
    })
  }

  return Array.from(deduped.values())
}

function preferredAttachmentSourceType(
  left: NormalizedCanvasContentAttachmentSourceType,
  right: NormalizedCanvasContentAttachmentSourceType,
): NormalizedCanvasContentAttachmentSourceType {
  const priority = {
    canvas_file: 0,
    external_link: 1,
    attachment: 2,
    unknown: 3,
  } satisfies Record<NormalizedCanvasContentAttachmentSourceType, number>

  return priority[left] <= priority[right] ? left : right
}

function extractAttachmentsFromSections(sections: CanvasContentSectionInput[] | undefined) {
  const discovered: CanvasContentAttachmentInput[] = []

  for (const section of sections ?? []) {
    if (!section.html) continue

    const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
    for (const match of section.html.matchAll(anchorPattern)) {
      const attributes = match[1] ?? ''
      const href = readHtmlAttribute(attributes, 'href')
      const apiEndpoint = readHtmlAttribute(attributes, 'data-api-endpoint')
      const rawLabel = stripHtml(match[2] ?? '')
      const label = trimToNull(decodeHtmlEntities(rawLabel))
      const candidateUrl = trimToNull(href ?? apiEndpoint)
      if (!candidateUrl || candidateUrl.startsWith('#') || candidateUrl.startsWith('javascript:')) {
        continue
      }

      discovered.push({
        name: label,
        url: candidateUrl,
        mimeType: null,
        sourceType: detectAttachmentSourceType(candidateUrl),
        canvasFileId: normalizeCanvasFileId(extractCanvasFileId(candidateUrl) ?? extractCanvasFileId(apiEndpoint)),
      })
    }
  }

  return normalizeAttachments(discovered)
}

function detectAttachmentSourceType(url: string | null | undefined): NormalizedCanvasContentAttachmentSourceType {
  if (!url) return 'unknown'

  const normalized = url.trim().toLowerCase()
  if (!normalized) return 'unknown'
  if (extractCanvasFileId(normalized) !== null) return 'canvas_file'
  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('/')) {
    return 'external_link'
  }

  return 'attachment'
}

export function extractCanvasFileId(url: string | null | undefined) {
  if (!url) return null
  const match = url.match(/\/files\/(\d+)(?:\/|[?#]|$)/i)
  if (!match) return null
  return normalizeCanvasFileId(match[1])
}

function normalizeCanvasFileId(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function readHtmlAttribute(attributes: string, name: string) {
  const doubleQuoted = attributes.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'))
  if (doubleQuoted?.[1]) return doubleQuoted[1]

  const singleQuoted = attributes.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'))
  if (singleQuoted?.[1]) return singleQuoted[1]

  const unquoted = attributes.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'))
  return unquoted?.[1] ?? null
}

function formatAttachmentTextBlock(attachment: ResolvedAttachmentDiagnostic) {
  const title = attachment.name ?? 'Attachment'
  return cleanCanvasContentText(`Attachment: ${title}\n${attachment.extractedText}`)
}

function removeAttachmentReferenceOnlyBodyText(
  text: string,
  attachments: Array<{
    name: string | null
    url: string | null
  }>,
) {
  if (!text.trim() || attachments.length === 0) {
    return text
  }

  const attachmentReferences = new Set(
    attachments.flatMap((attachment) => [
      normalizeLookup(attachment.name),
      normalizeLookup(extractAttachmentLabelFromUrl(attachment.url)),
      normalizeLookup(attachment.url),
    ]).filter(Boolean),
  )
  const meaningfulLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalized = normalizeLookup(line)
      if (!normalized) return false
      if (normalized === 'instructions' || normalized === 'prompt' || normalized === 'page content' || normalized === 'announcement') {
        return false
      }

      return !attachmentReferences.has(normalized)
    })

  return meaningfulLines.length === 0 ? '' : text
}

function cleanCanvasContentText(text: string) {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildWarningSummary(warnings: string[]) {
  const unique = uniqueWarnings(warnings)
  if (unique.length === 0) return null
  return unique.slice(0, 3).join(' ')
}

function inferCanvasContentPreviewState(extractedText: string | null, extractedTextPreview: string | null): CanvasContentPreviewState {
  if (!extractedTextPreview) {
    return 'no_text_available'
  }

  if (!extractedText) {
    return 'preview_only'
  }

  return 'full_text_available'
}

function countCanvasContentWords(text: string | null) {
  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

function uniqueWarnings(warnings: Array<string | null | undefined>) {
  return Array.from(new Set(
    warnings
      .map((warning) => trimToNull(warning))
      .filter((warning): warning is string => Boolean(warning)),
  ))
}

function trimToNull(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeLookup(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() ?? ''
}

function extractAttachmentLabelFromUrl(url: string | null) {
  if (!url) return ''

  try {
    const parsed = new URL(url, 'https://canvas.local')
    const label = parsed.pathname.split('/').filter(Boolean).at(-1) ?? ''
    return decodeURIComponent(label.replace(/[-_]+/g, ' '))
  } catch {
    return url
  }
}

function buildEmptyBodyMessage(sourceType: NormalizedCanvasContentSourceType) {
  if (sourceType === 'assignment') {
    return 'Canvas assignment content loaded, but no readable instructions were found in the body.'
  }

  if (sourceType === 'discussion') {
    return 'Canvas discussion content loaded, but no readable prompt text was found in the body.'
  }

  if (sourceType === 'announcement') {
    return 'Canvas announcement content loaded, but no readable body text was found.'
  }

  if (sourceType === 'page') {
    return 'Canvas page content loaded, but no readable body text was found.'
  }

  return 'Canvas content loaded, but no readable body text was found.'
}

function buildExternalLinkWarning(attachment: {
  name: string | null
  url: string | null
}) {
  const label = attachment.name ?? attachment.url ?? 'This link'
  return `${label} is an external link. Stay Focused keeps it as a link and does not pretend it parsed the destination content.`
}

function buildAttachmentDownloadUnavailableWarning(attachment: {
  name: string | null
  url: string | null
}) {
  const label = attachment.name ?? attachment.url ?? 'A linked attachment'
  return `${label} is Canvas-linked content, but no file downloader was available for extraction in this pass.`
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}
