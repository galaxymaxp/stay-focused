import type { ModuleResource } from '@/lib/types'
import type { PdfOcrResult } from '@/lib/extraction/pdf-ocr'

export interface ModuleResourceOcrUpdate {
  extraction_status: ModuleResource['extractionStatus']
  extracted_text: string | null
  extracted_text_preview: string | null
  extracted_char_count: number
  extraction_error: string | null
  visual_extraction_status: NonNullable<ModuleResource['visualExtractionStatus']>
  visual_extracted_text: string | null
  visual_extraction_error: string | null
  pages_processed: number
  extraction_provider?: string | null
  metadata: Record<string, unknown>
  updated_at: string
}

export function isScannedPdfOcrCandidate(resource: ModuleResource) {
  if (isOcrAlreadyCompleted(resource) || isOcrAlreadyRunning(resource)) return false

  const extension = resource.extension?.toLowerCase() ?? ''
  const contentType = resource.contentType?.toLowerCase() ?? ''
  const isPdf = extension === 'pdf' || contentType.includes('pdf')
  const hasNoSelectableTextSignal = resource.visualExtractionStatus === 'available'
    || resource.visualExtractionStatus === 'failed'
    || /\bpdf_image_only_possible\b|\bimage-only\b|\bimage based\b|\bimage-based\b|\bscanned\b/i.test(resource.extractionError ?? '')

  return isPdf && hasNoSelectableTextSignal
}

export function isOcrAlreadyRunning(resource: ModuleResource) {
  return resource.extractionStatus === 'processing' || resource.visualExtractionStatus === 'running'
}

export function isOcrAlreadyCompleted(resource: ModuleResource) {
  return resource.visualExtractionStatus === 'completed'
    && Boolean(resource.extractedText?.trim() || resource.visualExtractedText?.trim())
}

export function buildOcrProcessingUpdate(input: {
  resource: ModuleResource
  now: string
}): Pick<ModuleResourceOcrUpdate, 'extraction_status' | 'extraction_error' | 'visual_extraction_status' | 'visual_extraction_error' | 'metadata' | 'updated_at'> {
  const metadata = asPlainRecord(input.resource.metadata)
  return {
    extraction_status: 'processing',
    visual_extraction_status: 'running',
    visual_extraction_error: null,
    extraction_error: 'OCR is extracting text from images.',
    metadata: {
      ...metadata,
      pdfOcr: {
        ...asPlainRecord(metadata.pdfOcr),
        status: 'running',
        startedAt: input.now,
      },
    },
    updated_at: input.now,
  }
}

export function buildOcrCompletedUpdate(input: {
  resource: ModuleResource
  ocr: PdfOcrResult & { status: 'completed' }
  now: string
}): ModuleResourceOcrUpdate {
  const metadata = asPlainRecord(input.resource.metadata)
  return {
    extraction_status: 'completed',
    extracted_text: input.ocr.text,
    extracted_text_preview: input.ocr.text.slice(0, 420),
    extracted_char_count: input.ocr.charCount,
    extraction_error: null,
    visual_extraction_status: 'completed',
    visual_extracted_text: input.ocr.text,
    visual_extraction_error: null,
    pages_processed: input.resource.pageCount ?? 0,
    extraction_provider: input.ocr.provider,
    metadata: {
      ...metadata,
      ...input.ocr.metadata,
      storedTextLength: input.ocr.charCount,
      storedPreviewLength: Math.min(input.ocr.text.length, 420),
      fullTextAvailable: true,
      previewState: 'full_text_available',
      fallbackState: null,
      fallbackReason: null,
      normalizedContentStatus: 'success',
    },
    updated_at: input.now,
  }
}

export function buildOcrFailedUpdate(input: {
  resource: ModuleResource
  message: string
  now: string
  ocrMetadata?: Record<string, unknown>
  provider?: string | null
}): ModuleResourceOcrUpdate {
  const metadata = asPlainRecord(input.resource.metadata)
  const ocrMetadata = asPlainRecord(input.ocrMetadata)
  return {
    extraction_status: 'failed',
    extracted_text: null,
    extracted_text_preview: null,
    extracted_char_count: 0,
    extraction_error: input.message,
    visual_extraction_status: 'failed',
    visual_extracted_text: null,
    visual_extraction_error: input.message,
    pages_processed: 0,
    extraction_provider: input.provider ?? input.resource.extractionProvider ?? null,
    metadata: {
      ...metadata,
      ...ocrMetadata,
      storedTextLength: 0,
      storedPreviewLength: 0,
      fullTextAvailable: false,
      previewState: 'no_text_available',
      fallbackState: 'no_text_in_file',
      fallbackReason: 'no_text_in_file',
      normalizedContentStatus: 'failed',
      pdfOcr: {
        ...asPlainRecord(metadata.pdfOcr),
        ...asPlainRecord(ocrMetadata.pdfOcr),
        status: 'failed',
        error: input.message,
        completedAt: input.now,
      },
    },
    updated_at: input.now,
  }
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...value as Record<string, unknown> }
    : {}
}
