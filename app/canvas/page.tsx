import { ConnectCanvasFlowWrapper } from '@/components/ConnectCanvasFlowWrapper'
import { UnsyncButton } from '@/components/UnsyncButton'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type SyncTone = 'success' | 'neutral' | 'warning'

export default async function CanvasPage() {
  const { data: syncedModules } = await supabase
    .from('modules')
    .select('id, title, summary, status, created_at, raw_content')
    .order('created_at', { ascending: false })

  const sectionLabel = (text: string) => (
    <h2 style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '0 0 10px' }}>
      {text}
    </h2>
  )

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

  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '2.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <ConnectCanvasFlowWrapper initialConnectionUrl={initialConnectionUrl} lastSync={lastSync} syncedCourseKeys={syncedCourseKeys} />

      {syncedModules && syncedModules.length > 0 && (
        <section>
          {sectionLabel('Synced courses')}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {syncedModules.map((mod) => (
              <li key={mod.id} style={{ display: 'flex', alignItems: 'stretch', gap: '8px', flexWrap: 'wrap' }}>
                <Link
                  href={`/modules/${mod.id}`}
                  style={{
                    flex: '1 1 320px',
                    minWidth: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                      {mod.title}
                    </p>
                    {mod.summary && (
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                        {mod.summary}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap', paddingTop: '1px' }}>
                    {new Date(mod.created_at).toLocaleDateString()}
                  </span>
                </Link>
                <UnsyncButton moduleId={mod.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
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
