export type PdfExtractionErrorCode =
  | 'pdf_runtime_missing_dom_matrix'
  | 'pdf_parser_setup_failed'
  | 'pdf_downloaded_html_instead_of_pdf'
  | 'pdf_empty_text'
  | 'pdf_image_only_possible'
  | 'pdf_password_protected'
  | 'pdf_extraction_timeout'

export type PdfExtractionStatus = 'extracted' | 'needs_review' | 'empty' | 'failed'

export interface PdfExtractionQuality {
  meaningfulTextRatio: number
  meaningfulCharCount: number
  wordCount: number
  sentenceCount: number
  imageOnlyPossible: boolean
}

export interface PdfExtractionResult {
  status: PdfExtractionStatus
  text: string
  pageCount: number | null
  charCount: number
  errorCode: PdfExtractionErrorCode | null
  message: string | null
  quality: PdfExtractionQuality
}

interface PdfParseResult {
  text?: string
  numpages?: number
}

type PdfParse = (buffer: Buffer) => Promise<PdfParseResult>

const DEFAULT_TIMEOUT_MS = 20_000

export async function extractPdfTextFromBuffer(
  input: Buffer | ArrayBuffer,
  options: { timeoutMs?: number } = {},
): Promise<PdfExtractionResult> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const htmlGuard = detectDownloadedHtml(buffer)
  if (htmlGuard) {
    return buildPdfResult({
      status: 'failed',
      text: '',
      pageCount: null,
      errorCode: 'pdf_downloaded_html_instead_of_pdf',
      message: htmlGuard,
      buffer,
    })
  }

  let parse: PdfParse
  try {
    parse = await loadPdfParse()
  } catch (error) {
    return buildPdfResult({
      status: 'failed',
      text: '',
      pageCount: null,
      errorCode: classifyPdfSetupError(error),
      message: `PDF parser setup failed: ${normalizeErrorMessage(error)}`,
      buffer,
    })
  }

  let parsed: PdfParseResult
  try {
    parsed = await withTimeout(parse(buffer), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  } catch (error) {
    const code = classifyPdfParseError(error)
    const fallbackText = code === 'pdf_parser_setup_failed' ? extractPdfTextFromOperators(buffer) : ''
    if (fallbackText) {
      const quality = assessPdfTextQuality(fallbackText, buffer)
      return {
        status: quality.wordCount >= 20 && quality.sentenceCount >= 2 ? 'extracted' : 'needs_review',
        text: fallbackText,
        pageCount: inferPageCountFromPdfBytes(buffer),
        charCount: fallbackText.length,
        errorCode: quality.wordCount >= 20 && quality.sentenceCount >= 2 ? null : 'pdf_empty_text',
        message: 'PDF parser could not complete, but text was recovered from embedded text operators.',
        quality,
      }
    }

    if (code === 'pdf_parser_setup_failed' && looksLikeImageOnlyPdf(buffer)) {
      return buildPdfResult({
        status: 'empty',
        text: '',
        pageCount: inferPageCountFromPdfBytes(buffer),
        errorCode: 'pdf_image_only_possible',
        message: 'PDF parser could not complete, and the file appears to be image-only or scanned.',
        buffer,
      })
    }

    return buildPdfResult({
      status: 'failed',
      text: '',
      pageCount: null,
      errorCode: code,
      message: code === 'pdf_extraction_timeout'
        ? 'PDF extraction timed out before text could be read.'
        : formatPdfParseFailure(error),
      buffer,
    })
  }

  const pageCount = normalizePageCount(parsed.numpages)
  const primaryText = cleanExtractedText(parsed.text ?? '')
  if (!primaryText && looksLikeImageOnlyPdf(buffer)) {
    return buildPdfResult({
      status: 'empty',
      text: '',
      pageCount,
      errorCode: 'pdf_image_only_possible',
      message: 'PDF parsed, but it appears to be image-only or scanned and has no embedded readable text.',
      buffer,
    })
  }

  const fallbackText = primaryText ? '' : extractPdfTextFromOperators(buffer)
  const text = primaryText || fallbackText

  if (!text) {
    const imageOnlyPossible = looksLikeImageOnlyPdf(buffer)
    return buildPdfResult({
      status: 'empty',
      text: '',
      pageCount,
      errorCode: imageOnlyPossible ? 'pdf_image_only_possible' : 'pdf_empty_text',
      message: imageOnlyPossible
        ? 'PDF parsed, but it appears to be image-only or scanned and has no embedded readable text.'
        : 'PDF parsed successfully, but no readable text was found.',
      buffer,
    })
  }

  const quality = assessPdfTextQuality(text, buffer)
  if (
    quality.wordCount < 20
    || quality.meaningfulCharCount < 120
    || quality.meaningfulTextRatio < 0.25
    || quality.sentenceCount === 0
  ) {
    return {
      status: 'needs_review',
      text,
      pageCount,
      charCount: text.length,
      errorCode: 'pdf_empty_text',
      message: fallbackText
        ? 'PDF text was recovered from embedded operators, but the extract is thin and should be reviewed against the original file.'
        : 'PDF text was extracted, but it is too thin or noisy to trust without review.',
      quality,
    }
  }

  return {
    status: 'extracted',
    text,
    pageCount,
    charCount: text.length,
    errorCode: null,
    message: fallbackText
      ? 'PDF parsed, but only limited text could be recovered from embedded text operators.'
      : null,
    quality,
  }
}

function buildPdfResult(input: {
  status: PdfExtractionStatus
  text: string
  pageCount: number | null
  errorCode: PdfExtractionErrorCode | null
  message: string | null
  buffer: Buffer
}): PdfExtractionResult {
  const quality = assessPdfTextQuality(input.text, input.buffer)
  return {
    status: input.status,
    text: input.text,
    pageCount: input.pageCount,
    charCount: input.text.length,
    errorCode: input.errorCode,
    message: input.message,
    quality,
  }
}

async function loadPdfParse(): Promise<PdfParse> {
  const { extractText } = await import('unpdf')
  return async (buffer: Buffer) => {
    const { text, totalPages } = await extractText(new Uint8Array(buffer), { mergePages: true })
    return {
      text: Array.isArray(text) ? text.join('\n') : (text ?? ''),
      numpages: totalPages,
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new PdfExtractionTimeoutError()), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

class PdfExtractionTimeoutError extends Error {
  constructor() {
    super('PDF extraction timed out.')
    this.name = 'PdfExtractionTimeoutError'
  }
}

function detectDownloadedHtml(buffer: Buffer) {
  const prefix = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8')
  const normalized = prefix.replace(/^\uFEFF/, '').trimStart().toLowerCase()

  if (normalized.startsWith('%pdf-')) {
    return null
  }

  if (
    normalized.startsWith('<!doctype html')
    || normalized.startsWith('<html')
    || /<title>[^<]*(canvas|login|sign in|unauthorized|access denied)[^<]*<\/title>/i.test(prefix)
    || /<form\b[^>]*(login|signin|password)/i.test(prefix)
  ) {
    return 'Canvas returned HTML instead of a PDF. The file likely needs authenticated binary download or the stored URL points at a preview/login page.'
  }

  return null
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function assessPdfTextQuality(text: string, buffer: Buffer): PdfExtractionQuality {
  const cleaned = cleanExtractedText(text)
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean)
  const meaningfulLines = lines.filter((line) => isMeaningfulTextLine(line))
  const meaningfulText = meaningfulLines.join('\n')
  const wordCount = countWords(cleaned)
  const sentenceCount = countSentences(meaningfulText)
  const meaningfulCharCount = meaningfulText.length
  const meaningfulTextRatio = cleaned.length > 0 ? meaningfulCharCount / cleaned.length : 0

  return {
    meaningfulTextRatio,
    meaningfulCharCount,
    wordCount,
    sentenceCount,
    imageOnlyPossible: looksLikeImageOnlyPdf(buffer),
  }
}

function isMeaningfulTextLine(line: string) {
  const normalized = line.replace(/^[\-\u2022*0-9.)\s]+/, '').trim()
  if (normalized.length < 18) return false
  if (normalized.split(/\s+/).length < 4) return false
  if (/^[\d\s.,:/-]+$/.test(normalized)) return false
  return true
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length
}

function countSentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24 && sentence.split(/\s+/).length >= 5)
    .length
}

function normalizePageCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function inferPageCountFromPdfBytes(buffer: Buffer) {
  const binary = buffer.toString('latin1')
  const match = binary.match(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/)
  if (!match?.[1]) return null
  const count = Number.parseInt(match[1], 10)
  return Number.isFinite(count) && count > 0 ? count : null
}

function extractPdfTextFromOperators(buffer: Buffer) {
  const binary = buffer.toString('latin1')
  const matches = [...binary.matchAll(/\(([^()]|\\.){3,}\)\s*Tj/g)]
  const arrayMatches = [...binary.matchAll(/\[([\s\S]*?)\]\s*TJ/g)]
  const chunks: string[] = []

  for (const match of matches) {
    const text = decodePdfLiteralString(match[0].replace(/\)\s*Tj$/, '').replace(/^\(/, ''))
    if (text) chunks.push(text)
  }

  for (const match of arrayMatches) {
    const parts = [...match[1].matchAll(/\(([^()]|\\.)*\)/g)]
      .map((part) => decodePdfLiteralString(part[0].slice(1, -1)))
      .filter(Boolean)
    if (parts.length > 0) chunks.push(parts.join(' '))
  }

  return cleanExtractedText(chunks.join('\n'))
}

function decodePdfLiteralString(value: string) {
  return value
    .replace(/\\\)/g, ')')
    .replace(/\\\(/g, '(')
    .replace(/\\\\/g, '\\')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\d{3}/g, ' ')
    .replace(/[^\x20-\x7E\n\t]/g, ' ')
    .trim()
}

function looksLikeImageOnlyPdf(buffer: Buffer) {
  const binary = buffer.toString('latin1')
  const imageHits = (binary.match(/\/Subtype\s*\/Image/g) ?? []).length
  const fontHits = (binary.match(/\/Font\b/g) ?? []).length
  return imageHits > 0 && fontHits === 0
}

function classifyPdfSetupError(error: unknown): PdfExtractionErrorCode {
  const message = normalizeErrorMessage(error)
  if (/dommatrix/i.test(message)) return 'pdf_runtime_missing_dom_matrix'
  return 'pdf_parser_setup_failed'
}

function classifyPdfParseError(error: unknown): PdfExtractionErrorCode {
  const message = normalizeErrorMessage(error)
  if (error instanceof PdfExtractionTimeoutError) return 'pdf_extraction_timeout'
  if (/password|encrypted/i.test(message)) return 'pdf_password_protected'
  if (/dommatrix/i.test(message)) return 'pdf_runtime_missing_dom_matrix'
  return 'pdf_parser_setup_failed'
}

function formatPdfParseFailure(error: unknown) {
  const code = classifyPdfParseError(error)
  if (code === 'pdf_password_protected') {
    return 'PDF parse failed: the document is password-protected.'
  }

  if (code === 'pdf_runtime_missing_dom_matrix') {
    return `PDF parser runtime is missing DOMMatrix: ${normalizeErrorMessage(error)}`
  }

  return `PDF parse failed: ${normalizeErrorMessage(error)}`
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const cleaned = error.message.replace(/\s+/g, ' ').trim()
    return cleaned || 'Unknown extraction error.'
  }

  if (typeof error === 'string') {
    const cleaned = error.replace(/\s+/g, ' ').trim()
    return cleaned || 'Unknown extraction error.'
  }

  return 'Unknown extraction error.'
}
