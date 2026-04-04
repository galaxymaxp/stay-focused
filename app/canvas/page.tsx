import { fetchCourses } from '@/actions/canvas'
import { CanvasSyncForm } from '@/components/CanvasSyncForm'
import { UnsyncButton } from '@/components/UnsyncButton'
import { supabase } from '@/lib/supabase'
import type { CanvasCourse } from '@/lib/canvas'
import Link from 'next/link'

export default async function CanvasPage() {
  let courses: CanvasCourse[] = []
  let configError = null

  const { data: syncedModules } = await supabase
    .from('modules')
    .select('id, title, summary, status, created_at')
    .eq('status', 'processed')
    .order('created_at', { ascending: false })

  try {
    courses = await fetchCourses()
  } catch (err) {
    configError = err instanceof Error ? err.message : 'Failed to connect to Canvas.'
  }

  const sectionLabel = (text: string) => (
    <h2 style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '0 0 10px' }}>
      {text}
    </h2>
  )

  return (
    <main style={{ maxWidth: '640px', margin: '0 auto', padding: '2.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {syncedModules && syncedModules.length > 0 && (
        <section>
          {sectionLabel('Already synced')}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {syncedModules.map((mod) => (
              <li key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Link
                  href={`/modules/${mod.id}`}
                  style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mod.title}
                    </p>
                    {mod.summary && (
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mod.summary}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {new Date(mod.created_at).toLocaleDateString()}
                  </span>
                </Link>
                <UnsyncButton moduleId={mod.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        {sectionLabel('Sync a course')}
        {configError ? (
          <div style={{ background: 'var(--red-light)', border: '1px solid #F5C5BC', borderRadius: '10px', padding: '14px', fontSize: '14px', color: 'var(--red)' }}>
            <p style={{ margin: 0, fontWeight: 500 }}>Canvas connection failed</p>
            <p style={{ margin: '4px 0 0' }}>{configError}</p>
          </div>
        ) : courses.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No active courses found.</p>
        ) : (
          <CanvasSyncForm courses={courses} />
        )}
      </section>

    </main>
  )
}