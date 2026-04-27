import {
  formatNormalizedModuleResourceSourceType,
  getModuleResourceCapabilityInfo,
  getNormalizedModuleResourceSourceType,
} from '@/lib/module-resource-capability'
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
  const readableTextLength = getReadableTextLength(resource)
  const hasCompletedExtraction = resource.extractionStatus === 'completed'
    || resource.extractionStatus === 'extracted'
    || resource.visualExtractionStatus === 'completed'
  const isReadable = hasCompletedExtraction && readableTextLength >= 120
  const state = resolveSourceReadinessState({
    hasStoredResource: Boolean(input.storedResource && input.canonicalResourceId),
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
    message: messageForState(state, isPacketTracer),
    actions: actionsForState(state, isSummarizable),
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
}): SourceReadinessState {
  if (input.isPacketTracer) return 'unsupported_file_type'
  if (!input.hasStoredResource) {
    if (input.hasSourceHref) return 'missing_resource_link'
    if (input.sourceType === 'page') return 'canvas_lesson_page'
    if (input.sourceType === 'external_url' || input.sourceType === 'external_tool') return 'external_link'
    return 'unknown'
  }
  if (input.isReadable) return 'ready'
  if (input.hasCompletedExtraction && input.readableTextLength < 120) return 'empty_or_metadata_only'
  if (!input.extractionStatus && input.hasSourceHref && isProcessableSourceType(input.sourceType)) return 'needs_processing'
  if (input.extractionStatus === 'pending') return 'needs_processing'
  if (input.extractionStatus === 'failed' || input.capability === 'failed') return 'extraction_failed'
  if (input.visualExtractionStatus === 'available' || /\bpdf_image_only_possible\b|\bimage-only\b|\bscanned\b/i.test(input.extractionError ?? '')) {
    return 'visual_ocr_available'
  }
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
  if (state === 'visual_ocr_available') return 'No selectable text'
  if (state === 'empty_or_metadata_only') return 'Little readable text'
  return 'Needs review'
}

function messageForState(state: SourceReadinessState, isPacketTracer: boolean) {
  if (state === 'ready') return 'Deep Learn can read this source and use it for notes, quizzes, and review.'
  if (state === 'needs_processing') return 'This source can be processed from its original Canvas file. Use Process source or Process all readable sources.'
  if (state === 'missing_resource_link') return 'Try repair. If this still fails, open the item in Canvas.'
  if (state === 'unsupported_file_type') {
    return isPacketTracer
      ? 'Packet Tracer files cannot be read directly. Open the lab file or add notes/screenshots for Deep Learn.'
      : 'Deep Learn cannot read this source type yet.'
  }
  if (state === 'canvas_lesson_page') return 'This looks like a Canvas lesson page. Open it in Canvas or summarize it once page extraction is available.'
  if (state === 'external_link') return 'This source opens outside Canvas. Use the original link for now.'
  if (state === 'extraction_failed') return 'Deep Learn could not read this source. You can retry processing or open the original file.'
  if (state === 'visual_ocr_available') return 'This PDF appears scanned or image-based. OCR/visual extraction is required before Deep Learn can use it.'
  if (state === 'empty_or_metadata_only') return 'The file was processed, but Deep Learn could not find readable text.'
  return 'Deep Learn needs a little more source information before it can use this item well.'
}

function actionsForState(state: SourceReadinessState, isSummarizable: boolean): SourceReadinessAction[] {
  if (state === 'ready') return isSummarizable ? ['preview', 'start_deep_learn', 'summarize'] : ['preview', 'start_deep_learn']
  if (state === 'needs_processing') return ['process_source', 'open_source']
  if (state === 'missing_resource_link') return ['repair_source_link', 'open_canvas']
  if (state === 'unsupported_file_type') return ['open_source', 'add_notes']
  if (state === 'canvas_lesson_page') return ['open_lesson', 'summarize_page']
  if (state === 'extraction_failed') return ['retry_extraction', 'open_source']
  if (state === 'visual_ocr_available') return ['extract_text_from_images', 'open_source']
  if (state === 'empty_or_metadata_only') return ['open_source', 'add_notes']
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

function getReadableTextLength(resource: Pick<ModuleResource, 'extractedText' | 'extractedTextPreview' | 'extractedCharCount' | 'visualExtractionStatus' | 'visualExtractedText'> | ModuleSourceResource) {
  if (typeof resource.extractedCharCount === 'number' && resource.extractedCharCount > 0) return resource.extractedCharCount
  if (resource.visualExtractionStatus === 'completed' && resource.visualExtractedText?.trim()) {
    return resource.visualExtractedText.trim().length
  }
  return (resource.extractedText?.trim() ?? resource.extractedTextPreview?.trim() ?? '').length
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
