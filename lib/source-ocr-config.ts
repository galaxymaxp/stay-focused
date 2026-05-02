export const OCR_PROVIDERS = ['disabled', 'openai', 'google', 'aws', 'azure', 'tesseract'] as const

export type OcrProvider = typeof OCR_PROVIDERS[number]

export const DEFAULT_OPENAI_OCR_MAX_PAGES = 5
export const DEFAULT_OCR_MAX_JOBS_PER_SYNC = 1
export const DEFAULT_OCR_MAX_RETRIES_PER_RESOURCE = 1

export interface SourceOcrConfig {
  provider: OcrProvider
  openaiAutoRun: boolean
  openaiMaxPages: number
  maxJobsPerSync: number
  maxRetriesPerResource: number
}

export function getSourceOcrConfig(env: Partial<Record<string, string | undefined>> = process.env): SourceOcrConfig {
  const provider = normalizeOcrProvider(env.OCR_PROVIDER)
  const openaiAutoRun = parseBoolean(env.OPENAI_OCR_AUTO_RUN, false)
  return {
    provider,
    openaiAutoRun,
    openaiMaxPages: getConfiguredPositiveInt(env.OPENAI_OCR_MAX_PAGES, DEFAULT_OPENAI_OCR_MAX_PAGES),
    maxJobsPerSync: getConfiguredNonNegativeInt(env.OCR_MAX_JOBS_PER_SYNC, DEFAULT_OCR_MAX_JOBS_PER_SYNC),
    maxRetriesPerResource: getConfiguredNonNegativeInt(env.OCR_MAX_RETRIES_PER_RESOURCE, DEFAULT_OCR_MAX_RETRIES_PER_RESOURCE),
  }
}

export function canAutoRunSourceOcr(config: SourceOcrConfig = getSourceOcrConfig()) {
  if (config.provider === 'disabled') return false
  if (config.provider === 'openai') return config.openaiAutoRun
  return true
}

export function canRunManualSourceOcr(config: SourceOcrConfig = getSourceOcrConfig()) {
  return config.provider !== 'disabled'
}

export function normalizeOcrProvider(value: string | undefined): OcrProvider {
  const normalized = value?.trim().toLowerCase()
  return OCR_PROVIDERS.includes(normalized as OcrProvider) ? normalized as OcrProvider : 'disabled'
}

export function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null || value.trim() === '') return fallback
  return /^(1|true|yes|on)$/i.test(value.trim())
}

function getConfiguredPositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getConfiguredNonNegativeInt(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
