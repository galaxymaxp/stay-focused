'use server'

import { revalidatePath } from 'next/cache'
import { refreshCanvasModuleResourceMetadataForCourse } from '@/actions/canvas'
import { requireAuthenticatedUserServer, createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { buildResourceRefreshActivityDetail, recordResourceRefreshActivity } from '@/lib/resource-refresh-activity'

export async function refreshCourseResourcesAction(input: {
  courseId: string
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requireAuthenticatedUserServer()
  const db = await createAuthenticatedSupabaseServerClient()
  if (!db) {
    return { ok: false, error: 'Could not refresh this course right now.' }
  }

  const [{ data: settings }, { data: course }] = await Promise.all([
    db
      .from('user_settings')
      .select('canvas_api_url, canvas_access_token')
      .eq('user_id', user.id)
      .maybeSingle(),
    db
      .from('courses')
      .select('id, name, canvas_course_id, canvas_instance_url')
      .eq('id', input.courseId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!settings?.canvas_api_url || !settings?.canvas_access_token) {
    return { ok: false, error: 'Reconnect Canvas first, then try this refresh again.' }
  }
  if (!course || typeof course.canvas_course_id !== 'number' || !course.canvas_instance_url) {
    return { ok: false, error: 'This course is not ready for a bounded refresh yet.' }
  }

  try {
    const result = await refreshCanvasModuleResourceMetadataForCourse({
      userId: user.id,
      courseId: course.id,
      courseName: course.name,
      canvasUrl: settings.canvas_api_url,
      canvasAccessToken: settings.canvas_access_token,
      canvasCourseId: course.canvas_course_id,
    })

    const detail = buildResourceRefreshActivityDetail({
      courseName: course.name,
      resourcesInserted: result.resourcesInserted,
      resourcesUpdated: result.resourcesUpdated,
      warnings: result.warnings,
    })

    await recordResourceRefreshActivity({
      userId: user.id,
      courseId: course.id,
      status: result.warnings.length > 0 ? 'warning' : 'completed',
      detail,
      warnings: result.warnings,
      metadata: {
        modulesChecked: result.modulesChecked,
        moduleItemsChecked: result.moduleItemsChecked,
        resourcesInserted: result.resourcesInserted,
        resourcesUpdated: result.resourcesUpdated,
        skipped: result.skipped,
      },
    })

    revalidatePath('/sync')
    revalidatePath('/courses')
    revalidatePath(`/courses/${course.id}`)

    return { ok: true, message: detail }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Course refresh failed.'
    await recordResourceRefreshActivity({
      userId: user.id,
      courseId: course.id,
      status: 'failed',
      detail: `${course.name} refresh failed.`,
      warnings: [message],
      metadata: {},
    })
    return { ok: false, error: 'Could not refresh this course right now.' }
  }
}
