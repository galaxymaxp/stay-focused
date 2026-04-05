import type { ModuleResourceExtractionStatus } from '@/lib/types'

export interface ExtractedCanvasResourceContent {
  extractionStatus: ModuleResourceExtractionStatus
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  supported: boolean
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

    if (extension === 'pdf' || contentType === 'application/pdf') {
      const pdfResult = await extractPdfText(input.buffer)
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
      extractedText = stripHtml(input.buffer.toString('utf8'))
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
      extractionError: error instanceof Error ? error.message : 'Unknown extraction error.',
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

async function extractPdfText(buffer: Buffer): Promise<{ text: string; note: string | null }> {
  const pdfParseModule = await import('pdf-parse')
  const parser = new pdfParseModule.PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    const primaryText = cleanExtractedText(result.text ?? '')
    if (primaryText) {
      return { text: primaryText, note: null }
    }

    const byteHeuristicText = extractPdfTextFromOperators(buffer)
    if (byteHeuristicText) {
      return {
        text: byteHeuristicText,
        note: 'Recovered limited text from embedded PDF text operators after the primary parser returned little or no readable text.',
      }
    }

    if (looksLikeImageOnlyPdf(buffer)) {
      return {
        text: '',
        note: 'This PDF appears to be image-based or scanned. OCR fallback is not available in the current app architecture yet.',
      }
    }

    return {
      text: '',
      note: 'The PDF parser did not return readable text for this file.',
    }
  } finally {
    await parser.destroy()
  }
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
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
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
