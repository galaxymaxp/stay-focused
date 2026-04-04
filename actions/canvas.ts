'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  compileCanvasContent,
  getAnnouncements,
  getAssignments,
  getCourses,
  getModules,
  normalizeCanvasUrl,
  type CanvasConfig,
  type CanvasCourse,
} from '@/lib/canvas'
import { processModuleContent } from '@/lib/openai'
import { supabase } from '@/lib/supabase'

export interface CanvasConnectionResult {
  normalizedUrl: string
  courses: CanvasCourse[]
}

interface SyncCourseInput {
  courseId: number
  courseName: string
  courseCode: string
}

interface SyncCourseResult {
  moduleId: string
  courseName: string
}

interface ExistingModuleMatch {
  id: string
}

export async function fetchCourses(config?: Partial<CanvasConfig>): Promise<CanvasCourse[]> {
  return getCourses(config)
}

export async function testCanvasConnection(input: {
  canvasUrl: string
  accessToken: string
}): Promise<CanvasConnectionResult> {
  const config = getRequiredCanvasConfig(input.canvasUrl, input.accessToken)
  const courses = await getCourses(config)

  return {
    normalizedUrl: config.url,
    courses,
  }
}

export async function syncCourse(formData: FormData): Promise<{ error: string } | void> {
  const courseId = Number(formData.get('courseId'))
  const courseName = formData.get('courseName') as string
  const courseCode = (formData.get('courseCode') as string | null)?.trim() ?? ''
  const config = getCanvasConfig(
    formData.get('canvasUrl') as string | null,
    formData.get('accessToken') as string | null
  )

  if (!courseId) {
    return { error: 'Choose a course before syncing.' }
  }

  const result = await syncSingleCourse({
    id: courseId,
    name: courseName,
    course_code: courseCode,
    enrollment_state: 'active',
  }, config)

  revalidatePath('/')
  revalidatePath('/canvas')
  redirect(`/modules/${result.moduleId}`)
}

export async function syncCourses(input: {
  courses: SyncCourseInput[]
  canvasUrl: string
  accessToken: string
}): Promise<{ success: true; syncedCount: number; syncedCourses: string[] } | { error: string }> {
  const config = getRequiredCanvasConfig(input.canvasUrl, input.accessToken)

  if (input.courses.length === 0) {
    return { error: 'Choose at least one course to sync.' }
  }

  const syncedCourses: string[] = []

  for (const course of input.courses) {
    await syncSingleCourse({
      id: course.courseId,
      name: course.courseName,
      course_code: course.courseCode,
      enrollment_state: 'active',
    }, config)
    syncedCourses.push(course.courseName)
  }

  revalidatePath('/')
  revalidatePath('/canvas')

  return {
    success: true,
    syncedCount: syncedCourses.length,
    syncedCourses,
  }
}

async function syncSingleCourse(course: CanvasCourse, config: Partial<CanvasConfig>): Promise<SyncCourseResult> {
  const [assignments, announcements, modules] = await Promise.all([
    getAssignments(course.id, config),
    getAnnouncements(course.id, config),
    getModules(course.id, config),
  ])

  if (assignments.length === 0 && announcements.length === 0 && modules.length === 0) {
    throw new Error(`Canvas did not return any assignments, announcements, or module content for ${course.name} yet.`)
  }

  const rawContent = compileCanvasContent(course, assignments, announcements, modules)
  const existingModule = await findExistingSyncedModule(course.name, course.course_code)
  if (existingModule) {
    throw new Error(`${course.name} is already synced. Unsync it first if you want to connect it again.`)
  }

  const { data: moduleRecord, error: insertError } = await supabase
    .from('modules')
    .insert({
      title: 'Processing...',
      raw_content: rawContent,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !moduleRecord) throw new Error('Failed to save module.')
  const moduleId = moduleRecord.id

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
      aiResult.deadlines.map((deadline) => ({
        module_id: moduleId,
        label: deadline.label,
        date: deadline.date,
      }))
    )

    if (deadlinesInsertError) throw new Error('Failed to save synced deadlines.')
  }

  return {
    moduleId,
    courseName: course.name,
  }
}

async function findExistingSyncedModule(courseName: string, courseCode: string): Promise<ExistingModuleMatch | null> {
  const coursePrefix = `Course: ${courseName} (${courseCode})`

  const { data, error } = await supabase
    .from('modules')
    .select('id')
    .ilike('raw_content', `${coursePrefix}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('Failed to check existing synced module.')
  return (data as ExistingModuleMatch | null) ?? null
}

function getCanvasConfig(canvasUrl: string | null | undefined, accessToken: string | null | undefined): Partial<CanvasConfig> {
  const trimmedUrl = canvasUrl?.trim()
  const trimmedToken = accessToken?.trim()

  if (!trimmedUrl && !trimmedToken) {
    return {}
  }

  if (!trimmedUrl || !trimmedToken) {
    throw new Error('Please enter both your Canvas URL and access token.')
  }

  return {
    url: normalizeCanvasUrl(trimmedUrl),
    token: trimmedToken,
  }
}

function getRequiredCanvasConfig(canvasUrl: string | null | undefined, accessToken: string | null | undefined): CanvasConfig {
  const config = getCanvasConfig(canvasUrl, accessToken)

  if (!config.url || !config.token) {
    throw new Error('Please enter both your Canvas URL and access token.')
  }

  return {
    url: config.url,
    token: config.token,
  }
}
