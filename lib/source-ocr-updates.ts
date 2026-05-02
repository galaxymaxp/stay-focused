import type { ModuleResource } from '@/lib/types'
import type { PdfOcrResult } from '@/lib/extraction/pdf-ocr'
import { BAD_OCR_BLOCKED_MESSAGE, classifyExtractedTextQuality } from '@/lib/extracted-text-quality'

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
  const pages = Array.isArray(input.ocr.pages) ? input.ocr.pages : []
  const classifiedPages = pages.map((page) => {
    const quality = classifyExtractedTextQuality({
      text: page.text,
      title: input.resource.title,
    })

    return {
      ...page,
      textQuality: quality.quality,
      usableText: quality.candidateText,
      usableCharCount: quality.candidateCharCount,
      qualityReason: quality.reason,
    }
  })
  const mergedUsableText = classifiedPages
    .map((page) => page.usableText)
    .filter((text): text is string => Boolean(text))
    .join('\n\n')
    .trim()
  const mergedQuality = classifyExtractedTextQuality({
    text: mergedUsableText,
    title: input.resource.title,
  })
  const mergedQualityLabel = mergedQuality.usable
    ? mergedQuality.quality
    : classifiedPages.some((page) => page.textQuality === 'refusal')
      ? 'refusal'
      : classifiedPages.some((page) => page.textQuality === 'boilerplate')
        ? 'boilerplate'
        : classifiedPages.some((page) => page.textQuality === 'metadata_only')
          ? 'metadata_only'
          : mergedQuality.quality
  const hasUsableText = mergedQuality.usable
  return {
    extraction_status: hasUsableText ? 'completed' : 'empty',
    extracted_text: hasUsableText ? mergedQuality.candidateText : null,
    extracted_text_preview: hasUsableText ? mergedQuality.candidateText.slice(0, 420) : null,
    extracted_char_count: hasUsableText ? mergedQuality.candidateCharCount : 0,
    extraction_error: hasUsableText ? null : BAD_OCR_BLOCKED_MESSAGE,
    visual_extraction_status: hasUsableText ? 'completed' : 'failed',
    visual_extracted_text: hasUsableText ? mergedQuality.candidateText : null,
    visual_extraction_error: hasUsableText ? null : BAD_OCR_BLOCKED_MESSAGE,
    pages_processed: input.resource.pageCount ?? pages.length,
    extraction_provider: input.ocr.provider,
    metadata: {
      ...metadata,
      ...input.ocr.metadata,
      visualExtractionPages: classifiedPages,
      storedTextLength: hasUsableText ? mergedQuality.candidateCharCount : 0,
      storedPreviewLength: hasUsableText ? Math.min(mergedQuality.candidateCharCount, 420) : 0,
      fullTextAvailable: hasUsableText,
      previewState: hasUsableText ? 'full_text_available' : 'no_text_available',
      fallbackState: hasUsableText ? null : 'no_text_in_file',
      fallbackReason: hasUsableText ? null : 'no_text_in_file',
      normalizedContentStatus: hasUsableText ? 'success' : 'failed',
      extractedTextQuality: mergedQualityLabel,
      pdfOcr: {
        ...asPlainRecord(metadata.pdfOcr),
        ...asPlainRecord(input.ocr.metadata.pdfOcr),
        status: hasUsableText ? 'completed' : 'failed',
        provider: input.ocr.provider,
        completedAt: input.now,
        textQuality: mergedQualityLabel,
        refusalDetected: mergedQualityLabel === 'refusal',
        error: hasUsableText ? null : BAD_OCR_BLOCKED_MESSAGE,
      },
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
    extraction_status: 'empty',
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
