import type { ModuleResource } from './types'

export function adaptModuleResourceRow(row: Record<string, unknown>): ModuleResource {
  return {
    id: String(row.id ?? ''),
    moduleId: String(row.module_id ?? ''),
    courseId: typeof row.course_id === 'string' ? row.course_id : null,
    canvasInstanceUrl: typeof row.canvas_instance_url === 'string' ? row.canvas_instance_url : null,
    canvasCourseId: typeof row.canvas_course_id === 'number' ? row.canvas_course_id : null,
    canvasModuleId: typeof row.canvas_module_id === 'number' ? row.canvas_module_id : null,
    canvasItemId: typeof row.canvas_item_id === 'number' ? row.canvas_item_id : null,
    canvasFileId: typeof row.canvas_file_id === 'number' ? row.canvas_file_id : null,
    title: typeof row.title === 'string' ? row.title : 'Resource',
    resourceType: typeof row.resource_type === 'string' ? row.resource_type : 'Resource',
    contentType: typeof row.content_type === 'string' ? row.content_type : null,
    extension: typeof row.extension === 'string' ? row.extension : null,
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : null,
    htmlUrl: typeof row.html_url === 'string' ? row.html_url : null,
    extractionStatus: normalizeExtractionStatus(row.extraction_status),
    extractedText: typeof row.extracted_text === 'string' ? row.extracted_text : null,
    extractedTextPreview: typeof row.extracted_text_preview === 'string' ? row.extracted_text_preview : null,
    extractedCharCount: typeof row.extracted_char_count === 'number' ? row.extracted_char_count : 0,
    extractionError: typeof row.extraction_error === 'string' ? row.extraction_error : null,
    visualExtractionStatus: normalizeVisualExtractionStatus(row.visual_extraction_status),
    visualExtractedText: typeof row.visual_extracted_text === 'string' ? row.visual_extracted_text : null,
    visualExtractionError: typeof row.visual_extraction_error === 'string' ? row.visual_extraction_error : null,
    pageCount: typeof row.page_count === 'number' ? row.page_count : null,
    pagesProcessed: typeof row.pages_processed === 'number' ? row.pages_processed : 0,
    extractionProvider: typeof row.extraction_provider === 'string' ? row.extraction_provider : null,
    required: Boolean(row.required),
    metadata: isPlainRecord(row.metadata) ? row.metadata : {},
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function normalizeExtractionStatus(value: unknown): ModuleResource['extractionStatus'] {
  return value === 'pending'
    || value === 'processing'
    || value === 'extracted'
    || value === 'completed'
    || value === 'metadata_only'
    || value === 'unsupported'
    || value === 'empty'
    || value === 'failed'
    ? value
    : 'metadata_only'
}

function normalizeVisualExtractionStatus(value: unknown): ModuleResource['visualExtractionStatus'] {
  return value === 'not_started'
    || value === 'available'
    || value === 'queued'
    || value === 'running'
    || value === 'completed'
    || value === 'failed'
    || value === 'skipped'
    ? value
    : 'not_started'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
