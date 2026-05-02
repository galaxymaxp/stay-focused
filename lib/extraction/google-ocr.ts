import { createPrivateKey, createSign } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createIsomorphicCanvasFactory, getDocumentProxy, renderPageAsImage } from 'unpdf'
import { DEFAULT_OCR_MAX_PAGES_PER_JOB } from '@/lib/source-ocr-config'
import { MIN_USEFUL_OCR_CHARS, PER_PAGE_OCR_TIMEOUT_MS, type PdfOcrPage, type PdfOcrResult } from '@/lib/extraction/pdf-ocr'

type GoogleOcrProvider = 'google_vision' | 'google_document_ai'

const MAX_PDF_BYTES = 50 * 1024 * 1024
const DEFAULT_RENDER_WIDTH = 1800
const CANVAS_IMPORT = () => import('@napi-rs/canvas')
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

export async function extractScannedPdfTextWithGoogle(input: {
  provider: GoogleOcrProvider
  buffer: Buffer
  filename: string
  pageCount?: number | null
  pagesToProcess?: number[]
  maxPages?: number
  debugImages?: boolean
  debugImagesDir?: string
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
  const model = input.provider === 'google_document_ai'
    ? getDocumentAiProcessorName() ?? 'document_ai'
    : 'document_text_detection'
  const provider = input.provider === 'google_document_ai'
    ? `google_document_ai:${model}`
    : 'google_vision:document_text_detection'
  const maxPages = input.maxPages ?? getConfiguredPositiveInt(process.env.OCR_MAX_PAGES_PER_JOB, DEFAULT_OCR_MAX_PAGES_PER_JOB)
  const renderWidth = getConfiguredPositiveInt(process.env.GOOGLE_OCR_RENDER_WIDTH, DEFAULT_RENDER_WIDTH)

  if (input.buffer.length === 0) {
    return buildFailedResult(provider, 'The PDF download was empty, so OCR cannot run.')
  }

  if (input.buffer.length > MAX_PDF_BYTES) {
    return buildFailedResult(provider, 'This PDF is larger than the 50 MB OCR input limit. Open the original file instead.')
  }

  if (input.provider === 'google_vision' && !hasGoogleVisionCredentials()) {
    return buildFailedResult(provider, 'Google Vision OCR is not configured. Set GOOGLE_VISION_API_KEY or Google service account credentials.')
  }

  if (input.provider === 'google_document_ai' && !getDocumentAiProcessorName()) {
    return buildFailedResult(provider, 'Google Document AI OCR is not configured. Set GOOGLE_DOCUMENT_AI_PROCESSOR_NAME.')
  }

  if (input.provider === 'google_document_ai' && !hasGoogleOAuthCredentials()) {
    return buildFailedResult(provider, 'Google Document AI OCR needs Google service account credentials or GOOGLE_OCR_ACCESS_TOKEN.')
  }

  const CanvasFactory = await createIsomorphicCanvasFactory(CANVAS_IMPORT)
  const pdf = await getDocumentProxy(new Uint8Array(input.buffer), { CanvasFactory })

  try {
    const totalPages = pdf.numPages
    const pageNumbersToRun = input.pagesToProcess && input.pagesToProcess.length > 0
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
      let image: RenderedPdfPage | null = null
      try {
        image = await renderPdfPage(pdf, pageNumber, renderWidth)
        if (input.debugImages) {
          saveDebugImage(input.debugImagesDir, input.filename, pageNumber, image.buffer)
        }
        const renderedImage = image
        page = await withPageTimeout(
          () => input.provider === 'google_document_ai'
            ? runDocumentAiPageOcr({ image: renderedImage, pageNumber, provider, model })
            : runVisionPageOcr({ image: renderedImage, pageNumber, provider, model }),
          PER_PAGE_OCR_TIMEOUT_MS,
        )
      } catch (error) {
        page = {
          pageNumber,
          text: '',
          charCount: 0,
          status: 'failed',
          confidence: null,
          provider,
          model,
          error: normalizeErrorMessage(error),
          refusal: false,
          attempts: 1,
          imageWidth: image?.width ?? null,
          imageHeight: image?.height ?? null,
          imageByteSize: image?.byteSize ?? null,
          imageBlank: image?.blank ?? null,
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

    return buildGoogleOcrResultFromPages({
      provider,
      model,
      inputBytes: input.buffer.length,
      pageCount: input.pageCount ?? totalPages,
      totalPagesInDocument: totalPages,
      pagesProcessed: pageNumbersToRun.length,
      pages: pageResults,
      truncated: totalPages > pageNumbersToRun.length,
    })
  } catch (error) {
    return buildFailedResult(provider, `OCR failed: ${normalizeErrorMessage(error)}`)
  } finally {
    await pdf.destroy()
  }
}

async function runVisionPageOcr(input: {
  image: RenderedPdfPage
  pageNumber: number
  provider: string
  model: string
}): Promise<PdfOcrPage> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY?.trim() || process.env.GOOGLE_OCR_API_KEY?.trim()
  const accessToken = apiKey ? null : await getGoogleAccessToken()
  const url = apiKey
    ? `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`
    : 'https://vision.googleapis.com/v1/images:annotate'
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      requests: [{
        image: { content: input.image.buffer.toString('base64') },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
      }],
    }),
  })
  const json = await response.json().catch(() => null) as GoogleVisionAnnotateResponse | null
  if (!response.ok) throw new Error(extractGoogleError(json) ?? `Google Vision returned HTTP ${response.status}.`)

  const firstResponse = json?.responses?.[0]
  if (firstResponse?.error?.message) throw new Error(firstResponse.error.message)
  const annotation = firstResponse?.fullTextAnnotation
  const text = extractGoogleVisionTextFromResponse(json)
  const confidence = averageNumbers(annotation?.pages?.map((page) => page.confidence).filter(isFiniteNumber) ?? [])
  return buildPage({
    pageNumber: input.pageNumber,
    text,
    confidence,
    provider: input.provider,
    model: input.model,
    image: input.image,
  })
}

export function extractGoogleVisionTextFromResponse(json: GoogleVisionAnnotateResponse | null): string {
  const firstResponse = json?.responses?.[0]
  return normalizeOcrText(
    firstResponse?.fullTextAnnotation?.text
    ?? firstResponse?.textAnnotations?.[0]?.description
    ?? '',
  )
}

export function buildGoogleOcrResultFromPages(input: {
  provider: string
  model: string
  inputBytes: number
  pageCount: number | null
  totalPagesInDocument: number
  pagesProcessed: number
  pages: PdfOcrPage[]
  truncated: boolean
}): PdfOcrResult {
  const mergedText = mergeSuccessfulPageText(input.pages)
  const metadata = buildOcrMetadata({
    provider: input.provider,
    model: input.model,
    inputBytes: input.inputBytes,
    pageCount: input.pageCount,
    totalPagesInDocument: input.totalPagesInDocument,
    pagesProcessed: input.pagesProcessed,
    pages: input.pages,
    usefulCharCount: mergedText.length,
    truncated: input.truncated,
    status: mergedText.length >= MIN_USEFUL_OCR_CHARS ? 'completed' : 'no_text',
  })

  if (!mergedText || mergedText.length < MIN_USEFUL_OCR_CHARS) {
    return {
      status: 'failed',
      text: '',
      charCount: 0,
      pages: input.pages,
      provider: input.provider,
      error: 'OCR finished, but no useful text was recovered from the rendered PDF pages. Open the original file.',
      metadata,
    }
  }

  return {
    status: 'completed',
    text: mergedText,
    charCount: mergedText.length,
    pages: input.pages,
    provider: input.provider,
    error: null,
    metadata,
  }
}

async function runDocumentAiPageOcr(input: {
  image: RenderedPdfPage
  pageNumber: number
  provider: string
  model: string
}): Promise<PdfOcrPage> {
  const processorName = getDocumentAiProcessorName()
  if (!processorName) throw new Error('Google Document AI OCR is not configured.')
  const location = getDocumentAiLocation(processorName)
  const endpoint = process.env.GOOGLE_DOCUMENT_AI_ENDPOINT?.trim()
    || `https://${location}-documentai.googleapis.com/v1/${processorName}:process`
  const accessToken = await getGoogleAccessToken()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      rawDocument: {
        content: input.image.buffer.toString('base64'),
        mimeType: 'image/png',
      },
    }),
  })
  const json = await response.json().catch(() => null) as GoogleDocumentAiProcessResponse | null
  if (!response.ok) throw new Error(extractGoogleError(json) ?? `Google Document AI returned HTTP ${response.status}.`)

  const text = normalizeOcrText(json?.document?.text ?? '')
  const confidence = averageNumbers(json?.document?.pages
    ?.map((page) => page.layout?.confidence)
    .filter(isFiniteNumber) ?? [])
  return buildPage({
    pageNumber: input.pageNumber,
    text,
    confidence,
    provider: input.provider,
    model: input.model,
    image: input.image,
  })
}

async function renderPdfPage(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber: number,
  width: number,
): Promise<RenderedPdfPage> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const scale = width / viewport.width
  const image = await renderPageAsImage(pdf, pageNumber, {
    canvasImport: CANVAS_IMPORT,
    width,
  })
  const buffer = Buffer.from(image)

  return {
    buffer,
    width: Math.round(viewport.width * scale),
    height: Math.round(viewport.height * scale),
    byteSize: buffer.length,
    blank: await isRenderedImageBlank(buffer),
  }
}

function buildPage(input: {
  pageNumber: number
  text: string
  confidence: number | null
  provider: string
  model: string
  image: RenderedPdfPage
}): PdfOcrPage {
  if (!input.text) {
    return {
      pageNumber: input.pageNumber,
      text: '',
      charCount: 0,
      status: 'empty',
      confidence: input.confidence,
      provider: input.provider,
      model: input.model,
      error: `No legible text returned for rendered page ${input.pageNumber}.`,
      refusal: false,
      attempts: 1,
      imageWidth: input.image.width,
      imageHeight: input.image.height,
      imageByteSize: input.image.byteSize,
      imageBlank: input.image.blank,
    }
  }

  return {
    pageNumber: input.pageNumber,
    text: input.text,
    charCount: input.text.length,
    status: 'completed',
    confidence: input.confidence,
    provider: input.provider,
    model: input.model,
    error: null,
    refusal: false,
    attempts: 1,
    imageWidth: input.image.width,
    imageHeight: input.image.height,
    imageByteSize: input.image.byteSize,
    imageBlank: input.image.blank,
  }
}

function mergeSuccessfulPageText(pages: PdfOcrPage[]) {
  return pages
    .filter((page) => page.status === 'completed' && page.text.trim())
    .map((page) => `Page ${page.pageNumber}:\n${page.text.trim()}`)
    .join('\n\n')
    .trim()
}

function normalizeOcrText(value: string) {
  const cleaned = value
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!cleaned || /^NO_TEXT_FOUND\.?$/i.test(cleaned)) return ''
  return cleaned
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
      rawProviderCharCount: input.pages.reduce((sum, page) => sum + page.charCount, 0),
      successfulPages: input.pages.filter((page) => page.status === 'completed').length,
      failedPages: input.pages.filter((page) => page.status === 'failed').length,
      emptyPages: input.pages.filter((page) => page.status === 'empty').length,
      truncated: input.truncated,
      pages: input.pages,
      renderedImages: input.pages.map((page) => ({
        pageNumber: page.pageNumber,
        byteSize: page.imageByteSize ?? null,
        width: page.imageWidth ?? null,
        height: page.imageHeight ?? null,
        blank: page.imageBlank ?? null,
        status: page.status,
      })),
      completedAt: new Date().toISOString(),
    },
  }
}

async function getGoogleAccessToken() {
  const directToken = process.env.GOOGLE_OCR_ACCESS_TOKEN?.trim() || process.env.GOOGLE_ACCESS_TOKEN?.trim()
  if (directToken) return directToken

  const serviceAccount = getGoogleServiceAccount()
  if (!serviceAccount?.client_email || !serviceAccount.private_key) {
    throw new Error('Google OCR service account credentials are not configured.')
  }

  const now = Math.floor(Date.now() / 1000)
  const assertion = [
    base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64Url(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: GOOGLE_OAUTH_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })),
  ].join('.')
  const signer = createSign('RSA-SHA256')
  signer.update(assertion)
  signer.end()
  const signature = signer.sign(createPrivateKey(serviceAccount.private_key)).toString('base64url')

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${assertion}.${signature}`,
    }),
  })
  const json = await response.json().catch(() => null) as { access_token?: string; error_description?: string; error?: string } | null
  if (!response.ok || !json?.access_token) {
    throw new Error(json?.error_description ?? json?.error ?? `Google auth returned HTTP ${response.status}.`)
  }
  return json.access_token
}

function getGoogleServiceAccount() {
  const inline = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()
    || process.env.GOOGLE_CREDENTIALS_JSON?.trim()
    || process.env.GOOGLE_OCR_CREDENTIALS_JSON?.trim()
  if (inline) return parseServiceAccountJson(inline)

  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  if (!path) return null
  return parseServiceAccountJson(readFileSync(path, 'utf8'))
}

function parseServiceAccountJson(value: string) {
  const parsed = JSON.parse(value) as { client_email?: string; private_key?: string }
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
  return parsed
}

function hasGoogleVisionCredentials() {
  return Boolean(
    process.env.GOOGLE_VISION_API_KEY?.trim()
    || process.env.GOOGLE_OCR_API_KEY?.trim()
    || hasGoogleOAuthCredentials(),
  )
}

function hasGoogleOAuthCredentials() {
  return Boolean(
    process.env.GOOGLE_OCR_ACCESS_TOKEN?.trim()
    || process.env.GOOGLE_ACCESS_TOKEN?.trim()
    || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()
    || process.env.GOOGLE_CREDENTIALS_JSON?.trim()
    || process.env.GOOGLE_OCR_CREDENTIALS_JSON?.trim()
    || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  )
}

function getDocumentAiProcessorName() {
  const explicit = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_NAME?.trim()
  if (explicit) return explicit
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GOOGLE_PROJECT_ID?.trim()
  const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION?.trim() || 'us'
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim()
  if (!projectId || !processorId) return null
  return `projects/${projectId}/locations/${location}/processors/${processorId}`
}

function getDocumentAiLocation(processorName: string) {
  const match = processorName.match(/\/locations\/([^/]+)\//)
  return match?.[1] ?? process.env.GOOGLE_DOCUMENT_AI_LOCATION?.trim() ?? 'us'
}

function extractGoogleError(json: unknown) {
  const error = (json as { error?: { message?: string } } | null)?.error
  return typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : null
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url')
}

function averageNumbers(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getConfiguredPositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function saveDebugImage(debugImagesDir: string | undefined, filename: string, pageNumber: number, buffer: Buffer) {
  const dir = debugImagesDir?.trim() || join(process.cwd(), 'tmp', 'ocr-debug')
  mkdirSync(dir, { recursive: true })
  const safeBase = filename.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'scanned-pdf'
  writeFileSync(join(dir, `${safeBase}-page-${pageNumber}.png`), buffer)
}

async function isRenderedImageBlank(buffer: Buffer): Promise<boolean | null> {
  try {
    const canvasModule = await CANVAS_IMPORT() as unknown as {
      createCanvas: (width: number, height: number) => {
        getContext: (type: '2d') => {
          drawImage: (image: unknown, x: number, y: number, width: number, height: number) => void
          getImageData: (x: number, y: number, width: number, height: number) => { data: Uint8ClampedArray }
        }
      }
      loadImage: (buffer: Buffer) => Promise<{ width: number; height: number }>
    }
    const image = await canvasModule.loadImage(buffer)
    const sampleWidth = Math.min(64, image.width)
    const sampleHeight = Math.min(64, image.height)
    if (sampleWidth <= 0 || sampleHeight <= 0) return null
    const canvas = canvasModule.createCanvas(sampleWidth, sampleHeight)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight)
    const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data
    let min = 255
    let max = 0
    let nonWhite = 0
    for (let index = 0; index < data.length; index += 4) {
      const avg = Math.round((data[index] + data[index + 1] + data[index + 2]) / 3)
      min = Math.min(min, avg)
      max = Math.max(max, avg)
      if (avg < 248) nonWhite += 1
    }
    const pixels = data.length / 4
    return (max - min) < 4 || nonWhite / pixels < 0.001
  } catch {
    return null
  }
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
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').trim() || 'Unknown OCR error.'
  if (typeof error === 'string') return error.replace(/\s+/g, ' ').trim() || 'Unknown OCR error.'
  return 'Unknown OCR error.'
}

interface RenderedPdfPage {
  buffer: Buffer
  width: number
  height: number
  byteSize: number
  blank: boolean | null
}

export interface GoogleVisionAnnotateResponse {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string
      pages?: Array<{ confidence?: number }>
    }
    textAnnotations?: Array<{ description?: string }>
    error?: { message?: string }
  }>
  error?: { message?: string }
}

interface GoogleDocumentAiProcessResponse {
  document?: {
    text?: string
    pages?: Array<{ layout?: { confidence?: number } }>
  }
  error?: { message?: string }
}
