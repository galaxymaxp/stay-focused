import type { ModuleResourceExtractionStatus } from '@/lib/types'
import { extractPdfTextFromBuffer, type PdfExtractionResult as ServerPdfExtractionResult } from './extraction/pdf-extractor'

export interface ExtractedCanvasResourceContent {
  extractionStatus: ModuleResourceExtractionStatus
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  supported: boolean
  metadataPatch?: Record<string, unknown>
}

type HtmlExtractionContext = 'canvas_page' | 'html_file'

interface HtmlExtractionSection {
  label: string
  html?: string | null | undefined
  text?: string | null | undefined
}

export async function extractCanvasFileContent(input: {
  buffer: Buffer
  title: string
  extension: string | null
  contentType: string | null
}): Promise<ExtractedCanvasResourceContent> {
  const extension = normalizeExtension(input.extension, input.title)
  const contentType = input.contentType?.toLowerCase() ?? null

  try {
    let extractedText = ''
    let extractionError: string | null = null
    let metadataPatch: Record<string, unknown> = {}

    if (extension === 'pdf' || contentType === 'application/pdf') {
      const pdfResult = await extractPdfTextFromBuffer(input.buffer)
      metadataPatch = buildPdfExtractionMetadata(pdfResult)

      if (pdfResult.status === 'failed') {
        return {
          extractionStatus: 'failed',
          extractedText: null,
          extractedTextPreview: null,
          extractedCharCount: 0,
          extractionError: formatPdfExtractionMessage(pdfResult),
          supported: true,
          metadataPatch,
        }
      }

      if (pdfResult.status === 'empty') {
        return {
          extractionStatus: 'empty',
          extractedText: null,
          extractedTextPreview: null,
          extractedCharCount: 0,
          extractionError: formatPdfExtractionMessage(pdfResult),
          supported: true,
          metadataPatch,
        }
      }

      extractedText = pdfResult.text
      extractionError = pdfResult.status === 'needs_review'
        ? formatPdfExtractionMessage(pdfResult)
        : pdfResult.message
    } else if (
      extension === 'pptx'
      || contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      extractedText = await extractPptxText(input.buffer)
    } else if (
      extension === 'docx'
      || contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      extractedText = await extractDocxText(input.buffer)
    } else if (extension === 'ppt' || contentType === 'application/vnd.ms-powerpoint') {
      return {
        extractionStatus: 'unsupported',
        extractedText: null,
        extractedTextPreview: null,
        extractedCharCount: 0,
        extractionError: 'Legacy .ppt files are not readable in the current extraction pipeline. Open the file in Canvas or convert it to .pptx for better extraction.',
        supported: false,
      }
    } else if (extension === 'txt' || extension === 'md' || extension === 'csv') {
      extractedText = input.buffer.toString('utf8')
    } else if (extension === 'html' || extension === 'htm' || contentType === 'text/html') {
      extractedText = extractReadableTextFromHtml(input.buffer.toString('utf8'), 'html_file')
    } else {
      return {
        extractionStatus: 'unsupported',
        extractedText: null,
        extractedTextPreview: null,
        extractedCharCount: 0,
        extractionError: `Stay Focused cannot read this ${extension ? `.${extension}` : 'file'} type yet, so the item is kept as link-only context.`,
        supported: false,
      }
    }

    const cleaned = cleanExtractedText(extractedText)
    if (!cleaned) {
      return {
        extractionStatus: 'empty',
        extractedText: null,
        extractedTextPreview: null,
        extractedCharCount: 0,
        extractionError: extractionError,
        supported: true,
        metadataPatch,
      }
    }

    return {
      extractionStatus: 'extracted',
      extractedText: cleaned,
      extractedTextPreview: cleaned.slice(0, 420),
      extractedCharCount: cleaned.length,
      extractionError,
      supported: true,
      metadataPatch,
    }
  } catch (error) {
    return {
      extractionStatus: 'failed',
      extractedText: null,
      extractedTextPreview: null,
      extractedCharCount: 0,
      extractionError: formatUnexpectedExtractionError(error),
      supported: true,
    }
  }
}

export async function extractCanvasPageContent(input: {
  title: string
  html: string | null | undefined
}): Promise<ExtractedCanvasResourceContent> {
  return extractCanvasStructuredHtmlContent({
    title: input.title,
    sections: [
      {
        label: 'Page content',
        html: input.html,
      },
    ],
    emptyMessage: 'Canvas page fetched successfully, but no usable body text was found.',
  })
}

export async function extractCanvasStructuredHtmlContent(input: {
  title: string
  sections: HtmlExtractionSection[]
  emptyMessage: string
}): Promise<ExtractedCanvasResourceContent> {
  try {
    const cleaned = cleanExtractedText(buildStructuredHtmlExtraction(input.sections))
    if (!cleaned) {
      return {
        extractionStatus: 'empty',
        extractedText: null,
        extractedTextPreview: null,
        extractedCharCount: 0,
        extractionError: input.emptyMessage,
        supported: true,
      }
    }

    return {
      extractionStatus: 'extracted',
      extractedText: cleaned,
      extractedTextPreview: cleaned.slice(0, 420),
      extractedCharCount: cleaned.length,
      extractionError: null,
      supported: true,
    }
  } catch (error) {
    return {
      extractionStatus: 'failed',
      extractedText: null,
      extractedTextPreview: null,
      extractedCharCount: 0,
      extractionError: formatUnexpectedExtractionError(error),
      supported: true,
    }
  }
}

export function normalizeExtension(extension: string | null | undefined, title: string) {
  if (extension) return extension.replace(/^\./, '').trim().toLowerCase()
  const match = title.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : null
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function extractReadableTextFromHtml(html: string, context: HtmlExtractionContext) {
  const withoutHeavyNoise = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|canvas|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')

  const structured = withoutHeavyNoise
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<h[1-6]\b[^>]*>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote|pre|figure|figcaption|ul|ol|dl|table|thead|tbody|tfoot|tr)>/gi, '\n\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' ')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

  const lines = decodeHtmlEntities(structured)
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())

  const cleanedLines: string[] = []
  let previousWasBlank = false

  for (const line of lines) {
    if (!line) {
      if (!previousWasBlank && cleanedLines.length > 0) {
        cleanedLines.push('')
      }
      previousWasBlank = true
      continue
    }

    if (looksLikeHtmlChromeLine(line, context)) {
      continue
    }

    cleanedLines.push(line)
    previousWasBlank = false
  }

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function extractPptxText(buffer: Buffer) {
  const jszipModule = await import('jszip')
  const JSZip = jszipModule.default
  const zip = await JSZip.loadAsync(buffer)
  const files = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    .sort(comparePptxXmlPaths)

  const chunks: string[] = []

  for (const fileName of files) {
    const xml = await zip.files[fileName].async('string')
    const text = extractReadableTextFromPptxXml(xml)

    if (text) {
      const label = fileName.includes('notesSlides') ? 'Speaker notes' : 'Slide'
      chunks.push(`${label}: ${text}`)
    }
  }

  return chunks.join('\n\n')
}

async function extractDocxText(buffer: Buffer) {
  const jszipModule = await import('jszip')
  const JSZip = jszipModule.default
  const zip = await JSZip.loadAsync(buffer)
  const docxSections = [
    { path: 'word/document.xml', label: 'Document' },
    ...Object.keys(zip.files)
      .filter((name) => /^word\/header\d+\.xml$/i.test(name))
      .sort()
      .map((path) => ({ path, label: 'Header' })),
    ...Object.keys(zip.files)
      .filter((name) => /^word\/footnotes\.xml$/i.test(name))
      .sort()
      .map((path) => ({ path, label: 'Footnotes' })),
    ...Object.keys(zip.files)
      .filter((name) => /^word\/endnotes\.xml$/i.test(name))
      .sort()
      .map((path) => ({ path, label: 'Endnotes' })),
    ...Object.keys(zip.files)
      .filter((name) => /^word\/footer\d+\.xml$/i.test(name))
      .sort()
      .map((path) => ({ path, label: 'Footer' })),
  ]

  const chunks: string[] = []

  for (const section of docxSections) {
    const file = zip.files[section.path]
    if (!file) continue

    const xml = await file.async('string')
    const text = extractReadableTextFromDocxXml(xml)

    if (text) {
      chunks.push(section.label === 'Document' ? text : `${section.label}: ${text}`)
    }
  }

  return chunks.join('\n\n')
}

function extractReadableTextFromPptxXml(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<\/a:p>/gi, '\n')
      .replace(/<\/p:txBody>/gi, '\n\n')
      .replace(/<a:br\/>/gi, '\n')
      .replace(/<a:tab\/>/gi, '\t')
      .replace(/<a:t[^>]*>/gi, '')
      .replace(/<\/a:t>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function comparePptxXmlPaths(a: string, b: string) {
  const numberA = Number.parseInt(a.match(/(\d+)\.xml$/)?.[1] ?? '0', 10)
  const numberB = Number.parseInt(b.match(/(\d+)\.xml$/)?.[1] ?? '0', 10)
  if (numberA !== numberB) return numberA - numberB
  return a.localeCompare(b)
}

function decodeXmlEntities(value: string) {
  return decodeHtmlEntities(value)
}

function extractReadableTextFromDocxXml(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\/>/gi, '\t')
      .replace(/<w:br[^>]*\/>/gi, '\n')
      .replace(/<w:cr[^>]*\/>/gi, '\n')
      .replace(/<\/w:p>/gi, '\n\n')
      .replace(/<\/w:tr>/gi, '\n')
      .replace(/<w:t[^>]*>/gi, '')
      .replace(/<\/w:t>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildStructuredHtmlExtraction(sections: HtmlExtractionSection[]) {
  const parts: string[] = []

  for (const section of sections) {
    const text = section.html
      ? extractReadableTextFromHtml(section.html, 'canvas_page')
      : cleanExtractedText(section.text ?? '')

    const cleaned = cleanExtractedText(text)
    if (!cleaned) continue

    parts.push(`${section.label}:\n${cleaned}`)
  }

  return parts.join('\n\n')
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, rawCode: string) => {
    const code = rawCode.toLowerCase()

    if (code === 'nbsp') return ' '
    if (code === 'amp') return '&'
    if (code === 'lt') return '<'
    if (code === 'gt') return '>'
    if (code === 'quot') return '"'
    if (code === 'apos' || code === '#39') return "'"
    if (code === 'ndash') return '-'
    if (code === 'mdash') return '-'
    if (code === 'hellip') return '...'

    if (code.startsWith('#x')) {
      const parsed = Number.parseInt(code.slice(2), 16)
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity
    }

    if (code.startsWith('#')) {
      const parsed = Number.parseInt(code.slice(1), 10)
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity
    }

    return entity
  })
}

function looksLikeHtmlChromeLine(line: string, context: HtmlExtractionContext) {
  if (line.length > 36) return false

  const normalized = line.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (!normalized) return false

  if (normalized === 'skip to content') return true
  if (normalized === 'previous' || normalized === 'next' || normalized === 'back') return true
  if (normalized === 'print' || normalized === 'download') return true
  if (context === 'canvas_page' && (normalized === 'return to module' || normalized === 'back to modules')) {
    return true
  }

  return false
}

function buildPdfExtractionMetadata(result: ServerPdfExtractionResult) {
  return {
    pdfExtraction: {
      status: result.status,
      errorCode: result.errorCode,
      pageCount: result.pageCount,
      charCount: result.charCount,
      meaningfulTextRatio: Number(result.quality.meaningfulTextRatio.toFixed(3)),
      meaningfulCharCount: result.quality.meaningfulCharCount,
      wordCount: result.quality.wordCount,
      sentenceCount: result.quality.sentenceCount,
      imageOnlyPossible: result.quality.imageOnlyPossible,
      needsReview: result.status === 'needs_review',
    },
  }
}

function formatPdfExtractionMessage(result: ServerPdfExtractionResult) {
  if (result.errorCode && result.message) {
    return `${result.errorCode}: ${result.message}`
  }

  if (result.message) {
    return result.message
  }

  return null
}

function formatUnexpectedExtractionError(error: unknown) {
  return normalizeErrorMessage(error)
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
