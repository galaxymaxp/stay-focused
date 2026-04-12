import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CourseLearnExplorer } from '@/components/CourseLearnExplorer'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseLearnOverview } from '@/lib/course-learn-overview'
import { getSearchParamValue } from '@/lib/stay-focused-links'

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function CourseLearnPage({ params, searchParams }: Props) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const workspace = await getClarityWorkspace()
  const courseOverview = await buildCourseLearnOverview(workspace, id)

  if (!courseOverview) notFound()

  const { course, modules, resumeCue } = courseOverview
  const deepLearnReadyCount = modules.reduce(
    (total, module) => total + module.studyMaterials.filter((material) => material.deepLearnStatus === 'ready').length,
    0,
  )
  const quizReadyDeepLearnCount = modules.reduce(
    (total, module) => total + module.studyMaterials.filter((material) => material.deepLearnQuizReady).length,
    0,
  )
  const initialOpenModuleId = getSearchParamValue(resolvedSearchParams?.module)
  const initialOpenResourceId = getSearchParamValue(resolvedSearchParams?.resource)
  const initialTaskId = getSearchParamValue(resolvedSearchParams?.task)
  const initialFocusedModuleId = getSearchParamValue(resolvedSearchParams?.focus) === '1'
    ? initialOpenModuleId
    : null

  return (
    <main className="page-shell page-shell-narrow page-stack">
      <section className="motion-card section-shell section-shell-elevated" style={{ padding: '1.35rem 1.4rem', display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 520px' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <p className="ui-kicker">Learn</p>
              <span className="ui-chip ui-chip-soft">{course.code}</span>
            </div>
            <h1 className="ui-page-title" style={{ marginTop: '0.5rem' }}>{course.name}</h1>
            <p className="ui-page-copy" style={{ maxWidth: '48rem' }}>
              A tighter Deep Learn workspace. Scan compact module cards, generate or reopen saved notes inline, and drop to reader/source fallback only when you need direct evidence.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/learn" className="ui-button ui-button-ghost">Back to Learn</Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
          <StatTile label="Modules in Learn" value={String(courseOverview.visibleModuleCount)} />
          <StatTile label="Deep Learn notes" value={String(deepLearnReadyCount)} />
          <StatTile label="Quiz-ready notes" value={String(quizReadyDeepLearnCount)} />
          <StatTile label="Action items" value={String(courseOverview.actionCount)} />
          <StatTile label="Hidden modules" value={String(courseOverview.hiddenModuleCount)} />
        </div>

        {courseOverview.deepLearnUnavailableModuleCount > 0 && (
          <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', border: '1px solid color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)' }}>
            <p className="ui-kicker">Deep Learn note status unavailable</p>
            <p style={{ margin: '0.45rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
              {courseOverview.deepLearnUnavailableModuleCount} module{courseOverview.deepLearnUnavailableModuleCount === 1 ? '' : 's'} could not load saved Deep Learn notes right now. Course Learn still renders from the module resources and fallback reader/source surfaces.
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
          <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
            <p className="ui-kicker">Course view</p>
            <p style={{ margin: '0.48rem 0 0', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {courseOverview.note}
            </p>
          </div>

          {resumeCue && (
            <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
              <p className="ui-kicker">{resumeCue.promptLabel}</p>
              <p style={{ margin: '0.45rem 0 0', fontSize: '16px', lineHeight: 1.45, fontWeight: 650, color: 'var(--text-primary)' }}>
                {resumeCue.title}
              </p>
              <p style={{ margin: '0.28rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                {resumeCue.moduleTitle}
              </p>
              <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {resumeCue.note}
              </p>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {resumeCue.external ? (
                  <a href={resumeCue.href} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs">
                    {resumeCue.actionLabel}
                  </a>
                ) : (
                  <Link href={resumeCue.href} className="ui-button ui-button-secondary ui-button-xs">
                    {resumeCue.actionLabel}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="motion-card motion-delay-1 section-shell" style={{ padding: '1.2rem 1.25rem', display: 'grid', gap: '0.9rem' }}>
        <div>
          <p className="ui-kicker">Modules</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Open only what you need, and keep Deep Learn first</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '46rem' }}>
            Every module stays collapsed by default. Expand one to generate or reopen saved Deep Learn notes, see quiz readiness, and keep source support nearby without turning the old reader into the main destination.
          </p>
        </div>

        {modules.length === 0 ? (
          <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
            {courseOverview.hiddenModuleCount > 0
              ? 'All modules in this course are currently hidden from Learn.'
              : 'No modules are available in Learn for this course yet.'}
          </div>
        ) : (
          <CourseLearnExplorer
            modules={modules}
            initialOpenModuleId={initialOpenModuleId}
            initialFocusedModuleId={initialFocusedModuleId}
            initialOpenResourceId={initialOpenResourceId}
            initialTaskId={initialTaskId}
          />
        )}
      </section>
    </main>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.82rem 0.9rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p style={{ margin: '0.38rem 0 0', fontSize: '20px', lineHeight: 1.1, fontWeight: 650, color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  )
}
