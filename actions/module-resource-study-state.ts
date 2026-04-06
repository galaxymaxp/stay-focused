'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import type { ModuleResourceWorkflowOverride, StudyFileProgressStatus } from '@/lib/types'

const TABLE_NAME = 'module_resource_study_state'

export async function setStudyFileProgress(input: {
  moduleId: string
  resourceId: string
  progressStatus: StudyFileProgressStatus
  courseId?: string
}) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert({
      module_id: input.moduleId,
      resource_id: input.resourceId,
      study_progress_status: input.progressStatus,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'module_id,resource_id' })

  if (error) throw createStudyStateError('update study progress', error, input)

  revalidateStudyPaths(input.moduleId, input.resourceId, input.courseId)
}

export async function setStudyFileWorkflowOverride(input: {
  moduleId: string
  resourceId: string
  workflowOverride: ModuleResourceWorkflowOverride
  courseId?: string
}) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert({
      module_id: input.moduleId,
      resource_id: input.resourceId,
      workflow_override: input.workflowOverride,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'module_id,resource_id' })

  if (error) throw createStudyStateError('update study workflow override', error, input)

  revalidateStudyPaths(input.moduleId, input.resourceId, input.courseId)
}

export async function markStudyFileOpened(input: {
  moduleId: string
  resourceId: string
  courseId?: string
}) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const now = new Date().toISOString()
  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert({
      module_id: input.moduleId,
      resource_id: input.resourceId,
      last_opened_at: now,
      updated_at: now,
    }, { onConflict: 'module_id,resource_id' })

  if (error) throw createStudyStateError('mark study file opened', error, input)

  revalidatePath('/learn')
  revalidatePath('/courses')
  if (input.courseId) {
    revalidatePath(`/courses/${input.courseId}/learn`)
  }
  revalidatePath(`/modules/${input.moduleId}/learn`)
  revalidatePath(`/modules/${input.moduleId}/review`)
  revalidatePath(`/modules/${input.moduleId}/source`)
}

type SupabaseLikeError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function revalidateStudyPaths(moduleId: string, resourceId: string, courseId?: string) {
  revalidatePath('/learn')
  revalidatePath('/courses')
  if (courseId) {
    revalidatePath(`/courses/${courseId}/learn`)
  }
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath(`/modules/${moduleId}/learn`)
  revalidatePath(`/modules/${moduleId}/review`)
  revalidatePath(`/modules/${moduleId}/source`)
  revalidatePath(`/modules/${moduleId}/learn/resources/${encodeURIComponent(resourceId)}`)
}

function createStudyStateError(step: string, error: SupabaseLikeError | null | undefined, context?: Record<string, unknown>) {
  const code = error?.code ?? null
  const message = error?.message ?? 'Unknown Supabase error.'
  const details = error?.details ?? null
  const hint = error?.hint ?? null
  const contextText = context ? ` context=${JSON.stringify(context)}` : ''
  const migrationHelp = isMissingSchemaObjectError(error)
    ? ' Missing newer schema objects in the connected Supabase project. Apply supabase/migrations/20260406_add_module_resource_study_state.sql and supabase/migrations/20260407_add_module_resource_study_last_opened_at.sql, then refresh the PostgREST schema cache.'
    : ''
  const diagnostic = `[Study state] step=${step} code=${code ?? 'unknown'} message=${message}${details ? ` details=${details}` : ''}${hint ? ` hint=${hint}` : ''}${migrationHelp}${contextText}`

  console.error(diagnostic)

  if (process.env.NODE_ENV !== 'production') {
    return new Error(diagnostic)
  }

  return new Error(isMissingSchemaObjectError(error)
    ? 'Study progress hit a schema mismatch in Supabase. Apply the latest migration and retry.'
    : `Study progress could not be saved during ${step}.`)
}

function isMissingSchemaObjectError(error: SupabaseLikeError | null | undefined) {
  return error?.code === 'PGRST204' || error?.code === 'PGRST205'
}
