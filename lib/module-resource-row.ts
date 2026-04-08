import type { ModuleResource } from './types'

export function adaptModuleResourceRow(row: Record<string, unknown>): ModuleResource {
  return {
    id: String(row.id ?? ''),
    moduleId: String(row.module_id ?? ''),
    courseId: typeof row.course_id === 'string' ? row.course_id : null,
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
    required: Boolean(row.required),
    metadata: isPlainRecord(row.metadata) ? row.metadata : {},
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function normalizeExtractionStatus(value: unknown): ModuleResource['extractionStatus'] {
  return value === 'pending'
    || value === 'extracted'
    || value === 'metadata_only'
    || value === 'unsupported'
    || value === 'empty'
    || value === 'failed'
    ? value
    : 'metadata_only'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
