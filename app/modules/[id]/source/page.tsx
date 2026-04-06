import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { buildModuleLearnOverview } from '@/lib/module-learn-overview'
import { buildLearnExperience, extractCourseName, getLearnResourceHref, getModuleWorkspace, getResourceCanvasHref, type ModuleSourceResource } from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SourcePage({ params }: Props) {
  const { id } = await params
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, deadlines, resources: storedResources, resourceStudyStates } = workspace
  const courseName = extractCourseName(module.raw_content)
  const experience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount: deadlines.length,
    resources: storedResources,
    resourceStudyStates,
  })
  const overview = buildModuleLearnOverview({
    moduleId: module.id,
    resources: experience.resources,
    doItems: experience.doItems,
    tasks,
  })

  if (module.status === 'error') {
    return (
      <main className="page-shell page-shell-compact page-stack">
        <div className="ui-card ui-card-soft ui-status-danger" style={{ borderRadius: 'var(--radius-control)', padding: '14px', fontSize: '14px' }}>
          Processing failed. Delete this module and try again.
        </div>
      </main>
    )
  }

  return (
    <ModuleLensShell
      currentLens="source"
      moduleId={module.id}
      courseId={module.courseId}
      courseName={courseName}
      title={module.title}
      summary={overview.coverageNote}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 440px' }}>
              <p className="ui-kicker">Grounded source support</p>
              <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Source stays close to support the main Learn workspace</h2>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '46rem' }}>
                Readable files and pages stay available here when you want to verify evidence, reopen a document, or inspect extraction quality without cluttering the core Learn flow.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="ui-chip ui-chip-soft">{overview.totalStudyFileCount} study material{overview.totalStudyFileCount === 1 ? '' : 's'}</span>
              <span className="ui-chip ui-chip-soft">{overview.readyStudyFileCount} grounded</span>
              <span className="ui-chip ui-chip-soft">{overview.limitedStudyFileCount} limited</span>
            </div>
          </div>

            <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem 1.05rem', marginTop: '1rem' }}>
              <p className="ui-kicker">Why this still matters</p>
              <p style={{ margin: '0.55rem 0 0', fontSize: '15px', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
                Source is where you inspect the original extracted material, verify evidence, and reopen full readers. Learn stays lighter because this source layer is still available whenever you need more detail.
              </p>
            </div>
        </section>

        <section className="motion-card motion-delay-2 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <p className="ui-kicker">Study sources</p>
              <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>Files and pages backing this module Learn workspace</h3>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <StateChip label={`${overview.readyStudyFileCount} ready`} tone="accent" />
              {overview.limitedStudyFileCount > 0 && <StateChip label={`${overview.limitedStudyFileCount} limited`} tone="warning" />}
              {overview.unavailableStudyFileCount > 0 && <StateChip label={`${overview.unavailableStudyFileCount} need Canvas`} tone="muted" />}
            </div>
          </div>

          {overview.studyMaterials.length === 0 ? (
            <EmptySurface body="No active study materials are mapped into this module right now." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem', marginTop: '0.95rem' }}>
              {overview.studyMaterials.map((material) => (
                <article key={material.resource.id} className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <StateChip label={material.fileTypeLabel} tone="muted" />
                    <StateChip
                      label={material.readinessLabel}
                      tone={material.readiness === 'ready' ? 'accent' : material.readiness === 'limited' ? 'warning' : 'muted'}
                    />
                    {material.resource.required && <StateChip label="Required" tone="warning" />}
                  </div>

                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px', lineHeight: 1.42, color: 'var(--text-primary)' }}>{material.resource.title}</h4>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                      {material.note}
                    </p>
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.58, color: 'var(--text-muted)' }}>
                    {buildSourceContext(material.resource, courseName, module.title)}
                  </p>

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <Link href={getLearnResourceHref(module.id, material.resource.id)} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                      Open reader
                    </Link>
                    {getResourceCanvasHref(material.resource) && (
                      <a href={getResourceCanvasHref(material.resource)!} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Open in Canvas
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {overview.otherContextResources.length > 0 && (
          <section className="motion-card motion-delay-3 section-shell" style={{ padding: '1.25rem 1.35rem' }}>
            <p className="ui-kicker">Other support</p>
            <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '42rem' }}>
              These stay available as supporting context, but they are not the main term-bank sources.
            </p>
            <div style={{ display: 'grid', gap: '0.7rem', marginTop: '0.9rem' }}>
              {overview.otherContextResources.map((item) => (
                <article key={item.id} className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                    <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 600 }}>{item.title}</p>
                    {(item.linkedContext || item.whyItMatters || item.moduleName) && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                        {item.linkedContext ?? item.whyItMatters ?? item.moduleName}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Link href={getLearnResourceHref(module.id, item.id)} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                      Open detail
                    </Link>
                    {getResourceCanvasHref(item) && (
                      <a href={getResourceCanvasHref(item)!} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Open in Canvas
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </ModuleLensShell>
  )
}

function StateChip({ label, tone }: { label: string; tone: 'accent' | 'warning' | 'muted' }) {
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 88%, transparent)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
  const border = tone === 'accent'
    ? 'color-mix(in srgb, var(--accent) 30%, var(--border-subtle) 70%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
      : 'var(--border-subtle)'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.32rem 0.64rem',
      borderRadius: '999px',
      border: `1px solid ${border}`,
      background,
      fontSize: '11px',
      fontWeight: 700,
      lineHeight: 1.2,
      color: 'var(--text-primary)',
    }}>
      {label}
    </span>
  )
}

function EmptySurface({ body }: { body: string }) {
  return (
    <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.7, marginTop: '0.95rem' }}>
      {body}
    </div>
  )
}

function buildSourceContext(resource: ModuleSourceResource, courseName: string, moduleTitle: string) {
  const parts = [
    resource.courseName ?? courseName,
    resource.moduleName ?? moduleTitle,
    resource.originalTitle && resource.originalTitle !== resource.title ? `Canvas: ${resource.originalTitle}` : null,
  ].filter(Boolean)

  return parts.join(' / ') || 'Canvas study material'
}
