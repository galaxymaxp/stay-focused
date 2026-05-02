import type { ModuleResourceCapabilityLike, NormalizedModuleResourceSourceType } from '@/lib/module-resource-capability'
import { BAD_OCR_BLOCKED_MESSAGE, classifyModuleResourceTextQuality } from '@/lib/extracted-text-quality'
import { getModuleResourceQualityInfo } from '@/lib/module-resource-quality'
import type { ModuleSourceResource } from '@/lib/module-workspace'
import type { StudyFileReaderState } from '@/lib/study-file-reader'
import { getStudySourceNoun } from '@/lib/study-resource'

export type LearnResourceStatusKey =
  | 'ready'
  | 'partial'
  | 'source_first'
  | 'link_only'
  | 'unsupported'
  | 'no_extract'
  | 'visual_ocr_required'
  | 'visual_ocr_queued'
  | 'visual_ocr_running'
  | 'visual_ocr_partial'
  | 'visual_ocr_completed_empty'
  | 'visual_ocr_failed'
  | 'loading'

export type LearnResourceActionPriority = 'reader' | 'source'

export interface LearnResourceUiState {
  statusKey: LearnResourceStatusKey
  statusLabel: 'Ready' | 'Partial' | 'Source first' | 'Link only' | 'Unsupported' | 'No extract' | 'Scanned PDF' | 'Preparing' | 'OCR queued' | 'Extracting...' | 'OCR complete' | 'OCR finished' | 'OCR partial' | 'OCR failed' | 'Loading'
  tone: 'accent' | 'warning' | 'muted'
  primaryAction: LearnResourceActionPriority
  summary: string
  detail: string
  sourceActionLabel: string
  textAvailabilityLabel: 'Full text available' | 'Short preview only' | 'No text available'
}

export interface LearnResourceUiLike extends ModuleResourceCapabilityLike {
  title?: string | null
  fallbackReason?: string | null
  previewState?: ModuleSourceResource['previewState']
  sourceUrlCategory?: string | null
  resolvedUrlCategory?: string | null
  normalizedSourceType?: NormalizedModuleResourceSourceType | null
  visualExtractionStatus?: 'not_started' | 'available' | 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  visualExtractedText?: string | null
  visualExtractionError?: string | null
  pageCount?: number | null
  pagesProcessed?: number | null
  extractionProvider?: string | null
}

export function getLearnResourceUiState(
  resource: LearnResourceUiLike,
  options?: {
    readerState?: StudyFileReaderState
    hasOriginalFile?: boolean
    hasCanvasLink?: boolean
  },
): LearnResourceUiState {
  const quality = getModuleResourceQualityInfo(resource)
  const textQuality = classifyModuleResourceTextQuality({
    title: 'title' in resource ? resource.title : null,
    extractedText: resource.extractedText ?? null,
    extractedTextPreview: resource.extractedTextPreview ?? null,
    visualExtractionStatus: resource.visualExtractionStatus,
    visualExtractedText: resource.visualExtractedText ?? null,
  })
  const fallbackReason = resource.fallbackReason ?? quality.fallbackReason ?? null
  const readerState = options?.readerState
  const sourceNoun = getStudySourceNoun({ type: resource.type ?? 'Resource' })
  const sourceLabel = options?.hasOriginalFile
    ? 'file'
    : isExternalLinkResource(resource)
      ? 'link'
      : 'source'
  const hasSourceAction = Boolean(options?.hasOriginalFile || options?.hasCanvasLink)
  const sourceActionLabel = options?.hasOriginalFile
    ? 'Open original file'
    : isExternalLinkResource(resource)
      ? 'Open link'
      : options?.hasCanvasLink
        ? 'Open in Canvas'
        : 'Open original source'
  const textAvailabilityLabel = formatTextAvailability(resource.previewState)

  if (resource.extractionStatus === 'pending') {
    return {
      statusKey: 'loading',
      statusLabel: 'Loading',
      tone: 'muted',
      primaryAction: 'source',
      summary: 'This item is still loading into the reader.',
      detail: `The app is still preparing this ${sourceNoun}. Open the original ${sourceLabel} if you need it right away.`,
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (resource.visualExtractionStatus === 'queued') {
    return {
      statusKey: 'visual_ocr_queued',
      statusLabel: 'OCR queued',
      tone: 'warning',
      primaryAction: 'source',
      summary: 'Scanned PDF is queued for text extraction.',
      detail: `${formatPageCount(resource.pageCount)}Open the original ${sourceLabel} if you need it right away.`,
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (resource.extractionStatus === 'processing' || resource.visualExtractionStatus === 'running') {
    return {
      statusKey: 'visual_ocr_running',
      statusLabel: 'Extracting...',
      tone: 'warning',
      primaryAction: 'source',
      summary: 'Scanning pages for readable text...',
      detail: `${formatOcrProgress(resource.pagesProcessed, resource.pageCount)}Deep Learn will use this PDF after OCR finishes. Open the original ${sourceLabel} if you need it right away.`,
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (resource.visualExtractionStatus === 'completed' && textQuality.usable) {
    return {
      statusKey: 'ready',
      statusLabel: 'OCR complete',
      tone: 'accent',
      primaryAction: 'reader',
      summary: 'Readable text was recovered from the image-based PDF.',
      detail: 'Use Deep Learn for the main study pass. Open the original source when exact page layout matters.',
      sourceActionLabel,
      textAvailabilityLabel: 'Full text available',
    }
  }

  if (resource.visualExtractionStatus === 'completed' && !textQuality.usable) {
    return {
      statusKey: 'visual_ocr_completed_empty',
      statusLabel: 'OCR finished',
      tone: 'warning',
      primaryAction: 'source',
      summary: 'We could not find enough readable study text in this PDF. You can open the original source.',
      detail: resource.visualExtractionError?.trim() || resource.extractionError?.trim() || BAD_OCR_BLOCKED_MESSAGE,
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (
    resource.visualExtractionStatus === 'failed'
    && typeof resource.pagesProcessed === 'number'
    && typeof resource.pageCount === 'number'
    && resource.pagesProcessed > 0
    && resource.pagesProcessed < resource.pageCount
  ) {
    return {
      statusKey: 'visual_ocr_partial',
      statusLabel: 'OCR partial',
      tone: 'warning',
      primaryAction: 'source',
      summary: `Scanned PDF partially prepared: ${resource.pagesProcessed} of ${resource.pageCount} pages processed. Continue OCR to scan the remaining pages.`,
      detail: resource.visualExtractionError?.trim() || resource.extractionError?.trim() || BAD_OCR_BLOCKED_MESSAGE,
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (resource.visualExtractionStatus === 'failed') {
    return {
      statusKey: 'visual_ocr_failed',
      statusLabel: 'OCR failed',
      tone: 'warning',
      primaryAction: 'source',
      summary: 'Text extraction failed for this PDF. You can open the original source.',
      detail: resource.visualExtractionError?.trim() || resource.extractionError?.trim() || BAD_OCR_BLOCKED_MESSAGE,
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (fallbackReason === 'external_link_only') {
    return {
      statusKey: 'link_only',
      statusLabel: 'Link only',
      tone: 'muted',
      primaryAction: 'source',
      summary: 'This item opens as a link instead of an in-app reading view.',
      detail: 'Use the original link first. The reader only keeps the title and module context here.',
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (resource.extractionStatus === 'unsupported' || fallbackReason === 'unsupported_file_type') {
    return {
      statusKey: 'unsupported',
      statusLabel: 'Unsupported',
      tone: 'muted',
      primaryAction: 'source',
      summary: 'This file type does not open cleanly in the reader yet.',
      detail: `Use the original ${sourceLabel} for the full material.`,
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (resource.extractionStatus === 'empty' || fallbackReason === 'no_text_in_file') {
    const likelyScanned = /scanned|image-only|image based|image-based/i.test(resource.extractionError ?? '')
    if (likelyScanned || resource.visualExtractionStatus === 'available') {
      return {
        statusKey: 'visual_ocr_required',
        statusLabel: 'Preparing',
        tone: 'warning',
        primaryAction: 'source',
        summary: 'Preparing scanned PDF for Deep Learn...',
        detail: `${formatPageCount(resource.pageCount)}Text extraction should start automatically. Open the original ${sourceLabel} if you need it right away.`,
        sourceActionLabel,
        textAvailabilityLabel,
      }
    }

    return {
      statusKey: 'no_extract',
      statusLabel: 'No extract',
      tone: 'muted',
      primaryAction: 'source',
      summary: likelyScanned
        ? 'No readable text was recovered here, and this still looks like a scanned or image-based file.'
        : 'No readable text was recovered here.',
      detail: likelyScanned
        ? `If this ${sourceNoun} is image-based, the original ${sourceLabel} will usually be the clearest place to read it.`
        : `Use the original ${sourceLabel} for the full material.`,
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (quality.quality === 'strong' || quality.quality === 'usable' || readerState === 'extracted') {
    return {
      statusKey: 'ready',
      statusLabel: 'Ready',
      tone: 'accent',
      primaryAction: 'reader',
      summary: quality.quality === 'strong'
        ? 'Readable text was recovered here and the reader should work well for studying.'
        : 'Readable text was recovered here and the reader should work for a first study pass.',
      detail: quality.quality === 'strong'
        ? 'Use the reader for the main pass, then open the original source only when you want the exact file or page.'
        : 'Use the reader for the main pass. Open the original source when you want the cleanest full version.',
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (quality.quality === 'weak' || readerState === 'weak' || resource.previewState === 'preview_only') {
    if (resource.previewState === 'full_text_available') {
      return {
        statusKey: 'partial',
        statusLabel: 'Partial',
        tone: 'warning',
        primaryAction: 'reader',
        summary: 'This item is readable here, but some parts may still be messy or incomplete.',
        detail: `Use the reader for a quick pass, then open the original ${sourceLabel} when the exact wording or layout matters.`,
        sourceActionLabel,
        textAvailabilityLabel,
      }
    }

    if (resource.previewState === 'preview_only') {
      return {
        statusKey: 'partial',
        statusLabel: 'Partial',
        tone: 'warning',
        primaryAction: 'reader',
        summary: 'A short reader preview is available here, but it does not replace the full item.',
        detail: `Use the reader to get oriented, then open the original ${sourceLabel} for the full material.`,
        sourceActionLabel,
        textAvailabilityLabel,
      }
    }

    return {
      statusKey: 'partial',
      statusLabel: 'Partial',
      tone: 'warning',
      primaryAction: 'reader',
      summary: 'This item is readable here, but parts may still be incomplete or uneven.',
      detail: `Use the reader for a quick pass, then open the original ${sourceLabel} when accuracy matters.`,
      sourceActionLabel,
      textAvailabilityLabel,
    }
  }

  if (fallbackReason === 'canvas_resolution_required') {
    return buildSourceFirstState({
      hasSourceAction,
      sourceLabel,
      sourceActionLabel,
      textAvailabilityLabel,
      summary: 'Start with the original source for this item.',
      detail: 'The reader has the module context, but it still needs the direct Canvas page or file before it can stand in as the main reading path.',
    })
  }

  if (fallbackReason === 'canvas_fetch_failed') {
    return buildSourceFirstState({
      hasSourceAction,
      sourceLabel,
      sourceActionLabel,
      textAvailabilityLabel,
      summary: 'Start with the original source for this item.',
      detail: 'The reader did not load enough content to replace the original source for this pass.',
    })
  }

  if (fallbackReason === 'attachment_only') {
    return buildSourceFirstState({
      hasSourceAction,
      sourceLabel,
      sourceActionLabel,
      textAvailabilityLabel,
      summary: 'Start with the original source for this item.',
      detail: 'The reader keeps the module context visible here, but the original file or Canvas item is still the clearer place to read it in full.',
    })
  }

  return buildSourceFirstState({
    hasSourceAction,
    sourceLabel,
    sourceActionLabel,
    textAvailabilityLabel,
    summary: 'Start with the original source for this item.',
    detail: `Open the original ${sourceLabel} first. The reader only keeps limited context here, so treat it as a fallback view.`,
  })
}

function formatPageCount(pageCount: number | null | undefined) {
  return typeof pageCount === 'number' && pageCount > 0 ? `${pageCount} pages detected. ` : ''
}

function formatOcrProgress(pagesProcessed: number | null | undefined, pageCount: number | null | undefined) {
  if (typeof pagesProcessed === 'number' && typeof pageCount === 'number' && pageCount > 0) {
    return `Scanning pages for readable text... ${Math.min(pagesProcessed, pageCount)} of ${pageCount} pages processed. `
  }
  return formatPageCount(pageCount)
}

function isExternalLinkResource(
  resource: Pick<LearnResourceUiLike, 'fallbackReason' | 'sourceUrlCategory' | 'resolvedUrlCategory' | 'normalizedSourceType'>,
) {
  return resource.fallbackReason === 'external_link_only'
    || resource.sourceUrlCategory === 'external'
    || resource.resolvedUrlCategory === 'external'
    || resource.normalizedSourceType === 'external_url'
}

function formatTextAvailability(previewState: ModuleSourceResource['previewState']) {
  if (previewState === 'full_text_available') return 'Full text available'
  if (previewState === 'preview_only') return 'Short preview only'
  return 'No text available'
}

function buildSourceFirstState({
  hasSourceAction,
  sourceLabel,
  sourceActionLabel,
  textAvailabilityLabel,
  summary,
  detail,
}: {
  hasSourceAction: boolean
  sourceLabel: string
  sourceActionLabel: string
  textAvailabilityLabel: LearnResourceUiState['textAvailabilityLabel']
  summary: string
  detail: string
}): LearnResourceUiState {
  return {
    statusKey: 'source_first',
    statusLabel: 'Source first',
    tone: 'muted',
    primaryAction: hasSourceAction ? 'source' : 'reader',
    summary: hasSourceAction
      ? summary
      : 'The reader only has limited context for this item right now.',
    detail: hasSourceAction
      ? detail
      : `The original ${sourceLabel} is not available from this view right now, so use the reader as a limited fallback instead of a full reading path.`,
    sourceActionLabel,
    textAvailabilityLabel,
  }
}
