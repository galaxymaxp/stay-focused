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
import { dedupeAIResponseDeadlines } from '@/lib/course-work-dedupe'
import { processModuleContent } from '@/lib/openai'
import { supabase } from '@/lib/supabase'
import type { AIResponse, Course, Priority, TaskItem } from '@/lib/types'

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

interface ExistingCourseMatch {
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
  if (!supabase) {
    return { error: 'Supabase is not configured yet.' }
  }

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
  if (!supabase) {
    return { error: 'Supabase is not configured yet.' }
  }

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
  if (!supabase) throw new Error('Supabase is not configured yet.')

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

  const courseRecord = await ensureCourseRecord(course)

  const { data: moduleRecord, error: insertError } = await supabase
    .from('modules')
    .insert({
      course_id: courseRecord.id,
      title: 'Processing...',
      raw_content: rawContent,
      status: 'pending',
      order: 1,
      released_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !moduleRecord) {
    throw createSupabaseStepError('insert module', insertError, {
      courseId: courseRecord.id,
      canvasCourseCode: course.course_code,
      canvasCourseName: course.name,
    })
  }
  const moduleId = moduleRecord.id

  if (!moduleId) throw new Error('Failed to determine synced module.')

  let aiResult
  try {
    aiResult = await processModuleContent(rawContent)
  } catch (err) {
    const { error: markError } = await supabase.from('modules').update({ status: 'error' }).eq('id', moduleId)
    if (markError) {
      console.error(createSupabaseStepError('mark module as error', markError, { moduleId }).message)
    }
    throw new Error(`AI processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  const standaloneDeadlines = dedupeAIResponseDeadlines(aiResult.tasks, aiResult.deadlines)

  const { error: moduleUpdateError } = await supabase
    .from('modules')
    .update({
      title: aiResult.title,
      summary: aiResult.summary,
      concepts: aiResult.concepts,
      study_prompts: aiResult.study_prompts,
      recommended_order: aiResult.recommended_order,
      status: 'processed',
      estimated_minutes: estimateModuleMinutes(aiResult),
      priority_signal: deriveModulePrioritySignal(aiResult),
    })
    .eq('id', moduleId)

  if (moduleUpdateError) {
    throw createSupabaseStepError('update processed module', moduleUpdateError, { moduleId, title: aiResult.title })
  }

  const learningItems = buildLearningItemsForSync(aiResult, courseRecord.id, moduleId)
  if (learningItems.length > 0) {
    const { error: learningItemsError } = await supabase
      .from('learning_items')
      .insert(learningItems)

    if (learningItemsError) {
      throw createSupabaseStepError('insert learning items', learningItemsError, {
        moduleId,
        learningItemCount: learningItems.length,
      })
    }
  }

  const clarityTaskItems = buildTaskItemsForSync(aiResult, {
    courseId: courseRecord.id,
    moduleId,
    extractedFrom: aiResult.title,
  })

  if (clarityTaskItems.length > 0) {
    const { error: taskItemsError } = await supabase
      .from('task_items')
      .insert(clarityTaskItems)

    if (taskItemsError) {
      throw createSupabaseStepError('insert task items', taskItemsError, {
        moduleId,
        taskItemCount: clarityTaskItems.length,
      })
    }
  }

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

    if (tasksInsertError) {
      throw createSupabaseStepError('insert legacy tasks', tasksInsertError, {
        moduleId,
        taskCount: aiResult.tasks.length,
      })
    }
  }

  if (standaloneDeadlines.length > 0) {
    const { error: deadlinesInsertError } = await supabase.from('deadlines').insert(
      standaloneDeadlines.map((deadline) => ({
        module_id: moduleId,
        label: deadline.label,
        date: deadline.date,
      }))
    )

    if (deadlinesInsertError) {
      throw createSupabaseStepError('insert legacy deadlines', deadlinesInsertError, {
        moduleId,
        deadlineCount: standaloneDeadlines.length,
      })
    }
  }

  return {
    moduleId,
    courseName: course.name,
  }
}

async function findExistingSyncedModule(courseName: string, courseCode: string): Promise<ExistingModuleMatch | null> {
  if (!supabase) return null

  const coursePrefix = `Course: ${courseName} (${courseCode})`

  const { data, error } = await supabase
    .from('modules')
    .select('id')
    .ilike('raw_content', `${coursePrefix}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw createSupabaseStepError('check existing synced module', error, { courseName, courseCode })
  return (data as ExistingModuleMatch | null) ?? null
}

async function ensureCourseRecord(course: CanvasCourse): Promise<ExistingCourseMatch> {
  if (!supabase) throw new Error('Supabase is not configured yet.')

  const { data: existingCourse, error: existingCourseError } = await supabase
    .from('courses')
    .select('id')
    .eq('code', course.course_code)
    .eq('name', course.name)
    .limit(1)
    .maybeSingle()

  if (existingCourseError) throw createSupabaseStepError('check existing synced course', existingCourseError, {
    courseCode: course.course_code,
    courseName: course.name,
  })
  if (existingCourse) return existingCourse as ExistingCourseMatch

  const { data: insertedCourse, error: insertCourseError } = await supabase
    .from('courses')
    .insert({
      code: course.course_code,
      name: course.name,
      term: course.term?.name ?? 'Current term',
      instructor: 'Canvas course staff',
      focus_label: 'Synced from Canvas',
      color_token: pickCourseColorToken(course.course_code, course.name),
    })
    .select('id')
    .single()

  if (insertCourseError || !insertedCourse) {
    throw createSupabaseStepError('insert course', insertCourseError, {
      courseCode: course.course_code,
      courseName: course.name,
    })
  }
  return insertedCourse as ExistingCourseMatch
}

function buildLearningItemsForSync(aiResult: AIResponse, courseId: string, moduleId: string) {
  const items = [
    aiResult.summary
      ? {
          course_id: courseId,
          module_id: moduleId,
          title: 'What this module is trying to teach',
          body: aiResult.summary,
          type: 'summary',
          order: 0,
        }
      : null,
    ...aiResult.concepts.map((concept, index) => ({
      course_id: courseId,
      module_id: moduleId,
      title: `Key idea ${index + 1}`,
      body: concept,
      type: 'concept',
      order: index + 1,
    })),
    ...aiResult.study_prompts.map((prompt, index) => ({
      course_id: courseId,
      module_id: moduleId,
      title: `Check your understanding ${index + 1}`,
      body: prompt,
      type: 'review',
      order: aiResult.concepts.length + index + 1,
    })),
  ].filter(Boolean)

  return items
}

function buildTaskItemsForSync(
  aiResult: AIResponse,
  context: { courseId: string; moduleId: string; extractedFrom: string },
) {
  return aiResult.tasks.map((task) => ({
    course_id: context.courseId,
    module_id: context.moduleId,
    title: task.title,
    details: task.details,
    status: 'pending',
    priority: task.priority,
    deadline: task.deadline,
    task_type: normalizeTaskTypeForSync(task.task_type, task.title, task.details),
    estimated_minutes: normalizeEstimatedMinutes(task.estimated_minutes, task.priority),
    extracted_from: context.extractedFrom,
  }))
}

function estimateModuleMinutes(aiResult: AIResponse) {
  const learnMinutes = 10 + (aiResult.concepts.length * 5) + (aiResult.study_prompts.length * 4)
  const taskMinutes = aiResult.tasks.reduce((total, task) => total + normalizeEstimatedMinutes(task.estimated_minutes, task.priority), 0)
  return Math.min(180, Math.max(15, Math.round((learnMinutes + taskMinutes) / (aiResult.tasks.length > 0 ? 2 : 1))))
}

function deriveModulePrioritySignal(aiResult: AIResponse): Priority {
  if (aiResult.tasks.some((task) => task.priority === 'high')) return 'high'
  if (aiResult.tasks.some((task) => task.priority === 'medium')) return 'medium'
  return 'low'
}

function normalizeTaskTypeForSync(
  taskType: AIResponse['tasks'][number]['task_type'],
  title: string,
  details: string | null,
): TaskItem['taskType'] {
  if (taskType === 'assignment' || taskType === 'quiz' || taskType === 'reading' || taskType === 'prep' || taskType === 'discussion' || taskType === 'project') {
    return taskType
  }

  const combined = `${title} ${details ?? ''}`.toLowerCase()
  if (combined.includes('quiz')) return 'quiz'
  if (combined.includes('discussion') || combined.includes('response') || combined.includes('reply')) return 'discussion'
  if (combined.includes('read') || combined.includes('chapter') || combined.includes('article')) return 'reading'
  if (combined.includes('project') || combined.includes('implement') || combined.includes('build')) return 'project'
  if (combined.includes('prepare') || combined.includes('draft') || combined.includes('set up') || combined.includes('review')) return 'prep'
  return 'assignment'
}

function normalizeEstimatedMinutes(estimatedMinutes: number | undefined, priority: Priority) {
  if (typeof estimatedMinutes === 'number' && Number.isFinite(estimatedMinutes) && estimatedMinutes > 0) {
    return Math.min(180, Math.max(5, Math.round(estimatedMinutes)))
  }

  if (priority === 'high') return 35
  if (priority === 'medium') return 20
  return 12
}

function pickCourseColorToken(courseCode: string, courseName: string): Course['colorToken'] {
  const seed = `${courseCode}:${courseName}`.length % 4
  if (seed === 0) return 'yellow'
  if (seed === 1) return 'blue'
  if (seed === 2) return 'green'
  return 'orange'
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

type SupabaseLikeError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function createSupabaseStepError(step: string, error: SupabaseLikeError | null | undefined, context?: Record<string, unknown>) {
  const code = error?.code ?? null
  const message = error?.message ?? 'Unknown Supabase error.'
  const details = error?.details ?? null
  const hint = error?.hint ?? null
  const contextText = context ? ` context=${JSON.stringify(context)}` : ''
  const diagnostic = `[Canvas sync] step=${step} code=${code ?? 'unknown'} message=${message}${details ? ` details=${details}` : ''}${hint ? ` hint=${hint}` : ''}${contextText}`

  console.error(diagnostic)

  if (process.env.NODE_ENV !== 'production') {
    return new Error(diagnostic)
  }

  return new Error(`Canvas sync failed during ${step}.`)
}
