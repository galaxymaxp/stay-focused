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

    if (extension === 'pdf' || contentType === 'application/pdf') {
      extractedText = await extractPdfText(input.buffer)
    } else if (
      extension === 'pptx'
      || contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      extractedText = await extractPptxText(input.buffer)
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
        extractionError: null,
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

async function extractPdfText(buffer: Buffer) {
  const pdfParseModule = await import('pdf-parse')
  const parser = new pdfParseModule.PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return result.text ?? ''
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
    const text = decodeXmlEntities(
      xml
        .replace(/<\/a:p>/gi, '\n')
        .replace(/<a:tab\/>/gi, '\t')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (text) {
      const label = fileName.includes('notesSlides') ? 'Speaker notes' : 'Slide'
      chunks.push(`${label}: ${text}`)
    }
  }

  return chunks.join('\n\n')
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
