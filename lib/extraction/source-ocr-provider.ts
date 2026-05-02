import { extractScannedPdfTextWithOpenAI, type PdfOcrResult } from '@/lib/extraction/pdf-ocr'
import { extractScannedPdfTextWithGoogle } from '@/lib/extraction/google-ocr'
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

  if (provider === 'google_vision' || provider === 'google_document_ai') {
    return {
      provider,
      run: (input) => extractScannedPdfTextWithGoogle({ ...input, provider }),
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
  if (provider === 'google_vision') return 'Google Vision'
  if (provider === 'google_document_ai') return 'Google Document AI'
  if (provider === 'openai') return 'OpenAI'
  return 'Disabled'
}
