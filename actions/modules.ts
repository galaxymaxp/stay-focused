'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import { getRequiredSupabaseAuthEnv } from '@/lib/supabase-auth-config'

async function createAuthenticatedClient() {
  const cookieStore = await cookies()
  const { supabaseUrl, supabaseAnonKey } = getRequiredSupabaseAuthEnv()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // setAll may fail in read-only server component contexts
        }
      },
    },
  })
}

export async function deleteModule(moduleId: string) {
  const supabase = await createAuthenticatedClient()

  const { data: moduleRecord, error: moduleLookupError } = await supabase
    .from('modules')
    .select('course_id')
    .eq('id', moduleId)
    .maybeSingle()

  if (moduleLookupError) throw createSupabaseDeleteError('load module before delete', moduleLookupError, { moduleId })

  const courseId = moduleRecord?.course_id ?? null

  const { error: deepLearnNotesError } = await supabase
    .from('deep_learn_notes')
    .delete()
    .eq('module_id', moduleId)

  if (deepLearnNotesError) {
    if (isMissingSchemaObjectError(deepLearnNotesError)) {
      logOptionalTableMismatch('deep_learn_notes', deepLearnNotesError, { moduleId })
    } else {
      throw createSupabaseDeleteError('delete deep learn notes', deepLearnNotesError, { moduleId })
    }
  }

  const { error: studyStateError } = await supabase
    .from('module_resource_study_state')
    .delete()
    .eq('module_id', moduleId)

  if (studyStateError) {
    if (isMissingSchemaObjectError(studyStateError)) {
      logOptionalTableMismatch('module_resource_study_state', studyStateError, { moduleId })
    } else {
      throw createSupabaseDeleteError('delete module resource study state', studyStateError, { moduleId })
    }
  }

  const { error: learningItemsError } = await supabase
    .from('learning_items')
    .delete()
    .eq('module_id', moduleId)

  if (learningItemsError) throw createSupabaseDeleteError('delete synced learning items', learningItemsError, { moduleId })

  const { error: taskItemsError } = await supabase
    .from('task_items')
    .delete()
    .eq('module_id', moduleId)

  if (taskItemsError) throw createSupabaseDeleteError('delete synced task items', taskItemsError, { moduleId })

  const { error: moduleResourcesError } = await supabase
    .from('module_resources')
    .delete()
    .eq('module_id', moduleId)

  if (moduleResourcesError) {
    if (isMissingSchemaObjectError(moduleResourcesError)) {
      logOptionalTableMismatch('module_resources', moduleResourcesError, { moduleId })
    } else {
      throw createSupabaseDeleteError('delete synced module resources', moduleResourcesError, { moduleId })
    }
  }

  const { error } = await supabase
    .from('modules')
    .delete()
    .eq('id', moduleId)

  if (error) throw createSupabaseDeleteError('delete module', error, { moduleId })

  if (courseId) {
    const { count, error: siblingCountError } = await supabase
      .from('modules')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId)

    if (siblingCountError) throw createSupabaseDeleteError('check remaining modules for course cleanup', siblingCountError, { courseId, moduleId })

    if ((count ?? 0) === 0) {
      const { error: courseDeleteError } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId)

      if (courseDeleteError) throw createSupabaseDeleteError('clean up synced course', courseDeleteError, { courseId, moduleId })
    }
  }

  revalidatePath('/canvas')
  revalidatePath('/')
  revalidatePath('/courses')
  revalidatePath('/learn')
  revalidatePath('/do')
  revalidatePath('/calendar')
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath(`/modules/${moduleId}/learn`)
  revalidatePath(`/modules/${moduleId}/source`)
  revalidatePath(`/modules/${moduleId}/do`)
}

export async function setModuleLearnVisibility(input: { moduleId: string; showInLearn: boolean }) {
  const supabase = await createAuthenticatedClient()

  const { error } = await supabase
    .from('modules')
    .update({ show_in_learn: input.showInLearn })
    .eq('id', input.moduleId)

  if (error) throw createSupabaseDeleteError('update module learn visibility', error, input)

  revalidatePath('/')
  revalidatePath('/courses')
  revalidatePath('/learn')
  revalidatePath(`/modules/${input.moduleId}`)
  revalidatePath(`/modules/${input.moduleId}/learn`)
  revalidatePath(`/modules/${input.moduleId}/review`)
  revalidatePath(`/modules/${input.moduleId}/source`)
  revalidatePath(`/modules/${input.moduleId}/do`)
}

type SupabaseLikeError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function createSupabaseDeleteError(step: string, error: SupabaseLikeError | null | undefined, context?: Record<string, unknown>) {
  const code = error?.code ?? null
  const message = error?.message ?? 'Unknown Supabase error.'
  const details = error?.details ?? null
  const hint = error?.hint ?? null
  const contextText = context ? ` context=${JSON.stringify(context)}` : ''
  const migrationHelp = isMissingSchemaObjectError(error)
    ? ' Missing newer schema objects in the connected Supabase project. Apply supabase/migrations/20260405_add_module_resources.sql and refresh the PostgREST schema cache.'
    : ''
  const diagnostic = `[Module delete] step=${step} code=${code ?? 'unknown'} message=${message}${details ? ` details=${details}` : ''}${hint ? ` hint=${hint}` : ''}${migrationHelp}${contextText}`

  console.error(diagnostic)

  if (process.env.NODE_ENV !== 'production') {
    return new Error(diagnostic)
  }

  return new Error(isMissingSchemaObjectError(error)
    ? 'Module delete hit a schema mismatch in Supabase. Apply the latest migration and retry.'
    : `Module delete failed during ${step}.`)
}

function isMissingSchemaObjectError(error: SupabaseLikeError | null | undefined) {
  return error?.code === 'PGRST205'
}

function logOptionalTableMismatch(table: string, error: SupabaseLikeError, context?: Record<string, unknown>) {
  const projectHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
    : 'unknown-supabase-host'
  const contextText = context ? ` context=${JSON.stringify(context)}` : ''
  console.warn(
    `[Module delete] optional table "${table}" is missing in ${projectHost}. ` +
    `Continuing delete without that cleanup step. Apply supabase/migrations/20260405_add_module_resources.sql and refresh PostgREST schema cache.${contextText} ` +
    `code=${error.code ?? 'unknown'} message=${error.message ?? 'Unknown Supabase error.'}`
  )
}
