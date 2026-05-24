import { getNormalizedModuleResourceSourceType } from '@/lib/module-resource-capability'
import { classifyExtractedTextQuality } from '@/lib/extracted-text-quality'
import type { ModuleResource } from '@/lib/types'

const PROCESSABLE_TYPES = new Set(['pdf', 'pptx', 'docx', 'doc', 'text', 'markdown', 'csv', 'html', 'page', 'assignment', 'discussion', 'file', 'module_item'])
const UNSUPPORTED_EXTENSIONS = new Set(['pkt', 'pka', 'ppt'])
const READY_TEXT_THRESHOLD = 120

export function isProcessableReadableSource(resource: ModuleResource) {
  const extension = resource.extension?.replace(/^\./, '').toLowerCase() ?? null
  if (extension && UNSUPPORTED_EXTENSIONS.has(extension)) return false
  if (!resource.sourceUrl && !resource.htmlUrl) return false
  const sourceType = getNormalizedModuleResourceSourceType(resource)
  return PROCESSABLE_TYPES.has(sourceType)
}

export interface PersistableSourceProcessingResult {
  extractionStatus: ModuleResource['extractionStatus']
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  metadata: Record<string, unknown>
  outcome: 'ready' | 'empty' | 'failed'
}

export function normalizeSourceProcessingResult(input: {
  resource: ModuleResource
  extractionStatus: ModuleResource['extractionStatus']
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  metadata: Record<string, unknown>
}): PersistableSourceProcessingResult {
  if (input.extractionStatus === 'failed') {
    return {
      ...input,
      extractionStatus: 'failed',
      extractedText: null,
      extractedTextPreview: null,
      extractedCharCount: 0,
      extractionError: toSafeProcessingError(input.extractionError, 'Deep Learn could not process this source.'),
      outcome: 'failed',
    }
  }

  if (input.extractionStatus === 'unsupported') {
    return {
      ...input,
      extractionStatus: 'unsupported',
      extractedText: null,
      extractedTextPreview: null,
      extractedCharCount: 0,
      extractionError: toSafeProcessingError(input.extractionError, 'Deep Learn cannot read this source type yet.'),
      outcome: 'failed',
    }
  }

  const textQuality = classifyExtractedTextQuality({
    text: input.extractedText,
    title: input.resource.title,
    minMeaningfulChars: READY_TEXT_THRESHOLD,
  })
  const previewQuality = classifyExtractedTextQuality({
    text: input.extractedTextPreview,
    title: input.resource.title,
    minMeaningfulChars: READY_TEXT_THRESHOLD,
  })
  const bestQuality = textQuality.usable
    ? textQuality
    : previewQuality.usable
      ? previewQuality
      : textQuality.candidateCharCount >= previewQuality.candidateCharCount
        ? textQuality
        : previewQuality
  const cleanedText = bestQuality.candidateText.trim()
  const readableLength = bestQuality.candidateCharCount
  const hasReadyText = bestQuality.usable && readableLength >= READY_TEXT_THRESHOLD && Boolean(cleanedText)

  if (!hasReadyText) {
    return {
      ...input,
      extractionStatus: 'empty',
      extractedText: null,
      extractedTextPreview: null,
      extractedCharCount: 0,
      extractionError: input.extractionError?.trim() || 'The file was processed, but Deep Learn could not find readable text.',
      metadata: {
        ...input.metadata,
        lastProcessingOutcome: 'empty',
        lastProcessingReason: bestQuality.reason,
        extractedTextQuality: bestQuality.quality,
      },
      outcome: 'empty',
    }
  }

  return {
    ...input,
    extractionStatus: 'completed',
    extractedText: cleanedText,
    extractedTextPreview: cleanedText.slice(0, 420),
    extractedCharCount: readableLength,
    extractionError: null,
    metadata: {
      ...input.metadata,
      lastProcessingOutcome: 'ready',
      lastProcessingReadableCharCount: readableLength,
      extractedTextQuality: bestQuality.quality,
    },
    outcome: 'ready',
  }
}

export function formatSourceProcessingSummary(counts: {
  processed: number
  ready: number
  empty: number
  skipped: number
  failed: number
}) {
  if (counts.failed > 0 && counts.processed === 0) {
    return `Processing failed for ${counts.failed} source${counts.failed === 1 ? '' : 's'}`
  }

  const parts = [`Processed ${counts.processed} source${counts.processed === 1 ? '' : 's'}`]
  if (counts.ready > 0) parts.push(`${counts.ready} ready for Deep Learn`)
  if (counts.empty > 0) parts.push(counts.empty === 1 ? 'no readable text found' : `${counts.empty} had no readable text`)
  if (counts.skipped > 0) parts.push(`${counts.skipped} skipped`)
  if (counts.failed > 0) parts.push(`${counts.failed} failed`)
  return parts.join(' · ')
}

function toSafeProcessingError(value: string | null, fallback: string) {
  const cleaned = value?.replace(/\s+/g, ' ').trim()
  return cleaned || fallback
}
