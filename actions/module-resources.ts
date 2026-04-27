'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adaptModuleResourceRow } from '@/lib/module-resource-row'
import { reprocessStoredModuleResource, shouldReprocessWeakModuleResource } from '@/lib/module-resource-reprocess'
import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'

type ReprocessScope = 'all' | 'weak' | 'single'

export async function reprocessModuleResourcesAction(formData: FormData) {
  const moduleId = getRequiredValue(formData, 'moduleId')
  const returnPath = getOptionalValue(formData, 'returnPath') || `/modules/${moduleId}/inspect`
  const resourceId = getOptionalValue(formData, 'resourceId')
  const courseId = getOptionalValue(formData, 'courseId')
  const scope = normalizeScope(getOptionalValue(formData, 'scope'))
  const triggeredBy = normalizeTriggeredBy(getOptionalValue(formData, 'triggeredBy'))

  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) {
    redirect(appendNotice(returnPath, {
      reprocess: 'error',
      message: 'Supabase is not configured.',
    }))
  }

  try {
    let query = supabase
      .from('module_resources')
      .select('*')
      .eq('module_id', moduleId)
      .order('created_at')

    if (scope === 'single' && resourceId) {
      query = query.eq('id', resourceId)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to load module resources: ${error.message}`)
    }

    const resources = (data ?? []).map((row) => adaptModuleResourceRow(row as Record<string, unknown>))
    const targets = scope === 'weak'
      ? resources.filter(shouldReprocessWeakModuleResource)
      : resources

    if (targets.length === 0) {
      redirect(appendNotice(returnPath, {
        reprocess: 'skipped',
        count: '0',
        scope,
      }))
    }

    for (const resource of targets) {
      const result = await reprocessStoredModuleResource(resource, {
        triggeredBy,
      })

      const { error: updateError } = await supabase
        .from('module_resources')
        .update({
          extraction_status: result.update.extractionStatus,
          extracted_text: result.update.extractedText,
          extracted_text_preview: result.update.extractedTextPreview,
          extracted_char_count: result.update.extractedCharCount,
          extraction_error: result.update.extractionError,
          visual_extraction_status: result.update.visualExtractionStatus,
          visual_extracted_text: result.update.visualExtractedText,
          visual_extraction_error: result.update.visualExtractionError,
          page_count: result.update.pageCount,
          pages_processed: result.update.pagesProcessed,
          extraction_provider: result.update.extractionProvider,
          metadata: result.update.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resource.id)

      if (updateError) {
        throw new Error(`Failed to update ${resource.title}: ${updateError.message}`)
      }
    }

    revalidateModuleResourcePaths(moduleId, courseId, targets.map((resource) => resource.id))

    redirect(appendNotice(returnPath, {
      reprocess: 'done',
      count: String(targets.length),
      scope,
    }))
  } catch (error) {
    redirect(appendNotice(returnPath, {
      reprocess: 'error',
      message: error instanceof Error ? error.message : 'Resource reprocess failed.',
    }))
  }
}

function revalidateModuleResourcePaths(moduleId: string, courseId: string | null, resourceIds: string[]) {
  revalidatePath('/learn')
  revalidatePath('/courses')
  if (courseId) {
    revalidatePath(`/courses/${courseId}`)
  }
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath(`/modules/${moduleId}/learn`)
  revalidatePath(`/modules/${moduleId}/do`)
  revalidatePath(`/modules/${moduleId}/quiz`)
  revalidatePath(`/modules/${moduleId}/review`)
  revalidatePath(`/modules/${moduleId}/inspect`)

  for (const resourceId of resourceIds) {
    revalidatePath(`/modules/${moduleId}/learn/resources/${encodeURIComponent(resourceId)}`)
  }
}

function appendNotice(pathname: string, params: Record<string, string>) {
  const url = new URL(pathname, 'http://localhost')

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  return `${url.pathname}${url.search}${url.hash}`
}

function getRequiredValue(formData: FormData, key: string) {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required form field: ${key}`)
  }

  return value.trim()
}

function getOptionalValue(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeScope(value: string | null): ReprocessScope {
  return value === 'single' || value === 'weak' || value === 'all'
    ? value
    : 'weak'
}

function normalizeTriggeredBy(value: string | null) {
  return value === 'inspect' || value === 'resource_detail' || value === 'learn'
    ? value
    : 'inspect'
}
