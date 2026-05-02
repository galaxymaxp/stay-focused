import { extractScannedPdfTextWithOpenAI, type PdfOcrResult } from '@/lib/extraction/pdf-ocr'
import { getSourceOcrConfig, type OcrProvider } from '@/lib/source-ocr-config'

export interface SourceOcrRunInput {
  buffer: Buffer
  filename: string
  pageCount?: number | null
  pagesToProcess?: number[]
  maxPages?: number
  onPageStart?: Parameters<typeof extractScannedPdfTextWithOpenAI>[0]['onPageStart']
  onPageResult?: Parameters<typeof extractScannedPdfTextWithOpenAI>[0]['onPageResult']
}

export interface SourceOcrProviderAdapter {
  provider: OcrProvider
  run(input: SourceOcrRunInput): Promise<PdfOcrResult>
}

export function getSourceOcrProvider(provider = getSourceOcrConfig().provider): SourceOcrProviderAdapter {
  if (provider === 'openai') {
    return {
      provider,
      run: (input) => extractScannedPdfTextWithOpenAI(input),
    }
  }

  return {
    provider,
    run: async () => ({
      status: 'failed',
      text: '',
      charCount: 0,
      pages: [],
      provider,
      error: provider === 'disabled'
        ? 'This PDF needs visual text extraction before Deep Learn.'
        : `${formatProviderName(provider)} OCR is not configured yet.`,
      metadata: {
        pdfOcr: {
          status: 'failed',
          provider,
          error: provider === 'disabled'
            ? 'OCR provider is disabled.'
            : `${formatProviderName(provider)} OCR provider is not implemented yet.`,
          completedAt: new Date().toISOString(),
        },
      },
    }),
  }
}

function formatProviderName(provider: OcrProvider) {
  if (provider === 'aws') return 'AWS Textract'
  if (provider === 'azure') return 'Azure Document Intelligence'
  if (provider === 'google') return 'Google Vision'
  if (provider === 'tesseract') return 'Tesseract'
  if (provider === 'openai') return 'OpenAI'
  return 'Disabled'
}
