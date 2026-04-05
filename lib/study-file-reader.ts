import type { ModuleSourceResource } from '@/lib/module-workspace'
import type { ModuleResourceExtractionStatus } from '@/lib/types'
import { getCanvasSourceLabel, getStudySourceNoun, getStudySourceTypeLabel } from '@/lib/study-resource'

export type StudyFileReaderState = 'extracted' | 'metadata_only' | 'empty' | 'failed'

export interface StudyFilePreviewBlock {
  id: string
  title: string
  body: string
}

export interface StudyFileReaderModel {
  state: StudyFileReaderState
  fileTypeLabel: string
  statusLabel: string
  statusTone: 'accent' | 'muted' | 'warning' | 'danger'
  summary: string | null
  keyPoints: string[]
  previewBlocks: StudyFilePreviewBlock[]
  overviewTitle: string
  overviewBody: string
  keyPointsHint: string | null
  previewHint: string | null
  transparencyNote: string
  charCount: number
}

const PAGE_MARKER_PATTERN = /\n?--\s*\d+\s+of\s+\d+\s*--\n?/gi

export function buildStudyFileReaderModel(resource: ModuleSourceResource): StudyFileReaderModel {
  const state = resolveStudyFileReaderState(resource)
  const fileTypeLabel = getStudyFileTypeLabel(resource)
  const statusLabel = labelForExtractionStatus(resource.extractionStatus)
  const normalizedText = normalizeReaderText(resource.extractedText ?? resource.extractedTextPreview ?? '')
  const charCount = typeof resource.extractedCharCount === 'number' && resource.extractedCharCount > 0
    ? resource.extractedCharCount
    : normalizedText.length
  const paragraphs = buildPreviewParagraphs(normalizedText)
  const sourceNoun = getStudySourceNoun(resource)
  const canvasSourceLabel = getCanvasSourceLabel(resource)

  if (state === 'extracted' && normalizedText) {
    const summary = buildGroundedSummary(paragraphs)
    const keyPoints = buildGroundedKeyPoints(paragraphs, summary)
    const previewBlocks = buildPreviewBlocks(normalizedText, paragraphs)
    const transparencyBase = charCount >= 1200
      ? 'This study page is grounded in real extracted source text.'
      : 'This study page is grounded in real extracted source text, but the readable amount is still fairly light.'

    return {
      state,
      fileTypeLabel,
      statusLabel,
      statusTone: 'accent',
      summary,
      keyPoints,
      previewBlocks,
      overviewTitle: 'What this material is about',
      overviewBody: summary,
      keyPointsHint: null,
      previewHint: null,
      transparencyNote: resource.extractionError
        ? `${transparencyBase} Extraction note: ${resource.extractionError}`
        : `${transparencyBase} Summary and key points are only shown when readable text is available.`,
      charCount,
    }
  }

  if (state === 'metadata_only') {
    return {
      state,
      fileTypeLabel,
      statusLabel,
      statusTone: 'muted',
      summary: null,
      keyPoints: [],
      previewBlocks: [],
      overviewTitle: 'What this material is about',
      overviewBody: `Only the ${sourceNoun} title, type, and module context are available here right now. The app did not extract readable ${sourceNoun} text for this item, so it is not pretending to summarize it.`,
      keyPointsHint: `Key points stay hidden until the reader has real extracted ${sourceNoun} text to work from.`,
      previewHint: `Open the original ${canvasSourceLabel.toLowerCase()} in Canvas if you want the full source material right away.`,
      transparencyNote: resource.extractionError
        ? `No readable ${sourceNoun} text is stored for this item. Note: ${resource.extractionError}`
        : `No readable ${sourceNoun} text is stored for this item yet.`,
      charCount,
    }
  }

  if (state === 'empty') {
    const likelyScanned = /scanned|image-only|image based|image-based/i.test(resource.extractionError ?? '')

    return {
      state,
      fileTypeLabel,
      statusLabel,
      statusTone: 'warning',
      summary: null,
      keyPoints: [],
      previewBlocks: [],
      overviewTitle: 'What this material is about',
      overviewBody: likelyScanned
        ? `The ${sourceNoun} was parsed, but no usable text surfaced in the reader. It may be a scanned or image-based document, so this page stays quiet instead of inventing a summary.`
        : `The ${sourceNoun} was parsed successfully, but no usable text surfaced in the reader. This page stays honest and keeps the original ${canvasSourceLabel.toLowerCase()} close at hand.`,
      keyPointsHint: `Key points are hidden because the parser did not return usable text from the ${sourceNoun}.`,
      previewHint: likelyScanned
        ? `If this is a scanned handout or image-based PDF, the original ${canvasSourceLabel.toLowerCase()} will still be the best place to read it.`
        : `The ${sourceNoun} may still be useful in Canvas even though no readable text surfaced here.`,
      transparencyNote: resource.extractionError
        ? `Extraction completed, but no usable text was returned. Note: ${resource.extractionError}`
        : 'Extraction completed, but no usable text was returned.',
      charCount,
    }
  }

  return {
    state,
    fileTypeLabel,
    statusLabel,
    statusTone: 'danger',
    summary: null,
    keyPoints: [],
    previewBlocks: [],
    overviewTitle: 'What this material is about',
    overviewBody: `The app could not prepare a readable study view for this ${sourceNoun} this time. The original ${canvasSourceLabel.toLowerCase()} is still available, and this page keeps the state clear without making the reader feel broken.`,
    keyPointsHint: `Key points are hidden because extraction did not complete cleanly for this ${sourceNoun}.`,
    previewHint: `Use the Canvas link for the original ${sourceNoun}, then resync later if you want the reader to try again.`,
    transparencyNote: resource.extractionError
      ? `Extraction did not complete cleanly. Error: ${resource.extractionError}`
      : `Extraction did not complete cleanly for this ${sourceNoun}.`,
    charCount,
  }
}

export function getStudyFileTypeLabel(resource: Pick<ModuleSourceResource, 'type' | 'extension' | 'contentType'>) {
  return getStudySourceTypeLabel(resource)
}

export function labelForExtractionStatus(status?: ModuleResourceExtractionStatus) {
  if (!status) return 'Not available'
  if (status === 'extracted') return 'Text extracted'
  if (status === 'metadata_only') return 'Metadata only'
  if (status === 'empty') return 'No usable text found'
  if (status === 'failed') return 'Extraction unavailable'
  if (status === 'unsupported') return 'Unsupported'
  return 'Pending'
}

function resolveStudyFileReaderState(resource: ModuleSourceResource): StudyFileReaderState {
  if (resource.extractionStatus === 'metadata_only') return 'metadata_only'
  if (resource.extractionStatus === 'empty') return 'empty'
  if (resource.extractionStatus === 'failed' || resource.extractionStatus === 'unsupported' || resource.extractionStatus === 'pending') {
    return 'failed'
  }

  const normalizedText = normalizeReaderText(resource.extractedText ?? resource.extractedTextPreview ?? '')
  return normalizedText ? 'extracted' : 'empty'
}

function normalizeReaderText(text: string) {
  return text
    .replace(PAGE_MARKER_PATTERN, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\u0000/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function buildPreviewParagraphs(text: string) {
  const blocks = splitReadableBlocks(text)

  if (blocks.length >= 2) {
    return blocks.slice(0, 8)
  }

  const sentences = splitSentences(text)
  const chunked: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length < 260) {
      current = next
      continue
    }

    if (current) chunked.push(current)
    current = sentence
    if (chunked.length >= 6) break
  }

  if (current && chunked.length < 6) {
    chunked.push(current)
  }

  const compactBlocks = chunked.filter((block) => block.length >= 48).slice(0, 6)
  if (compactBlocks.length > 0) {
    return compactBlocks
  }

  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed ? [trimAtBoundary(trimmed, 240)] : []
}

function buildGroundedSummary(paragraphs: string[]) {
  const opening = paragraphs.find((paragraph) => paragraph.length >= 90) ?? paragraphs[0] ?? ''
  return trimAtBoundary(opening, 320)
}

function buildGroundedKeyPoints(paragraphs: string[], summary: string) {
  const candidates = uniqueLines([
    ...splitSentences(paragraphs.join(' ')),
    ...paragraphs,
  ])
    .map((line) => cleanupPoint(line))
    .filter((line) => line.length >= 38 && line.length <= 220)
    .filter((line) => !looksLikeNoise(line))
    .filter((line) => !summary || normalizeLookup(line) !== normalizeLookup(summary))

  const points = candidates.slice(0, 6)

  if (points.length >= 4) {
    return points
  }

  return uniqueLines([
    ...points,
    ...paragraphs.map((paragraph) => trimAtBoundary(paragraph, 180)),
  ]).slice(0, 6)
}

function buildPreviewBlocks(text: string, fallbackParagraphs: string[]): StudyFilePreviewBlock[] {
  const blockCandidates = splitReadableBlocks(text)
  const selectedParagraphs = blockCandidates.length >= 2
    ? samplePreviewSections(blockCandidates, Math.min(blockCandidates.length, 4))
    : fallbackParagraphs.slice(0, 4)
  const labels = buildPreviewSectionLabels(selectedParagraphs.length)

  return selectedParagraphs.map((paragraph, index) => ({
    id: `study-preview-section-${index + 1}`,
    title: labels[index] ?? `Section ${index + 1}`,
    body: trimAtBoundary(paragraph, selectedParagraphs.length === 1 ? 560 : 440),
  }))
}

function splitReadableBlocks(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((block) => block.length >= 48 && !looksLikeNoise(block))
}

function samplePreviewSections(blocks: string[], count: number) {
  if (blocks.length <= count) {
    return blocks.slice(0, count)
  }

  const indices = new Set<number>()
  for (let index = 0; index < count; index += 1) {
    const ratio = count === 1 ? 0 : index / (count - 1)
    indices.add(Math.round(ratio * (blocks.length - 1)))
  }

  return Array.from(indices)
    .sort((left, right) => left - right)
    .map((index) => blocks[index])
}

function buildPreviewSectionLabels(count: number) {
  if (count <= 1) return ['Beginning']
  if (count === 2) return ['Beginning', 'Later section']
  if (count === 3) return ['Beginning', 'Middle', 'Final section']
  return ['Beginning', 'Middle', 'Later section', 'Final section']
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function cleanupPoint(text: string) {
  return text
    .replace(/^[\-\u2022*]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function trimAtBoundary(text: string, maxLength: number) {
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength)
  const punctuationIndex = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('? '),
    clipped.lastIndexOf('! '),
  )

  if (punctuationIndex >= 80) {
    return clipped.slice(0, punctuationIndex + 1).trim()
  }

  const spaceIndex = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, spaceIndex > 0 ? spaceIndex : maxLength).trim()}...`
}

function uniqueLines(lines: string[]) {
  const seen = new Set<string>()
  const results: string[] = []

  for (const line of lines) {
    const cleaned = line.trim()
    if (!cleaned) continue
    const key = normalizeLookup(cleaned)
    if (!key || seen.has(key)) continue
    seen.add(key)
    results.push(cleaned)
  }

  return results
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function looksLikeNoise(value: string) {
  return /^page\s+\d+$/i.test(value)
    || /^figure\s+\d+$/i.test(value)
    || /^table\s+\d+$/i.test(value)
    || /^[\d\s.,-]+$/.test(value)
}
