import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'
import { resolveCanvasConfig, type CanvasConfig } from '@/lib/canvas'
import { adaptModuleResourceRow } from '@/lib/module-resource-row'
import { extractScannedPdfTextWithOpenAI } from '@/lib/extraction/pdf-ocr'
import {
  buildOcrCompletedUpdate,
  buildOcrFailedUpdate,
  buildOcrProcessingUpdate,
  isOcrAlreadyCompleted,
  isOcrAlreadyRunning,
  isScannedPdfOcrCandidate,
} from '@/lib/source-ocr-updates'
import type { ModuleResource } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Sign in before extracting text from images.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as { resourceId?: unknown; moduleId?: unknown } | null
  const resourceId = typeof body?.resourceId === 'string' && body.resourceId.trim() ? body.resourceId.trim() : null
  const moduleId = typeof body?.moduleId === 'string' && body.moduleId.trim() ? body.moduleId.trim() : null

  if (!resourceId) {
    return NextResponse.json({ ok: false, error: 'Source id is required for OCR.' }, { status: 400 })
  }

  const { data: row, error: resourceError } = await supabase
    .from('module_resources')
    .select('*, courses!inner(id, user_id)')
    .eq('id', resourceId)
    .eq('courses.user_id', user.id)
    .maybeSingle()

  if (resourceError) {
    return NextResponse.json({ ok: false, error: resourceError.message }, { status: 500 })
  }

  if (!row) {
    return NextResponse.json({ ok: false, error: 'You do not have access to this source.' }, { status: 404 })
  }

  const resource = adaptModuleResourceRow(row as Record<string, unknown>)
  if (isOcrAlreadyCompleted(resource)) {
    return NextResponse.json({
      ok: true,
      status: 'completed',
      message: 'OCR is already complete.',
      charCount: resource.extractedCharCount,
    })
  }

  if (isOcrAlreadyRunning(resource)) {
    return NextResponse.json({
      ok: false,
      status: 'running',
      error: 'OCR is already running for this PDF.',
    }, { status: 409 })
  }

  if (!isScannedPdfOcrCandidate(resource)) {
    return NextResponse.json({
      ok: false,
      error: 'OCR is only available for scanned PDFs with no selectable text.',
    }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error: processingError } = await supabase
    .from('module_resources')
    .update(buildOcrProcessingUpdate({ resource, now }))
    .eq('id', resource.id)

  if (processingError) {
    return NextResponse.json({ ok: false, error: processingError.message }, { status: 500 })
  }

  try {
    const canvasConfig = getOptionalCanvasConfig()
    const sourceUrl = resource.sourceUrl ?? resource.htmlUrl
    if (!sourceUrl) {
      throw new Error('No downloadable PDF source is stored for this item. Open the original file.')
    }

    const buffer = await downloadStoredPdf(sourceUrl, canvasConfig)
    const ocr = await extractScannedPdfTextWithOpenAI({
      buffer,
      filename: resource.title || 'scanned-pdf.pdf',
      pageCount: resource.pageCount ?? null,
    })

    if (ocr.status === 'completed') {
      const { error: updateError } = await supabase
        .from('module_resources')
        .update(buildOcrCompletedUpdate({ resource, ocr, now: new Date().toISOString() }))
        .eq('id', resource.id)

      if (updateError) throw new Error(updateError.message)
      revalidateOcrPaths(resource, moduleId)

      return NextResponse.json({
        ok: true,
        status: 'completed',
        message: 'OCR complete.',
        charCount: ocr.charCount,
      })
    }

    await markOcrFailed(supabase, resource, ocr.error ?? 'OCR failed. Open the original file.', ocr.metadata, ocr.provider)
    revalidateOcrPaths(resource, moduleId)
    return NextResponse.json({ ok: false, status: 'failed', error: ocr.error ?? 'OCR failed. Open the original file.' }, { status: 422 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR failed. Open the original file.'
    await markOcrFailed(supabase, resource, message)
    revalidateOcrPaths(resource, moduleId)
    return NextResponse.json({ ok: false, status: 'failed', error: message }, { status: 500 })
  }
}

async function markOcrFailed(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
  resource: ModuleResource,
  message: string,
  ocrMetadata: Record<string, unknown> = {},
  provider: string | null = null,
) {
  await supabase
    .from('module_resources')
    .update(buildOcrFailedUpdate({ resource, message, ocrMetadata, provider, now: new Date().toISOString() }))
    .eq('id', resource.id)
}

async function downloadStoredPdf(url: string, canvasConfig: CanvasConfig | null) {
  const resolvedUrl = await resolveStoredBinaryUrl(url, canvasConfig)
  const response = await fetchStoredSource(resolvedUrl, canvasConfig)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const buffer = Buffer.from(await response.arrayBuffer())

  if (!contentType.includes('pdf') && !buffer.subarray(0, 5).toString('utf8').startsWith('%PDF-')) {
    throw new Error('The stored source did not return a PDF file. Open the original file.')
  }

  return buffer
}

async function resolveStoredBinaryUrl(url: string, canvasConfig: CanvasConfig | null) {
  const absoluteUrl = resolveStoredUrl(url, canvasConfig)
  const parsed = new URL(absoluteUrl)
  const normalizedPathname = parsed.pathname.replace(/\/$/, '')

  if (/\/api\/v1\/(?:courses\/\d+\/)?files\/\d+$/i.test(normalizedPathname)) {
    const response = await fetchStoredSource(absoluteUrl, canvasConfig)
    const file = await response.json().catch(() => null) as { url?: string | null } | null
    if (!file?.url) {
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

async function fetchStoredSource(url: string, canvasConfig: CanvasConfig | null) {
  const absoluteUrl = resolveStoredUrl(url, canvasConfig)
  const response = await fetch(absoluteUrl, {
    headers: buildStoredSourceHeaders(absoluteUrl, canvasConfig),
    next: { revalidate: 0 },
  })

  if (response.ok) return response

  if (response.status === 401 || response.status === 403) {
    throw new Error('Canvas auth is required to OCR this PDF. Check CANVAS_API_URL and CANVAS_API_TOKEN, or open the original file.')
  }

  if (response.status === 404) {
    throw new Error('The stored PDF no longer resolves. Open the original file.')
  }

  throw new Error(`The stored PDF request failed with HTTP ${response.status}.`)
}

function resolveStoredUrl(url: string, canvasConfig: CanvasConfig | null) {
  try {
    return new URL(url).toString()
  } catch {
    if (!canvasConfig) {
      throw new Error('This stored source URL is relative, but no Canvas base URL is configured for OCR.')
    }

    return new URL(url, `${canvasConfig.url}/`).toString()
  }
}

function buildStoredSourceHeaders(url: string, canvasConfig: CanvasConfig | null) {
  if (!canvasConfig) return undefined

  const targetHost = new URL(url).host
  const canvasHost = new URL(`${canvasConfig.url}/`).host
  if (targetHost !== canvasHost) return undefined

  return {
    Authorization: `Bearer ${canvasConfig.token}`,
  }
}

function getOptionalCanvasConfig() {
  const hasEnvConfig = Boolean((process.env.CANVAS_API_URL ?? process.env.CANVAS_API_BASE_URL)?.trim() && process.env.CANVAS_API_TOKEN?.trim())
  if (!hasEnvConfig) return null

  try {
    return resolveCanvasConfig()
  } catch {
    return null
  }
}

function revalidateOcrPaths(resource: ModuleResource, requestedModuleId: string | null) {
  const moduleId = requestedModuleId ?? resource.moduleId
  revalidatePath('/learn')
  revalidatePath('/courses')
  if (resource.courseId) revalidatePath(`/courses/${resource.courseId}`)
  if (!moduleId) return
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath(`/modules/${moduleId}/learn`)
  revalidatePath(`/modules/${moduleId}/review`)
  revalidatePath(`/modules/${moduleId}/quiz`)
  revalidatePath(`/modules/${moduleId}/learn/resources/${encodeURIComponent(resource.id)}`)
  revalidatePath(`/modules/${moduleId}/learn/notes/${encodeURIComponent(resource.id)}`)
}
