import { classifyExtractedTextQuality } from '@/lib/extracted-text-quality'
import type { ModuleResource } from '@/lib/types'

export interface ResourceTextPreservationDecision {
  fileIdentityChanged: boolean
  preserveExtractedText: boolean
  preserveVisualText: boolean
  existingTextQuality: ReturnType<typeof classifyExtractedTextQuality>['quality']
  incomingTextQuality: ReturnType<typeof classifyExtractedTextQuality>['quality']
  existingVisualQuality: ReturnType<typeof classifyExtractedTextQuality>['quality']
}

export function evaluateResourceTextPreservation(
  existing: Pick<ModuleResource,
    | 'title'
    | 'canvasItemId'
    | 'canvasFileId'
    | 'extractedText'
    | 'extractedTextPreview'
    | 'visualExtractionStatus'
    | 'visualExtractedText'
    | 'metadata'
  >,
  incoming: Pick<ModuleResource,
    | 'title'
    | 'canvasItemId'
    | 'canvasFileId'
    | 'extractedText'
    | 'extractedTextPreview'
    | 'visualExtractionStatus'
    | 'visualExtractedText'
    | 'metadata'
  >,
): ResourceTextPreservationDecision {
  const fileIdentityChanged = hasCanvasFileIdentityChanged(existing, incoming)
  const existingText = classifyExtractedTextQuality({
    text: existing.extractedText ?? existing.extractedTextPreview,
    title: existing.title,
  })
  const incomingText = classifyExtractedTextQuality({
    text: incoming.extractedText ?? incoming.extractedTextPreview,
    title: incoming.title,
  })
  const existingVisual = classifyExtractedTextQuality({
    text: existing.visualExtractionStatus === 'completed' ? existing.visualExtractedText : null,
    title: existing.title,
  })

  return {
    fileIdentityChanged,
    preserveExtractedText: !fileIdentityChanged && existingText.usable && !incomingText.usable,
    preserveVisualText: !fileIdentityChanged && existing.visualExtractionStatus === 'completed' && existingVisual.usable,
    existingTextQuality: existingText.quality,
    incomingTextQuality: incomingText.quality,
    existingVisualQuality: existingVisual.quality,
  }
}

export function hasCanvasFileIdentityChanged(
  existing: Pick<ModuleResource, 'canvasItemId' | 'canvasFileId' | 'metadata'>,
  incoming: Pick<ModuleResource, 'canvasItemId' | 'canvasFileId' | 'metadata'>,
) {
  const sameCanvasItem = existing.canvasItemId !== null
    && incoming.canvasItemId !== null
    && existing.canvasItemId === incoming.canvasItemId

  if (!sameCanvasItem) return false

  if (existing.canvasFileId !== null && incoming.canvasFileId !== null) {
    return existing.canvasFileId !== incoming.canvasFileId
  }

  const existingContentId = readNumber(existing.metadata?.contentId, existing.metadata?.canvasFileId)
  const incomingContentId = readNumber(incoming.metadata?.contentId, incoming.metadata?.canvasFileId)
  return existingContentId !== null
    && incomingContentId !== null
    && existingContentId !== incomingContentId
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}
