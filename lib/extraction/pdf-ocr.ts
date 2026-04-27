import OpenAI from 'openai'

export type PdfOcrResult =
  | {
    status: 'completed'
    text: string
    charCount: number
    provider: string
    error: null
    metadata: Record<string, unknown>
  }
  | {
    status: 'failed'
    text: ''
    charCount: 0
    provider: string
    error: string
    metadata: Record<string, unknown>
  }

const MAX_PDF_BYTES = 50 * 1024 * 1024
const DEFAULT_MAX_OUTPUT_TOKENS = 12000

export async function extractScannedPdfTextWithOpenAI(input: {
  buffer: Buffer
  filename: string
  pageCount?: number | null
}): Promise<PdfOcrResult> {
  const apiKey = process.env.OPENAI_API_KEY
  const provider = process.env.OPENAI_OCR_MODEL?.trim() || 'gpt-4o-mini'

  if (!apiKey) {
    return buildFailedResult(provider, 'OPENAI_API_KEY is not set, so OCR cannot run.')
  }

  if (input.buffer.length === 0) {
    return buildFailedResult(provider, 'The PDF download was empty, so OCR cannot run.')
  }

  if (input.buffer.length > MAX_PDF_BYTES) {
    return buildFailedResult(provider, 'This PDF is larger than the 50 MB OCR input limit. Open the original file instead.')
  }

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.responses.create({
      model: provider,
      max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: sanitizeFilename(input.filename),
              file_data: `data:application/pdf;base64,${input.buffer.toString('base64')}`,
            },
            {
              type: 'input_text',
              text: buildOcrPrompt(input.pageCount),
            },
          ],
        },
      ],
    })
    const rawText = typeof response.output_text === 'string' ? response.output_text : ''
    const text = normalizeOcrText(rawText)

    if (!text) {
      return {
        status: 'failed',
        text: '',
        charCount: 0,
        provider,
        error: 'OCR finished, but no legible text was returned. Open the original file.',
        metadata: buildOcrMetadata(provider, input, response.id, rawText.length, 'no_text'),
      }
    }

    return {
      status: 'completed',
      text,
      charCount: text.length,
      provider,
      error: null,
      metadata: buildOcrMetadata(provider, input, response.id, rawText.length, 'completed'),
    }
  } catch (error) {
    return buildFailedResult(provider, `OCR failed: ${normalizeErrorMessage(error)}`)
  }
}

function buildOcrPrompt(pageCount: number | null | undefined) {
  const pageHint = typeof pageCount === 'number' && pageCount > 0
    ? `The PDF has ${pageCount} detected page${pageCount === 1 ? '' : 's'}.`
    : 'The PDF page count may be unknown.'

  return [
    'Transcribe the visible text in this scanned or image-based PDF.',
    pageHint,
    'Return only text that is visible in the document. Do not summarize, infer missing words, explain the document, or add facts.',
    'Keep the original reading order as well as you can. Add page headings as "Page 1:", "Page 2:", etc. only to separate pages.',
    'If a page has no legible text, write "[No legible text]" for that page.',
    'If the entire PDF has no legible text, return exactly "NO_TEXT_FOUND".',
  ].join('\n')
}

function normalizeOcrText(value: string) {
  const cleaned = value
    .replace(/^```(?:text|markdown)?/i, '')
    .replace(/```$/i, '')
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!cleaned || /^NO_TEXT_FOUND\.?$/i.test(cleaned)) return ''

  const withoutEmptyPageMarkers = cleaned
    .split('\n')
    .filter((line) => !/^\s*(?:page\s+\d+\s*:\s*)?\[no legible text\]\s*$/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return withoutEmptyPageMarkers
}

function sanitizeFilename(value: string) {
  const normalized = value.replace(/[^\w.\- ()]+/g, '_').trim()
  return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized || 'scanned-pdf'}.pdf`
}

function buildFailedResult(provider: string, error: string): PdfOcrResult {
  return {
    status: 'failed',
    text: '',
    charCount: 0,
    provider,
    error,
    metadata: {
      pdfOcr: {
        status: 'failed',
        provider,
        error,
        completedAt: new Date().toISOString(),
      },
    },
  }
}

function buildOcrMetadata(
  provider: string,
  input: { buffer: Buffer; pageCount?: number | null },
  responseId: string,
  rawOutputLength: number,
  status: 'completed' | 'no_text',
) {
  return {
    pdfOcr: {
      status,
      provider,
      responseId,
      pageCount: input.pageCount ?? null,
      inputBytes: input.buffer.length,
      rawOutputLength,
      completedAt: new Date().toISOString(),
    },
  }
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, ' ').trim() || 'Unknown OCR error.'
  }

  if (typeof error === 'string') {
    return error.replace(/\s+/g, ' ').trim() || 'Unknown OCR error.'
  }

  return 'Unknown OCR error.'
}
