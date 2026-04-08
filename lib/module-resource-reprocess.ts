import {
  extractCanvasFileContent,
  extractCanvasPageContent,
  extractCanvasStructuredHtmlContent,
  normalizeExtension,
  type ExtractedCanvasResourceContent,
} from './canvas-resource-extraction'
import {
  getModuleResourceCapabilityInfo,
  getNormalizedModuleResourceSourceType,
  type ModuleResourceCapabilityInfo,
} from './module-resource-capability'
import {
  buildModuleResourceAssessmentMetadata,
  getModuleResourceQualityInfo,
  type ModuleResourceQualityInfo,
} from './module-resource-quality'
import { resolveCanvasConfig, type CanvasConfig } from './canvas'
import type { ModuleResource, ModuleResourceExtractionStatus } from './types'

type CanvasPagePayload = {
  title?: string | null
  body?: string | null
  url?: string | null
  html_url?: string | null
  updated_at?: string | null
  published?: boolean | null
}

type CanvasAssignmentPayload = {
  name?: string | null
  description?: string | null
  due_at?: string | null
  html_url?: string | null
  url?: string | null
  points_possible?: number | null
  submission_types?: string[] | null
}

type CanvasDiscussionPayload = {
  title?: string | null
  message?: string | null
  html_url?: string | null
  url?: string | null
  posted_at?: string | null
  updated_at?: string | null
}

export interface ReprocessModuleResourceOptions {
  canvasConfig?: Partial<CanvasConfig>
  triggeredBy?: 'script' | 'inspect' | 'resource_detail' | 'learn'
  now?: string
}

export interface ReprocessedModuleResourceResult {
  update: {
    extractionStatus: ModuleResourceExtractionStatus
    extractedText: string | null
    extractedTextPreview: string | null
    extractedCharCount: number
    extractionError: string | null
    metadata: Record<string, unknown>
  }
  capability: ModuleResourceCapabilityInfo
  quality: ModuleResourceQualityInfo
}

export function shouldReprocessWeakModuleResource(resource: ModuleResource) {
  const capability = getModuleResourceCapabilityInfo(resource)
  if (capability.capability !== 'supported') {
    return true
  }

  const quality = getModuleResourceQualityInfo(resource)
  return quality.quality !== 'strong' && quality.quality !== 'usable'
}

export async function reprocessStoredModuleResource(
  resource: ModuleResource,
  options: ReprocessModuleResourceOptions = {},
): Promise<ReprocessedModuleResourceResult> {
  const normalizedSourceType = getNormalizedModuleResourceSourceType(resource)
  const now = options.now ?? new Date().toISOString()
  const baseMetadata = asPlainRecord(resource.metadata)
  const canvasConfig = getOptionalCanvasConfig(options.canvasConfig)

  let extracted: ExtractedCanvasResourceContent
  let metadataPatch: Record<string, unknown> = {
    normalizedSourceType,
  }

  if (normalizedSourceType === 'page') {
    const pageSourceUrl = resource.sourceUrl
    if (!pageSourceUrl) {
      extracted = buildFailedExtraction('Reprocess failed: this Canvas Page has no stored source URL.')
    } else {
      try {
        const page = await fetchStoredJson<CanvasPagePayload>(pageSourceUrl, canvasConfig)
        const title = page.title?.trim() || resource.title
        extracted = await extractCanvasPageContent({
          title,
          html: page.body ?? '',
        })
        metadataPatch = {
          ...metadataPatch,
          canvasPageUrl: page.url ?? baseMetadata.canvasPageUrl ?? null,
          pageUpdatedAt: page.updated_at ?? baseMetadata.pageUpdatedAt ?? null,
          pagePublished: page.published ?? baseMetadata.pagePublished ?? null,
        }
      } catch (error) {
        extracted = buildFailedExtraction(error instanceof Error ? error.message : 'Canvas page reprocess failed.')
      }
    }
  } else if (normalizedSourceType === 'assignment') {
    const assignmentSourceUrl = resource.sourceUrl
    if (!assignmentSourceUrl) {
      extracted = buildFailedExtraction('Reprocess failed: this Canvas Assignment has no stored source URL.')
    } else {
      try {
        const assignment = await fetchStoredJson<CanvasAssignmentPayload>(assignmentSourceUrl, canvasConfig)
        const title = assignment.name?.trim() || resource.title
        extracted = await extractCanvasStructuredHtmlContent({
          title,
          sections: [
            {
              label: 'Assignment',
              text: title,
            },
            {
              label: 'Submission types',
              text: Array.isArray(assignment.submission_types) && assignment.submission_types.length > 0
                ? assignment.submission_types.join(', ')
                : null,
            },
            {
              label: 'Instructions',
              html: assignment.description,
            },
          ],
          emptyMessage: 'Canvas assignment fetched successfully, but no readable instructions or body text were found.',
        })
        metadataPatch = {
          ...metadataPatch,
          assignmentDueAt: assignment.due_at ?? baseMetadata.assignmentDueAt ?? null,
          pointsPossible: assignment.points_possible ?? baseMetadata.pointsPossible ?? null,
          submissionTypes: Array.isArray(assignment.submission_types)
            ? assignment.submission_types
            : baseMetadata.submissionTypes ?? [],
        }
      } catch (error) {
        extracted = buildFailedExtraction(error instanceof Error ? error.message : 'Canvas assignment reprocess failed.')
      }
    }
  } else if (normalizedSourceType === 'discussion') {
    const discussionSourceUrl = resource.sourceUrl
    if (!discussionSourceUrl) {
      extracted = buildFailedExtraction('Reprocess failed: this Canvas Discussion has no stored source URL.')
    } else {
      try {
        const discussion = await fetchStoredJson<CanvasDiscussionPayload>(discussionSourceUrl, canvasConfig)
        const title = discussion.title?.trim() || resource.title
        extracted = await extractCanvasStructuredHtmlContent({
          title,
          sections: [
            {
              label: 'Discussion',
              text: title,
            },
            {
              label: 'Prompt',
              html: discussion.message,
            },
          ],
          emptyMessage: 'Canvas discussion fetched successfully, but no readable prompt text was found.',
        })
        metadataPatch = {
          ...metadataPatch,
          discussionPostedAt: discussion.posted_at ?? baseMetadata.discussionPostedAt ?? null,
          discussionUpdatedAt: discussion.updated_at ?? baseMetadata.discussionUpdatedAt ?? null,
        }
      } catch (error) {
        extracted = buildFailedExtraction(error instanceof Error ? error.message : 'Canvas discussion reprocess failed.')
      }
    }
  } else if (isUnsupportedLinkOnlyType(normalizedSourceType)) {
    extracted = {
      extractionStatus: 'unsupported',
      extractedText: null,
      extractedTextPreview: null,
      extractedCharCount: 0,
      extractionError: 'This resource is link-only in Stay Focused right now. Reprocessing can keep the status honest, but it cannot turn the link into readable study text yet.',
      supported: false,
    }
  } else {
    const fileSourceUrl = resource.sourceUrl
    if (!fileSourceUrl) {
      extracted = buildFailedExtraction(`Reprocess failed: ${resource.title} has no stored source URL.`)
    } else {
      try {
        const downloaded = await fetchStoredBinary(fileSourceUrl, canvasConfig)
        extracted = await extractCanvasFileContent({
          buffer: downloaded.buffer,
          title: resource.title,
          extension: resource.extension ?? normalizeExtension(downloaded.contentType, resource.title),
          contentType: resource.contentType ?? downloaded.contentType,
        })
      } catch (error) {
        extracted = buildFailedExtraction(error instanceof Error ? error.message : 'File reprocess failed.')
      }
    }
  }

  const provisionalMetadata = {
    ...baseMetadata,
    ...metadataPatch,
  }

  const nextResource = {
    ...resource,
    extractionStatus: extracted.extractionStatus,
    extractedText: extracted.extractedText,
    extractedTextPreview: extracted.extractedTextPreview,
    extractedCharCount: extracted.extractedCharCount,
    extractionError: extracted.extractionError,
    metadata: provisionalMetadata,
  }
  const capability = getModuleResourceCapabilityInfo(nextResource)
  const quality = getModuleResourceQualityInfo({
    ...nextResource,
    metadata: {
      ...provisionalMetadata,
      normalizedSourceType: capability.normalizedSourceType,
      capability: capability.capability,
    },
  })
  const assessmentMetadata = buildModuleResourceAssessmentMetadata({
    ...nextResource,
    metadata: {
      ...provisionalMetadata,
      normalizedSourceType: capability.normalizedSourceType,
      capability: capability.capability,
    },
  }, provisionalMetadata)

  return {
    update: {
      extractionStatus: extracted.extractionStatus,
      extractedText: extracted.extractedText,
      extractedTextPreview: extracted.extractedTextPreview,
      extractedCharCount: extracted.extractedCharCount,
      extractionError: extracted.extractionError,
      metadata: {
        ...assessmentMetadata,
        lastReprocessedAt: now,
        lastReprocessOutcome: capability.capability,
        lastReprocessReason: capability.reason,
        lastReprocessSource: options.triggeredBy ?? 'script',
      },
    },
    capability,
    quality,
  }
}

function getOptionalCanvasConfig(override?: Partial<CanvasConfig>) {
  const hasAnyOverride = Boolean(override?.url?.trim() || override?.token?.trim())
  const hasEnvConfig = Boolean((process.env.CANVAS_API_URL ?? process.env.CANVAS_API_BASE_URL)?.trim() && process.env.CANVAS_API_TOKEN?.trim())

  if (!hasAnyOverride && !hasEnvConfig) {
    return null
  }

  try {
    return resolveCanvasConfig(override)
  } catch {
    return null
  }
}

async function fetchStoredJson<T>(url: string, canvasConfig: CanvasConfig | null) {
  const response = await fetchStoredSource(url, canvasConfig)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  if (!contentType.includes('json')) {
    throw new Error('The stored source URL did not return Canvas JSON. This resource may need a fresh sync to store a reprocessable API URL.')
  }

  return response.json() as Promise<T>
}

async function fetchStoredBinary(url: string, canvasConfig: CanvasConfig | null) {
  const response = await fetchStoredSource(url, canvasConfig)

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  }
}

async function fetchStoredSource(url: string, canvasConfig: CanvasConfig | null) {
  const absoluteUrl = resolveStoredUrl(url, canvasConfig)
  const response = await fetch(absoluteUrl, {
    headers: buildStoredSourceHeaders(absoluteUrl, canvasConfig),
    next: { revalidate: 0 },
  })

  if (response.ok) {
    return response
  }

  throw new Error(buildStoredFetchError(response.status, absoluteUrl, canvasConfig))
}

function buildStoredSourceHeaders(url: string, canvasConfig: CanvasConfig | null) {
  if (!canvasConfig) {
    return undefined
  }

  const targetHost = new URL(url).host
  const canvasHost = new URL(`${canvasConfig.url}/`).host

  if (targetHost !== canvasHost) {
    return undefined
  }

  return {
    Authorization: `Bearer ${canvasConfig.token}`,
  }
}

function buildStoredFetchError(status: number, absoluteUrl: string, canvasConfig: CanvasConfig | null) {
  if (status === 401 || status === 403) {
    const targetHost = new URL(absoluteUrl).host
    const canvasHost = canvasConfig ? new URL(`${canvasConfig.url}/`).host : null

    if (!canvasConfig || targetHost !== canvasHost) {
      return 'Canvas auth is required to reprocess this resource. Add CANVAS_API_URL and CANVAS_API_TOKEN for this Canvas host, then retry.'
    }

    return 'Canvas rejected the stored reprocess request for this resource. Check CANVAS_API_TOKEN or resync the module with a working Canvas connection.'
  }

  if (status === 404) {
    return 'The stored source URL no longer resolves. This resource may need a fresh sync to refresh its Canvas links.'
  }

  return `The stored source request failed with HTTP ${status}.`
}

function resolveStoredUrl(url: string, canvasConfig: CanvasConfig | null) {
  try {
    return new URL(url).toString()
  } catch {
    if (!canvasConfig) {
      throw new Error('This stored source URL is relative, but no Canvas base URL is configured for reprocessing.')
    }

    return new URL(url, `${canvasConfig.url}/`).toString()
  }
}

function isUnsupportedLinkOnlyType(normalizedSourceType: ReturnType<typeof getNormalizedModuleResourceSourceType>) {
  return normalizedSourceType === 'external_url'
    || normalizedSourceType === 'external_tool'
    || normalizedSourceType === 'subheader'
    || normalizedSourceType === 'module_item'
}

function buildFailedExtraction(message: string): ExtractedCanvasResourceContent {
  return {
    extractionStatus: 'failed',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: message,
    supported: true,
  }
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...value as Record<string, unknown> }
    : {}
}
