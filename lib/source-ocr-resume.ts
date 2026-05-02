import type { PdfOcrPage, PdfOcrResult } from '@/lib/extraction/pdf-ocr'
import { MIN_USEFUL_OCR_CHARS } from '@/lib/extraction/pdf-ocr'
import type { ModuleResource } from '@/lib/types'

export interface OcrResumeState {
  previousPages: PdfOcrPage[]
  pagesToProcess: number[]
  previousCompletedCount: number
}

export function buildOcrResumeState(
  resource: ModuleResource,
): OcrResumeState {
  const previousPages = loadPreviousOcrPages(resource)
  const pagesToProcess = computeOcrPagesToProcess({
    previousPages,
    totalPageCount: resource.pageCount ?? null,
  })
  const previousCompletedCount = previousPages.filter((p) => p.status === 'completed').length
  return { previousPages, pagesToProcess, previousCompletedCount }
}

export function loadPreviousOcrPages(resource: ModuleResource): PdfOcrPage[] {
  const pages = asPlainRecord(resource.metadata).visualExtractionPages
  if (!Array.isArray(pages)) return []
  return pages.filter(isValidOcrPage)
}

export function computeOcrPagesToProcess(input: {
  previousPages: PdfOcrPage[]
  totalPageCount: number | null
}): number[] {
  if (input.previousPages.length === 0) return []

  const processedNums = new Set(input.previousPages.map((p) => p.pageNumber))
  const maxProcessed = Math.max(...input.previousPages.map((p) => p.pageNumber))
  const total = input.totalPageCount ?? maxProcessed

  const toProcess: number[] = []

  for (const p of input.previousPages) {
    if (p.status === 'failed') toProcess.push(p.pageNumber)
  }

  for (let n = maxProcessed + 1; n <= total; n++) {
    if (!processedNums.has(n)) toProcess.push(n)
  }

  return toProcess.sort((a, b) => a - b)
}

export function mergeOcrPageArrays(previous: PdfOcrPage[], current: PdfOcrPage[]): PdfOcrPage[] {
  const pageMap = new Map<number, PdfOcrPage>()
  for (const p of previous) pageMap.set(p.pageNumber, p)
  for (const p of current) {
    const existing = pageMap.get(p.pageNumber)
    if (!existing || p.status === 'completed' || existing.status === 'failed') {
      pageMap.set(p.pageNumber, p)
    }
  }
  return [...pageMap.values()].sort((a, b) => a.pageNumber - b.pageNumber)
}

export function buildMergedOcrText(mergedPages: PdfOcrPage[]): string {
  return mergedPages
    .filter((p) => p.status === 'completed' && p.text.trim())
    .map((p) => `Page ${p.pageNumber}:\n${p.text.trim()}`)
    .join('\n\n')
    .trim()
}

export function buildMergedOcrResult(
  ocr: PdfOcrResult,
  mergedPages: PdfOcrPage[],
  mergedText: string,
): PdfOcrResult {
  if (!mergedText || mergedText.length < MIN_USEFUL_OCR_CHARS) {
    return {
      status: 'failed',
      text: '',
      charCount: 0,
      pages: mergedPages,
      provider: ocr.provider,
      error: ocr.status === 'failed'
        ? (ocr.error ?? 'OCR finished but not enough useful text was recovered.')
        : 'OCR finished but the merged text was too short to use.',
      metadata: ocr.metadata,
    }
  }
  return {
    status: 'completed',
    text: mergedText,
    charCount: mergedText.length,
    pages: mergedPages,
    provider: ocr.provider,
    error: null,
    metadata: ocr.metadata,
  }
}

function isValidOcrPage(value: unknown): value is PdfOcrPage {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return typeof r.pageNumber === 'number' && typeof r.status === 'string'
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
