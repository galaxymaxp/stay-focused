import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'
import {
  adaptRepairableLearningItem,
  adaptRepairModuleResourceRow,
  buildLearningItemSourcePatch,
  classifyUnrepairedCanvasItem,
  findSourceRepairMatch,
  summarizeSourceRepairCounts,
  type SourceRepairCounts,
} from '@/lib/source-repair'

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
    .select('id')
    .eq('id', moduleRow.course_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!courseRow) {
    return NextResponse.json({ ok: false, error: 'You do not have access to this module.' }, { status: 403 })
  }

  if (bulk) {
    const result = await repairLearningItemsForModule(supabase, moduleId, moduleRow.course_id)
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
  const match = findSourceRepairMatch(item, (resources ?? []).map((row) => adaptRepairModuleResourceRow(row as Record<string, unknown>)))

  if (match) {
    return NextResponse.json({
      ok: true,
      repaired: true,
      resourceId: match.resource.id,
      strategy: match.strategy,
      message: 'Source link repaired. Refresh the page if the source card does not update immediately.',
    })
  }

  if (item.sourceUrl) {
    const { data: created, error: createError } = await supabase
      .from('module_resources')
      .insert({
        module_id: moduleId,
        course_id: moduleRow.course_id,
        title,
        resource_type: 'Canvas item',
        source_url: item.sourceUrl,
        html_url: item.sourceUrl,
        extraction_status: 'metadata_only',
        extraction_error: 'This source was reconnected from Canvas metadata. Process it to extract readable text.',
        metadata: { repairedFromLearn: true, sourceLabel: classifyUnrepairedCanvasItem(item) },
      })
      .select('id')
      .single()
    if (!createError && created) {
      return NextResponse.json({
        ok: true,
        repaired: true,
        resourceId: String(created.id ?? ''),
        message: 'Source link repaired. Process this source to make it readable in Deep Learn.',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    repaired: false,
    sourceLabel: classifyUnrepairedCanvasItem(item),
    message: 'Stay Focused could not reconnect this item automatically. Try opening the item in Canvas.',
  })
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
