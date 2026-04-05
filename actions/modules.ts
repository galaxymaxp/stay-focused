'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

export async function deleteModule(moduleId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data: moduleRecord, error: moduleLookupError } = await supabase
    .from('modules')
    .select('course_id')
    .eq('id', moduleId)
    .maybeSingle()

  if (moduleLookupError) throw createSupabaseDeleteError('load module before delete', moduleLookupError, { moduleId })

  const courseId = moduleRecord?.course_id ?? null

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

  if (moduleResourcesError) throw createSupabaseDeleteError('delete synced module resources', moduleResourcesError, { moduleId })

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
  const diagnostic = `[Module delete] step=${step} code=${code ?? 'unknown'} message=${message}${details ? ` details=${details}` : ''}${hint ? ` hint=${hint}` : ''}${contextText}`

  console.error(diagnostic)

  if (process.env.NODE_ENV !== 'production') {
    return new Error(diagnostic)
  }

  return new Error(`Module delete failed during ${step}.`)
}
