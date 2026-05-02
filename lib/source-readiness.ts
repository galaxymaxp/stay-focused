import {
  formatNormalizedModuleResourceSourceType,
  getModuleResourceCapabilityInfo,
  getNormalizedModuleResourceSourceType,
} from '@/lib/module-resource-capability'
import { classifyExtractedTextQuality } from '@/lib/extracted-text-quality'
import { getModuleResourceQualityInfo } from '@/lib/module-resource-quality'
import { getResourceCanvasHref, getResourceOriginalFileHref, type ModuleSourceResource } from '@/lib/module-workspace'
import { classifyUnrepairedCanvasItem } from '@/lib/source-repair'
import type { ModuleResource } from '@/lib/types'

export type SourceReadinessState =
  | 'ready'
  | 'needs_processing'
  | 'missing_resource_link'
  | 'unsupported_file_type'
  | 'canvas_lesson_page'
  | 'external_link'
  | 'extraction_failed'
  | 'visual_ocr_available'
  | 'visual_ocr_queued'
  | 'visual_ocr_running'
  | 'visual_ocr_partial'
  | 'visual_ocr_completed_empty'
  | 'visual_ocr_failed'
  | 'empty_or_metadata_only'
  | 'unknown'

export type SourceReadinessAction =
  | 'preview'
  | 'start_deep_learn'
  | 'process_source'
  | 'open_source'
  | 'repair_source_link'
  | 'open_canvas'
  | 'add_notes'
  | 'open_lesson'
  | 'summarize_page'
  | 'retry_extraction'
  | 'open_link'
  | 'summarize'
  | 'extract_text_from_images'

export interface SourceSummarySnapshot {
  summary: string | null
  topics: string[]
  studyValue?: 'high' | 'medium' | 'low' | null
  suggestedUse?: string | null
  status: 'ready' | 'pending' | 'failed' | 'stale' | 'missing'
  generatedAt?: string | null
}

export interface NormalizedSourceReadiness {
  id: string
  canonicalResourceId: string | null
  title: string
  moduleId: string
  moduleTitle: string
  sourceTypeLabel: string
  originLabel: string
  state: SourceReadinessState
  statusLabel: string
  message: string
  actions: SourceReadinessAction[]
  fileExtension: string | null
  mimeType: string | null
  pageCount: number | null
  isReadable: boolean
  isUnsupported: boolean
  isRepairable: boolean
  isSummarizable: boolean
  isPacketTracer: boolean
  summary: SourceSummarySnapshot | null
}

export function normalizeSourceReadiness(input: {
  resource: ModuleSourceResource
  storedResource: ModuleResource | null
  canonicalResourceId: string | null
  moduleId: string
  moduleTitle: string
  summary?: SourceSummarySnapshot | null
}): NormalizedSourceReadiness {
  const resource = input.storedResource ?? input.resource
  const sourceType = getNormalizedModuleResourceSourceType(resource)
  const capability = getModuleResourceCapabilityInfo(resource)
  const quality = getModuleResourceQualityInfo(resource)
  const fileExtension = normalizeExtension(resource.extension ?? input.resource.extension)
  const isPacketTracer = fileExtension === 'pkt' || /packet\s*tracer/i.test(input.resource.title)
  const hasSourceHref = Boolean(getSourceHref(input.resource) || input.storedResource?.sourceUrl || input.storedResource?.htmlUrl)
  const hasStoredResource = Boolean(input.storedResource && input.canonicalResourceId)
  const readableTextLength = getReadableTextLength(resource)
  const visualExtractionCandidate = isVisualExtractionCandidate({
    sourceType,
    fileExtension,
    contentType: resource.contentType ?? input.resource.contentType ?? null,
    pageCount: typeof resource.pageCount === 'number' ? resource.pageCount : input.resource.pageCount ?? null,
  })
  const hasCompletedExtraction = resource.extractionStatus === 'completed'
    || resource.extractionStatus === 'extracted'
    || resource.visualExtractionStatus === 'completed'
  const isReadable = hasCompletedExtraction && readableTextLength > 0
  const state = resolveSourceReadinessState({
    hasStoredResource,
    extractionStatus: resource.extractionStatus,
    sourceType,
    capability: capability.capability,
    quality: quality.quality,
    readableTextLength,
    hasCompletedExtraction,
    isReadable,
    isPacketTracer,
    hasSourceHref,
    fallbackReason: quality.fallbackReason,
    visualExtractionStatus: resource.visualExtractionStatus,
    extractionError: resource.extractionError,
    pageCount: typeof resource.pageCount === 'number' ? resource.pageCount : input.resource.pageCount ?? null,
    pagesProcessed: typeof resource.pagesProcessed === 'number' ? resource.pagesProcessed : input.resource.pagesProcessed ?? null,
  })
  const isUnsupported = state === 'unsupported_file_type'
  const isRepairable = state === 'missing_resource_link'
  const isSummarizable = isReadable && !isUnsupported && !isPacketTracer

  return {
    id: input.resource.id,
    canonicalResourceId: input.canonicalResourceId,
    title: input.resource.title,
    moduleId: input.moduleId,
    moduleTitle: input.moduleTitle,
    sourceTypeLabel: buildSourceTypeLabel(input.resource, sourceType, fileExtension, isPacketTracer, Boolean(input.storedResource)),
    originLabel: buildOriginLabel(input.resource, sourceType),
    state,
    statusLabel: statusLabelForState(state, isPacketTracer),
    message: messageForState(state, isPacketTracer, readableTextLength, visualExtractionCandidate),
    actions: actionsForState(state, isSummarizable, visualExtractionCandidate),
    fileExtension,
    mimeType: resource.contentType ?? input.resource.contentType ?? null,
    pageCount: typeof resource.pageCount === 'number' ? resource.pageCount : input.resource.pageCount ?? null,
    isReadable,
    isUnsupported,
    isRepairable,
    isSummarizable,
    isPacketTracer,
    summary: input.summary ?? null,
  }
}

export function getSourceReadinessBucket(state: SourceReadinessState): 'ready' | 'needs_action' | 'unsupported' {
  if (state === 'ready') return 'ready'
  if (state === 'unsupported_file_type' || state === 'external_link' || state === 'canvas_lesson_page') return 'unsupported'
  return 'needs_action'
}

function resolveSourceReadinessState(input: {
  hasStoredResource: boolean
  extractionStatus?: string | null
  sourceType: string
  capability: string
  quality: string
  readableTextLength: number
  hasCompletedExtraction: boolean
  isReadable: boolean
  isPacketTracer: boolean
  hasSourceHref: boolean
  fallbackReason: string | null
  visualExtractionStatus?: ModuleResource['visualExtractionStatus']
  extractionError?: string | null
  pageCount?: number | null
  pagesProcessed?: number | null
}): SourceReadinessState {
  if (input.isPacketTracer) return 'unsupported_file_type'
  if (!input.hasStoredResource) {
    if (input.sourceType === 'page') return 'canvas_lesson_page'
    if (input.sourceType === 'external_url' || input.sourceType === 'external_tool') return 'external_link'
    return 'unknown'
  }
  if (input.isReadable) return 'ready'
  if (input.visualExtractionStatus === 'queued') return 'visual_ocr_queued'
  if (input.visualExtractionStatus === 'running' || input.extractionStatus === 'processing') return 'visual_ocr_running'
  if (
    input.visualExtractionStatus === 'failed'
    && typeof input.pagesProcessed === 'number'
    && typeof input.pageCount === 'number'
    && input.pagesProcessed > 0
    && input.pagesProcessed < input.pageCount
  ) return 'visual_ocr_partial'
  if (input.visualExtractionStatus === 'failed') return 'visual_ocr_failed'
  if (input.visualExtractionStatus === 'completed' && input.readableTextLength < 120) return 'visual_ocr_completed_empty'
  if (input.visualExtractionStatus === 'available' || /\bpdf_image_only_possible\b|\bimage-only\b|\bscanned\b/i.test(input.extractionError ?? '')) {
    return 'visual_ocr_available'
  }
  if (input.hasCompletedExtraction && input.readableTextLength < 120) return 'empty_or_metadata_only'
  if (!input.extractionStatus && input.hasSourceHref && isProcessableSourceType(input.sourceType)) return 'needs_processing'
  if (input.extractionStatus === 'pending') return 'needs_processing'
  if (input.extractionStatus === 'failed' || input.capability === 'failed') return 'extraction_failed'
  if (input.sourceType === 'external_url' || input.sourceType === 'external_tool') return 'external_link'
  if (input.sourceType === 'page') return 'canvas_lesson_page'
  if (input.capability === 'unsupported') return 'unsupported_file_type'
  if (input.extractionStatus === 'empty' || input.extractionStatus === 'metadata_only' || input.quality === 'empty') {
    return input.fallbackReason === 'canvas_resolution_required'
      ? 'missing_resource_link'
      : 'empty_or_metadata_only'
  }
  if (input.quality === 'weak') return 'needs_processing'
  return 'unknown'
}

function buildSourceTypeLabel(
  resource: ModuleSourceResource,
  sourceType: ReturnType<typeof getNormalizedModuleResourceSourceType>,
  extension: string | null,
  isPacketTracer: boolean,
  hasStoredResource: boolean,
) {
  if (isPacketTracer) return 'Packet Tracer lab'
  if (extension && sourceType === 'file') return `${extension.toUpperCase()} file`
  if (!hasStoredResource) {
    return classifyUnrepairedCanvasItem({
      title: resource.title,
      type: resource.type,
      canvasUrl: resource.canvasUrl,
      htmlUrl: resource.htmlUrl,
      externalUrl: null,
      sourceUrl: resource.sourceUrl,
      metadata: {
        extension: resource.extension,
        contentType: resource.contentType,
        sourceType: resource.type,
      },
    })
  }
  return formatNormalizedModuleResourceSourceType(sourceType)
}

function buildOriginLabel(resource: ModuleSourceResource, sourceType: ReturnType<typeof getNormalizedModuleResourceSourceType>) {
  const modulePart = resource.moduleName ? `Canvas module: ${resource.moduleName}` : 'Canvas module item'
  if (sourceType === 'external_url' || sourceType === 'external_tool') return `${modulePart} · External link`
  if (sourceType === 'page') return `${modulePart} · Canvas page`
  if (resource.htmlUrl) return `${modulePart} · Canvas source`
  if (resource.sourceUrl) return `${modulePart} · File source`
  return modulePart
}

function statusLabelForState(state: SourceReadinessState, isPacketTracer: boolean) {
  if (state === 'ready') return 'Ready'
  if (state === 'needs_processing') return 'Needs processing'
  if (state === 'missing_resource_link') return 'Needs source repair'
  if (state === 'unsupported_file_type') return isPacketTracer ? 'Packet Tracer lab' : 'Unsupported'
  if (state === 'canvas_lesson_page') return 'Canvas lesson page'
  if (state === 'external_link') return 'External link'
  if (state === 'extraction_failed') return 'Retry needed'
  if (state === 'visual_ocr_available') return 'Preparing'
  if (state === 'visual_ocr_queued') return 'OCR queued'
  if (state === 'visual_ocr_running') return 'Extracting...'
  if (state === 'visual_ocr_partial') return 'OCR partial'
  if (state === 'visual_ocr_completed_empty') return 'OCR finished'
  if (state === 'visual_ocr_failed') return 'OCR failed'
  if (state === 'empty_or_metadata_only') return 'Little readable text'
  return 'Extraction status unavailable'
}

function messageForState(
  state: SourceReadinessState,
  isPacketTracer: boolean,
  readableTextLength: number,
  visualExtractionCandidate: boolean,
) {
  if (state === 'ready') return 'Deep Learn can read this source and use it for notes, quizzes, and review.'
  if (state === 'needs_processing') return 'This source can be processed from its original Canvas file. Use Process source or Process all readable sources.'
  if (state === 'missing_resource_link') return 'Source link missing. Try reconnecting from Canvas.'
  if (state === 'unsupported_file_type') {
    return isPacketTracer
      ? 'Packet Tracer files cannot be read directly. Open the lab file or add notes/screenshots for Deep Learn.'
      : 'Deep Learn cannot read this source type yet.'
  }
  if (state === 'canvas_lesson_page') return 'This looks like a Canvas lesson page. Open it in Canvas or summarize it once page extraction is available.'
  if (state === 'external_link') return 'This source opens outside Canvas. Use the original link for now.'
  if (state === 'extraction_failed') return 'Extraction failed. Retry processing, or open the original file.'
  if (state === 'visual_ocr_available') return 'Preparing scanned PDF for Deep Learn...'
  if (state === 'visual_ocr_queued') return 'Scanned PDF is queued for text extraction.'
  if (state === 'visual_ocr_running') return 'Scanning pages for readable text...'
  if (state === 'visual_ocr_partial') return 'Scanned PDF partially prepared. Continue OCR to scan the remaining pages.'
  if (state === 'visual_ocr_completed_empty') return 'We could not find enough readable study text in this PDF. You can open the original source.'
  if (state === 'visual_ocr_failed') return 'Text extraction failed for this PDF. You can open the original source.'
  if (state === 'empty_or_metadata_only') {
    const countText = readableTextLength > 0
      ? `Only ${readableTextLength.toLocaleString()} readable characters were found; Deep Learn needs at least 120.`
      : 'Processing completed, but Deep Learn could not find readable text.'
    return visualExtractionCandidate
      ? `${countText} This looks image-heavy, so scanned PDF extraction should start automatically.`
      : `${countText} No recovery path is available for this source type yet.`
  }
  return 'Readable source text is not available yet. Open the original file or prepare the source from Learn.'
}

function actionsForState(
  state: SourceReadinessState,
  isSummarizable: boolean,
  visualExtractionCandidate: boolean,
): SourceReadinessAction[] {
  if (state === 'ready') return isSummarizable ? ['preview', 'start_deep_learn', 'summarize'] : ['preview', 'start_deep_learn']
  if (state === 'needs_processing') return ['process_source', 'open_source']
  if (state === 'missing_resource_link') return ['repair_source_link', 'open_canvas']
  if (state === 'unsupported_file_type') return ['open_source', 'add_notes']
  if (state === 'canvas_lesson_page') return ['open_lesson', 'summarize_page']
  if (state === 'extraction_failed') return ['retry_extraction', 'open_source']
  if (state === 'visual_ocr_available') return ['extract_text_from_images', 'open_source']
  if (state === 'visual_ocr_queued') return ['open_source']
  if (state === 'visual_ocr_running') return ['open_source']
  if (state === 'visual_ocr_partial') return ['extract_text_from_images', 'open_source']
  if (state === 'visual_ocr_completed_empty') return ['extract_text_from_images', 'open_source']
  if (state === 'visual_ocr_failed') return ['extract_text_from_images', 'open_source']
  if (state === 'empty_or_metadata_only') {
    return visualExtractionCandidate
      ? ['extract_text_from_images', 'open_source']
      : ['open_source', 'add_notes']
  }
  if (state === 'external_link') return ['open_link']
  return ['open_source']
}

function getSourceHref(resource: ModuleSourceResource) {
  return getResourceOriginalFileHref(resource) ?? getResourceCanvasHref(resource)
}

function normalizeExtension(value: string | null | undefined) {
  const normalized = value?.replace(/^\./, '').trim().toLowerCase()
  return normalized || null
}

function isVisualExtractionCandidate(input: {
  sourceType: string
  fileExtension: string | null
  contentType: string | null
  pageCount: number | null
}) {
  const contentType = input.contentType?.toLowerCase() ?? ''
  return input.sourceType === 'pdf'
    || input.fileExtension === 'pdf'
    || contentType.includes('pdf')
    || (typeof input.pageCount === 'number' && input.pageCount > 0 && input.sourceType === 'file')
}

function getReadableTextLength(resource: Pick<ModuleResource, 'extractedText' | 'extractedTextPreview' | 'extractedCharCount' | 'visualExtractionStatus' | 'visualExtractedText'> | ModuleSourceResource) {
  const hasAnyStoredText = Boolean(
    resource.extractedText?.trim()
    || resource.extractedTextPreview?.trim()
    || resource.visualExtractedText?.trim(),
  )
  if (!hasAnyStoredText && typeof resource.extractedCharCount === 'number' && resource.extractedCharCount > 0) {
    return resource.extractedCharCount
  }

  const directQuality = classifyExtractedTextQuality({
    text: resource.extractedText,
    title: 'title' in resource ? resource.title : null,
  })
  if (directQuality.usable) return directQuality.candidateCharCount

  if (resource.visualExtractionStatus === 'completed') {
    const visualQuality = classifyExtractedTextQuality({
      text: resource.visualExtractedText,
      title: 'title' in resource ? resource.title : null,
    })
    if (visualQuality.usable) return visualQuality.candidateCharCount
  }

  const previewQuality = classifyExtractedTextQuality({
    text: resource.extractedTextPreview,
    title: 'title' in resource ? resource.title : null,
  })

  return previewQuality.usable ? previewQuality.candidateCharCount : 0
}

function isProcessableSourceType(value: string) {
  return value === 'pdf'
    || value === 'pptx'
    || value === 'docx'
    || value === 'doc'
    || value === 'text'
    || value === 'markdown'
    || value === 'csv'
    || value === 'html'
    || value === 'file'
    || value === 'module_item'
}
