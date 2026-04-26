import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'
import { adaptModuleResourceRow } from '@/lib/module-resource-row'
import { isProcessableReadableSource } from '@/lib/source-processing'
import { reprocessStoredModuleResource } from '@/lib/module-resource-reprocess'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Sign in before processing sources.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as { moduleId?: unknown; resourceId?: unknown; bulk?: unknown } | null
  const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : null
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId : null
  const bulk = body?.bulk === true

  if (!moduleId && !resourceId) {
    return NextResponse.json({ ok: false, error: 'Module or source id is required.' }, { status: 400 })
  }

  const moduleQuery = supabase
    .from('modules')
    .select('id, course_id, courses!inner(id, user_id)')
  const { data: moduleRow, error: moduleError } = moduleId
    ? await moduleQuery.eq('id', moduleId).eq('courses.user_id', user.id).maybeSingle()
    : { data: null, error: null }

  if (moduleId && (moduleError || !moduleRow)) {
    return NextResponse.json({ ok: false, error: 'Module was not found.' }, { status: 404 })
  }

  let query = supabase.from('module_resources').select('*').order('created_at')
  if (resourceId) query = query.eq('id', resourceId)
  else if (moduleId) query = query.eq('module_id', moduleId)

  const { data: rows, error: resourceError } = await query
  if (resourceError) {
    return NextResponse.json({ ok: false, error: resourceError.message }, { status: 500 })
  }

  const resources = (rows ?? []).map((row) => adaptModuleResourceRow(row as Record<string, unknown>))
  if (resourceId && resources[0]?.courseId) {
    const { data: courseRow } = await supabase
      .from('courses')
      .select('id')
      .eq('id', resources[0].courseId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!courseRow) return NextResponse.json({ ok: false, error: 'You do not have access to this source.' }, { status: 403 })
  }

  const targets = resources.filter((resource) => (
    (!bulk || resource.extractionStatus === 'pending' || resource.extractionStatus === 'metadata_only' || resource.extractionStatus === 'failed')
    && isProcessableReadableSource(resource)
  ))
  const skipped = resources.length - targets.length
  let processed = 0
  let ready = 0
  let failed = 0

  for (const resource of targets) {
    try {
      const result = await reprocessStoredModuleResource(resource, { triggeredBy: 'learn' })
      const { error } = await supabase
        .from('module_resources')
        .update({
          extraction_status: result.update.extractionStatus,
          extracted_text: result.update.extractedText,
          extracted_text_preview: result.update.extractedTextPreview,
          extracted_char_count: result.update.extractedCharCount,
          extraction_error: result.update.extractionError,
          metadata: result.update.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resource.id)

      if (error) {
        failed += 1
        continue
      }

      processed += 1
      if (result.quality.quality === 'strong' || result.quality.quality === 'usable') ready += 1
    } catch {
      failed += 1
    }
  }

  return NextResponse.json({
    ok: true,
    counts: { processed, ready, skipped, failed },
    message: `${processed} processed · ${ready} ready · ${skipped} skipped · ${failed} failed`,
  })
}
