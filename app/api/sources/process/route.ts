import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'
import { adaptModuleResourceRow } from '@/lib/module-resource-row'
import { formatSourceProcessingSummary, isProcessableReadableSource, normalizeSourceProcessingResult } from '@/lib/source-processing'
import { CANVAS_RECONNECT_MESSAGE, resolveStoredCanvasConfigForUserResource } from '@/lib/canvas-user-config'
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
  let empty = 0
  let failed = 0
  const touchedResourceIds: string[] = []

  for (const resource of targets) {
    try {
      const canvasConfig = await resolveStoredCanvasConfigForUserResource(user.id, {
        canvasInstanceUrl: resource.canvasInstanceUrl,
      })
      const result = await reprocessStoredModuleResource(resource, {
        triggeredBy: 'learn',
        ...(canvasConfig ? { canvasConfig } : {}),
      })
      const normalized = normalizeSourceProcessingResult({
        resource,
        extractionStatus: result.update.extractionStatus,
        extractedText: result.update.extractedText,
        extractedTextPreview: result.update.extractedTextPreview,
        extractedCharCount: result.update.extractedCharCount,
        extractionError: result.update.extractionError,
        metadata: result.update.metadata,
      })
      const { error } = await supabase
        .from('module_resources')
        .update({
          extraction_status: normalized.extractionStatus,
          extracted_text: normalized.extractedText,
          extracted_text_preview: normalized.extractedTextPreview,
          extracted_char_count: normalized.extractedCharCount,
          extraction_error: normalized.extractionError,
          visual_extraction_status: result.update.visualExtractionStatus,
          visual_extracted_text: result.update.visualExtractedText,
          visual_extraction_error: result.update.visualExtractionError,
          page_count: result.update.pageCount,
          pages_processed: result.update.pagesProcessed,
          extraction_provider: result.update.extractionProvider,
          metadata: normalized.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resource.id)

      if (error) {
        console.error('[sources/process] persist_failed', {
          resourceId: resource.id,
          moduleId: resource.moduleId,
          canvasCourseId: resource.canvasCourseId,
          canvasFileId: resource.canvasFileId,
          failureCategory: 'database_update_failed',
          message: error.message,
        })
        failed += 1
        continue
      }

      processed += 1
      touchedResourceIds.push(resource.id)
      if (normalized.outcome === 'failed' || normalized.outcome === 'empty') {
        console.warn('[sources/process] resource_not_ready', buildSourceProcessDiagnostic({
          resource,
          canvasConfigResolved: Boolean(canvasConfig),
          normalized,
          result,
        }))
      } else {
        console.info('[sources/process] resource_ready', {
          resourceId: resource.id,
          moduleId: resource.moduleId,
          canvasCourseId: resource.canvasCourseId,
          canvasFileId: resource.canvasFileId,
          extractedCharCount: normalized.extractedCharCount,
          extractionStatus: normalized.extractionStatus,
        })
      }
      if (normalized.outcome === 'ready') ready += 1
      if (normalized.outcome === 'empty') empty += 1
      if (normalized.outcome === 'failed') failed += 1
    } catch (error) {
      const safeError = error instanceof Error && error.message.trim()
        ? error.message.replace(/\s+/g, ' ').trim()
        : 'Deep Learn could not process this source.'
      const canvasConfig = await resolveStoredCanvasConfigForUserResource(user.id, {
        canvasInstanceUrl: resource.canvasInstanceUrl,
      })
      console.error('[sources/process] resource_exception', {
        resourceId: resource.id,
        moduleId: resource.moduleId,
        canvasCourseId: resource.canvasCourseId,
        canvasFileId: resource.canvasFileId,
        canvasConfigResolved: Boolean(canvasConfig),
        failureCategory: classifySourceProcessFailure({
          resource,
          canvasConfigResolved: Boolean(canvasConfig),
          extractionStatus: 'failed',
          extractionError: safeError,
          extractedCharCount: 0,
        }),
        message: safeError,
      })
      await supabase
        .from('module_resources')
        .update({
          extraction_status: 'failed',
          extracted_text: null,
          extracted_text_preview: null,
          extracted_char_count: 0,
          extraction_error: safeError,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resource.id)
      processed += 1
      failed += 1
      touchedResourceIds.push(resource.id)
    }
  }

  revalidateSourceProcessingPaths({
    moduleId: moduleId ?? resources[0]?.moduleId ?? null,
    courseId: typeof moduleRow?.course_id === 'string' ? moduleRow.course_id : resources[0]?.courseId ?? null,
    resourceIds: touchedResourceIds,
  })

  const counts = { processed, ready, empty, skipped, failed }

  return NextResponse.json({
    ok: true,
    counts,
    message: formatSourceProcessingSummary(counts),
  })
}

function buildSourceProcessDiagnostic(input: {
  resource: ReturnType<typeof adaptModuleResourceRow>
  canvasConfigResolved: boolean
  normalized: ReturnType<typeof normalizeSourceProcessingResult>
  result: Awaited<ReturnType<typeof reprocessStoredModuleResource>>
}) {
  return {
    resourceId: input.resource.id,
    moduleId: input.resource.moduleId,
    canvasCourseId: input.resource.canvasCourseId,
    canvasFileId: input.resource.canvasFileId,
    sourceUrlHost: safeUrlHost(input.resource.sourceUrl),
    htmlUrlHost: safeUrlHost(input.resource.htmlUrl),
    canvasConfigResolved: input.canvasConfigResolved,
    extractionStatus: input.normalized.extractionStatus,
    extractedCharCount: input.normalized.extractedCharCount,
    visualExtractionStatus: input.result.update.visualExtractionStatus,
    failureCategory: classifySourceProcessFailure({
      resource: input.resource,
      canvasConfigResolved: input.canvasConfigResolved,
      extractionStatus: input.normalized.extractionStatus,
      extractionError: input.normalized.extractionError,
      extractedCharCount: input.normalized.extractedCharCount,
    }),
    pdfExtraction: readPlainRecord(input.result.update.metadata?.pdfExtraction),
  }
}

function classifySourceProcessFailure(input: {
  resource: ReturnType<typeof adaptModuleResourceRow>
  canvasConfigResolved: boolean
  extractionStatus: string | null
  extractionError: string | null
  extractedCharCount: number
}) {
  const errorText = input.extractionError?.toLowerCase() ?? ''
  if (!input.canvasConfigResolved && looksLikeCanvasFileResource(input.resource)) return 'missing_canvas_credentials'
  if (!input.resource.canvasFileId && looksLikeCanvasFileResource(input.resource)) return 'missing_canvas_file_identity'
  if (errorText.includes(CANVAS_RECONNECT_MESSAGE.toLowerCase())) return 'missing_canvas_credentials'
  if (errorText.includes('did not return a pdf') || errorText.includes('not a readable pdf')) return 'non_pdf_response'
  if (input.extractionStatus === 'failed') return 'pdf_extraction_exception'
  if (input.extractedCharCount < 120) return 'extracted_text_too_short'
  return 'unknown'
}

function looksLikeCanvasFileResource(resource: ReturnType<typeof adaptModuleResourceRow>) {
  return resource.extension === 'pdf'
    || resource.contentType?.toLowerCase().includes('pdf')
    || /instructure\.com/i.test(resource.canvasInstanceUrl ?? '')
}

function readPlainRecord(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...value as Record<string, unknown> }
    : null
}

function safeUrlHost(value: string | null) {
  if (!value) return null
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

function revalidateSourceProcessingPaths(input: {
  moduleId: string | null
  courseId: string | null
  resourceIds: string[]
}) {
  revalidatePath('/')
  revalidatePath('/home')
  revalidatePath('/learn')
  revalidatePath('/courses')
  revalidatePath('/library')
  if (input.courseId) revalidatePath(`/courses/${input.courseId}`)
  if (input.moduleId) {
    revalidatePath(`/modules/${input.moduleId}/learn`)
    revalidatePath(`/modules/${input.moduleId}/review`)
    revalidatePath(`/modules/${input.moduleId}/quiz`)
    revalidatePath(`/modules/${input.moduleId}/inspect`)
    for (const resourceId of input.resourceIds) {
      revalidatePath(`/modules/${input.moduleId}/learn/resources/${encodeURIComponent(resourceId)}`)
    }
  }
}
