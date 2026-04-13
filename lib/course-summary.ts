import { supabase } from '@/lib/supabase'
import type { ClarityWorkspace } from '@/lib/clarity-workspace'
import type { Course } from '@/lib/types'

export interface CourseSummary {
  course: Course
  moduleCount: number
  lastSyncedAt: string | null
  pendingTaskCount: number
  nextDueTask: { id: string; title: string; deadline: string; moduleId: string } | null
  recentAnnouncementCount: number
  readyPackCount: number
}

/**
 * Build lightweight per-course summaries from the already-loaded workspace,
 * plus a single batched deep_learn_notes query for ready pack counts.
 *
 * This replaces the old pattern of calling buildCourseLearnOverview per course,
 * which triggered getModuleWorkspace (7 queries) + listDeepLearnNotesForModule
 * (1 query) for every module — easily 100+ round-trips for a typical student.
 */
export async function buildCourseSummaries(
  workspace: ClarityWorkspace,
): Promise<CourseSummary[]> {
  const allModuleIds = workspace.modules.map((m) => m.id)
  const readyPacksByModuleId = new Map<string, number>()

  // One batched query instead of N per-module queries
  if (supabase && allModuleIds.length > 0) {
    const { data } = await supabase
      .from('deep_learn_notes')
      .select('module_id')
      .in('module_id', allModuleIds)
      .eq('status', 'ready')
    for (const row of data ?? []) {
      const moduleId = (row as { module_id: string }).module_id
      readyPacksByModuleId.set(moduleId, (readyPacksByModuleId.get(moduleId) ?? 0) + 1)
    }
  }

  return workspace.courses.map((course) => {
    const courseModules = workspace.modules.filter((m) => m.courseId === course.id)
    const pendingTasks = workspace.taskItems.filter(
      (t) => t.courseId === course.id && t.status !== 'completed',
    )

    const nextDueTask =
      [...pendingTasks]
        .filter((t) => t.deadline)
        .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]
      ?? null

    const lastSyncedAt =
      courseModules
        .map((m) => m.released_at ?? m.created_at)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      ?? null

    const readyPackCount = courseModules.reduce(
      (sum, m) => sum + (readyPacksByModuleId.get(m.id) ?? 0),
      0,
    )

    const recentAnnouncementCount = workspace.recentAnnouncements.filter(
      (a) => a.courseId === course.id,
    ).length

    return {
      course,
      moduleCount: courseModules.length,
      lastSyncedAt,
      pendingTaskCount: pendingTasks.length,
      nextDueTask: nextDueTask
        ? {
            id: nextDueTask.id,
            title: nextDueTask.title,
            deadline: nextDueTask.deadline!,
            moduleId: nextDueTask.moduleId,
          }
        : null,
      recentAnnouncementCount,
      readyPackCount,
    }
  })
}
