'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAuthenticatedUserServer } from '@/lib/auth-server'
import {
  compileCanvasContent,
  getCanvasAssignment,
  downloadCanvasBinarySource,
  getCanvasDiscussionTopic,
  getCanvasFile,
  getCanvasPage,
  getAnnouncements,
  getAssignments,
  getCourses,
  getModules,
  normalizeCanvasUrl,
  resolveCanvasLinkedTarget,
  resolveCanvasConfig,
  type CanvasConfig,
  type CanvasAssignment,
  type CanvasCourse,
  type CanvasModuleItem,
} from '@/lib/canvas'
import { normalizeExtension } from '@/lib/canvas-resource-extraction'
import {
  buildCanvasContentPlaceholderResult,
  resolveCanvasContentForWorkspaceItem,
  type ResolveCanvasAttachmentDownloadInput,
  type ResolveCanvasContentResult,
} from '@/lib/canvas-content-resolution'
import { buildModuleResourceAssessmentMetadata } from '@/lib/module-resource-quality'
import {
  normalizeCanvasCourseForSync,
  normalizeOptionalCanvasSyncText,
  normalizeRequiredCanvasSyncText,
  sanitizeCanvasSyncValue as sanitizeDatabaseValue,
  stripDatabaseNullCharacters,
  type NormalizedCanvasCourseForSync,
} from '@/lib/canvas-sync'
import { dedupeAIResponseDeadlines } from '@/lib/course-work-dedupe'
import { processModuleContent } from '@/lib/openai'
import { getSupabaseLoggingContext, serializeErrorForLogging, supabase } from '@/lib/supabase'
import { populateModuleTerms } from '@/actions/module-terms'
import type { AIResponse, Course, ModuleResourceExtractionStatus, Priority, TaskItem } from '@/lib/types'

export interface CanvasConnectionResult {
  normalizedUrl: string
  courses: CanvasCourse[]
}

export interface CanvasConnectionErrorResult {
  error: string
}

interface SyncCourseInput {
  courseId: number
  courseName: string
  courseCode: string
  instructor?: string | null
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

interface ResourceIngestionRecord {
  canvasModuleId: number | null
  canvasItemId: number | null
  canvasFileId: number | null
  title: string
  resourceType: string
  contentType: string | null
  extension: string | null
  sourceUrl: string | null
  htmlUrl: string | null
  extractionStatus: ModuleResourceExtractionStatus
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  required: boolean
  metadata: Record<string, unknown>
}

interface TaskCanvasLink {
  title: string
  canvasUrl: string | null
  canvasAssignmentId: number | null
  taskStatus: 'pending' | 'completed'
  completionOrigin: 'canvas' | null
}

interface SyncedTaskDraft {
  title: string
  details: string | null
  deadline: string | null
  priority: Priority
  taskType: TaskItem['taskType']
  estimatedMinutes: number
  canvasUrl: string | null
  canvasAssignmentId: number | null
  status: 'pending' | 'completed'
  completionOrigin: 'canvas' | null
}

export async function fetchCourses(config?: Partial<CanvasConfig>): Promise<CanvasCourse[]> {
  await requireAuthenticatedUserServer()
  return getCourses(config)
}

export async function testCanvasConnection(input: {
  canvasUrl: string
  accessToken: string
}): Promise<CanvasConnectionResult | CanvasConnectionErrorResult> {
  try {
    await requireAuthenticatedUserServer()
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'You need to sign in before using Canvas sync.',
    }
  }

  try {
    const config = getRequiredCanvasConfig(input.canvasUrl, input.accessToken)
    const courses = await getCourses(config)

    return {
      normalizedUrl: config.url,
      courses,
    }
  } catch (error) {
    logCanvasActionFailure('test connection', error, {
      canvasUrl: input.canvasUrl,
    })
    return {
      error: formatCanvasActionError(error, 'We could not connect to Canvas just yet.'),
    }
  }
}

export async function syncCourse(formData: FormData): Promise<{ error: string } | void> {
  if (!supabase) {
    return { error: 'Supabase is not configured yet.' }
  }
  const user = await requireAuthenticatedUserServer()

  const courseId = Number(formData.get('courseId'))
  const courseName = formData.get('courseName') as string
  const courseCode = (formData.get('courseCode') as string | null)?.trim() ?? ''
  const instructor = (formData.get('instructor') as string | null)?.trim() || null
  const config = getCanvasConfig(
    formData.get('canvasUrl') as string | null,
    formData.get('accessToken') as string | null
  )

  if (!courseId) {
    return { error: 'Choose a course before syncing.' }
  }

  let result: SyncCourseResult
  try {
    result = await syncSingleCourse({
      id: courseId,
      name: courseName,
      course_code: courseCode,
      enrollment_state: 'active',
      teachers: instructor ? [{ display_name: instructor }] : undefined,
    }, config, user.id)
  } catch (error) {
    logCanvasActionFailure('sync single course', error, {
      courseId,
      courseName,
      courseCode,
    })
    return {
      error: formatCanvasActionError(error, `We could not sync ${courseName || 'that course'}.`),
    }
  }

  revalidatePath('/')
  revalidatePath('/canvas')
  redirect(`/modules/${result.moduleId}`)
}

export async function refreshCourseInstructors(input: {
  canvasUrl: string
  accessToken: string
}): Promise<{ success: true; updatedCount: number } | { error: string }> {
  if (!supabase) {
    return { error: 'Supabase is not configured yet.' }
  }

  const user = await requireAuthenticatedUserServer()

  let config: ReturnType<typeof getRequiredCanvasConfig>
  try {
    config = getRequiredCanvasConfig(input.canvasUrl, input.accessToken)
  } catch (error) {
    return { error: formatCanvasActionError(error, 'We could not connect to Canvas.') }
  }

  let canvasCourses: Awaited<ReturnType<typeof getCourses>>
  try {
    canvasCourses = await getCourses(config)
  } catch (error) {
    logCanvasActionFailure('refresh instructors: fetch courses', error)
    return { error: formatCanvasActionError(error, 'We could not fetch courses from Canvas.') }
  }

  let updatedCount = 0

  for (const course of canvasCourses) {
    const instructor = resolveInstructorName(course)
    if (instructor === 'Canvas course staff') continue

    const { error } = await supabase
      .from('courses')
      .update({ instructor })
      .eq('user_id', user.id)
      .eq('canvas_course_id', course.id)
      .eq('canvas_instance_url', normalizeCanvasUrl(config.url))

    if (!error) updatedCount++
  }

  revalidatePath('/')
  revalidatePath('/canvas')

  return { success: true, updatedCount }
}

export async function syncCourses(input: {
  courses: SyncCourseInput[]
  canvasUrl: string
  accessToken: string
}): Promise<{ success: true; syncedCount: number; syncedCourses: string[] } | { error: string }> {
  if (!supabase) {
    return { error: 'Supabase is not configured yet.' }
  }
  const user = await requireAuthenticatedUserServer()

  const config = getRequiredCanvasConfig(input.canvasUrl, input.accessToken)

  if (input.courses.length === 0) {
    return { error: 'Choose at least one course to sync.' }
  }

  const syncedCourses: string[] = []

  for (const course of input.courses) {
    try {
      await syncSingleCourse({
        id: course.courseId,
        name: course.courseName,
        course_code: course.courseCode,
        enrollment_state: 'active',
        teachers: course.instructor ? [{ display_name: course.instructor }] : undefined,
      }, config, user.id)
    } catch (error) {
      logCanvasActionFailure('sync selected courses', error, {
        courseId: course.courseId,
        courseName: course.courseName,
        courseCode: course.courseCode,
      })
      return {
        error: formatCanvasActionError(error, `We could not sync ${course.courseName}.`),
      }
    }
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

async function syncSingleCourse(course: CanvasCourse, config: Partial<CanvasConfig>, userId: string): Promise<SyncCourseResult> {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  const resolvedConfig = resolveCanvasConfig(config)
  const normalizedCourse = normalizeCanvasCourseForSync(course, resolvedConfig.url)
  const databaseSafeCourse: CanvasCourse = {
    ...course,
    id: normalizedCourse.canvasCourseId,
    name: normalizedCourse.name,
    course_code: normalizedCourse.courseCode,
    term: course.term
      ? {
          ...course.term,
          name: normalizedCourse.termName,
        }
      : course.term,
  }

  const [assignments, announcements, modules] = await Promise.all([
    getAssignments(course.id, resolvedConfig),
    getAnnouncements(course.id, resolvedConfig),
    getModules(course.id, resolvedConfig),
  ])

  if (assignments.length === 0 && announcements.length === 0 && modules.length === 0) {
    throw new Error(`Canvas did not return any assignments, announcements, or module content for ${databaseSafeCourse.name} yet.`)
  }

  const resourceIngestion = await ingestModuleResources(course.id, modules, resolvedConfig, assignments)
  const taskCanvasLinks = buildTaskCanvasLinks(assignments, resourceIngestion)
  const rawContent = stripDatabaseNullCharacters(compileCanvasContent(
    databaseSafeCourse,
    assignments,
    announcements,
    modules,
    resourceIngestion
      .filter((resource) => resource.extractionStatus === 'extracted' && resource.extractedText)
      .map((resource) => ({
        title: resource.title,
        resourceType: resource.resourceType,
        extractedText: resource.extractedText!,
      }))
  ))
  const courseRecord = await upsertCanvasCourseRecord(normalizedCourse, userId, resolveInstructorName(course))
  const existingModule = await findExistingSyncedModule(courseRecord.id, {
    courseName: databaseSafeCourse.name,
    courseCode: databaseSafeCourse.course_code,
  })
  if (existingModule) {
    throw new Error(`${databaseSafeCourse.name} is already synced. Unsync it first if you want to connect it again.`)
  }

  const { data: moduleRecord, error: insertError } = await supabase
    .from('modules')
    .insert(sanitizeDatabaseValue({
      course_id: courseRecord.id,
      title: 'Processing...',
      raw_content: rawContent,
      status: 'pending',
      order: 1,
      released_at: new Date().toISOString(),
    }))
    .select('id')
    .single()

  if (insertError || !moduleRecord) {
    throw createSupabaseStepError('insert module', insertError, {
      courseId: courseRecord.id,
      canvasCourseCode: databaseSafeCourse.course_code,
      canvasCourseName: databaseSafeCourse.name,
    })
  }
  const moduleId = moduleRecord.id

  if (!moduleId) throw new Error('Failed to determine synced module.')

  if (resourceIngestion.length > 0) {
    const resourceRows = buildModuleResourcesForSync(resourceIngestion, {
      moduleId,
      courseId: courseRecord.id,
    })

    const { error: resourcesInsertError } = await supabase
      .from('module_resources')
      .insert(resourceRows)

    if (resourcesInsertError) {
      throw createSupabaseStepError('insert module resources', resourcesInsertError, {
        moduleId,
        moduleResourceCount: resourceRows.length,
      })
    }
  }

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

  const normalizedAiResult = normalizeAIResponseForSync(aiResult)
  const standaloneDeadlines = dedupeAIResponseDeadlines(normalizedAiResult.tasks, normalizedAiResult.deadlines)

  const { error: moduleUpdateError } = await supabase
    .from('modules')
    .update(sanitizeDatabaseValue({
      title: normalizedAiResult.title,
      summary: normalizedAiResult.summary || null,
      concepts: normalizedAiResult.concepts,
      study_prompts: normalizedAiResult.study_prompts,
      recommended_order: normalizedAiResult.recommended_order,
      status: 'processed',
      estimated_minutes: estimateModuleMinutes(normalizedAiResult),
      priority_signal: deriveModulePrioritySignal(normalizedAiResult),
    }))
    .eq('id', moduleId)

  if (moduleUpdateError) {
    throw createSupabaseStepError('update processed module', moduleUpdateError, { moduleId, title: normalizedAiResult.title })
  }

  const learningItems = buildLearningItemsForSync(normalizedAiResult, courseRecord.id, moduleId)
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

  const syncedTaskDrafts = buildSyncedTaskDrafts(normalizedAiResult, {
    taskCanvasLinks,
  })
  const clarityTaskItems = buildTaskItemsForSync(syncedTaskDrafts, {
    courseId: courseRecord.id,
    moduleId,
    extractedFrom: normalizedAiResult.title,
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

  if (normalizedAiResult.tasks.length > 0) {
    const { error: tasksInsertError } = await supabase.from('tasks').insert(
      sanitizeDatabaseValue(syncedTaskDrafts.map((task) => ({
        module_id: moduleId,
        title: task.title,
        details: task.details,
        deadline: task.deadline,
        canvas_url: task.canvasUrl,
        canvas_assignment_id: task.canvasAssignmentId,
        priority: task.priority,
        status: task.status,
        completion_origin: task.completionOrigin,
        planning_annotation: null,
      })))
    )

    if (tasksInsertError) {
      throw createSupabaseStepError('insert legacy tasks', tasksInsertError, {
        moduleId,
        taskCount: normalizedAiResult.tasks.length,
      })
    }
  }

  if (standaloneDeadlines.length > 0) {
    const { error: deadlinesInsertError } = await supabase.from('deadlines').insert(
      sanitizeDatabaseValue(standaloneDeadlines.map((deadline) => ({
        module_id: moduleId,
        label: deadline.label,
        date: deadline.date,
      })))
    )

    if (deadlinesInsertError) {
      throw createSupabaseStepError('insert legacy deadlines', deadlinesInsertError, {
        moduleId,
        deadlineCount: standaloneDeadlines.length,
      })
    }
  }

  await populateModuleTerms({
    moduleId,
    courseId: courseRecord.id,
  })

  return {
    moduleId,
    courseName: databaseSafeCourse.name,
  }
}

async function findExistingSyncedModule(
  courseId: string,
  context?: { courseName?: string; courseCode?: string },
): Promise<ExistingModuleMatch | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('modules')
    .select('id')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw createSupabaseStepError('check existing synced module', error, {
      courseId,
      courseName: context?.courseName,
      courseCode: context?.courseCode,
    })
  }
  return (data as ExistingModuleMatch | null) ?? null
}

async function upsertCanvasCourseRecord(course: NormalizedCanvasCourseForSync, userId: string, instructor = 'Canvas course staff'): Promise<ExistingCourseMatch> {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  const courseIdentityPayload = buildCanvasCourseIdentityPayload(course)

  logCanvasCourseUpsertEvent('start', {
    courseIdentityPayload,
    supabase: getSupabaseLoggingContext(),
  })

  await probeSupabaseCoursesBeforeUpsert(course)

  let courseRecord: ExistingCourseMatch | null = null
  let upsertCourseError: SupabaseLikeError | null = null

  try {
    const response = await supabase
      .from('courses')
      .upsert(
        sanitizeDatabaseValue({
          user_id: userId,
          canvas_instance_url: course.canvasInstanceUrl,
          canvas_course_id: course.canvasCourseId,
          code: course.courseCode,
          name: course.name,
          term: course.termName,
          instructor,
          focus_label: 'Synced from Canvas',
          color_token: pickCourseColorToken(course.courseCode, course.name),
        }),
        {
          onConflict: 'user_id,canvas_instance_url,canvas_course_id',
          ignoreDuplicates: false,
        },
      )
      .select('id')
      .single()

    courseRecord = (response.data as ExistingCourseMatch | null) ?? null
    upsertCourseError = response.error
  } catch (error) {
    logCanvasCourseUpsertEvent('request_threw', {
      courseIdentityPayload,
      supabase: getSupabaseLoggingContext(),
      error: serializeErrorForLogging(error),
    })
    throw error
  }

  if (upsertCourseError || !courseRecord) {
    logCanvasCourseUpsertEvent('response_error', {
      courseIdentityPayload,
      supabase: getSupabaseLoggingContext(),
      error: serializeErrorForLogging(upsertCourseError),
    })
    throw createSupabaseStepError('upsert course', upsertCourseError, {
      canvasInstanceUrl: course.canvasInstanceUrl,
      canvasCourseId: course.canvasCourseId,
      courseCode: course.courseCode,
      courseName: course.name,
    })
  }

  logCanvasCourseUpsertEvent('success', {
    courseIdentityPayload,
    supabase: getSupabaseLoggingContext(),
    insertedCourseId: courseRecord.id,
  })

  return courseRecord as ExistingCourseMatch
}

function buildLearningItemsForSync(aiResult: AIResponse, courseId: string, moduleId: string) {
  const items = sanitizeDatabaseValue([
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
  ].filter(Boolean))

  return items
}

function buildModuleResourcesForSync(
  resources: ResourceIngestionRecord[],
  context: { moduleId: string; courseId: string },
) {
  return sanitizeDatabaseValue(resources.map((resource) => {
    const assessmentMetadata = buildModuleResourceAssessmentMetadata({
      type: resource.resourceType,
      extension: resource.extension,
      contentType: resource.contentType,
      extractionStatus: resource.extractionStatus,
      extractedText: resource.extractedText,
      extractedTextPreview: resource.extractedTextPreview,
      extractedCharCount: resource.extractedCharCount,
      extractionError: resource.extractionError,
      metadata: resource.metadata,
    }, resource.metadata)

    return {
      module_id: context.moduleId,
      course_id: context.courseId,
      canvas_module_id: resource.canvasModuleId,
      canvas_item_id: resource.canvasItemId,
      canvas_file_id: resource.canvasFileId,
      title: normalizeRequiredCanvasSyncText(resource.title, 'Canvas resource'),
      resource_type: normalizeRequiredCanvasSyncText(resource.resourceType, 'resource'),
      content_type: normalizeOptionalCanvasSyncText(resource.contentType),
      extension: normalizeOptionalCanvasSyncText(resource.extension),
      source_url: normalizeOptionalCanvasSyncText(resource.sourceUrl),
      html_url: normalizeOptionalCanvasSyncText(resource.htmlUrl),
      extraction_status: resource.extractionStatus,
      extracted_text: normalizeOptionalCanvasSyncText(resource.extractedText),
      extracted_text_preview: normalizeOptionalCanvasSyncText(resource.extractedTextPreview),
      extracted_char_count: resource.extractedCharCount,
      extraction_error: normalizeOptionalCanvasSyncText(resource.extractionError),
      required: resource.required,
      metadata: assessmentMetadata,
    }
  }))
}

function buildSyncedTaskDrafts(
  aiResult: AIResponse,
  context: { taskCanvasLinks: TaskCanvasLink[] },
): SyncedTaskDraft[] {
  return aiResult.tasks.map((task) => {
    const taskType = normalizeTaskTypeForSync(task.task_type, task.title, task.details)
    const matchedCanvasLink = resolveTaskCanvasLink(task.title, context.taskCanvasLinks, taskType)

    return {
      title: normalizeRequiredCanvasSyncText(task.title, 'Canvas task'),
      details: normalizeOptionalCanvasSyncText(task.details),
      deadline: normalizeOptionalCanvasSyncText(task.deadline),
      priority: task.priority,
      taskType,
      estimatedMinutes: normalizeEstimatedMinutes(task.estimated_minutes, task.priority),
      canvasUrl: normalizeOptionalCanvasSyncText(matchedCanvasLink?.canvasUrl ?? null),
      canvasAssignmentId: matchedCanvasLink?.canvasAssignmentId ?? null,
      status: matchedCanvasLink?.taskStatus ?? 'pending',
      completionOrigin: matchedCanvasLink?.completionOrigin ?? null,
    }
  })
}

function buildTaskItemsForSync(
  syncedTasks: SyncedTaskDraft[],
  context: { courseId: string; moduleId: string; extractedFrom: string },
) {
  return sanitizeDatabaseValue(syncedTasks.map((task) => ({
    course_id: context.courseId,
    module_id: context.moduleId,
    title: task.title,
    details: task.details,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline,
    task_type: task.taskType,
    estimated_minutes: task.estimatedMinutes,
    extracted_from: normalizeRequiredCanvasSyncText(context.extractedFrom, 'Canvas module'),
    canvas_url: task.canvasUrl,
    canvas_assignment_id: task.canvasAssignmentId,
    completion_origin: task.completionOrigin,
    planning_annotation: null,
  })))
}

function normalizeAIResponseForSync(aiResult: AIResponse): AIResponse {
  return {
    title: normalizeRequiredCanvasSyncText(aiResult.title, 'Canvas module'),
    summary: normalizeOptionalCanvasSyncText(aiResult.summary) ?? '',
    concepts: normalizeCanvasSyncTextList(aiResult.concepts),
    study_prompts: normalizeCanvasSyncTextList(aiResult.study_prompts),
    recommended_order: normalizeCanvasSyncTextList(aiResult.recommended_order),
    tasks: aiResult.tasks
      .map((task) => {
        const title = normalizeOptionalCanvasSyncText(task.title)
        if (!title) return null

        return {
          ...task,
          title,
          details: normalizeOptionalCanvasSyncText(task.details),
        }
      })
      .filter((task): task is AIResponse['tasks'][number] => Boolean(task)),
    deadlines: aiResult.deadlines
      .map((deadline) => {
        const label = normalizeOptionalCanvasSyncText(deadline.label)
        if (!label) return null

        return {
          ...deadline,
          label,
        }
      })
      .filter((deadline): deadline is AIResponse['deadlines'][number] => Boolean(deadline)),
  }
}

function normalizeCanvasSyncTextList(values: string[]) {
  return values
    .map((value) => normalizeOptionalCanvasSyncText(value))
    .filter((value): value is string => Boolean(value))
}

async function probeSupabaseCoursesBeforeUpsert(course: NormalizedCanvasCourseForSync) {
  if (!supabase) throw new Error('Supabase is not configured yet.')

  const courseIdentityPayload = buildCanvasCourseIdentityPayload(course)

  logCanvasCourseUpsertEvent('probe_start', {
    courseIdentityPayload,
    supabase: getSupabaseLoggingContext(),
  })

  try {
    const { error } = await supabase
      .from('courses')
      .select('id', { head: true, count: 'exact' })
      .limit(1)

    if (error) {
      logCanvasCourseUpsertEvent('probe_response_error', {
        courseIdentityPayload,
        supabase: getSupabaseLoggingContext(),
        error: serializeErrorForLogging(error),
      })

      throw createSupabaseStepError('probe courses before upsert', error, {
        canvasInstanceUrl: course.canvasInstanceUrl,
        canvasCourseId: course.canvasCourseId,
        courseCode: course.courseCode,
        courseName: course.name,
      })
    }

    logCanvasCourseUpsertEvent('probe_success', {
      courseIdentityPayload,
      supabase: getSupabaseLoggingContext(),
    })
  } catch (error) {
    logCanvasCourseUpsertEvent('probe_threw', {
      courseIdentityPayload,
      supabase: getSupabaseLoggingContext(),
      error: serializeErrorForLogging(error),
    })
    throw error
  }
}

function buildCanvasCourseIdentityPayload(course: NormalizedCanvasCourseForSync) {
  return {
    canvasInstanceUrl: course.canvasInstanceUrl,
    canvasCourseId: course.canvasCourseId,
    courseCode: course.courseCode,
    courseName: course.name,
    termName: course.termName,
  }
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

async function ingestModuleResources(
  courseId: number,
  modules: Awaited<ReturnType<typeof getModules>>,
  config: Partial<CanvasConfig>,
  assignments: CanvasAssignment[],
): Promise<ResourceIngestionRecord[]> {
  const records: ResourceIngestionRecord[] = []
  const assignmentsById = new Map(assignments.map((assignment) => [assignment.id, assignment]))
  const downloadAttachment = createCanvasAttachmentDownloader(courseId, config)

  for (const moduleItem of modules) {
    for (const item of moduleItem.items ?? []) {
      const required = Boolean(item.completion_requirement)
      const baseRecord: ResourceIngestionRecord = {
        canvasModuleId: moduleItem.id,
        canvasItemId: item.id ?? null,
        canvasFileId: typeof item.content_id === 'number' ? item.content_id : null,
        title: item.title,
        resourceType: item.type,
        contentType: item.content_details?.content_type ?? null,
        extension: normalizeExtension(null, item.title),
        sourceUrl: resolveCanvasUrl(config.url ?? null, item.content_details?.url ?? item.url ?? null),
        htmlUrl: buildCanvasPageHtmlUrl(config.url ?? null, courseId, item.page_url ?? null, item.html_url ?? null),
        extractionStatus: 'metadata_only',
        extractedText: null,
        extractedTextPreview: null,
        extractedCharCount: 0,
        extractionError: null,
        required,
        metadata: {
          canvasModuleName: moduleItem.name,
          canvasModuleUrl: buildCanvasModuleUrl(config.url ?? null, courseId, moduleItem.id),
          completionRequirementType: item.completion_requirement?.type ?? null,
          normalizedSourceType: normalizeModuleItemSourceType(item),
        },
      }

      if (isCanvasPageModuleItem(item)) {
        try {
          const page = await getCanvasPage(courseId, {
            pageUrl: item.page_url ?? null,
            apiUrl: item.url ?? null,
          }, config)
          const title = page.title?.trim() || item.title
          const resolved = await resolveCanvasContentForWorkspaceItem({
            title,
            sourceType: 'page',
            mimeType: 'text/html',
            sections: [
              {
                label: 'Page content',
                html: page.body ?? '',
              },
            ],
            courseId,
            moduleId: moduleItem.id,
          }, {
            downloadAttachment,
          })

          records.push(createResolvedResourceRecord(baseRecord, resolved, {
            title,
            contentType: 'text/html',
            extension: null,
            sourceUrl: buildCanvasPageApiUrl(config.url ?? null, courseId, page.url ?? item.page_url ?? null, item.url ?? null),
            htmlUrl: buildCanvasPageHtmlUrl(config.url ?? null, courseId, page.url ?? item.page_url ?? null, page.html_url ?? item.html_url ?? null),
            metadataPatch: {
              canvasPageUrl: page.url ?? item.page_url ?? null,
              pageUpdatedAt: page.updated_at ?? null,
              pagePublished: page.published ?? null,
            },
          }))
        } catch (error) {
          records.push({
            ...baseRecord,
            contentType: 'text/html',
            extension: null,
            sourceUrl: buildCanvasPageApiUrl(config.url ?? null, courseId, item.page_url ?? null, item.url ?? null),
            htmlUrl: buildCanvasPageHtmlUrl(config.url ?? null, courseId, item.page_url ?? null, item.html_url ?? null),
            extractionStatus: 'failed',
            extractionError: error instanceof Error ? error.message : 'Unknown Canvas page ingestion error.',
            metadata: {
              ...baseRecord.metadata,
              canvasPageUrl: item.page_url ?? null,
            },
          })
        }
        continue
      }

      if (isCanvasAssignmentModuleItem(item)) {
        const assignment = typeof item.content_id === 'number'
          ? assignmentsById.get(item.content_id) ?? null
          : null

        if (!assignment) {
          records.push({
            ...baseRecord,
            contentType: 'text/html',
            extractionStatus: 'metadata_only',
            extractionError: 'This module-linked assignment was detected, but Canvas did not provide readable assignment details in the current sync payload.',
            metadata: {
              ...baseRecord.metadata,
              normalizedSourceType: 'assignment',
            },
          })
          continue
        }

        const resolved = await resolveCanvasContentForWorkspaceItem({
          title: assignment.name,
          sourceType: 'assignment',
          mimeType: 'text/html',
          sections: [
            {
              label: 'Instructions',
              html: assignment.description,
            },
          ],
          dueAt: assignment.due_at ?? null,
          courseId,
          moduleId: moduleItem.id,
        }, {
          downloadAttachment,
        })

        records.push(createResolvedResourceRecord(baseRecord, resolved, {
          title: assignment.name,
          contentType: 'text/html',
          extension: null,
          sourceUrl: assignment.url ?? baseRecord.sourceUrl,
          htmlUrl: assignment.html_url ?? baseRecord.htmlUrl,
          metadataPatch: {
            normalizedSourceType: 'assignment',
            assignmentDueAt: assignment.due_at ?? null,
            pointsPossible: assignment.points_possible ?? null,
            submissionTypes: assignment.submission_types,
          },
        }))
        continue
      }

      if (isCanvasDiscussionModuleItem(item)) {
        try {
          const discussion = await getCanvasDiscussionTopic(courseId, {
            topicId: typeof item.content_id === 'number' ? item.content_id : null,
            apiUrl: item.url ?? null,
          }, config)

          const resolved = await resolveCanvasContentForWorkspaceItem({
            title: discussion.title || item.title,
            sourceType: 'discussion',
            mimeType: 'text/html',
            sections: [
              {
                label: 'Prompt',
                html: discussion.message,
              },
            ],
            postedAt: discussion.posted_at ?? null,
            courseId,
            moduleId: moduleItem.id,
          }, {
            downloadAttachment,
          })

          records.push(createResolvedResourceRecord(baseRecord, resolved, {
            title: discussion.title?.trim() || item.title,
            contentType: 'text/html',
            extension: null,
            sourceUrl: discussion.url ?? baseRecord.sourceUrl,
            htmlUrl: discussion.html_url ?? baseRecord.htmlUrl,
            metadataPatch: {
              normalizedSourceType: 'discussion',
              discussionUpdatedAt: discussion.updated_at ?? null,
              discussionPostedAt: discussion.posted_at ?? null,
            },
          }))
        } catch (error) {
          records.push({
            ...baseRecord,
            contentType: 'text/html',
            extension: null,
            extractionStatus: 'failed',
            extractionError: error instanceof Error ? error.message : 'Unknown Canvas discussion ingestion error.',
            metadata: {
              ...baseRecord.metadata,
              normalizedSourceType: 'discussion',
            },
          })
        }
        continue
      }

      const resolvedTargetRecord = await tryResolveModuleItemTargetForSync({
        item,
        moduleItemId: moduleItem.id,
        courseId,
        config,
        assignmentsById,
        baseRecord,
        downloadAttachment,
      })
      if (resolvedTargetRecord) {
        records.push(resolvedTargetRecord)
        continue
      }

      if (item.type.toLowerCase() !== 'file') {
        records.push({
          ...baseRecord,
          extractionStatus: 'metadata_only',
          extractionError: buildModuleItemCapabilityNote(item),
          metadata: {
              ...baseRecord.metadata,
          },
        })
        continue
      }

      try {
        const file = typeof item.content_id === 'number'
          ? await getCanvasFile(courseId, item.content_id, config)
          : null
        const title = file?.display_name?.trim() || file?.filename?.trim() || item.title
        const contentType = file?.content_type ?? file?.['content-type'] ?? baseRecord.contentType
        const extension = normalizeExtension(null, title)
        const sourceUrl = file?.url ?? baseRecord.sourceUrl

        if (!sourceUrl) {
          records.push({
            ...baseRecord,
            title,
            contentType,
            extension,
            extractionStatus: 'failed',
            extractionError: 'Canvas returned no downloadable URL for this file.',
            metadata: {
              ...baseRecord.metadata,
              fileSize: file?.size ?? item.content_details?.size ?? null,
              mimeClass: file?.mime_class ?? item.content_details?.mime_class ?? null,
            },
          })
          continue
        }

        const resolved = await resolveCanvasContentForWorkspaceItem({
          title,
          sourceType: 'file',
          mimeType: contentType,
          extension,
          file: {
            url: sourceUrl,
            title,
            mimeType: contentType,
            extension,
          },
          courseId,
          moduleId: moduleItem.id,
        }, {
          downloadAttachment,
        })

        records.push(createResolvedResourceRecord(baseRecord, resolved, {
          canvasFileId: file?.id ?? baseRecord.canvasFileId,
          title,
          contentType,
          extension,
          sourceUrl,
          htmlUrl: file?.preview_url ?? baseRecord.htmlUrl,
          metadataPatch: {
            fileSize: file?.size ?? item.content_details?.size ?? null,
            mimeClass: file?.mime_class ?? item.content_details?.mime_class ?? null,
            fileUpdatedAt: file?.updated_at ?? null,
          },
        }))
      } catch (error) {
        records.push({
          ...baseRecord,
          extractionStatus: 'failed',
          extractionError: error instanceof Error ? error.message : 'Unknown Canvas file ingestion error.',
          metadata: {
            ...baseRecord.metadata,
          },
        })
      }
    }
  }

  return records
}

function createResolvedResourceRecord(
  baseRecord: ResourceIngestionRecord,
  resolved: ResolveCanvasContentResult,
  overrides: Partial<ResourceIngestionRecord> & {
    metadataPatch?: Record<string, unknown>
    extractionError?: string | null
  } = {},
): ResourceIngestionRecord {
  return {
    ...baseRecord,
    ...overrides,
    title: resolved.content.title ?? overrides.title ?? baseRecord.title,
    contentType: overrides.contentType ?? resolved.content.mimeType ?? baseRecord.contentType,
    extractionStatus: resolved.persisted.extractionStatus,
    extractedText: resolved.persisted.extractedText,
    extractedTextPreview: resolved.persisted.extractedTextPreview,
    extractedCharCount: resolved.persisted.extractedCharCount,
    extractionError: overrides.extractionError ?? resolved.persisted.extractionError,
    metadata: {
      ...baseRecord.metadata,
      ...resolved.persisted.metadataPatch,
      ...(overrides.metadataPatch ?? {}),
    },
  }
}

async function tryResolveModuleItemTargetForSync(input: {
  item: CanvasModuleItem
  moduleItemId: number
  courseId: number
  config: Partial<CanvasConfig>
  assignmentsById: Map<number, CanvasAssignment>
  baseRecord: ResourceIngestionRecord
  downloadAttachment: ReturnType<typeof createCanvasAttachmentDownloader>
}): Promise<ResourceIngestionRecord | null> {
  const candidateUrl = input.baseRecord.sourceUrl
    ?? resolveCanvasUrl(input.config.url ?? null, input.item.html_url ?? null)
    ?? resolveCanvasUrl(input.config.url ?? null, input.item.url ?? null)
    ?? resolveCanvasUrl(input.config.url ?? null, input.item.content_details?.url ?? null)

  if (!candidateUrl) {
    return null
  }

  const target = await resolveCanvasLinkedTarget(candidateUrl, input.config)
  const resolutionMetadataPatch = buildCanvasTargetMetadataPatch(input.item, target)

  if (target.resolutionState === 'resolved' && target.resolvedTargetType === 'page' && target.courseId) {
    try {
      const page = await getCanvasPage(target.courseId, {
        pageUrl: target.pageUrl,
        apiUrl: target.resolvedUrl,
      }, input.config)
      const title = page.title?.trim() || input.item.title
      const resolved = await resolveCanvasContentForWorkspaceItem({
        title,
        sourceType: 'page',
        mimeType: 'text/html',
        sections: [
          {
            label: 'Page content',
            html: page.body ?? '',
          },
        ],
        courseId: input.courseId,
        moduleId: input.moduleItemId,
      }, {
        downloadAttachment: input.downloadAttachment,
      })

      return createResolvedResourceRecord(input.baseRecord, resolved, {
        title,
        contentType: 'text/html',
        extension: null,
        sourceUrl: buildCanvasPageApiUrl(input.config.url ?? null, target.courseId, page.url ?? target.pageUrl, target.resolvedUrl),
        htmlUrl: buildCanvasPageHtmlUrl(input.config.url ?? null, target.courseId, page.url ?? target.pageUrl, page.html_url ?? target.resolvedUrl),
        metadataPatch: {
          ...resolutionMetadataPatch,
          normalizedSourceType: 'page',
          canvasPageUrl: page.url ?? target.pageUrl ?? null,
          pageUpdatedAt: page.updated_at ?? null,
          pagePublished: page.published ?? null,
        },
      })
    } catch (error) {
      return createResolvedResourceRecord(
        input.baseRecord,
        buildCanvasContentPlaceholderResult({
          title: input.item.title,
          sourceType: 'module_item',
          mimeType: 'text/html',
          extractionStatus: 'failed',
          fallbackState: 'canvas_fetch_failed',
          recommendationStrength: 'fallback',
          courseId: input.courseId,
          moduleId: input.moduleItemId,
          warnings: [error instanceof Error ? error.message : 'Canvas page resolution failed.'],
        }),
        {
          contentType: 'text/html',
          extractionError: error instanceof Error ? error.message : 'Canvas page resolution failed.',
          metadataPatch: resolutionMetadataPatch,
        },
      )
    }
  }

  if (target.resolutionState === 'resolved' && target.resolvedTargetType === 'assignment' && target.courseId) {
    try {
      const assignment = typeof target.assignmentId === 'number'
        ? input.assignmentsById.get(target.assignmentId)
          ?? await getCanvasAssignment(target.courseId, {
            assignmentId: target.assignmentId,
            apiUrl: target.resolvedUrl,
          }, input.config)
        : await getCanvasAssignment(target.courseId, {
          apiUrl: target.resolvedUrl,
        }, input.config)

      const resolved = await resolveCanvasContentForWorkspaceItem({
        title: assignment.name,
        sourceType: 'assignment',
        mimeType: 'text/html',
        sections: [
          {
            label: 'Instructions',
            html: assignment.description,
          },
        ],
        dueAt: assignment.due_at ?? null,
        courseId: input.courseId,
        moduleId: input.moduleItemId,
      }, {
        downloadAttachment: input.downloadAttachment,
      })

      return createResolvedResourceRecord(input.baseRecord, resolved, {
        title: assignment.name,
        contentType: 'text/html',
        extension: null,
        sourceUrl: buildCanvasAssignmentApiUrl(input.config.url ?? null, target.courseId, assignment.id ?? target.assignmentId ?? null, assignment.url ?? target.resolvedUrl),
        htmlUrl: assignment.html_url ?? target.resolvedUrl ?? input.baseRecord.htmlUrl,
        metadataPatch: {
          ...resolutionMetadataPatch,
          normalizedSourceType: 'assignment',
          assignmentDueAt: assignment.due_at ?? null,
          pointsPossible: assignment.points_possible ?? null,
          submissionTypes: assignment.submission_types,
        },
      })
    } catch (error) {
      return createResolvedResourceRecord(
        input.baseRecord,
        buildCanvasContentPlaceholderResult({
          title: input.item.title,
          sourceType: 'module_item',
          mimeType: 'text/html',
          extractionStatus: 'failed',
          fallbackState: 'canvas_fetch_failed',
          recommendationStrength: 'fallback',
          courseId: input.courseId,
          moduleId: input.moduleItemId,
          warnings: [error instanceof Error ? error.message : 'Canvas assignment resolution failed.'],
        }),
        {
          contentType: 'text/html',
          extractionError: error instanceof Error ? error.message : 'Canvas assignment resolution failed.',
          metadataPatch: resolutionMetadataPatch,
        },
      )
    }
  }

  if (target.resolutionState === 'resolved' && target.resolvedTargetType === 'discussion' && target.courseId) {
    try {
      const discussion = await getCanvasDiscussionTopic(target.courseId, {
        topicId: target.discussionId,
        apiUrl: target.resolvedUrl,
      }, input.config)
      const resolved = await resolveCanvasContentForWorkspaceItem({
        title: discussion.title || input.item.title,
        sourceType: 'discussion',
        mimeType: 'text/html',
        sections: [
          {
            label: 'Prompt',
            html: discussion.message,
          },
        ],
        postedAt: discussion.posted_at ?? null,
        courseId: input.courseId,
        moduleId: input.moduleItemId,
      }, {
        downloadAttachment: input.downloadAttachment,
      })

      return createResolvedResourceRecord(input.baseRecord, resolved, {
        title: discussion.title?.trim() || input.item.title,
        contentType: 'text/html',
        extension: null,
        sourceUrl: buildCanvasDiscussionApiUrl(input.config.url ?? null, target.courseId, discussion.id ?? target.discussionId ?? null, discussion.url ?? target.resolvedUrl),
        htmlUrl: discussion.html_url ?? target.resolvedUrl ?? input.baseRecord.htmlUrl,
        metadataPatch: {
          ...resolutionMetadataPatch,
          normalizedSourceType: 'discussion',
          discussionUpdatedAt: discussion.updated_at ?? null,
          discussionPostedAt: discussion.posted_at ?? null,
        },
      })
    } catch (error) {
      return createResolvedResourceRecord(
        input.baseRecord,
        buildCanvasContentPlaceholderResult({
          title: input.item.title,
          sourceType: 'module_item',
          mimeType: 'text/html',
          extractionStatus: 'failed',
          fallbackState: 'canvas_fetch_failed',
          recommendationStrength: 'fallback',
          courseId: input.courseId,
          moduleId: input.moduleItemId,
          warnings: [error instanceof Error ? error.message : 'Canvas discussion resolution failed.'],
        }),
        {
          contentType: 'text/html',
          extractionError: error instanceof Error ? error.message : 'Canvas discussion resolution failed.',
          metadataPatch: resolutionMetadataPatch,
        },
      )
    }
  }

  if (target.resolutionState === 'resolved' && target.resolvedTargetType === 'file') {
    try {
      const sourceUrl = target.resolvedUrl ?? candidateUrl
      const file = target.courseId && target.fileId
        ? await getCanvasFile(target.courseId, target.fileId, input.config)
        : null
      const title = file?.display_name?.trim() || file?.filename?.trim() || input.item.title
      const contentType = file?.content_type ?? file?.['content-type'] ?? input.baseRecord.contentType
      const extension = normalizeExtension(null, title)
      const resolved = await resolveCanvasContentForWorkspaceItem({
        title,
        sourceType: 'file',
        mimeType: contentType,
        extension,
        file: {
          url: file?.url ?? sourceUrl,
          title,
          mimeType: contentType,
          extension,
        },
        courseId: input.courseId,
        moduleId: input.moduleItemId,
      }, {
        downloadAttachment: input.downloadAttachment,
      })

      return createResolvedResourceRecord(input.baseRecord, resolved, {
        canvasFileId: file?.id ?? target.fileId ?? input.baseRecord.canvasFileId,
        title,
        contentType,
        extension,
        sourceUrl: file?.url ?? sourceUrl,
        htmlUrl: file?.preview_url ?? target.resolvedUrl ?? input.baseRecord.htmlUrl,
        metadataPatch: {
          ...resolutionMetadataPatch,
          normalizedSourceType: 'file',
          fileSize: file?.size ?? input.item.content_details?.size ?? null,
          mimeClass: file?.mime_class ?? input.item.content_details?.mime_class ?? null,
          fileUpdatedAt: file?.updated_at ?? null,
        },
      })
    } catch (error) {
      return createResolvedResourceRecord(
        input.baseRecord,
        buildCanvasContentPlaceholderResult({
          title: input.item.title,
          sourceType: 'module_item',
          mimeType: input.item.content_details?.content_type ?? null,
          extractionStatus: 'failed',
          fallbackState: 'canvas_fetch_failed',
          recommendationStrength: 'fallback',
          courseId: input.courseId,
          moduleId: input.moduleItemId,
          warnings: [error instanceof Error ? error.message : 'Canvas file resolution failed.'],
        }),
        {
          extractionError: error instanceof Error ? error.message : 'Canvas file resolution failed.',
          metadataPatch: resolutionMetadataPatch,
        },
      )
    }
  }

  if (target.resolutionState === 'external_link_only') {
    const resolved = await resolveCanvasContentForWorkspaceItem({
      title: input.item.title,
      sourceType: 'external_link',
      mimeType: input.item.content_details?.content_type ?? null,
      attachments: [
        {
          name: input.item.title,
          url: target.resolvedUrl ?? candidateUrl,
          mimeType: input.item.content_details?.content_type ?? null,
          sourceType: 'external_link',
        },
      ],
      courseId: input.courseId,
      moduleId: input.moduleItemId,
    })

    return createResolvedResourceRecord(input.baseRecord, resolved, {
      extractionError: resolved.persisted.extractionError ?? buildModuleItemCapabilityNote(input.item),
      metadataPatch: resolutionMetadataPatch,
    })
  }

  if (target.resolutionState === 'canvas_resolution_required' || target.resolutionState === 'canvas_fetch_failed') {
    const fallbackState = target.resolutionState
    const placeholder = buildCanvasContentPlaceholderResult({
      title: input.item.title,
      sourceType: 'module_item',
      mimeType: input.item.content_details?.content_type ?? null,
      extractionStatus: fallbackState === 'canvas_fetch_failed' ? 'failed' : 'partial',
      fallbackState,
      recommendationStrength: 'fallback',
      courseId: input.courseId,
      moduleId: input.moduleItemId,
      warnings: [target.reason ?? buildModuleItemCapabilityNote(input.item)],
    })

    return createResolvedResourceRecord(input.baseRecord, placeholder, {
      extractionError: target.reason ?? buildModuleItemCapabilityNote(input.item),
      metadataPatch: resolutionMetadataPatch,
    })
  }

  return null
}

function buildCanvasTargetMetadataPatch(item: CanvasModuleItem, target: Awaited<ReturnType<typeof resolveCanvasLinkedTarget>>) {
  const metadataPatch: Record<string, unknown> = {
    originalResourceKind: item.type,
    resolutionState: target.resolutionState,
    sourceUrlCategory: target.originalUrlCategory,
    resolvedUrlCategory: target.resolvedUrlCategory,
    resolvedUrl: target.resolvedUrl,
    resolvedTargetType: target.resolvedTargetType,
  }

  if (target.resolvedTargetType !== 'unknown' && target.resolvedTargetType !== 'external_link') {
    metadataPatch.normalizedSourceType = target.resolvedTargetType
  } else if (target.resolutionState === 'canvas_resolution_required' || target.resolutionState === 'canvas_fetch_failed') {
    metadataPatch.normalizedSourceType = 'module_item'
  }

  if (target.resolutionState !== 'resolved') {
    metadataPatch.fallbackReason = target.resolutionState
  }

  return metadataPatch
}

function createCanvasAttachmentDownloader(courseId: number, config: Partial<CanvasConfig>) {
  return async (input: ResolveCanvasAttachmentDownloadInput) => {
    if (typeof input.canvasFileId === 'number') {
      try {
        const file = await getCanvasFile(courseId, input.canvasFileId, config)
        const sourceUrl = file.url ?? input.url
        if (!sourceUrl) {
          throw new Error('Canvas returned a linked file without a downloadable URL.')
        }

        const downloaded = await downloadCanvasBinarySource(sourceUrl, config)
        const title = file.display_name?.trim() || file.filename?.trim() || (input.title ?? null)

        return {
          buffer: downloaded.buffer,
          contentType: file.content_type ?? file['content-type'] ?? downloaded.contentType,
          title,
          extension: normalizeExtension(null, title ?? 'Canvas attachment'),
        }
      } catch (error) {
        if (!input.url) {
          throw error
        }
      }
    }

    if (!input.url) {
      throw new Error('Canvas attachment download is missing a URL.')
    }

    const downloaded = await downloadCanvasBinarySource(input.url, config)
    return {
      buffer: downloaded.buffer,
      contentType: downloaded.contentType,
      title: input.title,
      extension: normalizeExtension(null, input.title ?? 'Canvas attachment'),
    }
  }
}

function pickCourseColorToken(courseCode: string, courseName: string): Course['colorToken'] {
  const seed = `${courseCode}:${courseName}`.length % 4
  if (seed === 0) return 'yellow'
  if (seed === 1) return 'blue'
  if (seed === 2) return 'green'
  return 'orange'
}

function buildTaskCanvasLinks(
  assignments: CanvasAssignment[],
  resources: ResourceIngestionRecord[],
): TaskCanvasLink[] {
  const assignmentLinks = assignments.map((assignment) => ({
    title: assignment.name,
    canvasUrl: assignment.html_url ?? assignment.url ?? null,
    canvasAssignmentId: assignment.id,
    ...deriveCanvasAssignmentTaskState(assignment),
  }))

  const resourceLinks = resources.map((resource) => ({
    title: resource.title,
    canvasUrl: getBestResourceCanvasUrl(resource),
    canvasAssignmentId: null,
    taskStatus: 'pending' as const,
    completionOrigin: null,
  }))

  return [...assignmentLinks, ...resourceLinks]
}

function deriveCanvasAssignmentTaskState(assignment: Pick<CanvasAssignment, 'submission'>) {
  const submission = assignment.submission
  if (!submission || submission.missing) {
    return {
      taskStatus: 'pending' as const,
      completionOrigin: null,
    }
  }

  const workflowState = submission.workflow_state?.toLowerCase() ?? null
  const isCompleted = submission.excused
    || Boolean(submission.submitted_at)
    || workflowState === 'submitted'
    || workflowState === 'graded'
    || workflowState === 'pending_review'
    || (workflowState === 'unsubmitted' && submission.score !== null && submission.score !== undefined)
    || (workflowState === 'unsubmitted' && Boolean(submission.grade))

  return {
    taskStatus: isCompleted ? 'completed' as const : 'pending' as const,
    completionOrigin: isCompleted ? 'canvas' as const : null,
  }
}

function resolveTaskCanvasLink(
  taskTitle: string,
  links: TaskCanvasLink[],
  taskType: TaskItem['taskType'],
) {
  const match = links.find((link) => matchesCanvasTaskTitle(taskTitle, link.title))
  if (!match) return null

  if (!isCanvasCompletableTaskType(taskType)) {
    return {
      ...match,
      taskStatus: 'pending' as const,
      completionOrigin: null,
    }
  }

  return match
}

function getBestResourceCanvasUrl(resource: ResourceIngestionRecord) {
  const moduleUrl = typeof resource.metadata.canvasModuleUrl === 'string' ? resource.metadata.canvasModuleUrl : null
  return resource.htmlUrl ?? resource.sourceUrl ?? moduleUrl
}

function isCanvasCompletableTaskType(taskType: TaskItem['taskType']) {
  return taskType === 'assignment'
    || taskType === 'quiz'
    || taskType === 'discussion'
    || taskType === 'project'
}

function buildCanvasModuleUrl(baseUrl: string | null | undefined, courseId: number, moduleId: number) {
  if (!baseUrl) return null
  return `${normalizeCanvasUrl(baseUrl)}/courses/${courseId}/modules/${moduleId}`
}

function buildCanvasPageApiUrl(
  baseUrl: string | null | undefined,
  courseId: number,
  pageUrl: string | null | undefined,
  fallback: string | null | undefined
) {
  if (pageUrl && baseUrl) {
    return `${normalizeCanvasUrl(baseUrl)}/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`
  }
  return resolveCanvasUrl(baseUrl, fallback)
}

function buildCanvasAssignmentApiUrl(
  baseUrl: string | null | undefined,
  courseId: number,
  assignmentId: number | null | undefined,
  fallback: string | null | undefined,
) {
  if (assignmentId && baseUrl) {
    return `${normalizeCanvasUrl(baseUrl)}/api/v1/courses/${courseId}/assignments/${assignmentId}`
  }

  return resolveCanvasUrl(baseUrl, fallback)
}

function buildCanvasDiscussionApiUrl(
  baseUrl: string | null | undefined,
  courseId: number,
  discussionId: number | null | undefined,
  fallback: string | null | undefined,
) {
  if (discussionId && baseUrl) {
    return `${normalizeCanvasUrl(baseUrl)}/api/v1/courses/${courseId}/discussion_topics/${discussionId}`
  }

  return resolveCanvasUrl(baseUrl, fallback)
}

function buildCanvasPageHtmlUrl(
  baseUrl: string | null | undefined,
  courseId: number,
  pageUrl: string | null | undefined,
  fallback: string | null | undefined
) {
  if (pageUrl && baseUrl) {
    return `${normalizeCanvasUrl(baseUrl)}/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`
  }
  return resolveCanvasUrl(baseUrl, fallback)
}

function resolveCanvasUrl(baseUrl: string | null | undefined, value: string | null | undefined) {
  if (!value) return null

  try {
    return new URL(value, baseUrl ? `${normalizeCanvasUrl(baseUrl)}/` : undefined).toString()
  } catch {
    return value
  }
}

function isCanvasPageModuleItem(item: { type?: string | null; page_url?: string | null }) {
  const type = item.type?.toLowerCase() ?? ''
  return Boolean(item.page_url) || type.includes('page') || type.includes('wiki')
}

function isCanvasAssignmentModuleItem(item: CanvasModuleItem) {
  const type = item.type?.toLowerCase() ?? ''
  return type.includes('assignment')
}

function isCanvasDiscussionModuleItem(item: CanvasModuleItem) {
  const type = item.type?.toLowerCase() ?? ''
  return type.includes('discussion')
}

function normalizeModuleItemSourceType(item: CanvasModuleItem) {
  if (isCanvasPageModuleItem(item)) return 'page'
  if (isCanvasAssignmentModuleItem(item)) return 'assignment'
  if (isCanvasDiscussionModuleItem(item)) return 'discussion'
  if ((item.type?.toLowerCase() ?? '') === 'file') return 'file'
  return (item.type?.toLowerCase() ?? 'resource').replace(/\s+/g, '_')
}

function buildModuleItemCapabilityNote(item: CanvasModuleItem) {
  const type = item.type?.trim() || 'resource'
  const locked = item.content_details?.locked_for_user
    ? ' Canvas currently marks it locked for this user.'
    : ''

  if ((item.type?.toLowerCase() ?? '').includes('external')) {
    return `This ${type} is preserved as a module link, but Stay Focused cannot read its body content directly yet.${locked}`
  }

  if ((item.type?.toLowerCase() ?? '').includes('subheader')) {
    return 'This module item is a structural subheader, so it is kept as navigation context instead of readable study content.'
  }

  return `This ${type} is linked from the module, but Stay Focused does not yet have direct readable extraction for this source type.${locked}`
}

function matchesCanvasTaskTitle(taskTitle: string, sourceTitle: string) {
  const left = normalizeTaskLookup(taskTitle)
  const right = normalizeTaskLookup(sourceTitle)
  return left === right || left.includes(right) || right.includes(left)
}

function normalizeTaskLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
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

  if (step === 'insert course' || step === 'upsert course') {
    const detail = [code, message].filter(Boolean).join(': ')
    return new Error(detail ? `Canvas sync failed during ${step}: ${detail}.` : `Canvas sync failed during ${step}.`)
  }

  return new Error(`Canvas sync failed during ${step}.`)
}

function formatCanvasActionError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message && !isGenericProductionActionError(message)) {
      return message
    }
  }

  return fallback
}

function isGenericProductionActionError(message: string) {
  return message.includes('An error occurred in the Server Components render')
    || message.includes('digest property is included')
}

function logCanvasActionFailure(step: string, error: unknown, context?: Record<string, unknown>) {
  console.error(`[Canvas action] step=${step}`, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
  })
}

function logCanvasCourseUpsertEvent(step: string, context: Record<string, unknown>) {
  console.info('[Canvas course upsert]', {
    step,
    ...context,
  })
}

function resolveInstructorName(course: CanvasCourse): string {
  const teacher = course.teachers?.[0]
  if (teacher?.display_name) return teacher.display_name
  return 'Canvas course staff'
}
