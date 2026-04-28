import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'
import { resolveCanvasConfigFromUser } from '@/lib/canvas-user-config'
import { getCanvasFile, getModules, normalizeCanvasUrl, type CanvasFile, type CanvasModuleItem } from '@/lib/canvas'
import { extractCanvasFileId } from '@/lib/canvas-content-resolution'
import { normalizeExtension } from '@/lib/canvas-resource-extraction'
import {
  adaptRepairableLearningItem,
  adaptRepairModuleResourceRow,
  buildLearningItemSourcePatch,
  classifyUnrepairedCanvasItem,
  findGeneratedLearningItemSourceMatch,
  findSourceRepairMatch,
  isSourceLessGeneratedLearningItem,
  normalizeCanvasFileTitle,
  shouldAttemptLearningItemSourceRepair,
  summarizeSourceRepairCounts,
  type SourceRepairCounts,
} from '@/lib/source-repair'
import type { ModuleResource } from '@/lib/types'

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Sign in before repairing source links.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as {
    bulk?: unknown
    moduleId?: unknown
    courseId?: unknown
    title?: unknown
    sourceUrl?: unknown
    canvasItemId?: unknown
    canvasFileId?: unknown
  } | null
  const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : null
  const title = typeof body?.title === 'string' ? body.title.trim() : null
  const bulk = body?.bulk === true

  if (!moduleId || (!bulk && !title)) {
    return NextResponse.json({ ok: false, error: 'Module and source title are required.' }, { status: 400 })
  }

  const { data: moduleRow, error: moduleError } = await supabase
    .from('modules')
    .select('id, course_id')
    .eq('id', moduleId)
    .maybeSingle()
  if (moduleError || !moduleRow || typeof moduleRow.course_id !== 'string') {
    return NextResponse.json({ ok: false, error: 'Module was not found.' }, { status: 404 })
  }

  const { data: courseRow } = await supabase
    .from('courses')
    .select('id, canvas_instance_url, canvas_course_id')
    .eq('id', moduleRow.course_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!courseRow) {
    return NextResponse.json({ ok: false, error: 'You do not have access to this module.' }, { status: 403 })
  }

  if (bulk) {
    const result = await repairLearningItemsForModule(supabase, moduleId, moduleRow.course_id)
    revalidateLearnDataPaths(moduleId, moduleRow.course_id)
    return NextResponse.json({
      ok: true,
      ...result,
      message: summarizeSourceRepairCounts(result.counts),
    })
  }

  const { data: resources, error: resourceError } = await supabase
    .from('module_resources')
    .select('*')
    .eq('module_id', moduleId)
  if (resourceError) {
    return NextResponse.json({ ok: false, error: resourceError.message }, { status: 500 })
  }

  const item = adaptRepairableLearningItem({
    id: 'single',
    module_id: moduleId,
    course_id: moduleRow.course_id,
    title,
    type: body?.canvasFileId ? 'file' : 'canvas_item',
    source_url: typeof body?.sourceUrl === 'string' ? body.sourceUrl.trim() : null,
    canvas_item_id: typeof body?.canvasItemId === 'number' ? body.canvasItemId : null,
    canvas_file_id: typeof body?.canvasFileId === 'number' ? body.canvasFileId : null,
  })
  const storedResources = (resources ?? []).map((row) => adaptRepairModuleResourceRow(row as Record<string, unknown>))
  const match = findSourceRepairMatch(item, storedResources)

  if (match) {
    await patchLearningItemsAfterRepair(supabase, item, match.resource, `Matched by ${match.strategy}.`)
    revalidateLearnDataPaths(moduleId, moduleRow.course_id)
    return NextResponse.json({
      ok: true,
      repaired: true,
      resourceId: match.resource.id,
      strategy: match.strategy,
      message: 'Source link repaired. Refresh the page if the source card does not update immediately.',
    })
  }

  const canvasRepair = await tryRepairFromCanvas({
    courseRow: courseRow as CourseIdentityRow,
    moduleId,
    courseId: moduleRow.course_id,
    item,
    resources: storedResources,
  })

  if (canvasRepair.resource) {
    const { resource: savedResource, error: saveError } = await saveRepairedModuleResource(supabase, canvasRepair.resource)

    if (saveError) {
      console.warn('[source repair] module_resource save failed', {
        reason: saveError,
        moduleId,
        courseId: moduleRow.course_id,
        title,
      })
    } else if (savedResource) {
      const repairedResource = adaptRepairModuleResourceRow(savedResource)
      await patchLearningItemsAfterRepair(supabase, item, repairedResource, canvasRepair.note)
      revalidateLearnDataPaths(moduleId, moduleRow.course_id, repairedResource.id)
      return NextResponse.json({
        ok: true,
        repaired: true,
        resourceId: repairedResource.id,
        strategy: canvasRepair.strategy,
        message: 'Source link repaired. Generate study pack when this source is ready.',
      })
    }
  }

  if (canvasRepair.reason) {
    console.warn('[source repair] Canvas repair failed', {
      reason: canvasRepair.reason,
      moduleId,
      courseId: moduleRow.course_id,
      title,
    })
  }

  return NextResponse.json({
    ok: true,
    repaired: false,
    sourceLabel: classifyUnrepairedCanvasItem(item),
    message: item.title ? 'Source link missing. Try reconnecting from Canvas.' : 'Stay Focused could not reconnect this item automatically. Try opening the item in Canvas.',
  })
}

function revalidateLearnDataPaths(moduleId: string, courseId: string, resourceId?: string | null) {
  revalidatePath('/')
  revalidatePath('/home')
  revalidatePath('/learn')
  revalidatePath('/courses')
  revalidatePath('/library')
  revalidatePath(`/courses/${courseId}`)
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath(`/modules/${moduleId}/learn`)
  revalidatePath(`/modules/${moduleId}/review`)
  revalidatePath(`/modules/${moduleId}/quiz`)
  if (resourceId) {
    revalidatePath(`/modules/${moduleId}/learn/resources/${encodeURIComponent(resourceId)}`)
    revalidatePath(`/modules/${moduleId}/learn/notes/${encodeURIComponent(resourceId)}`)
  }
}

interface CourseIdentityRow {
  id: string
  canvas_instance_url?: string | null
  canvas_course_id?: number | null
}

async function tryRepairFromCanvas(input: {
  courseRow: CourseIdentityRow
  moduleId: string
  courseId: string
  item: ReturnType<typeof adaptRepairableLearningItem>
  resources: ModuleResource[]
}): Promise<{
  resource: Record<string, unknown> | null
  strategy: string | null
  note: string
  reason: string | null
}> {
  const canvasCourseId = firstNumber(input.courseRow.canvas_course_id)
  const canvasInstanceUrl = readString(input.courseRow.canvas_instance_url)
  if (!canvasCourseId || !canvasInstanceUrl) {
    console.warn('[source repair] no course Canvas identity', { courseId: input.courseId, moduleId: input.moduleId })
    return { resource: null, strategy: null, note: 'No Canvas course identity was stored.', reason: 'no course Canvas identity' }
  }

  let config
  try {
    config = await resolveCanvasConfigFromUser({ url: canvasInstanceUrl })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Canvas credentials unavailable.'
    console.warn('[source repair] Canvas config unavailable', { reason, courseId: input.courseId, moduleId: input.moduleId })
    return { resource: null, strategy: null, note: reason, reason: 'no course Canvas identity' }
  }

  const sourceFileId = firstNumber(input.item.canvasFileId, extractCanvasFileId(input.item.sourceUrl), extractCanvasFileId(input.item.canvasUrl), extractCanvasFileId(input.item.htmlUrl))
  const sourceModuleItemId = firstNumber(input.item.canvasItemId)

  if (sourceFileId) {
    const fileResult = await fetchCanvasFileForRepair(canvasCourseId, sourceFileId, config)
    if (fileResult.file) {
      return {
        resource: buildRepairedFileResource({
          moduleId: input.moduleId,
          courseId: input.courseId,
          canvasInstanceUrl,
          canvasCourseId,
          file: fileResult.file,
          item: input.item,
          moduleItem: null,
        }),
        strategy: 'canvas_file_id',
        note: 'Repaired from Canvas file id.',
        reason: null,
      }
    }
    console.warn('[source repair] Canvas file id failed', { fileId: sourceFileId, reason: fileResult.reason })
  } else {
    console.info('[source repair] no file id available', { courseId: input.courseId, moduleId: input.moduleId, title: input.item.title })
  }

  let modules
  try {
    modules = await getModules(canvasCourseId, config)
  } catch (error) {
    const reason = classifyCanvasRepairError(error)
    console.warn('[source repair] Canvas modules endpoint failed', { reason, courseId: input.courseId, moduleId: input.moduleId })
    return { resource: null, strategy: null, note: reason, reason }
  }

  const moduleItems = modules.flatMap((module) => (module.items ?? []).map((moduleItem) => ({
    canvasModuleId: module.id,
    canvasModuleName: module.name,
    item: moduleItem,
  })))

  if (sourceModuleItemId) {
    const moduleItemMatch = moduleItems.find((entry) => entry.item.id === sourceModuleItemId)
    if (moduleItemMatch) {
      const repaired = await buildResourceFromModuleItem({
        moduleId: input.moduleId,
        courseId: input.courseId,
        canvasInstanceUrl,
        canvasCourseId,
        canvasModuleId: moduleItemMatch.canvasModuleId,
        canvasModuleName: moduleItemMatch.canvasModuleName,
        item: moduleItemMatch.item,
        config,
      })
      if (repaired) return { resource: repaired, strategy: 'module_item_id', note: 'Repaired from Canvas module item id.', reason: null }
    }
  } else {
    console.info('[source repair] no module item id available', { courseId: input.courseId, moduleId: input.moduleId, title: input.item.title })
  }

  const titleKey = normalizeCanvasFileTitle(input.item.title)
  const titleMatches = moduleItems.filter((entry) => normalizeCanvasFileTitle(entry.item.title) === titleKey)
  if (titleKey && titleMatches.length === 1) {
    const repaired = await buildResourceFromModuleItem({
      moduleId: input.moduleId,
      courseId: input.courseId,
      canvasInstanceUrl,
      canvasCourseId,
      canvasModuleId: titleMatches[0]!.canvasModuleId,
      canvasModuleName: titleMatches[0]!.canvasModuleName,
      item: titleMatches[0]!.item,
      config,
    })
    if (repaired) return { resource: repaired, strategy: 'normalized_filename', note: 'Repaired from normalized Canvas file title.', reason: null }
  }

  console.warn('[source repair] title match failed', { title: input.item.title, normalizedTitle: titleKey, matches: titleMatches.length })
  return { resource: null, strategy: null, note: 'Canvas title match failed.', reason: 'title match failed' }
}

async function saveRepairedModuleResource(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
  resource: Record<string, unknown>,
): Promise<{ resource: Record<string, unknown> | null; error: string | null }> {
  const moduleId = readString(resource.module_id)
  const canvasItemId = firstNumber(resource.canvas_item_id)
  const canvasFileId = firstNumber(resource.canvas_file_id)
  if (!moduleId) return { resource: null, error: 'missing module id' }

  let existing: Record<string, unknown> | null = null
  if (canvasItemId) {
    const { data, error } = await supabase
      .from('module_resources')
      .select('*')
      .eq('module_id', moduleId)
      .eq('canvas_item_id', canvasItemId)
      .maybeSingle()
    if (error) return { resource: null, error: error.message }
    existing = data as Record<string, unknown> | null
  }

  if (!existing && canvasFileId) {
    const { data, error } = await supabase
      .from('module_resources')
      .select('*')
      .eq('module_id', moduleId)
      .eq('canvas_file_id', canvasFileId)
      .maybeSingle()
    if (error) return { resource: null, error: error.message }
    existing = data as Record<string, unknown> | null
  }

  if (existing?.id) {
    const update = preserveReadableExtractionOnRepair(existing, resource)
    const { data, error } = await supabase
      .from('module_resources')
      .update(update)
      .eq('id', existing.id)
      .select('*')
      .single()
    return error ? { resource: null, error: error.message } : { resource: data as Record<string, unknown>, error: null }
  }

  const { data, error } = await supabase
    .from('module_resources')
    .insert(resource)
    .select('*')
    .single()
  return error ? { resource: null, error: error.message } : { resource: data as Record<string, unknown>, error: null }
}

function preserveReadableExtractionOnRepair(existing: Record<string, unknown>, patch: Record<string, unknown>) {
  const existingStatus = readString(existing.extraction_status)
  const existingCharCount = firstNumber(existing.extracted_char_count) ?? 0
  const hasReadableExtraction = (existingStatus === 'completed' || existingStatus === 'extracted') && existingCharCount > 0
  if (!hasReadableExtraction) return patch

  return {
    ...patch,
    extraction_status: existing.extraction_status,
    extraction_error: existing.extraction_error ?? null,
    extracted_text: existing.extracted_text ?? null,
    extracted_text_preview: existing.extracted_text_preview ?? null,
    extracted_char_count: existing.extracted_char_count ?? 0,
    visual_extraction_status: existing.visual_extraction_status ?? patch.visual_extraction_status,
    visual_extracted_text: existing.visual_extracted_text ?? patch.visual_extracted_text,
    visual_extraction_error: existing.visual_extraction_error ?? patch.visual_extraction_error,
    page_count: existing.page_count ?? patch.page_count,
    pages_processed: existing.pages_processed ?? patch.pages_processed,
    extraction_provider: existing.extraction_provider ?? patch.extraction_provider,
  }
}

async function repairLearningItemsForModule(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
  moduleId: string,
  courseId: string,
) {
  const counts: SourceRepairCounts = { repaired: 0, created: 0, classified: 0, skipped: 0, failed: 0 }
  const { data: itemRows, error: itemsError } = await supabase
    .from('learning_items')
    .select('*')
    .eq('module_id', moduleId)
  if (itemsError) throw new Error(itemsError.message)

  const { data: resourceRows, error: resourcesError } = await supabase
    .from('module_resources')
    .select('*')
    .eq('course_id', courseId)
  if (resourcesError) throw new Error(resourcesError.message)

  const resources = (resourceRows ?? []).map((row) => adaptRepairModuleResourceRow(row as Record<string, unknown>))
  const items = (itemRows ?? []).map((row) => adaptRepairableLearningItem(row as Record<string, unknown>))

  for (const item of items) {
    if (item.sourceResourceId || item.canonicalSourceId?.startsWith('module_resource:')) {
      counts.skipped += 1
      continue
    }

    const generatedMatch = findGeneratedLearningItemSourceMatch(item, resources)
    if (generatedMatch) {
      const { error } = await supabase
        .from('learning_items')
        .update({
          ...buildLearningItemSourcePatch(generatedMatch.resource),
          source_label: generatedMatch.resource.title,
          source_repair_status: 'repaired',
          source_repair_note: `Matched by ${generatedMatch.strategy}.`,
        })
        .eq('id', item.id)
      if (error) counts.failed += 1
      else counts.repaired += 1
      continue
    }

    if (!shouldAttemptLearningItemSourceRepair(item)) {
      const { error } = await supabase
        .from('learning_items')
        .update(isSourceLessGeneratedLearningItem(item)
          ? {
              source_label: 'Legacy generated item',
              source_repair_status: null,
              source_repair_note: null,
            }
          : {
              source_repair_status: null,
              source_repair_note: null,
            })
        .eq('id', item.id)
      if (error) counts.failed += 1
      else counts.skipped += 1
      continue
    }

    const match = findSourceRepairMatch(item, resources)
    if (match) {
      const { error } = await supabase
        .from('learning_items')
        .update({
          ...buildLearningItemSourcePatch(match.resource),
          source_label: classifyUnrepairedCanvasItem(item),
          source_repair_status: 'repaired',
          source_repair_note: `Matched by ${match.strategy}.`,
        })
        .eq('id', item.id)
      if (error) counts.failed += 1
      else counts.repaired += 1
      continue
    }

    const label = classifyUnrepairedCanvasItem(item)
    const { error } = await supabase
      .from('learning_items')
      .update({
        source_label: label,
        source_repair_status: 'needs_canvas',
        source_repair_note: 'Try repair. If this still fails, open the item in Canvas.',
      })
      .eq('id', item.id)
    if (error) counts.failed += 1
    else {
      counts.classified += 1
      counts.skipped += 1
    }
  }

  return { counts }
}

async function fetchCanvasFileForRepair(
  canvasCourseId: number,
  canvasFileId: number,
  config: Awaited<ReturnType<typeof resolveCanvasConfigFromUser>>,
) {
  try {
    return { file: await getCanvasFile(canvasCourseId, canvasFileId, config), reason: null }
  } catch (error) {
    return { file: null, reason: classifyCanvasRepairError(error) }
  }
}

async function buildResourceFromModuleItem(input: {
  moduleId: string
  courseId: string
  canvasInstanceUrl: string
  canvasCourseId: number
  canvasModuleId: number
  canvasModuleName: string
  item: CanvasModuleItem
  config: Awaited<ReturnType<typeof resolveCanvasConfigFromUser>>
}) {
  if (input.item.type.toLowerCase() !== 'file') {
    return {
      module_id: input.moduleId,
      course_id: input.courseId,
      canvas_instance_url: input.canvasInstanceUrl,
      canvas_course_id: input.canvasCourseId,
      canvas_module_id: input.canvasModuleId,
      canvas_item_id: input.item.id,
      canvas_file_id: null,
      title: input.item.title,
      resource_type: input.item.type,
      content_type: input.item.content_details?.content_type ?? null,
      extension: normalizeExtension(null, input.item.title),
      source_url: resolveCanvasUrl(input.canvasInstanceUrl, input.item.content_details?.url ?? input.item.url ?? null),
      html_url: buildCanvasModuleItemHtmlUrl(input.canvasInstanceUrl, input.canvasCourseId, input.item.id, input.item.html_url ?? null),
      extraction_status: 'metadata_only',
      extraction_error: 'This Canvas item was reconnected. Process it if readable text is needed.',
      metadata: buildRepairMetadata(input, null, {
        normalizedSourceType: input.item.type.toLowerCase() === 'externalurl' ? 'external_url' : 'module_item',
      }),
    }
  }

  const fileId = firstNumber(input.item.content_id)
  const fileResult = fileId ? await fetchCanvasFileForRepair(input.canvasCourseId, fileId, input.config) : { file: null, reason: 'no file id' }
  if (!fileResult.file) {
    console.warn('[source repair] Canvas files endpoint failed', {
      fileId,
      reason: fileResult.reason,
      moduleItemId: input.item.id,
    })
    return null
  }

  return buildRepairedFileResource({
    moduleId: input.moduleId,
    courseId: input.courseId,
    canvasInstanceUrl: input.canvasInstanceUrl,
    canvasCourseId: input.canvasCourseId,
    file: fileResult.file,
    item: {
      id: 'repair',
      courseId: input.courseId,
      moduleId: input.moduleId,
      title: input.item.title,
      type: input.item.type,
      canvasItemId: input.item.id,
      canvasFileId: fileResult.file.id,
      metadata: null,
    },
    moduleItem: {
      canvasModuleId: input.canvasModuleId,
      canvasModuleName: input.canvasModuleName,
      item: input.item,
    },
  })
}

function buildRepairedFileResource(input: {
  moduleId: string
  courseId: string
  canvasInstanceUrl: string
  canvasCourseId: number
  file: CanvasFile
  item: ReturnType<typeof adaptRepairableLearningItem>
  moduleItem: { canvasModuleId: number; canvasModuleName: string; item: CanvasModuleItem } | null
}) {
  const title = input.file.display_name?.trim() || input.file.filename?.trim() || input.item.title
  const contentType = input.file.content_type ?? input.file['content-type'] ?? null
  const sourceUrl = input.file.url ?? resolveCanvasUrl(input.canvasInstanceUrl, input.item.sourceUrl ?? input.item.canvasUrl ?? null)
  const htmlUrl = input.file.preview_url
    ?? (input.moduleItem ? buildCanvasModuleItemHtmlUrl(input.canvasInstanceUrl, input.canvasCourseId, input.moduleItem.item.id, input.moduleItem.item.html_url ?? null) : null)
    ?? sourceUrl

  return {
    module_id: input.moduleId,
    course_id: input.courseId,
    canvas_instance_url: input.canvasInstanceUrl,
    canvas_course_id: input.canvasCourseId,
    canvas_module_id: input.moduleItem?.canvasModuleId ?? firstNumber(input.item.metadata?.canvasModuleId, input.item.metadata?.canvas_module_id),
    canvas_item_id: input.moduleItem?.item.id ?? firstNumber(input.item.canvasItemId),
    canvas_file_id: input.file.id,
    title,
    resource_type: 'File',
    content_type: contentType,
    extension: normalizeExtension(null, title),
    source_url: sourceUrl,
    html_url: htmlUrl,
    extraction_status: sourceUrl ? 'pending' : 'metadata_only',
    extraction_error: sourceUrl ? null : 'Canvas file exists, but Canvas did not return a downloadable file URL.',
    extracted_text: null,
    extracted_text_preview: null,
    extracted_char_count: 0,
    required: Boolean(input.moduleItem?.item.completion_requirement),
    metadata: buildRepairMetadata({
      canvasInstanceUrl: input.canvasInstanceUrl,
      canvasCourseId: input.canvasCourseId,
      canvasModuleId: input.moduleItem?.canvasModuleId ?? firstNumber(input.item.metadata?.canvasModuleId, input.item.metadata?.canvas_module_id) ?? 0,
      canvasModuleName: input.moduleItem?.canvasModuleName ?? readString(input.item.metadata?.canvasModuleName) ?? null,
      item: input.moduleItem?.item ?? null,
    }, input.file, {
      normalizedSourceType: 'file',
      repairedFromCanvas: true,
      repairSource: 'source-repair',
    }),
  }
}

function buildRepairMetadata(
  input: {
    canvasInstanceUrl: string
    canvasCourseId: number
    canvasModuleId: number
    canvasModuleName: string | null
    item: CanvasModuleItem | null
  },
  file: CanvasFile | null,
  patch: Record<string, unknown>,
) {
  return {
    ...patch,
    canvasInstanceUrl: input.canvasInstanceUrl,
    canvasCourseId: input.canvasCourseId,
    canvasModuleId: input.canvasModuleId,
    canvasModuleName: input.canvasModuleName,
    canvasModuleItemId: input.item?.id ?? null,
    canvasItemId: input.item?.id ?? null,
    canvasFileId: file?.id ?? (input.item?.type.toLowerCase() === 'file' ? input.item.content_id ?? null : null),
    contentId: input.item?.content_id ?? file?.id ?? null,
    filename: file?.filename ?? null,
    displayName: file?.display_name ?? null,
    sourceUrl: file?.url ?? input.item?.content_details?.url ?? input.item?.url ?? null,
    htmlUrl: file?.preview_url ?? input.item?.html_url ?? null,
    fileSize: file?.size ?? input.item?.content_details?.size ?? null,
    mimeClass: file?.mime_class ?? input.item?.content_details?.mime_class ?? null,
    fileUpdatedAt: file?.updated_at ?? null,
  }
}

async function patchLearningItemsAfterRepair(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
  item: ReturnType<typeof adaptRepairableLearningItem>,
  resource: ModuleResource,
  note: string,
) {
  const query = supabase
    .from('learning_items')
    .update({
      ...buildLearningItemSourcePatch(resource),
      source_label: classifyUnrepairedCanvasItem(item),
      source_repair_status: 'repaired',
      source_repair_note: note,
    })
    .eq('module_id', resource.moduleId)

  if (item.id !== 'single') {
    await query.eq('id', item.id)
    return
  }

  await query.eq('title', item.title)
}

function buildCanvasModuleItemHtmlUrl(baseUrl: string | null | undefined, courseId: number, moduleItemId: number | null | undefined, fallback: string | null | undefined) {
  if (baseUrl && moduleItemId) return `${normalizeCanvasUrl(baseUrl)}/courses/${courseId}/modules/items/${moduleItemId}`
  return resolveCanvasUrl(baseUrl, fallback)
}

function resolveCanvasUrl(baseUrl: string | null | undefined, candidate: string | null | undefined) {
  if (!candidate) return null
  if (/^https?:\/\//i.test(candidate)) return candidate
  if (!baseUrl) return candidate
  return new URL(candidate, `${normalizeCanvasUrl(baseUrl)}/`).toString()
}

function classifyCanvasRepairError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/\b401\b|access token|verify/i.test(message)) return 'Canvas API 401'
  if (/\b403\b|forbidden|unauthor/i.test(message)) return 'Canvas API 403'
  if (/\b404\b|not found|did not respond/i.test(message)) return 'Canvas API 404'
  return message
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
