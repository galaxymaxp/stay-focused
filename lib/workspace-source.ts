import { type ClarityWorkspaceSourceData, adaptSupabaseWorkspaceRows } from '@/lib/workspace-adapter'
import { fetchWorkspaceRows } from '@/lib/workspace-queries'
import { isSupabaseConfigured } from '@/lib/supabase'

export async function loadWorkspaceSource(): Promise<ClarityWorkspaceSourceData> {
  if (!isSupabaseConfigured) {
    return buildEmptyWorkspaceSource()
  }

  const rows = await fetchWorkspaceRows()
  if (!rows) {
    return buildEmptyWorkspaceSource()
  }

  const hasAnySupabaseData = rows.courses.length > 0 || rows.modules.length > 0 || rows.learningItems.length > 0 || rows.taskItems.length > 0
  if (!hasAnySupabaseData) {
    return buildEmptyWorkspaceSource()
  }

  const adapted = adaptSupabaseWorkspaceRows(rows)
  const hasUsableWorkspaceData = adapted.courses.length > 0 || adapted.modules.length > 0 || adapted.learnItems.length > 0 || adapted.taskItems.length > 0

  return hasUsableWorkspaceData ? adapted : buildEmptyWorkspaceSource()
}

function buildEmptyWorkspaceSource(): ClarityWorkspaceSourceData {
  return {
    courses: [],
    modules: [],
    learnItems: [],
    taskItems: [],
  }
}
