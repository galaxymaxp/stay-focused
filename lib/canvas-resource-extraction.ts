import type { ModuleResourceExtractionStatus } from '@/lib/types'

export interface ExtractedCanvasResourceContent {
  extractionStatus: ModuleResourceExtractionStatus
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  supported: boolean
}

type PdfParseModule = typeof import('pdf-parse')

type PdfExtractionResult =
  | {
      outcome: 'extracted'
      text: string
      note: string | null
    }
  | {
      outcome: 'empty'
      text: ''
      note: string
      reason: 'no_text' | 'scanned'
    }
  | {
      outcome: 'failed'
      text: ''
      note: string
      reason: 'setup' | 'parse'
    }

type PdfRuntimeGlobal = typeof globalThis & {
  __stayFocusedPdfParseModulePromise?: Promise<PdfParseModule>
  pdfjsWorker?: {
    WorkerMessageHandler?: unknown
  }
}

type HtmlExtractionContext = 'canvas_page' | 'html_file'

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

    if (extension === 'pdf' || contentType === 'application/pdf') {
      const pdfResult = await extractPdfText(input.buffer)
      if (pdfResult.outcome === 'failed') {
        return {
          extractionStatus: 'failed',
          extractedText: null,
          extractedTextPreview: null,
          extractedCharCount: 0,
          extractionError: pdfResult.note,
          supported: true,
        }
      }

      extractedText = pdfResult.text
      extractionError = pdfResult.note
    } else if (
      extension === 'pptx'
      || contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      extractedText = await extractPptxText(input.buffer)
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
        extractionError: null,
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
      }
    }

    return {
      extractionStatus: 'extracted',
      extractedText: cleaned,
      extractedTextPreview: cleaned.slice(0, 420),
      extractedCharCount: cleaned.length,
      extractionError,
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

export async function extractCanvasPageContent(input: {
  title: string
  html: string | null | undefined
}): Promise<ExtractedCanvasResourceContent> {
  try {
    const cleaned = cleanExtractedText(extractReadableTextFromHtml(input.html ?? '', 'canvas_page'))
    if (!cleaned) {
      return {
        extractionStatus: 'empty',
        extractedText: null,
        extractedTextPreview: null,
        extractedCharCount: 0,
        extractionError: 'Canvas page fetched successfully, but no usable body text was found.',
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

async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  let pdfParseModule: PdfParseModule

  try {
    pdfParseModule = await loadPdfParseModule()
  } catch (error) {
    return {
      outcome: 'failed',
      text: '',
      note: formatPdfSetupError(error),
      reason: 'setup',
    }
  }

  const parser = new pdfParseModule.PDFParse({ data: buffer })

  try {
    let result: Awaited<ReturnType<InstanceType<PdfParseModule['PDFParse']>['getText']>>

    try {
      result = await parser.getText({ pageJoiner: '' })
    } catch (error) {
      return {
        outcome: 'failed',
        text: '',
        note: formatPdfParseError(error),
        reason: 'parse',
      }
    }

    const primaryText = cleanExtractedText(result.text ?? '')
    if (primaryText) {
      return { outcome: 'extracted', text: primaryText, note: null }
    }

    const byteHeuristicText = extractPdfTextFromOperators(buffer)
    if (byteHeuristicText) {
      return {
        outcome: 'extracted',
        text: byteHeuristicText,
        note: 'PDF parsed, but only limited text could be recovered from embedded text operators.',
      }
    }

    if (looksLikeImageOnlyPdf(buffer)) {
      return {
        outcome: 'empty',
        text: '',
        note: 'Likely scanned or image-only PDF. A real parse completed, but no readable text was found.',
        reason: 'scanned',
      }
    }

    return {
      outcome: 'empty',
      text: '',
      note: 'PDF parsed successfully, but no readable text was found.',
      reason: 'no_text',
    }
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}

async function loadPdfParseModule() {
  const runtime = globalThis as PdfRuntimeGlobal

  if (!runtime.__stayFocusedPdfParseModulePromise) {
    runtime.__stayFocusedPdfParseModulePromise = (async () => {
      const [pdfWorkerModule, pdfParseModule] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
        import('pdf-parse'),
      ])

      const workerHandler = pdfWorkerModule?.WorkerMessageHandler
      if (workerHandler) {
        runtime.pdfjsWorker = {
          ...(runtime.pdfjsWorker ?? {}),
          WorkerMessageHandler: workerHandler,
        }
      }

      return pdfParseModule
    })().catch((error) => {
      delete runtime.__stayFocusedPdfParseModulePromise
      throw error
    })
  }

  return runtime.__stayFocusedPdfParseModulePromise
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

function formatPdfSetupError(error: unknown) {
  const message = normalizeErrorMessage(error)
  if (/fake worker/i.test(message) || /pdf\.worker/i.test(message) || /workersrc/i.test(message)) {
    return 'PDF parser setup failed before the document could be read.'
  }

  return `PDF parser setup failed: ${message}`
}

function formatPdfParseError(error: unknown) {
  const message = normalizeErrorMessage(error)

  if (/password/i.test(message)) {
    return 'PDF parse failed: the document is password-protected.'
  }

  if (/invalidpdf|invalid pdf|formaterror|bad xref|malformed/i.test(message)) {
    return 'PDF parse failed: the file appears invalid or corrupted.'
  }

  return `PDF parse failed: ${message}`
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
