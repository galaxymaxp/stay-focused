import { normalizeModuleResourceStudyText } from '@/lib/module-resource-quality'
import type { ExtractedTextQuality, ModuleResource } from '@/lib/types'

export const MIN_MEANINGFUL_SOURCE_CHARS = 120
export const BAD_OCR_BLOCKED_MESSAGE = 'Visual extraction did not find enough usable study text. Try OCR again or open the original source.'

const REFUSAL_PATTERNS = [
  /\bi(?:'m| am)\s+unable\s+to\s+transcribe\b/i,
  /\bi\s+can(?:not|'t)\s+transcribe\b/i,
  /\bunable\s+to\s+extract\s+text\b/i,
  /\bunable\s+to\s+read\s+the\s+text\b/i,
  /\bunable\s+to\s+help\s+with\s+transcribing\b/i,
  /\bcan(?:not|'t)\s+help\s+transcribe\b/i,
  /\bscanned documents? at this time\b/i,
]

const BOILERPLATE_PATTERNS = [
  /\bvisual extraction did not find enough usable study text\b/i,
  /\btry ocr again\b/i,
  /\bopen the original source\b/i,
  /\bopen the original file\b/i,
  /\bocr (?:finished|completed),? but no legible text\b/i,
]

const METADATA_LINE_PATTERNS = [
  /^\s*(?:resource|document|file)\s+title\s*:/i,
  /^\s*(?:resource|document|file)\s+id\s*:/i,
  /^\s*uuid\s*:/i,
  /^\s*(?:module|course|resource|canvas)\s+id\s*:/i,
  /^\s*quality note\s*:/i,
  /^\s*extraction quality\s*:/i,
  /^\s*source warning\s*:/i,
  /^\s*source note\s*:/i,
  /^\s*preview state\s*:/i,
  /^\s*stored text length\s*:/i,
  /^\s*stored preview length\s*:/i,
  /^\s*page count\s*:/i,
  /^\s*pages processed\s*:/i,
  /^\s*normalized content status\s*:/i,
  /^\s*visual extraction status\s*:/i,
  /^\s*provider\s*:/i,
  /^\s*model\s*:/i,
  /^\s*confidence\s*:/i,
  /^\s*(?:source|resource)\s+type\s*:/i,
]

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
const TITLE_PUNCTUATION_PATTERN = /[^a-z0-9]+/gi

export interface ExtractedTextQualityResult {
  quality: ExtractedTextQuality
  usable: boolean
  normalizedText: string
  candidateText: string
  candidateCharCount: number
  alphaWordCount: number
  reason: string
}

export function classifyExtractedTextQuality(input: {
  text: string | null | undefined
  title?: string | null
  minMeaningfulChars?: number
}): ExtractedTextQualityResult {
  const normalizedText = normalizeModuleResourceStudyText(input.text ?? '')
  const minMeaningfulChars = input.minMeaningfulChars ?? MIN_MEANINGFUL_SOURCE_CHARS
  if (!normalizedText) {
    return buildResult('empty', normalizedText, '', 'No readable text was extracted.')
  }

  const refusalMatch = REFUSAL_PATTERNS.some((pattern) => pattern.test(normalizedText))
  const lines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean)
  const normalizedTitle = normalizeTitleIdentity(input.title ?? null)
  const candidateLines = lines.filter((line) => !isMetadataLikeLine(line, normalizedTitle))
  const candidateText = candidateLines.join('\n').trim()
  const candidateCharCount = candidateText.length
  const alphaWordCount = countAlphaWords(candidateText)

  if (refusalMatch && candidateCharCount < minMeaningfulChars) {
    return buildResult('refusal', normalizedText, '', 'OCR returned refusal text instead of source content.')
  }

  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(normalizedText)) && candidateCharCount < minMeaningfulChars) {
    return buildResult('boilerplate', normalizedText, '', 'Only extraction boilerplate was returned, not study text.')
  }

  if (!candidateText) {
    const metadataHeavy = lines.some((line) => isMetadataLikeLine(line, normalizedTitle)) || UUID_PATTERN.test(normalizedText)
    return buildResult(
      metadataHeavy ? 'metadata_only' : 'empty',
      normalizedText,
      '',
      metadataHeavy ? 'Only metadata-like text was extracted.' : 'No readable study text was extracted.',
    )
  }

  if (UUID_PATTERN.test(candidateText) && countUuidMatches(candidateText) >= 2 && alphaWordCount < 12) {
    return buildResult('metadata_only', normalizedText, '', 'Extracted text is dominated by identifiers and metadata.')
  }

  if (candidateCharCount < minMeaningfulChars || alphaWordCount < 12) {
    return buildResult('too_short', normalizedText, candidateText, 'Readable text exists, but it is too short to ground Deep Learn.')
  }

  return buildResult('meaningful', normalizedText, candidateText, 'Readable study text is available and usable for Deep Learn.')
}

export function classifyModuleResourceTextQuality(
  resource: Pick<ModuleResource, 'extractedText' | 'extractedTextPreview' | 'visualExtractionStatus' | 'visualExtractedText'> & {
    title?: string | null
  },
) {
  const preferredText = typeof resource.extractedText === 'string' && resource.extractedText.trim()
    ? resource.extractedText
    : resource.visualExtractionStatus === 'completed' && typeof resource.visualExtractedText === 'string' && resource.visualExtractedText.trim()
      ? resource.visualExtractedText
      : resource.extractedTextPreview

  return classifyExtractedTextQuality({
    text: preferredText,
    title: resource.title,
  })
}

function buildResult(
  quality: ExtractedTextQuality,
  normalizedText: string,
  candidateText: string,
  reason: string,
): ExtractedTextQualityResult {
  return {
    quality,
    usable: quality === 'meaningful',
    normalizedText,
    candidateText,
    candidateCharCount: candidateText.length,
    alphaWordCount: countAlphaWords(candidateText),
    reason,
  }
}

function isMetadataLikeLine(line: string, normalizedTitle: string | null) {
  if (!line) return true
  if (METADATA_LINE_PATTERNS.some((pattern) => pattern.test(line))) return true
  if (UUID_PATTERN.test(line)) return true

  const normalizedLine = normalizeTitleIdentity(line)
  if (normalizedTitle && normalizedLine === normalizedTitle) return true

  return false
}

function normalizeTitleIdentity(value: string | null) {
  if (!value) return null
  const normalized = value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(TITLE_PUNCTUATION_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || null
}

function countAlphaWords(text: string) {
  const matches = text.match(/\b[a-z][a-z0-9-]{1,}\b/gi)
  return matches?.length ?? 0
}

function countUuidMatches(text: string) {
  return text.match(new RegExp(UUID_PATTERN.source, 'gi'))?.length ?? 0
}
