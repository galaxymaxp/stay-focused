import { normalizeExtension } from './canvas-resource-extraction'
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
import {
  buildCanvasContentPlaceholderResult,
  resolveCanvasContentForWorkspaceItem,
  type ResolveCanvasAttachmentDownloadInput,
} from './canvas-content-resolution'
import { resolveCanvasConfig, resolveCanvasLinkedTarget, type CanvasConfig } from './canvas'
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
  const downloadAttachment = createStoredAttachmentDownloader(canvasConfig)
  let update: {
    extractionStatus: ModuleResourceExtractionStatus
    extractedText: string | null
    extractedTextPreview: string | null
    extractedCharCount: number
    extractionError: string | null
    metadataPatch: Record<string, unknown>
  } = buildFailedPersistedUpdate('Resource reprocess did not run.')
  let metadataPatch: Record<string, unknown> = {
    normalizedSourceType,
  }

  if (normalizedSourceType === 'page') {
    const pageSourceUrl = resource.sourceUrl
    if (!pageSourceUrl) {
      update = buildFailedPersistedUpdate('Reprocess failed: this Canvas Page has no stored source URL.')
    } else {
      try {
        const page = await fetchStoredJson<CanvasPagePayload>(pageSourceUrl, canvasConfig)
        const title = page.title?.trim() || resource.title
        const resolved = await resolveCanvasContentForWorkspaceItem({
          title,
          sourceType: 'page',
          mimeType: 'text/html',
          sections: [
            {
              label: 'Page content',
              html: page.body ?? '',
            },
          ],
          courseId: resource.courseId,
          moduleId: resource.moduleId,
        }, {
          downloadAttachment,
        })

        update = resolved.persisted
        metadataPatch = {
          ...metadataPatch,
          ...resolved.persisted.metadataPatch,
          canvasPageUrl: page.url ?? baseMetadata.canvasPageUrl ?? null,
          pageUpdatedAt: page.updated_at ?? baseMetadata.pageUpdatedAt ?? null,
          pagePublished: page.published ?? baseMetadata.pagePublished ?? null,
        }
      } catch (error) {
        update = buildFailedPersistedUpdate(error instanceof Error ? error.message : 'Canvas page reprocess failed.')
      }
    }
  } else if (normalizedSourceType === 'assignment') {
    const assignmentSourceUrl = resource.sourceUrl
    if (!assignmentSourceUrl) {
      update = buildFailedPersistedUpdate('Reprocess failed: this Canvas Assignment has no stored source URL.')
    } else {
      try {
        const assignment = await fetchStoredJson<CanvasAssignmentPayload>(assignmentSourceUrl, canvasConfig)
        const title = assignment.name?.trim() || resource.title
        const resolved = await resolveCanvasContentForWorkspaceItem({
          title,
          sourceType: 'assignment',
          mimeType: 'text/html',
          sections: [
            {
              label: 'Instructions',
              html: assignment.description,
            },
          ],
          dueAt: assignment.due_at ?? null,
          courseId: resource.courseId,
          moduleId: resource.moduleId,
        }, {
          downloadAttachment,
        })

        update = resolved.persisted
        metadataPatch = {
          ...metadataPatch,
          ...resolved.persisted.metadataPatch,
          assignmentDueAt: assignment.due_at ?? baseMetadata.assignmentDueAt ?? null,
          pointsPossible: assignment.points_possible ?? baseMetadata.pointsPossible ?? null,
          submissionTypes: Array.isArray(assignment.submission_types)
            ? assignment.submission_types
            : baseMetadata.submissionTypes ?? [],
        }
      } catch (error) {
        update = buildFailedPersistedUpdate(error instanceof Error ? error.message : 'Canvas assignment reprocess failed.')
      }
    }
  } else if (normalizedSourceType === 'discussion') {
    const discussionSourceUrl = resource.sourceUrl
    if (!discussionSourceUrl) {
      update = buildFailedPersistedUpdate('Reprocess failed: this Canvas Discussion has no stored source URL.')
    } else {
      try {
        const discussion = await fetchStoredJson<CanvasDiscussionPayload>(discussionSourceUrl, canvasConfig)
        const title = discussion.title?.trim() || resource.title
        const resolved = await resolveCanvasContentForWorkspaceItem({
          title,
          sourceType: 'discussion',
          mimeType: 'text/html',
          sections: [
            {
              label: 'Prompt',
              html: discussion.message,
            },
          ],
          postedAt: discussion.posted_at ?? null,
          courseId: resource.courseId,
          moduleId: resource.moduleId,
        }, {
          downloadAttachment,
        })

        update = resolved.persisted
        metadataPatch = {
          ...metadataPatch,
          ...resolved.persisted.metadataPatch,
          discussionPostedAt: discussion.posted_at ?? baseMetadata.discussionPostedAt ?? null,
          discussionUpdatedAt: discussion.updated_at ?? baseMetadata.discussionUpdatedAt ?? null,
        }
      } catch (error) {
        update = buildFailedPersistedUpdate(error instanceof Error ? error.message : 'Canvas discussion reprocess failed.')
      }
    }
  } else if (normalizedSourceType === 'external_url' || normalizedSourceType === 'external_tool' || normalizedSourceType === 'module_item') {
    const resolvedTarget = await reprocessResolvedCanvasLinkTarget({
      resource,
      canvasConfig,
      downloadAttachment,
    })

    if (resolvedTarget) {
      update = resolvedTarget.update
      metadataPatch = {
        ...metadataPatch,
        ...resolvedTarget.metadataPatch,
      }
    } else {
      update = {
        extractionStatus: 'metadata_only',
        extractedText: null,
        extractedTextPreview: null,
        extractedCharCount: 0,
        extractionError: 'This stored module link has no resolvable Canvas or external URL yet, so reprocessing keeps it as context-only metadata.',
        metadataPatch: {},
      }
    }
  } else if (normalizedSourceType === 'subheader') {
    update = {
      extractionStatus: 'metadata_only',
      extractedText: null,
      extractedTextPreview: null,
      extractedCharCount: 0,
      extractionError: 'This resource is structural or link-only in Stay Focused right now, so reprocessing preserves the note instead of inventing readable content.',
      metadataPatch: {},
    }
  } else {
    const fileSourceUrl = resource.sourceUrl
    if (!fileSourceUrl) {
      update = buildFailedPersistedUpdate(`Reprocess failed: ${resource.title} has no stored source URL.`)
    } else {
      try {
        const resolved = await resolveCanvasContentForWorkspaceItem({
          title: resource.title,
          sourceType: 'file',
          mimeType: resource.contentType,
          extension: resource.extension,
          file: {
            url: fileSourceUrl,
            title: resource.title,
            mimeType: resource.contentType,
            extension: resource.extension ?? normalizeExtension(null, resource.title),
          },
          courseId: resource.courseId,
          moduleId: resource.moduleId,
        }, {
          downloadAttachment,
        })

        update = resolved.persisted
        metadataPatch = {
          ...metadataPatch,
          ...resolved.persisted.metadataPatch,
        }
      } catch (error) {
        update = buildFailedPersistedUpdate(error instanceof Error ? error.message : 'File reprocess failed.')
      }
    }
  }

  const provisionalMetadata = {
    ...baseMetadata,
    ...metadataPatch,
  }

  const nextResource = {
    ...resource,
    extractionStatus: update.extractionStatus,
    extractedText: update.extractedText,
    extractedTextPreview: update.extractedTextPreview,
    extractedCharCount: update.extractedCharCount,
    extractionError: update.extractionError,
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
      extractionStatus: update.extractionStatus,
      extractedText: update.extractedText,
      extractedTextPreview: update.extractedTextPreview,
      extractedCharCount: update.extractedCharCount,
      extractionError: update.extractionError,
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

async function reprocessResolvedCanvasLinkTarget(input: {
  resource: ModuleResource
  canvasConfig: CanvasConfig | null
  downloadAttachment: ReturnType<typeof createStoredAttachmentDownloader>
}) {
  const candidateUrl = input.resource.htmlUrl ?? input.resource.sourceUrl
  if (!candidateUrl) {
    return null
  }

  const target = await resolveCanvasLinkedTarget(candidateUrl, input.canvasConfig)
  const metadataPatch = buildStoredCanvasTargetMetadataPatch(input.resource, target)

  if (target.resolutionState === 'resolved' && target.resolvedTargetType === 'page') {
    const pageApiUrl = buildResolvedCanvasPageApiUrl(target, input.canvasConfig)
    if (!pageApiUrl) {
      return buildStoredCanvasResolutionPlaceholder({
        resource: input.resource,
        target,
        extractionStatus: 'metadata_only',
        fallbackState: 'canvas_resolution_required',
        reason: 'Canvas resolved this item to a page, but reprocessing still needs Canvas API credentials to fetch the page body.',
      })
    }

    try {
      const page = await fetchStoredJson<CanvasPagePayload>(pageApiUrl, input.canvasConfig)
      const title = page.title?.trim() || input.resource.title
      const resolved = await resolveCanvasContentForWorkspaceItem({
        title,
        sourceType: 'page',
        mimeType: 'text/html',
        sections: [
          {
            label: 'Page content',
            html: page.body ?? '',
          },
        ],
        courseId: input.resource.courseId,
        moduleId: input.resource.moduleId,
      }, {
        downloadAttachment: input.downloadAttachment,
      })

      return {
        update: resolved.persisted,
        metadataPatch: {
          ...metadataPatch,
          ...resolved.persisted.metadataPatch,
          normalizedSourceType: 'page',
          canvasPageUrl: page.url ?? target.pageUrl ?? null,
          pageUpdatedAt: page.updated_at ?? null,
          pagePublished: page.published ?? null,
        },
      }
    } catch (error) {
      return buildStoredCanvasResolutionPlaceholder({
        resource: input.resource,
        target,
        extractionStatus: 'failed',
        fallbackState: 'canvas_fetch_failed',
        reason: error instanceof Error ? error.message : 'Canvas page reprocess failed.',
      })
    }
  }

  if (target.resolutionState === 'resolved' && target.resolvedTargetType === 'assignment') {
    const assignmentApiUrl = buildResolvedCanvasAssignmentApiUrl(target, input.canvasConfig)
    if (!assignmentApiUrl) {
      return buildStoredCanvasResolutionPlaceholder({
        resource: input.resource,
        target,
        extractionStatus: 'metadata_only',
        fallbackState: 'canvas_resolution_required',
        reason: 'Canvas resolved this item to an assignment, but reprocessing still needs Canvas API credentials to fetch the assignment instructions.',
      })
    }

    try {
      const assignment = await fetchStoredJson<CanvasAssignmentPayload>(assignmentApiUrl, input.canvasConfig)
      const title = assignment.name?.trim() || input.resource.title
      const resolved = await resolveCanvasContentForWorkspaceItem({
        title,
        sourceType: 'assignment',
        mimeType: 'text/html',
        sections: [
          {
            label: 'Instructions',
            html: assignment.description,
          },
        ],
        dueAt: assignment.due_at ?? null,
        courseId: input.resource.courseId,
        moduleId: input.resource.moduleId,
      }, {
        downloadAttachment: input.downloadAttachment,
      })

      return {
        update: resolved.persisted,
        metadataPatch: {
          ...metadataPatch,
          ...resolved.persisted.metadataPatch,
          normalizedSourceType: 'assignment',
          assignmentDueAt: assignment.due_at ?? null,
          pointsPossible: assignment.points_possible ?? null,
          submissionTypes: Array.isArray(assignment.submission_types) ? assignment.submission_types : [],
        },
      }
    } catch (error) {
      return buildStoredCanvasResolutionPlaceholder({
        resource: input.resource,
        target,
        extractionStatus: 'failed',
        fallbackState: 'canvas_fetch_failed',
        reason: error instanceof Error ? error.message : 'Canvas assignment reprocess failed.',
      })
    }
  }

  if (target.resolutionState === 'resolved' && target.resolvedTargetType === 'discussion') {
    const discussionApiUrl = buildResolvedCanvasDiscussionApiUrl(target, input.canvasConfig)
    if (!discussionApiUrl) {
      return buildStoredCanvasResolutionPlaceholder({
        resource: input.resource,
        target,
        extractionStatus: 'metadata_only',
        fallbackState: 'canvas_resolution_required',
        reason: 'Canvas resolved this item to a discussion, but reprocessing still needs Canvas API credentials to fetch the discussion prompt.',
      })
    }

    try {
      const discussion = await fetchStoredJson<CanvasDiscussionPayload>(discussionApiUrl, input.canvasConfig)
      const title = discussion.title?.trim() || input.resource.title
      const resolved = await resolveCanvasContentForWorkspaceItem({
        title,
        sourceType: 'discussion',
        mimeType: 'text/html',
        sections: [
          {
            label: 'Prompt',
            html: discussion.message,
          },
        ],
        postedAt: discussion.posted_at ?? null,
        courseId: input.resource.courseId,
        moduleId: input.resource.moduleId,
      }, {
        downloadAttachment: input.downloadAttachment,
      })

      return {
        update: resolved.persisted,
        metadataPatch: {
          ...metadataPatch,
          ...resolved.persisted.metadataPatch,
          normalizedSourceType: 'discussion',
          discussionPostedAt: discussion.posted_at ?? null,
          discussionUpdatedAt: discussion.updated_at ?? null,
        },
      }
    } catch (error) {
      return buildStoredCanvasResolutionPlaceholder({
        resource: input.resource,
        target,
        extractionStatus: 'failed',
        fallbackState: 'canvas_fetch_failed',
        reason: error instanceof Error ? error.message : 'Canvas discussion reprocess failed.',
      })
    }
  }

  if (target.resolutionState === 'resolved' && target.resolvedTargetType === 'file') {
    try {
      const resolved = await resolveCanvasContentForWorkspaceItem({
        title: input.resource.title,
        sourceType: 'file',
        mimeType: input.resource.contentType,
        extension: input.resource.extension,
        file: {
          url: target.resolvedUrl,
          title: input.resource.title,
          mimeType: input.resource.contentType,
          extension: input.resource.extension ?? normalizeExtension(null, input.resource.title),
        },
        courseId: input.resource.courseId,
        moduleId: input.resource.moduleId,
      }, {
        downloadAttachment: input.downloadAttachment,
      })

      return {
        update: resolved.persisted,
        metadataPatch: {
          ...metadataPatch,
          ...resolved.persisted.metadataPatch,
          normalizedSourceType: 'file',
        },
      }
    } catch (error) {
      return buildStoredCanvasResolutionPlaceholder({
        resource: input.resource,
        target,
        extractionStatus: 'failed',
        fallbackState: 'canvas_fetch_failed',
        reason: error instanceof Error ? error.message : 'Canvas file reprocess failed.',
      })
    }
  }

  if (target.resolutionState === 'external_link_only') {
    const resolved = await resolveCanvasContentForWorkspaceItem({
      title: input.resource.title,
      sourceType: 'external_link',
      mimeType: input.resource.contentType,
      attachments: [
        {
          name: input.resource.title,
          url: target.resolvedUrl ?? candidateUrl,
          mimeType: input.resource.contentType,
          sourceType: 'external_link',
        },
      ],
      courseId: input.resource.courseId,
      moduleId: input.resource.moduleId,
    })

    return {
      update: {
        ...resolved.persisted,
        extractionError: resolved.persisted.extractionError
          ?? 'This resource is link-only in Stay Focused right now. Reprocessing can keep the status honest, but it cannot turn the link into readable study text yet.',
      },
      metadataPatch: {
        ...metadataPatch,
        ...resolved.persisted.metadataPatch,
      },
    }
  }

  if (target.resolutionState === 'canvas_resolution_required' || target.resolutionState === 'canvas_fetch_failed') {
    return buildStoredCanvasResolutionPlaceholder({
      resource: input.resource,
      target,
      extractionStatus: target.resolutionState === 'canvas_fetch_failed' ? 'failed' : 'metadata_only',
      fallbackState: target.resolutionState,
      reason: target.reason ?? 'This internal Canvas link still needs deeper target resolution before readable content can be extracted.',
    })
  }

  return buildStoredCanvasResolutionPlaceholder({
    resource: input.resource,
    target,
    extractionStatus: 'metadata_only',
    fallbackState: 'canvas_resolution_required',
    reason: target.reason ?? 'This internal Canvas link did not resolve to a readable target yet.',
  })
}

function buildStoredCanvasResolutionPlaceholder(input: {
  resource: ModuleResource
  target: Awaited<ReturnType<typeof resolveCanvasLinkedTarget>>
  extractionStatus: ModuleResourceExtractionStatus
  fallbackState: 'canvas_resolution_required' | 'canvas_fetch_failed'
  reason: string
}) {
  const placeholder = buildCanvasContentPlaceholderResult({
    title: input.resource.title,
    sourceType: 'module_item',
    mimeType: input.resource.contentType,
    extractionStatus: input.extractionStatus === 'failed' ? 'failed' : 'partial',
    fallbackState: input.fallbackState,
    recommendationStrength: 'fallback',
    courseId: input.resource.courseId,
    moduleId: input.resource.moduleId,
    warnings: [input.reason],
  })

  return {
    update: {
      ...placeholder.persisted,
      extractionStatus: input.extractionStatus,
      extractionError: input.reason,
    },
    metadataPatch: {
      ...buildStoredCanvasTargetMetadataPatch(input.resource, input.target),
      ...placeholder.persisted.metadataPatch,
    },
  }
}

function buildStoredCanvasTargetMetadataPatch(
  resource: ModuleResource,
  target: Awaited<ReturnType<typeof resolveCanvasLinkedTarget>>,
) {
  const metadataPatch: Record<string, unknown> = {
    originalResourceKind: resource.resourceType,
    resolutionState: target.resolutionState,
    sourceUrlCategory: target.originalUrlCategory,
    resolvedUrlCategory: target.resolvedUrlCategory,
    resolvedUrl: target.resolvedUrl,
    resolvedTargetType: target.resolvedTargetType,
  }

  if (target.resolvedTargetType !== 'unknown' && target.resolvedTargetType !== 'external_link') {
    metadataPatch.normalizedSourceType = target.resolvedTargetType
  } else if (target.resolutionState === 'canvas_resolution_required' || target.resolutionState === 'canvas_fetch_failed') {
    metadataPatch.normalizedSourceType = 'module_item'
  }

  if (target.resolutionState !== 'resolved') {
    metadataPatch.fallbackReason = target.resolutionState
  }

  return metadataPatch
}

function buildResolvedCanvasPageApiUrl(
  target: Awaited<ReturnType<typeof resolveCanvasLinkedTarget>>,
  canvasConfig: CanvasConfig | null,
) {
  if (!target.resolvedUrl) return null
  if (target.resolvedUrl.includes('/api/v1/')) return target.resolvedUrl
  if (!canvasConfig || !target.courseId || !target.pageUrl) return null
  return `${canvasConfig.url}/api/v1/courses/${target.courseId}/pages/${encodeURIComponent(target.pageUrl)}`
}

function buildResolvedCanvasAssignmentApiUrl(
  target: Awaited<ReturnType<typeof resolveCanvasLinkedTarget>>,
  canvasConfig: CanvasConfig | null,
) {
  if (!target.resolvedUrl) return null
  if (target.resolvedUrl.includes('/api/v1/')) return target.resolvedUrl
  if (!canvasConfig || !target.courseId || !target.assignmentId) return null
  return `${canvasConfig.url}/api/v1/courses/${target.courseId}/assignments/${target.assignmentId}`
}

function buildResolvedCanvasDiscussionApiUrl(
  target: Awaited<ReturnType<typeof resolveCanvasLinkedTarget>>,
  canvasConfig: CanvasConfig | null,
) {
  if (!target.resolvedUrl) return null
  if (target.resolvedUrl.includes('/api/v1/')) return target.resolvedUrl
  if (!canvasConfig || !target.courseId || !target.discussionId) return null
  return `${canvasConfig.url}/api/v1/courses/${target.courseId}/discussion_topics/${target.discussionId}`
}

async function fetchStoredJson<T>(url: string, canvasConfig: CanvasConfig | null) {
  const response = await fetchStoredSource(url, canvasConfig)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  if (!contentType.includes('json')) {
    throw new Error('The stored source URL did not return Canvas JSON. Try repair. If this still fails, open the item in Canvas.')
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

    return 'Canvas rejected the stored reprocess request for this resource. Check CANVAS_API_TOKEN, try repair, or open the item in Canvas.'
  }

  if (status === 404) {
    return 'The stored source URL no longer resolves. Try repair. If this still fails, open the item in Canvas.'
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

async function resolveStoredBinaryUrl(url: string, canvasConfig: CanvasConfig | null) {
  const absoluteUrl = resolveStoredUrl(url, canvasConfig)
  const parsed = new URL(absoluteUrl)
  const normalizedPathname = parsed.pathname.replace(/\/$/, '')

  if (/\/api\/v1\/(?:courses\/\d+\/)?files\/\d+$/i.test(normalizedPathname)) {
    const file = await fetchStoredJson<{ url?: string | null }>(absoluteUrl, canvasConfig)
    if (!file.url) {
      throw new Error('The stored Canvas file endpoint no longer returns a downloadable URL.')
    }

    return file.url
  }

  if (/\/courses\/\d+\/files\/\d+$/i.test(normalizedPathname)) {
    parsed.pathname = `${normalizedPathname}/download`
    return parsed.toString()
  }

  return absoluteUrl
}

function createStoredAttachmentDownloader(canvasConfig: CanvasConfig | null) {
  return async (input: ResolveCanvasAttachmentDownloadInput) => {
    if (!input.url) {
      throw new Error('Stored attachment download is missing a URL.')
    }

    const resolvedUrl = await resolveStoredBinaryUrl(input.url, canvasConfig)
    const downloaded = await fetchStoredBinary(resolvedUrl, canvasConfig)

    return {
      buffer: downloaded.buffer,
      contentType: downloaded.contentType,
      title: input.title,
      extension: normalizeExtension(null, input.title ?? 'Canvas attachment'),
    }
  }
}

function buildFailedPersistedUpdate(message: string): {
  extractionStatus: ModuleResourceExtractionStatus
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  metadataPatch: Record<string, unknown>
} {
  return {
    extractionStatus: 'failed',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: message,
    metadataPatch: {},
  }
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...value as Record<string, unknown> }
    : {}
}
