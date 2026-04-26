import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CourseLearnModuleCard } from '@/lib/course-learn-overview'
import { generateCourseSummary } from '@/lib/openai'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'
import { getAuthenticatedSupabaseServerContext } from '@/lib/supabase-auth-app'
import type { Course } from '@/lib/types'

interface StoredCourseSummaryRow {
  ai_summary?: string | null
  ai_summary_source_hash?: string | null
}

interface CourseSummaryModuleContext {
  id: string
  title: string
  summary: string | null
  pendingTasks: { title: string }[]
  completedTasks: unknown[]
}

export async function getPersistedCoursePageSummary(
  course: Course,
  modules: CourseLearnModuleCard[],
) {
  const summarySourceHash = buildCourseSummarySourceHash(course, modules)
  const authContext = await getAuthenticatedSupabaseServerContext()

  if (!authContext) {
    return 'Course overview will appear after sync finishes processing sources.'
  }

  const { client, user } = authContext
  const { data: storedRow } = await client
    .from('courses')
    .select('ai_summary, ai_summary_source_hash')
    .eq('id', course.id)
    .eq('user_id', user.id)
    .maybeSingle()

  const storedSummary = ((storedRow as StoredCourseSummaryRow | null)?.ai_summary ?? '').trim()
  const storedHash = ((storedRow as StoredCourseSummaryRow | null)?.ai_summary_source_hash ?? '').trim()

  if (storedSummary && storedHash === summarySourceHash) return storedSummary
  if (storedSummary) return `${storedSummary} Updated course overview is being prepared after sync.`
  return 'Course overview will appear after sync finishes processing sources.'
}

export async function generateCoursePageSummaryForUserId(input: {
  courseId: string
  userId: string
  client?: SupabaseClient | null
}) {
  const client = input.client ?? createSupabaseServiceRoleClient()
  if (!client) return { generated: 0, skipped: 1, failed: 0 }

  const { data: courseRow, error: courseError } = await client
    .from('courses')
    .select('*')
    .eq('id', input.courseId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (courseError || !courseRow) return { generated: 0, skipped: 0, failed: 1 }

  const course = adaptCourse(courseRow as Record<string, unknown>)
  const { data: moduleRows, error: moduleError } = await client
    .from('modules')
    .select('id,title,summary')
    .eq('course_id', input.courseId)
    .order('created_at')

  if (moduleError) return { generated: 0, skipped: 0, failed: 1 }

  const moduleIds = (moduleRows ?? []).map((row) => String(row.id ?? '')).filter(Boolean)
  const summaryByModuleId = await loadModuleSummaryText(client, moduleIds, input.userId)
  const taskCountsByModuleId = await loadTaskTitles(client, moduleIds)
  const modules = (moduleRows ?? []).map((row) => {
    const id = String(row.id ?? '')
    return {
      id,
      title: typeof row.title === 'string' ? row.title : 'Module',
      summary: summaryByModuleId.get(id) ?? (typeof row.summary === 'string' ? row.summary : null),
      pendingTasks: taskCountsByModuleId.get(id) ?? [],
      completedTasks: [],
    } satisfies CourseSummaryModuleContext
  })
  const summarySourceHash = buildCourseSummarySourceHash(course, modules)
  const storedSummary = typeof (courseRow as StoredCourseSummaryRow).ai_summary === 'string'
    ? (courseRow as StoredCourseSummaryRow).ai_summary?.trim() ?? ''
    : ''
  const storedHash = typeof (courseRow as StoredCourseSummaryRow).ai_summary_source_hash === 'string'
    ? (courseRow as StoredCourseSummaryRow).ai_summary_source_hash?.trim() ?? ''
    : ''

  if (storedSummary && storedHash === summarySourceHash) return { generated: 0, skipped: 1, failed: 0 }

  const contextSnippet = buildCourseSummaryContextSnippet(course, modules)
  if (contextSnippet.length < 160) return { generated: 0, skipped: 1, failed: 0 }

  const generatedSummary = (await generateCourseSummary(course.name, contextSnippet)).trim()
  if (!generatedSummary || generatedSummary === 'Course overview not available') return { generated: 0, skipped: 1, failed: 0 }

  const { error: updateError } = await client
    .from('courses')
    .update({
      ai_summary: generatedSummary,
      ai_summary_source_hash: summarySourceHash,
      ai_summary_generated_at: new Date().toISOString(),
    })
    .eq('id', input.courseId)
    .eq('user_id', input.userId)

  if (updateError) return { generated: 0, skipped: 0, failed: 1 }
  return { generated: 1, skipped: 0, failed: 0 }
}

async function loadModuleSummaryText(client: SupabaseClient, moduleIds: string[], userId: string) {
  if (moduleIds.length === 0) return new Map<string, string>()

  const { data, error } = await client
    .from('module_summaries')
    .select('module_id,summary,status')
    .eq('user_id', userId)
    .eq('status', 'ready')
    .in('module_id', moduleIds)

  if (error) return new Map<string, string>()

  return new Map((data ?? [])
    .map((row) => [String(row.module_id ?? ''), typeof row.summary === 'string' ? row.summary : ''] as const)
    .filter((entry) => entry[0] && entry[1].trim()))
}

async function loadTaskTitles(client: SupabaseClient, moduleIds: string[]) {
  if (moduleIds.length === 0) return new Map<string, { title: string }[]>()

  const { data, error } = await client
    .from('task_items')
    .select('module_id,title,status')
    .in('module_id', moduleIds)
    .neq('status', 'completed')

  if (error) return new Map<string, { title: string }[]>()

  const byModuleId = new Map<string, { title: string }[]>()
  for (const row of data ?? []) {
    const moduleId = String(row.module_id ?? '')
    const title = typeof row.title === 'string' ? row.title : null
    if (!moduleId || !title) continue
    const existing = byModuleId.get(moduleId) ?? []
    if (existing.length < 3) existing.push({ title })
    byModuleId.set(moduleId, existing)
  }
  return byModuleId
}

function buildCourseSummaryContextSnippet(course: Course, modules: CourseSummaryModuleContext[]) {
  const moduleContext = modules
    .slice(0, 6)
    .map((module) => {
      const fragments = [module.title]

      if (module.summary) {
        fragments.push(module.summary)
      }

      if (module.pendingTasks.length > 0) {
        fragments.push(`Pending: ${module.pendingTasks.slice(0, 3).map((task) => task.title).join('; ')}`)
      }

      return fragments.join(' - ')
    })
    .join(' | ')

  const context = [
    course.code,
    course.term,
    course.instructor,
    moduleContext,
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' | ')

  return context.slice(0, 1200)
}

function buildCourseSummarySourceHash(course: Course, modules: CourseSummaryModuleContext[]) {
  const digest = createHash('sha256')
  digest.update(course.name)
  digest.update('|')
  digest.update(course.code)
  digest.update('|')
  digest.update(course.term)
  digest.update('|')
  digest.update(course.instructor)

  for (const moduleCard of modules) {
    digest.update('|')
    digest.update(moduleCard.id)
    digest.update('|')
    digest.update(moduleCard.title)
    digest.update('|')
    digest.update(moduleCard.summary ?? '')
    digest.update('|')
    digest.update(String(moduleCard.pendingTasks.length))
    digest.update('|')
    digest.update(String(moduleCard.completedTasks.length))
  }

  return digest.digest('hex')
}

function adaptCourse(row: Record<string, unknown>): Course {
  return {
    id: String(row.id ?? ''),
    code: typeof row.code === 'string' ? row.code : '',
    name: typeof row.name === 'string' ? row.name : 'Course',
    term: typeof row.term === 'string' ? row.term : '',
    instructor: typeof row.instructor === 'string' ? row.instructor : '',
    focusLabel: typeof row.focus_label === 'string' ? row.focus_label : 'Course',
    colorToken: row.color_token === 'yellow' || row.color_token === 'orange' || row.color_token === 'blue' || row.color_token === 'green'
      ? row.color_token
      : 'blue',
  }
}
