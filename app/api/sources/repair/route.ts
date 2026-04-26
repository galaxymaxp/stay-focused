import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'

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
    moduleId?: unknown
    title?: unknown
    sourceUrl?: unknown
    canvasItemId?: unknown
    canvasFileId?: unknown
  } | null
  const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : null
  const title = typeof body?.title === 'string' ? body.title.trim() : null

  if (!moduleId || !title) {
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

  const { data: resources, error: resourceError } = await supabase
    .from('module_resources')
    .select('*')
    .eq('module_id', moduleId)
  if (resourceError) {
    return NextResponse.json({ ok: false, error: resourceError.message }, { status: 500 })
  }

  const sourceUrl = typeof body?.sourceUrl === 'string' ? body.sourceUrl.trim() : null
  const canvasItemId = typeof body?.canvasItemId === 'number' ? body.canvasItemId : null
  const canvasFileId = typeof body?.canvasFileId === 'number' ? body.canvasFileId : null
  const match = (resources ?? []).find((resource: Record<string, unknown>) => {
    if (canvasItemId && resource.canvas_item_id === canvasItemId) return true
    if (canvasFileId && resource.canvas_file_id === canvasFileId) return true
    if (sourceUrl && (resource.source_url === sourceUrl || resource.html_url === sourceUrl)) return true
    return normalizeLookup(String(resource.title ?? '')) === normalizeLookup(title)
  })

  if (match) {
    return NextResponse.json({
      ok: true,
      repaired: true,
      resourceId: String((match as Record<string, unknown>).id ?? ''),
      message: 'Source link repaired. Refresh the page if the source card does not update immediately.',
    })
  }

  if (sourceUrl) {
    const { data: created, error: createError } = await supabase
      .from('module_resources')
      .insert({
        module_id: moduleId,
        course_id: moduleRow.course_id,
        title,
        resource_type: 'Canvas item',
        source_url: sourceUrl,
        html_url: sourceUrl,
        extraction_status: 'metadata_only',
        extraction_error: 'This source was reconnected from Canvas metadata. Process it to extract readable text.',
        metadata: { repairedFromLearn: true },
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
    message: 'Stay Focused could not reconnect this item automatically. Re-sync the course or open the item in Canvas.',
  })
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
