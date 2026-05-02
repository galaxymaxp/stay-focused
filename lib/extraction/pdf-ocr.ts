import OpenAI from 'openai'
import { createIsomorphicCanvasFactory, getDocumentProxy, renderPageAsImage } from 'unpdf'
import { DEFAULT_OPENAI_OCR_MAX_PAGES } from '@/lib/source-ocr-config'

export type PdfOcrResult =
  | {
    status: 'completed'
    text: string
    charCount: number
    pages: PdfOcrPage[]
    provider: string
    error: null
    metadata: Record<string, unknown>
  }
  | {
    status: 'failed'
    text: ''
    charCount: 0
    pages: PdfOcrPage[]
    provider: string
    error: string
    metadata: Record<string, unknown>
  }

export interface PdfOcrPage {
  pageNumber: number
  text: string
  charCount: number
  status: 'completed' | 'empty' | 'failed'
  confidence: number | null
  provider: string
  model: string
  error: string | null
  refusal: boolean
  attempts: number
  imageWidth: number | null
  imageHeight: number | null
}

const MAX_PDF_BYTES = 50 * 1024 * 1024
const DEFAULT_MAX_PAGES_PER_RUN = DEFAULT_OPENAI_OCR_MAX_PAGES
const DEFAULT_RENDER_WIDTH = 1800
const DEFAULT_RENDER_RETRY_WIDTH = 2400
export const MIN_USEFUL_OCR_CHARS = 120
const MAX_OUTPUT_TOKENS_PER_PAGE = 1200
const CANVAS_IMPORT = () => import('@napi-rs/canvas')

export const PER_PAGE_OCR_TIMEOUT_MS = 30_000

export async function extractScannedPdfTextWithOpenAI(input: {
  buffer: Buffer
  filename: string
  pageCount?: number | null
  pagesToProcess?: number[]
  maxPages?: number
  onPageStart?: (progress: {
    pageNumber: number
    pagesProcessed: number
    totalPages: number
  }) => void | Promise<void>
  onPageResult?: (progress: {
    page: PdfOcrPage
    pageNumber: number
    pagesProcessed: number
    totalPages: number
  }) => void | Promise<void>
}): Promise<PdfOcrResult> {
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_OCR_MODEL?.trim() || 'gpt-4o-mini'
  const maxPages = input.maxPages ?? getConfiguredPositiveInt(process.env.OPENAI_OCR_MAX_PAGES, DEFAULT_MAX_PAGES_PER_RUN)
  const renderWidth = getConfiguredPositiveInt(process.env.OPENAI_OCR_RENDER_WIDTH, DEFAULT_RENDER_WIDTH)
  const retryRenderWidth = getConfiguredPositiveInt(process.env.OPENAI_OCR_RETRY_RENDER_WIDTH, DEFAULT_RENDER_RETRY_WIDTH)

  if (!apiKey) {
    return buildFailedResult(model, 'OPENAI_API_KEY is not set, so OCR cannot run.')
  }

  if (input.buffer.length === 0) {
    return buildFailedResult(model, 'The PDF download was empty, so OCR cannot run.')
  }

  if (input.buffer.length > MAX_PDF_BYTES) {
    return buildFailedResult(model, 'This PDF is larger than the 50 MB OCR input limit. Open the original file instead.')
  }

  const provider = `openai:${model}`
  const client = new OpenAI({ apiKey })
  const CanvasFactory = await createIsomorphicCanvasFactory(CANVAS_IMPORT)
  const pdf = await getDocumentProxy(new Uint8Array(input.buffer), { CanvasFactory })

  try {
    const totalPages = pdf.numPages
    const pageNumbersToRun: number[] = input.pagesToProcess && input.pagesToProcess.length > 0
      ? input.pagesToProcess.filter((n) => n >= 1 && n <= totalPages).slice(0, maxPages)
      : Array.from({ length: Math.min(totalPages, maxPages) }, (_, i) => i + 1)
    const pageResults: PdfOcrPage[] = []

    for (const pageNumber of pageNumbersToRun) {
      await input.onPageStart?.({
        pageNumber,
        pagesProcessed: pageResults.length,
        totalPages,
      })

      let page: PdfOcrPage
      try {
        page = await withPageTimeout(
          () => runPageOcr({ client, pdf, pageNumber, model, provider, widths: [renderWidth, retryRenderWidth] }),
          PER_PAGE_OCR_TIMEOUT_MS,
        )
      } catch {
        page = {
          pageNumber,
          text: '',
          charCount: 0,
          status: 'failed',
          confidence: null,
          provider,
          model,
          error: `Page ${pageNumber} OCR timed out after ${PER_PAGE_OCR_TIMEOUT_MS / 1000}s.`,
          refusal: false,
          attempts: 1,
          imageWidth: null,
          imageHeight: null,
        }
      }
      pageResults.push(page)
      await input.onPageResult?.({
        page,
        pageNumber,
        pagesProcessed: pageResults.length,
        totalPages,
      })
    }

    const successfulPages = pageResults.filter((page) => page.status === 'completed' && page.text.trim())
    const mergedText = successfulPages
      .map((page) => `Page ${page.pageNumber}:\n${page.text.trim()}`)
      .join('\n\n')
      .trim()

    if (!mergedText || mergedText.length < MIN_USEFUL_OCR_CHARS) {
      return {
        status: 'failed',
        text: '',
        charCount: 0,
        pages: pageResults,
        provider,
        error: 'OCR finished, but no useful text was recovered from the rendered PDF pages. Open the original file.',
        metadata: buildOcrMetadata({
          provider,
          model,
          inputBytes: input.buffer.length,
          pageCount: input.pageCount ?? totalPages,
          totalPagesInDocument: totalPages,
          pagesProcessed: pageNumbersToRun.length,
          pages: pageResults,
          usefulCharCount: mergedText.length,
          truncated: totalPages > pageNumbersToRun.length,
          status: 'no_text',
        }),
      }
    }

    return {
      status: 'completed',
      text: mergedText,
      charCount: mergedText.length,
      pages: pageResults,
      provider,
      error: null,
      metadata: buildOcrMetadata({
        provider,
        model,
        inputBytes: input.buffer.length,
        pageCount: input.pageCount ?? totalPages,
        totalPagesInDocument: totalPages,
        pagesProcessed: pageNumbersToRun.length,
        pages: pageResults,
        usefulCharCount: mergedText.length,
        truncated: totalPages > pageNumbersToRun.length,
        status: 'completed',
      }),
    }
  } catch (error) {
    return buildFailedResult(provider, `OCR failed: ${normalizeErrorMessage(error)}`)
  } finally {
    await pdf.destroy()
  }
}

async function runPageOcr(input: {
  client: OpenAI
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>
  pageNumber: number
  model: string
  provider: string
  widths: number[]
}): Promise<PdfOcrPage> {
  let lastFailure: PdfOcrPage | null = null

  for (let attemptIndex = 0; attemptIndex < input.widths.length; attemptIndex += 1) {
    const width = input.widths[attemptIndex]
    try {
      const image = await renderPdfPage(input.pdf, input.pageNumber, width)
      const response = await input.client.responses.create({
        model: input.model,
        max_output_tokens: MAX_OUTPUT_TOKENS_PER_PAGE,
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildRenderedPagePrompt(input.pageNumber),
            },
            {
              type: 'input_image',
              detail: 'high',
              image_url: `data:image/png;base64,${image.buffer.toString('base64')}`,
            },
          ],
        }],
      })

      const rawText = typeof response.output_text === 'string' ? response.output_text : ''
      const normalizedText = normalizeOcrText(rawText)
      const refusal = looksLikeModelRefusal(normalizedText)
      if (normalizedText && !refusal) {
        return {
          pageNumber: input.pageNumber,
          text: normalizedText,
          charCount: normalizedText.length,
          status: 'completed',
          confidence: null,
          provider: input.provider,
          model: input.model,
          error: null,
          refusal: false,
          attempts: attemptIndex + 1,
          imageWidth: image.width,
          imageHeight: image.height,
        }
      }

      lastFailure = {
        pageNumber: input.pageNumber,
        text: '',
        charCount: 0,
        status: refusal ? 'failed' : 'empty',
        confidence: null,
        provider: input.provider,
        model: input.model,
        error: refusal
          ? `Model refusal on rendered page ${input.pageNumber}.`
          : `No legible text returned for rendered page ${input.pageNumber}.`,
        refusal,
        attempts: attemptIndex + 1,
        imageWidth: image.width,
        imageHeight: image.height,
      }
    } catch (error) {
      lastFailure = {
        pageNumber: input.pageNumber,
        text: '',
        charCount: 0,
        status: 'failed',
        confidence: null,
        provider: input.provider,
        model: input.model,
        error: normalizeErrorMessage(error),
        refusal: false,
        attempts: attemptIndex + 1,
        imageWidth: null,
        imageHeight: null,
      }
    }
  }

  return lastFailure ?? {
    pageNumber: input.pageNumber,
    text: '',
    charCount: 0,
    status: 'failed',
    confidence: null,
    provider: input.provider,
    model: input.model,
    error: `OCR did not return text for rendered page ${input.pageNumber}.`,
    refusal: false,
    attempts: input.widths.length,
    imageWidth: null,
    imageHeight: null,
  }
}

async function renderPdfPage(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber: number,
  width: number,
) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const scale = width / viewport.width
  const image = await renderPageAsImage(pdf, pageNumber, {
    canvasImport: CANVAS_IMPORT,
    width,
  })

  return {
    buffer: Buffer.from(image),
    width: Math.round(viewport.width * scale),
    height: Math.round(viewport.height * scale),
  }
}

function buildRenderedPagePrompt(pageNumber: number) {
  return [
    `Transcribe only the visible text from PDF page ${pageNumber}.`,
    'Return plain text only. Do not summarize, explain, refuse, or add facts.',
    'Preserve reading order as closely as possible.',
    'If the page has no legible text, return exactly NO_TEXT_FOUND.',
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

  return cleaned
}

function looksLikeModelRefusal(value: string) {
  if (!value) return false
  return /\bI('| a)?m unable\b|\bI cannot\b|\bcan't assist\b|\bI can only\b|\bfeel free to ask\b/i.test(value)
}

function buildFailedResult(provider: string, error: string): PdfOcrResult {
  return {
    status: 'failed',
    text: '',
    charCount: 0,
    pages: [],
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

function buildOcrMetadata(input: {
  provider: string
  model: string
  inputBytes: number
  pageCount: number | null
  totalPagesInDocument: number
  pagesProcessed: number
  pages: PdfOcrPage[]
  usefulCharCount: number
  truncated: boolean
  status: 'completed' | 'no_text'
}) {
  return {
    pdfOcr: {
      status: input.status,
      provider: input.provider,
      model: input.model,
      pageCount: input.pageCount,
      totalPagesInDocument: input.totalPagesInDocument,
      pagesProcessed: input.pagesProcessed,
      inputBytes: input.inputBytes,
      usefulCharCount: input.usefulCharCount,
      successfulPages: input.pages.filter((page) => page.status === 'completed').length,
      failedPages: input.pages.filter((page) => page.status === 'failed').length,
      emptyPages: input.pages.filter((page) => page.status === 'empty').length,
      truncated: input.truncated,
      pages: input.pages,
      completedAt: new Date().toISOString(),
    },
  }
}

function getConfiguredPositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function withPageTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error(`OCR timed out after ${ms}ms.`))
      }
    }, ms)
    fn().then(
      (value) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(value)
        }
      },
      (err: unknown) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(err)
        }
      },
    )
  })
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
