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
  /^\s*file title\b/i,
  /^\s*source type of the file\b/i,
  /^\s*module name\b/i,
  /^\s*course name\b/i,
  /^\s*extraction quality reported\b/i,
  /^\s*source text quality reported\b/i,
  /^\s*grounding strategy used\b/i,
  /^\s*was an ai fallback used to supply text\b/i,
  /^\s*was the pdf text transcribed from scanned images\b/i,
  /^\s*resource context\b/i,
  /^\s*grounding status\b/i,
  /^\s*best available source grounding\b/i,
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
  academicKeywordCount: number
  academicKeywordDensity: number
  metadataLikeLineCount: number
  metadataLineRatio: number
  refusalDetected: boolean
  reason: string
}

const METADATA_WORDS = new Set([
  'file', 'title', 'source', 'type', 'module', 'name', 'course', 'extraction', 'quality', 'reported',
  'text', 'grounding', 'strategy', 'used', 'fallback', 'supply', 'transcribed', 'scanned', 'images',
  'resource', 'document', 'provider', 'model', 'confidence', 'preview', 'status', 'page', 'pages',
  'processed', 'stored', 'visual', 'warning', 'note', 'generation', 'mode', 'context', 'available',
  'selected', 'debug', 'diagnostic', 'uuid', 'identifier',
])

const COMMON_NON_ACADEMIC_WORDS = new Set([
  'this', 'that', 'with', 'from', 'into', 'only', 'were', 'been', 'have', 'will', 'would', 'could',
  'should', 'about', 'there', 'their', 'them', 'they', 'what', 'when', 'where', 'which', 'while',
  'again', 'open', 'original', 'study', 'content', 'specific', 'know', 'discuss', 'something', 'like',
  'feel', 'free', 'your', 'time', 'unable', 'transcribe', 'images', 'scanned', 'documents',
])

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
  const metadataLikeLineCount = lines.filter((line) => isMetadataLikeLine(line, normalizedTitle)).length
  const candidateLines = lines.filter((line) => !isMetadataLikeLine(line, normalizedTitle))
  const candidateText = candidateLines.join('\n').trim()
  const candidateCharCount = candidateText.length
  const alphaWordCount = countAlphaWords(candidateText)
  const academicKeywordCount = countAcademicKeywords(candidateText)
  const academicKeywordDensity = alphaWordCount > 0 ? academicKeywordCount / alphaWordCount : 0
  const metadataLineRatio = lines.length > 0 ? metadataLikeLineCount / lines.length : 0

  if (refusalMatch && (candidateCharCount < minMeaningfulChars || academicKeywordDensity < 0.2 || metadataLineRatio >= 0.35)) {
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

  if (metadataLineRatio >= 0.5 && academicKeywordDensity < 0.24) {
    return buildResult('metadata_only', normalizedText, '', 'Extracted text is dominated by metadata/debug labels instead of study content.')
  }

  if (academicKeywordDensity < 0.2 && metadataLikeLineCount > 0) {
    return buildResult('metadata_only', normalizedText, '', 'Extracted text is mostly labels and diagnostics, not academic source text.')
  }

  if (candidateCharCount < minMeaningfulChars || alphaWordCount < 12) {
    return buildResult('too_short', normalizedText, candidateText, 'Readable text exists, but it is too short to ground Deep Learn.')
  }

  if (academicKeywordCount < 8 || academicKeywordDensity < 0.2) {
    return buildResult('metadata_only', normalizedText, '', 'Readable text was found, but it does not look like meaningful academic source content.')
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

export function isMeaningfulDeepLearnSourceText(input: {
  text: string | null | undefined
  title?: string | null
}) {
  const quality = classifyExtractedTextQuality(input)
  return quality.quality === 'meaningful'
    && quality.academicKeywordCount >= 8
    && quality.academicKeywordDensity >= 0.2
    && !quality.refusalDetected
}

function buildResult(
  quality: ExtractedTextQuality,
  normalizedText: string,
  candidateText: string,
  reason: string,
): ExtractedTextQualityResult {
  const alphaWordCount = countAlphaWords(candidateText)
  const academicKeywordCount = countAcademicKeywords(candidateText)
  return {
    quality,
    usable: quality === 'meaningful',
    normalizedText,
    candidateText,
    candidateCharCount: candidateText.length,
    alphaWordCount,
    academicKeywordCount,
    academicKeywordDensity: alphaWordCount > 0 ? academicKeywordCount / alphaWordCount : 0,
    metadataLikeLineCount: 0,
    metadataLineRatio: 0,
    refusalDetected: REFUSAL_PATTERNS.some((pattern) => pattern.test(normalizedText)),
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

function countAcademicKeywords(text: string) {
  const words = text.match(/\b[a-z][a-z0-9-]{3,}\b/gi) ?? []
  return words.filter((rawWord) => {
    const word = rawWord.toLowerCase()
    return !METADATA_WORDS.has(word) && !COMMON_NON_ACADEMIC_WORDS.has(word)
  }).length
}
