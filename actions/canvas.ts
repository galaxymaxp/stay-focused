'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  getCourses,
  getAssignments,
  getAnnouncements,
  getModules,
  compileCanvasContent,
  type CanvasCourse,
} from '@/lib/canvas'
import { processModuleContent } from '@/lib/openai'
import { supabase } from '@/lib/supabase'

export async function fetchCourses(): Promise<CanvasCourse[]> {
  return getCourses()
}

export async function syncCourse(formData: FormData): Promise<{ error: string } | void> {
  const courseId = Number(formData.get('courseId'))
  const courseName = formData.get('courseName') as string
  const courseCode = (formData.get('courseCode') as string | null)?.trim() ?? ''

  if (!courseId) {
    return { error: 'No course selected.' }
  }

  const [assignments, announcements, modules] = await Promise.all([
    getAssignments(courseId),
    getAnnouncements(courseId),
    getModules(courseId),
  ])

  if (assignments.length === 0 && announcements.length === 0 && modules.length === 0) {
    return { error: 'Canvas returned no assignments, announcements, or modules for this course.' }
  }

  const course = {
    id: courseId,
    name: courseName,
    course_code: courseCode,
    enrollment_state: 'active',
  }
  const rawContent = compileCanvasContent(course, assignments, announcements, modules)
  const coursePrefix = `Course: ${courseName} (${courseCode})`

  const { data: existingModule, error: existingModuleError } = await supabase
    .from('modules')
    .select('id')
    .ilike('raw_content', `${coursePrefix}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingModuleError) throw new Error('Failed to check existing synced module.')

  let moduleId = existingModule?.id as string | undefined

  if (moduleId) {
    const { error: tasksDeleteError } = await supabase.from('tasks').delete().eq('module_id', moduleId)
    if (tasksDeleteError) throw new Error('Failed to refresh existing synced tasks.')

    const { error: deadlinesDeleteError } = await supabase.from('deadlines').delete().eq('module_id', moduleId)
    if (deadlinesDeleteError) throw new Error('Failed to refresh existing synced deadlines.')

    const { error: moduleRefreshError } = await supabase
      .from('modules')
      .update({
        title: 'Processing...',
        raw_content: rawContent,
        summary: null,
        recommended_order: [],
        status: 'pending',
      })
      .eq('id', moduleId)

    if (moduleRefreshError) throw new Error('Failed to refresh existing synced module.')
  } else {
    const { data: module, error: insertError } = await supabase
      .from('modules')
      .insert({
        title: 'Processing...',
        raw_content: rawContent,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !module) throw new Error('Failed to save module.')
    moduleId = module.id
  }

  if (!moduleId) throw new Error('Failed to determine synced module.')

  let aiResult
  try {
    aiResult = await processModuleContent(rawContent)
  } catch (err) {
    await supabase.from('modules').update({ status: 'error' }).eq('id', moduleId)
    throw new Error(`AI processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  const { error: moduleUpdateError } = await supabase
    .from('modules')
    .update({
      title: aiResult.title,
      summary: aiResult.summary,
      recommended_order: aiResult.recommended_order,
      status: 'processed',
    })
    .eq('id', moduleId)

  if (moduleUpdateError) throw new Error('Failed to save processed module.')

  if (aiResult.tasks.length > 0) {
    const { error: tasksInsertError } = await supabase.from('tasks').insert(
      aiResult.tasks.map((task) => ({
        module_id: moduleId,
        title: task.title,
        details: task.details,
        deadline: task.deadline,
        priority: task.priority,
        status: 'pending',
      }))
    )

    if (tasksInsertError) throw new Error('Failed to save synced tasks.')
  }

  if (aiResult.deadlines.length > 0) {
    const { error: deadlinesInsertError } = await supabase.from('deadlines').insert(
      aiResult.deadlines.map((d) => ({
        module_id: moduleId,
        label: d.label,
        date: d.date,
      }))
    )

    if (deadlinesInsertError) throw new Error('Failed to save synced deadlines.')
  }

  revalidatePath('/')
  revalidatePath('/canvas')
  redirect(`/modules/${moduleId}`)
}
