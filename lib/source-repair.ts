import { adaptModuleResourceRow } from '@/lib/module-resource-row'
import { normalizeOptionalCanvasSyncText } from '@/lib/canvas-sync'
import type { ModuleResource } from '@/lib/types'

export interface RepairableLearningItem {
  id: string
  courseId: string | null
  moduleId: string | null
  title: string
  type: string | null
  body?: string | null
  sourceType?: string | null
  sourceLabel?: string | null
  canvasItemId?: number | null
  canvasFileId?: number | null
  canvasUrl?: string | null
  htmlUrl?: string | null
  externalUrl?: string | null
  sourceUrl?: string | null
  sourceResourceId?: string | null
  canonicalSourceId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface SourceRepairCounts {
  repaired: number
  created: number
  classified: number
  skipped: number
  failed: number
}

export interface SourceRepairMatch {
  resource: ModuleResource
  strategy: 'canvas_item_id' | 'canvas_file_id' | 'url' | 'module_title' | 'course_title' | 'normalized_filename'
}

export interface GeneratedLearningItemSourceMatch {
  resource: ModuleResource
  strategy: 'generated_body_title'
}

export function findSourceRepairMatch(
  item: RepairableLearningItem,
  resources: ModuleResource[],
): SourceRepairMatch | null {
  if (isSourceLessGeneratedLearningItem(item)) return null

  const canvasItemId = firstNumber(item.canvasItemId, item.metadata?.canvasItemId, item.metadata?.canvas_module_item_id)
  if (canvasItemId != null) {
    const match = resources.find((resource) => resource.canvasItemId === canvasItemId)
    if (match) return { resource: match, strategy: 'canvas_item_id' }
  }

  const canvasFileId = firstNumber(item.canvasFileId, item.metadata?.canvasFileId, item.metadata?.canvas_file_id)
  if (canvasFileId != null) {
    const match = resources.find((resource) => resource.canvasFileId === canvasFileId)
    if (match) return { resource: match, strategy: 'canvas_file_id' }
  }

  const itemUrls = buildNormalizedUrlSet([
    item.canvasUrl,
    item.htmlUrl,
    item.externalUrl,
    item.sourceUrl,
    readString(item.metadata?.canvasUrl),
    readString(item.metadata?.htmlUrl),
    readString(item.metadata?.externalUrl),
    readString(item.metadata?.sourceUrl),
  ])
  if (itemUrls.size > 0) {
    const match = resources.find((resource) => {
      const resourceUrls = buildNormalizedUrlSet([resource.sourceUrl, resource.htmlUrl, readString(resource.metadata.canvasModuleUrl), readString(resource.metadata.resolvedUrl)])
      return [...itemUrls].some((url) => resourceUrls.has(url))
    })
    if (match) return { resource: match, strategy: 'url' }
  }

  const normalizedTitle = normalizeSourceTitle(item.title)
  const normalizedFilename = normalizeCanvasFileTitle(item.title)
  if (normalizedTitle && item.moduleId) {
    const moduleMatches = resources.filter((resource) => (
      resource.moduleId === item.moduleId
      && (
        normalizeSourceTitle(resource.title) === normalizedTitle
        || (normalizedFilename && normalizeCanvasFileTitle(resource.title) === normalizedFilename)
      )
    ))
    if (moduleMatches.length === 1) {
      const strategy = normalizeSourceTitle(moduleMatches[0]!.title) === normalizedTitle ? 'module_title' : 'normalized_filename'
      return { resource: moduleMatches[0]!, strategy }
    }
  }

  if (normalizedTitle && item.courseId) {
    const courseMatches = resources.filter((resource) => (
      resource.courseId === item.courseId
      && (
        normalizeSourceTitle(resource.title) === normalizedTitle
        || (normalizedFilename && normalizeCanvasFileTitle(resource.title) === normalizedFilename)
      )
    ))
    if (courseMatches.length === 1) return { resource: courseMatches[0]!, strategy: 'course_title' }
  }

  return null
}

export function findGeneratedLearningItemSourceMatch(
  item: RepairableLearningItem,
  resources: ModuleResource[],
): GeneratedLearningItemSourceMatch | null {
  if (!isSourceLessGeneratedLearningItem(item)) return null

  const sameModuleResources = item.moduleId
    ? resources.filter((resource) => resource.moduleId === item.moduleId)
    : []
  const candidates = sameModuleResources.length > 0
    ? sameModuleResources
    : item.courseId
      ? resources.filter((resource) => resource.courseId === item.courseId)
      : []
  const itemText = normalizeSourceTitle([
    item.title,
    item.body,
    item.sourceLabel,
  ].filter(Boolean).join(' '))

  if (!itemText) return null

  const matches = candidates.filter((resource) => {
    const resourceTitle = normalizeSourceTitle(resource.title)
    if (!isConservativeTitleNeedle(resourceTitle)) return false
    return itemText.includes(resourceTitle)
  })

  return matches.length === 1 ? { resource: matches[0]!, strategy: 'generated_body_title' } : null
}

export function shouldAttemptLearningItemSourceRepair(item: RepairableLearningItem) {
  if (item.sourceResourceId || item.canonicalSourceId?.startsWith('module_resource:')) return false
  return !isSourceLessGeneratedLearningItem(item)
}

export function isSourceLessGeneratedLearningItem(item: RepairableLearningItem) {
  if (item.sourceResourceId || item.canonicalSourceId) return false
  if (hasCanvasSourceEvidence(item)) return false

  const type = item.type?.toLowerCase().trim() ?? ''
  const title = item.title.toLowerCase().trim()
  return type === 'summary'
    || type === 'concept'
    || type === 'connection'
    || type === 'review'
    || title === 'what this module is trying to teach'
    || /^key idea \d+$/i.test(title)
    || /^check your understanding \d+$/i.test(title)
}

export function buildLearningItemSourcePatch(resource: ModuleResource) {
  return {
    source_type: 'module_resource',
    canonical_source_id: `module_resource:${resource.id}`,
    source_module_id: resource.moduleId,
    source_resource_id: resource.id,
  }
}

export function classifyUnrepairedCanvasItem(item: Pick<RepairableLearningItem, 'title' | 'type' | 'canvasUrl' | 'htmlUrl' | 'externalUrl' | 'sourceUrl' | 'metadata'>) {
  const type = `${item.type ?? ''} ${readString(item.metadata?.sourceType) ?? ''} ${readString(item.metadata?.resourceType) ?? ''}`.toLowerCase()
  const url = item.canvasUrl ?? item.htmlUrl ?? item.externalUrl ?? item.sourceUrl ?? readString(item.metadata?.url)
  const extension = inferExtension(item.title, readString(item.metadata?.extension), readString(item.metadata?.contentType))

  if (extension) return `${extension.toUpperCase()} file`
  if (type.includes('page') || /\/pages\//i.test(url ?? '')) return 'Canvas page'
  if (type.includes('assignment') || /\/assignments\//i.test(url ?? '')) return 'Canvas assignment'
  if (type.includes('discussion') || /\/discussion/i.test(url ?? '')) return 'Canvas discussion'
  if (type.includes('external') || type.includes('url') || type.includes('link')) return 'Canvas link'
  if (url) return isLikelyCanvasUrl(url) ? 'Canvas item' : 'Canvas link'
  return 'Unknown Canvas source'
}

export function summarizeSourceRepairCounts(counts: SourceRepairCounts) {
  const parts = [
    counts.repaired > 0 ? `${counts.repaired} repaired` : null,
    counts.created > 0 ? `${counts.created} created` : null,
    counts.classified > 0 ? `${counts.classified} classified` : null,
    counts.skipped > 0 ? `${counts.skipped} still need Canvas` : null,
    counts.failed > 0 ? `${counts.failed} failed` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : 'No source links needed repair.'
}

export function adaptRepairableLearningItem(row: Record<string, unknown>): RepairableLearningItem {
  const metadata = isPlainRecord(row.metadata) ? row.metadata : {}
  return {
    id: String(row.id ?? ''),
    courseId: typeof row.course_id === 'string' ? row.course_id : null,
    moduleId: typeof row.module_id === 'string' ? row.module_id : null,
    title: typeof row.title === 'string' ? row.title : 'Canvas item',
    type: typeof row.type === 'string' ? row.type : null,
    body: typeof row.body === 'string' ? row.body : null,
    sourceType: readString(row.source_type),
    sourceLabel: readString(row.source_label),
    canvasItemId: firstNumber(row.canvas_item_id, row.canvas_module_item_id),
    canvasFileId: firstNumber(row.canvas_file_id),
    canvasUrl: readString(row.canvas_url),
    htmlUrl: readString(row.html_url),
    externalUrl: readString(row.external_url),
    sourceUrl: readString(row.source_url),
    sourceResourceId: readString(row.source_resource_id),
    canonicalSourceId: readString(row.canonical_source_id),
    metadata,
  }
}

export function adaptRepairModuleResourceRow(row: Record<string, unknown>) {
  return adaptModuleResourceRow(row)
}

export function normalizeSourceTitle(value: string) {
  return value
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeCanvasFileTitle(value: string | null | undefined) {
  const cleaned = value?.trim()
  if (!cleaned) return ''

  return decodeURIComponent(cleaned)
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bcopy\s*\(\d+\)$/i, '')
    .replace(/\s*\(\d+\)$/i, '')
    .replace(/[_\-–—]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(final|updated|revised|copy)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildNormalizedUrlSet(values: Array<string | null | undefined>) {
  return new Set(values.map(normalizeUrlForMatch).filter((value): value is string => Boolean(value)))
}

function normalizeUrlForMatch(value: string | null | undefined) {
  const cleaned = normalizeOptionalCanvasSyncText(value)
  if (!cleaned) return null
  try {
    const url = new URL(cleaned)
    url.hash = ''
    url.searchParams.sort()
    return url.toString().replace(/\/$/, '')
  } catch {
    return cleaned.replace(/\/$/, '')
  }
}

function inferExtension(title: string, extension: string | null, contentType: string | null) {
  const normalizedExtension = extension?.replace(/^\./, '').trim().toLowerCase()
  if (normalizedExtension) return normalizedExtension
  if (contentType?.includes('pdf')) return 'pdf'
  if (contentType?.includes('presentation')) return 'pptx'
  if (contentType?.includes('word')) return 'docx'
  const match = title.match(/\.([a-z0-9]{2,5})$/i)
  return match?.[1]?.toLowerCase() ?? null
}

function hasCanvasSourceEvidence(item: RepairableLearningItem) {
  return firstNumber(item.canvasItemId, item.canvasFileId, item.metadata?.canvasItemId, item.metadata?.canvasFileId, item.metadata?.canvas_module_item_id, item.metadata?.canvas_file_id) != null
    || Boolean(
      item.canvasUrl
      || item.htmlUrl
      || item.externalUrl
      || item.sourceUrl
      || readString(item.metadata?.canvasUrl)
      || readString(item.metadata?.htmlUrl)
      || readString(item.metadata?.externalUrl)
      || readString(item.metadata?.sourceUrl)
      || readString(item.metadata?.url),
    )
}

function isConservativeTitleNeedle(normalizedTitle: string) {
  if (normalizedTitle.length < 12) return false
  return normalizedTitle.split(/\s+/).filter(Boolean).length >= 3
}

function isLikelyCanvasUrl(value: string) {
  try {
    const url = new URL(value)
    return /canvas/i.test(url.host) || /\/courses\/\d+\//.test(url.pathname)
  } catch {
    return false
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Math.trunc(Number(value))
  }
  return null
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
