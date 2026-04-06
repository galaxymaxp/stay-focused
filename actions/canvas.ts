'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  compileCanvasContent,
  downloadCanvasBinary,
  getCanvasFile,
  getCanvasPage,
  getAnnouncements,
  getAssignments,
  getCourses,
  getModules,
  normalizeCanvasUrl,
  type CanvasConfig,
  type CanvasAssignment,
  type CanvasCourse,
} from '@/lib/canvas'
import { extractCanvasFileContent, extractCanvasPageContent, normalizeExtension } from '@/lib/canvas-resource-extraction'
import { dedupeAIResponseDeadlines } from '@/lib/course-work-dedupe'
import { processModuleContent } from '@/lib/openai'
import { supabase } from '@/lib/supabase'
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
  return getCourses(config)
}

export async function testCanvasConnection(input: {
  canvasUrl: string
  accessToken: string
}): Promise<CanvasConnectionResult | CanvasConnectionErrorResult> {
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

  let result: SyncCourseResult
  try {
    result = await syncSingleCourse({
      id: courseId,
      name: courseName,
      course_code: courseCode,
      enrollment_state: 'active',
    }, config)
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
    try {
      await syncSingleCourse({
        id: course.courseId,
        name: course.courseName,
        course_code: course.courseCode,
        enrollment_state: 'active',
      }, config)
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

async function syncSingleCourse(course: CanvasCourse, config: Partial<CanvasConfig>): Promise<SyncCourseResult> {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  const databaseSafeCourse = createDatabaseSafeCanvasCourse(course)

  const [assignments, announcements, modules] = await Promise.all([
    getAssignments(course.id, config),
    getAnnouncements(course.id, config),
    getModules(course.id, config),
  ])

  if (assignments.length === 0 && announcements.length === 0 && modules.length === 0) {
    throw new Error(`Canvas did not return any assignments, announcements, or module content for ${databaseSafeCourse.name} yet.`)
  }

  const resourceIngestion = await ingestModuleResources(course.id, modules, config)
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
  const courseRecord = await ensureCourseRecord(databaseSafeCourse)
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

  const standaloneDeadlines = dedupeAIResponseDeadlines(aiResult.tasks, aiResult.deadlines)

  const { error: moduleUpdateError } = await supabase
    .from('modules')
    .update(sanitizeDatabaseValue({
      title: aiResult.title,
      summary: aiResult.summary,
      concepts: aiResult.concepts,
      study_prompts: aiResult.study_prompts,
      recommended_order: aiResult.recommended_order,
      status: 'processed',
      estimated_minutes: estimateModuleMinutes(aiResult),
      priority_signal: deriveModulePrioritySignal(aiResult),
    }))
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

  const syncedTaskDrafts = buildSyncedTaskDrafts(aiResult, {
    taskCanvasLinks,
  })
  const clarityTaskItems = buildTaskItemsForSync(syncedTaskDrafts, {
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
        taskCount: aiResult.tasks.length,
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
    courseName: course.name,
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

async function ensureCourseRecord(course: CanvasCourse): Promise<ExistingCourseMatch> {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  const databaseSafeCourse = createDatabaseSafeCanvasCourse(course)

  const { data: insertedCourse, error: insertCourseError } = await supabase
    .from('courses')
    .insert(sanitizeDatabaseValue({
      code: databaseSafeCourse.course_code,
      name: databaseSafeCourse.name,
      term: databaseSafeCourse.term?.name ?? 'Current term',
      instructor: 'Canvas course staff',
      focus_label: 'Synced from Canvas',
      color_token: pickCourseColorToken(databaseSafeCourse.course_code, databaseSafeCourse.name),
    }))
    .select('id')
    .single()

  if (insertedCourse) return insertedCourse as ExistingCourseMatch

  if (insertCourseError?.code === '23505') {
    const { data: existingCourse, error: existingCourseError } = await supabase
      .from('courses')
      .select('id')
      .eq('code', databaseSafeCourse.course_code)
      .eq('name', databaseSafeCourse.name)
      .limit(1)
      .maybeSingle()

    if (existingCourse) return existingCourse as ExistingCourseMatch

    if (existingCourseError) {
      throw createSupabaseStepError('resolve existing synced course after conflict', existingCourseError, {
        courseCode: databaseSafeCourse.course_code,
        courseName: databaseSafeCourse.name,
      })
    }
  }

  if (insertCourseError || !insertedCourse) {
    throw createSupabaseStepError('insert course', insertCourseError, {
      courseCode: databaseSafeCourse.course_code,
      courseName: databaseSafeCourse.name,
    })
  }

  return insertedCourse as ExistingCourseMatch
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
  return sanitizeDatabaseValue(resources.map((resource) => ({
    module_id: context.moduleId,
    course_id: context.courseId,
    canvas_module_id: resource.canvasModuleId,
    canvas_item_id: resource.canvasItemId,
    canvas_file_id: resource.canvasFileId,
    title: resource.title,
    resource_type: resource.resourceType,
    content_type: resource.contentType,
    extension: resource.extension,
    source_url: resource.sourceUrl,
    html_url: resource.htmlUrl,
    extraction_status: resource.extractionStatus,
    extracted_text: resource.extractedText,
    extracted_text_preview: resource.extractedTextPreview,
    extracted_char_count: resource.extractedCharCount,
    extraction_error: resource.extractionError,
    required: resource.required,
    metadata: resource.metadata,
  })))
}

function buildSyncedTaskDrafts(
  aiResult: AIResponse,
  context: { taskCanvasLinks: TaskCanvasLink[] },
): SyncedTaskDraft[] {
  return aiResult.tasks.map((task) => {
    const taskType = normalizeTaskTypeForSync(task.task_type, task.title, task.details)
    const matchedCanvasLink = resolveTaskCanvasLink(task.title, context.taskCanvasLinks, taskType)

    return {
      title: task.title,
      details: task.details,
      deadline: task.deadline,
      priority: task.priority,
      taskType,
      estimatedMinutes: normalizeEstimatedMinutes(task.estimated_minutes, task.priority),
      canvasUrl: matchedCanvasLink?.canvasUrl ?? null,
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
    extracted_from: context.extractedFrom,
    canvas_url: task.canvasUrl,
    canvas_assignment_id: task.canvasAssignmentId,
    completion_origin: task.completionOrigin,
    planning_annotation: null,
  })))
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
): Promise<ResourceIngestionRecord[]> {
  const records: ResourceIngestionRecord[] = []

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
        },
      }

      if (isCanvasPageModuleItem(item)) {
        try {
          const page = await getCanvasPage(courseId, {
            pageUrl: item.page_url ?? null,
            apiUrl: item.url ?? null,
          }, config)
          const title = page.title?.trim() || item.title
          const extracted = await extractCanvasPageContent({
            title,
            html: page.body ?? '',
          })

          records.push({
            ...baseRecord,
            title,
            contentType: 'text/html',
            extension: null,
            sourceUrl: buildCanvasPageApiUrl(config.url ?? null, courseId, page.url ?? item.page_url ?? null, item.url ?? null),
            htmlUrl: buildCanvasPageHtmlUrl(config.url ?? null, courseId, page.url ?? item.page_url ?? null, page.html_url ?? item.html_url ?? null),
            extractionStatus: extracted.extractionStatus,
            extractedText: extracted.extractedText,
            extractedTextPreview: extracted.extractedTextPreview,
            extractedCharCount: extracted.extractedCharCount,
            extractionError: extracted.extractionError,
            metadata: {
              ...baseRecord.metadata,
              canvasPageUrl: page.url ?? item.page_url ?? null,
              pageUpdatedAt: page.updated_at ?? null,
              pagePublished: page.published ?? null,
            },
          })
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

      if (item.type.toLowerCase() !== 'file' || typeof item.content_id !== 'number') {
        records.push(baseRecord)
        continue
      }

      try {
        const file = await getCanvasFile(courseId, item.content_id, config)
        const title = file.display_name?.trim() || file.filename?.trim() || item.title
        const contentType = file.content_type ?? file['content-type'] ?? baseRecord.contentType
        const extension = normalizeExtension(null, title)
        const sourceUrl = file.url ?? baseRecord.sourceUrl

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
              fileSize: file.size ?? null,
              mimeClass: file.mime_class ?? null,
            },
          })
          continue
        }

        const fileBuffer = await downloadCanvasBinary(sourceUrl, config)
        const extracted = await extractCanvasFileContent({
          buffer: fileBuffer,
          title,
          extension,
          contentType,
        })

        records.push({
          ...baseRecord,
          canvasFileId: file.id,
          title,
          contentType,
          extension,
          sourceUrl,
          htmlUrl: file.preview_url ?? baseRecord.htmlUrl,
          extractionStatus: extracted.extractionStatus,
          extractedText: extracted.extractedText,
          extractedTextPreview: extracted.extractedTextPreview,
          extractedCharCount: extracted.extractedCharCount,
          extractionError: extracted.extractionError,
          metadata: {
            ...baseRecord.metadata,
            fileSize: file.size ?? null,
            mimeClass: file.mime_class ?? null,
            fileUpdatedAt: file.updated_at ?? null,
          },
        })
      } catch (error) {
        records.push({
          ...baseRecord,
          extractionStatus: 'failed',
          extractionError: error instanceof Error ? error.message : 'Unknown Canvas file ingestion error.',
        })
      }
    }
  }

  return records
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

function createDatabaseSafeCanvasCourse(course: CanvasCourse): CanvasCourse {
  return {
    ...course,
    name: normalizeCanvasCourseField(course.name, `Canvas course ${course.id}`),
    course_code: normalizeCanvasCourseField(course.course_code, `canvas-${course.id}`),
    term: course.term
      ? {
          ...course.term,
          name: normalizeCanvasCourseField(course.term.name, 'Current term'),
        }
      : course.term,
  }
}

function normalizeCanvasCourseField(value: string | null | undefined, fallback: string) {
  const normalized = stripDatabaseNullCharacters(value ?? '').trim()
  return normalized || fallback
}

function stripDatabaseNullCharacters(value: string) {
  return value.replace(/\u0000/g, '')
}

function sanitizeDatabaseValue<T>(value: T): T {
  if (typeof value === 'string') {
    return stripDatabaseNullCharacters(value) as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDatabaseValue(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, sanitizeDatabaseValue(nestedValue)])
    ) as T
  }

  return value
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
