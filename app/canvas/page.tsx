import { ConnectCanvasFlowWrapper } from '@/components/ConnectCanvasFlowWrapper'
import { supabase } from '@/lib/supabase'

type SyncTone = 'success' | 'neutral' | 'warning'

interface CanvasPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function CanvasPage({ searchParams }: CanvasPageProps = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const actionParam = resolvedSearchParams.action
  const initialAction = Array.isArray(actionParam) ? actionParam[0] : actionParam ?? null

  const { data: syncedModules } = await supabase
    .from('modules')
    .select('id, title, summary, status, created_at, raw_content')
    .order('created_at', { ascending: false })

  const latestModule = syncedModules?.[0]
  const initialConnectionUrl = extractCanvasUrl(latestModule?.summary ?? null)
  const syncedCourseKeys = Array.from(
    new Set(
      (syncedModules ?? [])
        .map((module) => extractCourseKey(module.raw_content))
        .filter((value): value is string => Boolean(value))
    )
  )
  const lastSync = latestModule
    ? {
        label:
          latestModule.status === 'processed'
            ? `Last sync finished on ${new Date(latestModule.created_at).toLocaleString()}`
            : latestModule.status === 'error'
              ? `Last sync ran into a problem on ${new Date(latestModule.created_at).toLocaleString()}`
              : `A sync started on ${new Date(latestModule.created_at).toLocaleString()}`,
        tone: getSyncTone(latestModule.status),
      }
    : null
  const syncedModulesForFlow = (syncedModules ?? []).map((module) => ({
    id: module.id,
    title: module.title,
    summary: module.summary,
    createdAt: module.created_at,
  }))

  return (
    <main className="page-shell page-shell-narrow page-stack">
      <ConnectCanvasFlowWrapper
        initialConnectionUrl={initialConnectionUrl}
        lastSync={lastSync}
        syncedCourseKeys={syncedCourseKeys}
        initialAction={initialAction}
        syncedModules={syncedModulesForFlow}
      />
    </main>
  )
}

function extractCanvasUrl(summary: string | null) {
  if (!summary) return null

  const match = summary.match(/https?:\/\/[^\s)]+/i)
  return match?.[0] ?? null
}

function getSyncTone(status: string): SyncTone {
  if (status === 'processed') return 'success'
  if (status === 'error') return 'warning'
  return 'neutral'
}

function extractCourseKey(rawContent: string | null | undefined) {
  if (!rawContent) return null

  const firstLine = rawContent.split('\n').find((line) => line.startsWith('Course:'))
  if (!firstLine) return null

  const match = firstLine.match(/^Course:\s*(.+?)\s+\((.+)\)\s*$/)
  if (!match) return null

  return `${match[1]}::${match[2]}`.toLowerCase()
}
