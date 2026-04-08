import {
  getModuleResourceCapabilityInfo,
  type ModuleResourceCapabilityInfo,
  type ModuleResourceCapabilityLike,
} from './module-resource-capability'
import type { ModuleResourceGroundingLevel, ModuleResourceQuality } from './types'

export type ModuleResourceQualityLike = ModuleResourceCapabilityLike

export interface ModuleResourceQualityInfo {
  capability: ModuleResourceCapabilityInfo
  quality: ModuleResourceQuality
  qualityLabel: 'Strong' | 'Usable' | 'Weak' | 'Empty' | 'Unsupported' | 'Failed'
  qualityTone: 'accent' | 'warning' | 'muted' | 'danger'
  groundingLevel: ModuleResourceGroundingLevel
  groundingLabel: 'Strong grounding' | 'Weak grounding' | 'Not grounding'
  shouldUseForStudy: boolean
  shouldUseForGrounding: boolean
  shouldUseForQuiz: boolean
  normalizedText: string
  meaningfulText: string
  totalCharCount: number
  meaningfulCharCount: number
  meaningfulBlockCount: number
  sentenceCount: number
  noiseLineCount: number
  repeatedLineCount: number
  signalRatio: number
  reason: string
}

const PAGE_MARKER_PATTERN = /\n?--\s*\d+\s+of\s+\d+\s*--\n?/gi
const UI_JUNK_PATTERN = /\b(?:dashboard|account|calendar|inbox|history|help|settings|syllabus|modules?|announcements?|assignments?|discussions?|quizzes?|grades?|people|pages?|files?|outcomes|collaborations|attendance|conferences|open in new window|next|previous|back to|download)\b/i
const SCANNED_NOTE_PATTERN = /scanned|image-only|image based|image-based/i

export function getModuleResourceQualityInfo(resource: ModuleResourceQualityLike): ModuleResourceQualityInfo {
  const capability = getModuleResourceCapabilityInfo(resource)
  const normalizedText = normalizeModuleResourceStudyText(resource.extractedText ?? resource.extractedTextPreview ?? '')
  const lines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean)
  const repeatedLineCount = countRepeatedLines(lines)
  const noiseLines = lines.filter((line) => looksLikeNoiseLine(line))
  const meaningfulLines = lines.filter((line) => !looksLikeNoiseLine(line) && isMeaningfulLine(line))
  const meaningfulBlocks = normalizedText
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter((block) => block.length >= 48 && !looksLikeNoiseLine(block))
  const meaningfulText = meaningfulLines.join('\n').trim()
  const sentenceCount = countSentences(meaningfulText)
  const totalCharCount = normalizedText.length
  const meaningfulCharCount = meaningfulText.length
  const signalRatio = totalCharCount > 0 ? meaningfulCharCount / totalCharCount : 0
  const likelyScanned = SCANNED_NOTE_PATTERN.test(resource.extractionError ?? '')

  const quality = resolveModuleResourceQuality({
    capability,
    extractionStatus: resource.extractionStatus,
    meaningfulCharCount,
    meaningfulBlockCount: meaningfulBlocks.length,
    sentenceCount,
    signalRatio,
    repeatedLineCount,
    noiseLineCount: noiseLines.length,
    likelyScanned,
  })
  const groundingLevel = resolveGroundingLevel(quality)

  return {
    capability,
    quality,
    qualityLabel: labelForModuleResourceQuality(quality),
    qualityTone: toneForModuleResourceQuality(quality),
    groundingLevel,
    groundingLabel: labelForGroundingLevel(groundingLevel),
    shouldUseForStudy: quality === 'strong' || quality === 'usable',
    shouldUseForGrounding: groundingLevel !== 'none',
    shouldUseForQuiz: quality === 'strong' || quality === 'usable',
    normalizedText,
    meaningfulText,
    totalCharCount,
    meaningfulCharCount,
    meaningfulBlockCount: meaningfulBlocks.length,
    sentenceCount,
    noiseLineCount: noiseLines.length,
    repeatedLineCount,
    signalRatio,
    reason: buildQualityReason({
      resource,
      capability,
      quality,
      groundingLevel,
      meaningfulCharCount,
      meaningfulBlockCount: meaningfulBlocks.length,
      sentenceCount,
      signalRatio,
      repeatedLineCount,
      noiseLineCount: noiseLines.length,
      likelyScanned,
    }),
  }
}

export function buildModuleResourceAssessmentMetadata(
  resource: ModuleResourceQualityLike,
  metadata?: Record<string, unknown> | null,
) {
  const baseMetadata = asPlainRecord(metadata)
  const capability = getModuleResourceCapabilityInfo({
    ...resource,
    metadata: baseMetadata,
  })
  const quality = getModuleResourceQualityInfo({
    ...resource,
    metadata: {
      ...baseMetadata,
      normalizedSourceType: capability.normalizedSourceType,
      capability: capability.capability,
    },
  })

  return {
    ...baseMetadata,
    normalizedSourceType: capability.normalizedSourceType,
    capability: capability.capability,
    capabilityReason: capability.reason,
    quality: quality.quality,
    qualityReason: quality.reason,
    groundingLevel: quality.groundingLevel,
    qualityMeaningfulCharCount: quality.meaningfulCharCount,
    qualitySignalRatio: Number(quality.signalRatio.toFixed(3)),
    qualitySentenceCount: quality.sentenceCount,
    qualityNoiseLineCount: quality.noiseLineCount,
    qualityRepeatedLineCount: quality.repeatedLineCount,
  }
}

export function normalizeModuleResourceStudyText(text: string) {
  return decodeBasicHtmlEntities(
    text
      .replace(PAGE_MARKER_PATTERN, '\n')
      .replace(/(?:^|\n)\s*Speaker notes:\s*\d+\s*(?=\n|$)/gi, '\n\n')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n')
      .replace(/<\s*p\s*>/gi, '\n')
      .replace(/<\s*\/li\s*>/gi, '\n')
      .replace(/<\s*li\s*>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/(?:^|\n)[^\n|]{1,100}\|\s*\d+\s*(?=\n|$)/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\u0000/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  )
}

export function labelForModuleResourceQuality(quality: ModuleResourceQuality) {
  if (quality === 'strong') return 'Strong'
  if (quality === 'usable') return 'Usable'
  if (quality === 'weak') return 'Weak'
  if (quality === 'empty') return 'Empty'
  if (quality === 'unsupported') return 'Unsupported'
  return 'Failed'
}

export function toneForModuleResourceQuality(quality: ModuleResourceQuality) {
  if (quality === 'strong') return 'accent'
  if (quality === 'usable') return 'accent'
  if (quality === 'weak') return 'warning'
  if (quality === 'empty') return 'muted'
  if (quality === 'unsupported') return 'muted'
  return 'danger'
}

export function labelForGroundingLevel(value: ModuleResourceGroundingLevel) {
  if (value === 'strong') return 'Strong grounding'
  if (value === 'weak') return 'Weak grounding'
  return 'Not grounding'
}

function resolveModuleResourceQuality(input: {
  capability: ModuleResourceCapabilityInfo
  extractionStatus: unknown
  meaningfulCharCount: number
  meaningfulBlockCount: number
  sentenceCount: number
  signalRatio: number
  repeatedLineCount: number
  noiseLineCount: number
  likelyScanned: boolean
}): ModuleResourceQuality {
  if (input.capability.capability === 'failed') return 'failed'
  if (input.capability.capability === 'unsupported') return 'unsupported'

  const extractionStatus = normalizeExtractionStatus(input.extractionStatus)
  if (extractionStatus === 'empty') return 'empty'
  if (extractionStatus === 'metadata_only' && input.meaningfulCharCount === 0) return 'empty'
  if (input.likelyScanned && input.meaningfulCharCount === 0) return 'empty'
  if (input.meaningfulCharCount === 0) return 'empty'

  if (
    input.meaningfulCharCount >= 850
    && input.meaningfulBlockCount >= 3
    && input.sentenceCount >= 4
    && input.signalRatio >= 0.48
    && input.repeatedLineCount <= 2
    && input.noiseLineCount <= 6
  ) {
    return 'strong'
  }

  if (
    input.meaningfulCharCount >= 280
    && input.meaningfulBlockCount >= 1
    && input.sentenceCount >= 2
    && input.signalRatio >= 0.28
    && input.repeatedLineCount <= 8
  ) {
    return 'usable'
  }

  return 'weak'
}

function resolveGroundingLevel(quality: ModuleResourceQuality): ModuleResourceGroundingLevel {
  if (quality === 'strong') return 'strong'
  if (quality === 'usable') return 'weak'
  return 'none'
}

function buildQualityReason(input: {
  resource: ModuleResourceQualityLike
  capability: ModuleResourceCapabilityInfo
  quality: ModuleResourceQuality
  groundingLevel: ModuleResourceGroundingLevel
  meaningfulCharCount: number
  meaningfulBlockCount: number
  sentenceCount: number
  signalRatio: number
  repeatedLineCount: number
  noiseLineCount: number
  likelyScanned: boolean
}) {
  if (input.quality === 'failed' || input.quality === 'unsupported') {
    return input.capability.reason
  }

  if (input.quality === 'empty') {
    if (input.likelyScanned) {
      return 'The extractor found little or no usable text, and the stored note still looks scanned or image-based.'
    }

    if (input.resource.extractionStatus === 'metadata_only') {
      return input.capability.reason
    }

    return 'Readable text is missing or too thin to support Learn, Quiz, or deeper study grounding.'
  }

  if (input.quality === 'weak') {
    if (input.meaningfulCharCount < 220) {
      return `Readable text exists, but it is still too thin for confident study grounding (${input.meaningfulCharCount.toLocaleString()} meaningful characters).`
    }

    if (input.signalRatio < 0.34 || input.noiseLineCount >= 6) {
      return 'Readable text exists, but too much of the extract still looks like boilerplate, navigation, or UI noise.'
    }

    if (input.repeatedLineCount >= 4) {
      return 'Readable text exists, but repeated lines still dominate too much of the extract to trust it as solid study material.'
    }

    return 'Readable text is present, but it is still weak for Learn and Quiz. The app keeps it visible without treating it like strong grounding.'
  }

  if (input.quality === 'usable') {
    return `Readable text is available and usable for study, but it is still lighter than the strongest sources (${input.meaningfulCharCount.toLocaleString()} meaningful characters across ${input.meaningfulBlockCount} readable sections).`
  }

  return `Readable text looks substantial enough to support grounded study use (${input.meaningfulCharCount.toLocaleString()} meaningful characters, ${input.sentenceCount} sentences, ${(input.signalRatio * 100).toFixed(0)}% signal).`
}

function countRepeatedLines(lines: string[]) {
  const counts = new Map<string, number>()

  for (const line of lines) {
    const key = normalizeLookup(line)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.values()).filter((count) => count > 1).length
}

function countSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 24)
    .length
}

function isMeaningfulLine(line: string) {
  const normalized = line.replace(/^[\-\u2022*0-9.)\s]+/, '').trim()
  if (normalized.length < 24) return false
  if (normalizeLookup(normalized).length < 18) return false
  return normalized.split(/\s+/).length >= 5
}

function looksLikeNoiseLine(line: string) {
  if (!line) return true
  if (/^[\d\s.,:/-]+$/.test(line)) return true
  if (/^(page|slide|figure|table)\s+\d+$/i.test(line)) return true
  if (/^speaker notes:\s*\d+$/i.test(line)) return true
  if (line.length <= 18 && UI_JUNK_PATTERN.test(line)) return true

  const words = line.split(/\s+/).filter(Boolean)
  return words.length <= 6 && UI_JUNK_PATTERN.test(line)
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeExtractionStatus(value: unknown) {
  return value === 'pending'
    || value === 'extracted'
    || value === 'metadata_only'
    || value === 'unsupported'
    || value === 'empty'
    || value === 'failed'
    ? value
    : 'metadata_only'
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...value as Record<string, unknown> }
    : {}
}
