import { evaluateResourceTextPreservation } from '@/lib/canvas-resource-preservation'
import { buildModuleResourceAssessmentMetadata } from '@/lib/module-resource-quality'
import { normalizeOptionalCanvasSyncText, normalizeRequiredCanvasSyncText } from '@/lib/canvas-sync'
import type { ModuleResourceExtractionStatus, ModuleResourceVisualExtractionStatus } from '@/lib/types'

export interface CanvasResourceRefreshInput {
  canvasInstanceUrl: string | null
  canvasCourseId: number | null
  canvasModuleId: number | null
  canvasItemId: number | null
  canvasFileId: number | null
  title: string
  resourceType: string
  contentType: string | null
  extension: string | null
  sourceUrl: string | null
  htmlUrl: string | null
  required: boolean
  metadata: Record<string, unknown>
}

export interface ExistingCanvasResourceSnapshot extends CanvasResourceRefreshInput {
  extractionStatus: ModuleResourceExtractionStatus
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  visualExtractionStatus: ModuleResourceVisualExtractionStatus
  visualExtractedText: string | null
  visualExtractionError: string | null
  pageCount: number | null
  pagesProcessed: number
  extractionProvider: string | null
}

export interface PreparedCanvasResourceRefreshRow {
  canvas_instance_url: string | null
  canvas_course_id: number | null
  canvas_module_id: number | null
  canvas_item_id: number | null
  canvas_file_id: number | null
  title: string
  resource_type: string
  content_type: string | null
  extension: string | null
  source_url: string | null
  html_url: string | null
  extraction_status: ModuleResourceExtractionStatus
  extracted_text: string | null
  extracted_text_preview: string | null
  extracted_char_count: number
  extraction_error: string | null
  visual_extraction_status: ModuleResourceVisualExtractionStatus
  visual_extracted_text: string | null
  visual_extraction_error: string | null
  page_count: number | null
  pages_processed: number
  extraction_provider: string | null
  required: boolean
  metadata: Record<string, unknown>
}

export interface PreparedCanvasResourceRefreshResult {
  row: PreparedCanvasResourceRefreshRow
  fileIdentityChanged: boolean
  preservedExtraction: boolean
  preservedVisual: boolean
}

export function prepareCanvasResourceRefreshRow(
  incoming: CanvasResourceRefreshInput,
  existing?: ExistingCanvasResourceSnapshot | null,
): PreparedCanvasResourceRefreshResult {
  const preservation = existing
    ? evaluateResourceTextPreservation(existing, {
        ...incoming,
        extractedText: null,
        extractedTextPreview: null,
        visualExtractionStatus: 'not_started',
        visualExtractedText: null,
      })
    : null

  const preserveAllExtraction = Boolean(existing) && !preservation?.fileIdentityChanged
  const merged = {
    extractionStatus: preserveAllExtraction ? existing!.extractionStatus : 'metadata_only' as ModuleResourceExtractionStatus,
    extractedText: preserveAllExtraction ? existing!.extractedText : null,
    extractedTextPreview: preserveAllExtraction ? existing!.extractedTextPreview : null,
    extractedCharCount: preserveAllExtraction ? existing!.extractedCharCount : 0,
    extractionError: preserveAllExtraction ? existing!.extractionError : null,
    visualExtractionStatus: preserveAllExtraction ? existing!.visualExtractionStatus : 'not_started' as ModuleResourceVisualExtractionStatus,
    visualExtractedText: preserveAllExtraction ? existing!.visualExtractedText : null,
    visualExtractionError: preserveAllExtraction ? existing!.visualExtractionError : null,
    pageCount: preserveAllExtraction ? existing!.pageCount : null,
    pagesProcessed: preserveAllExtraction ? existing!.pagesProcessed : 0,
    extractionProvider: preserveAllExtraction ? existing!.extractionProvider : null,
  }

  const metadata = buildModuleResourceAssessmentMetadata({
    type: incoming.resourceType,
    extension: incoming.extension,
    contentType: incoming.contentType,
    extractionStatus: merged.extractionStatus,
    extractedText: merged.extractedText,
    extractedTextPreview: merged.extractedTextPreview,
    extractedCharCount: merged.extractedCharCount,
    extractionError: merged.extractionError,
    metadata: {
      ...(existing?.metadata ?? {}),
      ...incoming.metadata,
    },
  }, {
    ...(existing?.metadata ?? {}),
    ...incoming.metadata,
  })

  return {
    row: {
      canvas_instance_url: normalizeOptionalCanvasSyncText(incoming.canvasInstanceUrl),
      canvas_course_id: incoming.canvasCourseId,
      canvas_module_id: incoming.canvasModuleId,
      canvas_item_id: incoming.canvasItemId,
      canvas_file_id: incoming.canvasFileId,
      title: normalizeRequiredCanvasSyncText(incoming.title, 'Canvas resource'),
      resource_type: normalizeRequiredCanvasSyncText(incoming.resourceType, 'resource'),
      content_type: normalizeOptionalCanvasSyncText(incoming.contentType),
      extension: normalizeOptionalCanvasSyncText(incoming.extension),
      source_url: normalizeOptionalCanvasSyncText(incoming.sourceUrl),
      html_url: normalizeOptionalCanvasSyncText(incoming.htmlUrl),
      extraction_status: merged.extractionStatus,
      extracted_text: normalizeOptionalCanvasSyncText(merged.extractedText),
      extracted_text_preview: normalizeOptionalCanvasSyncText(merged.extractedTextPreview),
      extracted_char_count: merged.extractedCharCount,
      extraction_error: normalizeOptionalCanvasSyncText(merged.extractionError),
      visual_extraction_status: merged.visualExtractionStatus,
      visual_extracted_text: normalizeOptionalCanvasSyncText(merged.visualExtractedText),
      visual_extraction_error: normalizeOptionalCanvasSyncText(merged.visualExtractionError),
      page_count: merged.pageCount,
      pages_processed: merged.pagesProcessed,
      extraction_provider: normalizeOptionalCanvasSyncText(merged.extractionProvider),
      required: incoming.required,
      metadata,
    },
    fileIdentityChanged: preservation?.fileIdentityChanged ?? false,
    preservedExtraction: preserveAllExtraction && Boolean(existing?.extractedText || existing?.extractedTextPreview || existing?.extractionStatus !== 'metadata_only'),
    preservedVisual: preserveAllExtraction && existing?.visualExtractionStatus === 'completed',
  }
}

export function hasCanvasResourceRefreshRowChanged(
  existing: ExistingCanvasResourceSnapshot,
  next: PreparedCanvasResourceRefreshRow,
) {
  return existing.canvasInstanceUrl !== next.canvas_instance_url
    || existing.canvasCourseId !== next.canvas_course_id
    || existing.canvasModuleId !== next.canvas_module_id
    || existing.canvasItemId !== next.canvas_item_id
    || existing.canvasFileId !== next.canvas_file_id
    || existing.title !== next.title
    || existing.resourceType !== next.resource_type
    || existing.contentType !== next.content_type
    || existing.extension !== next.extension
    || existing.sourceUrl !== next.source_url
    || existing.htmlUrl !== next.html_url
    || existing.extractionStatus !== next.extraction_status
    || existing.extractedText !== next.extracted_text
    || existing.extractedTextPreview !== next.extracted_text_preview
    || existing.extractedCharCount !== next.extracted_char_count
    || existing.extractionError !== next.extraction_error
    || existing.visualExtractionStatus !== next.visual_extraction_status
    || existing.visualExtractedText !== next.visual_extracted_text
    || existing.visualExtractionError !== next.visual_extraction_error
    || existing.pageCount !== next.page_count
    || existing.pagesProcessed !== next.pages_processed
    || existing.extractionProvider !== next.extraction_provider
    || existing.required !== next.required
    || JSON.stringify(existing.metadata) !== JSON.stringify(next.metadata)
}
