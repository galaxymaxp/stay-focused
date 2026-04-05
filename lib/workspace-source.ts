import { buildSeedWorkspaceSource, type ClarityWorkspaceSourceData, adaptSupabaseWorkspaceRows } from '@/lib/workspace-adapter'
import { fetchWorkspaceRows } from '@/lib/workspace-queries'
import { isSupabaseConfigured } from '@/lib/supabase'

export async function loadWorkspaceSource(): Promise<ClarityWorkspaceSourceData> {
  if (!isSupabaseConfigured) {
    return buildSeedWorkspaceSource()
  }

  const rows = await fetchWorkspaceRows()
  if (!rows) {
    return buildSeedWorkspaceSource()
  }

  const hasAnySupabaseData = rows.courses.length > 0 || rows.modules.length > 0 || rows.learningItems.length > 0 || rows.taskItems.length > 0
  if (!hasAnySupabaseData) {
    return buildSeedWorkspaceSource()
  }

  const adapted = adaptSupabaseWorkspaceRows(rows)
  const hasUsableWorkspaceData = adapted.courses.length > 0 && adapted.modules.length > 0

  return hasUsableWorkspaceData ? adapted : buildSeedWorkspaceSource()
}
