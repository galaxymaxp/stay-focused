import { createHash } from 'node:crypto'
import type { CourseLearnModuleCard } from '@/lib/course-learn-overview'
import { generateCourseSummary } from '@/lib/openai'
import { getAuthenticatedSupabaseServerContext } from '@/lib/supabase-auth-app'
import type { Course } from '@/lib/types'

interface StoredCourseSummaryRow {
  ai_summary?: string | null
  ai_summary_source_hash?: string | null
}

export async function getPersistedCoursePageSummary(
  course: Course,
  modules: CourseLearnModuleCard[],
) {
  const contextSnippet = buildCourseSummaryContextSnippet(course, modules)
  const summarySourceHash = buildCourseSummarySourceHash(course, modules)
  const authContext = await getAuthenticatedSupabaseServerContext()

  if (!authContext) {
    return generateCourseSummary(course.name, contextSnippet)
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

  if (storedSummary && storedHash === summarySourceHash) {
    return storedSummary
  }

  const generatedSummary = (await generateCourseSummary(course.name, contextSnippet)).trim()
  const resolvedSummary = generatedSummary && generatedSummary !== 'Course overview not available'
    ? generatedSummary
    : storedSummary || 'Course overview not available'

  if (resolvedSummary !== 'Course overview not available') {
    await client
      .from('courses')
      .update({
        ai_summary: resolvedSummary,
        ai_summary_source_hash: summarySourceHash,
        ai_summary_generated_at: new Date().toISOString(),
      })
      .eq('id', course.id)
      .eq('user_id', user.id)
  }

  return resolvedSummary
}

function buildCourseSummaryContextSnippet(course: Course, modules: CourseLearnModuleCard[]) {
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

function buildCourseSummarySourceHash(course: Course, modules: CourseLearnModuleCard[]) {
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
