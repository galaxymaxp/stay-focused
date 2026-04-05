import { notFound } from 'next/navigation'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { buildLearnExperience, extractCourseName, getModuleWorkspace } from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LearnPage({ params }: Props) {
  const { id } = await params
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, deadlines, resources: storedResources } = workspace
  const courseName = extractCourseName(module.raw_content)
  const experience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount: deadlines.length,
    resources: storedResources,
  })
  const { sections, resources, audit } = experience

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
      currentLens="learn"
      moduleId={module.id}
      courseName={courseName}
      title={module.title}
      summary={module.summary}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>
        <section className="section-shell" style={{ padding: '1.35rem 1.45rem' }}>
          <div className="ui-meta-list" style={{ marginBottom: '1rem' }}>
            <span><strong>Tasks:</strong> {tasks.length} tied to this module</span>
            <span><strong>Deadlines:</strong> {deadlines.length} referenced</span>
            <span><strong>Resources:</strong> {resources.length} mapped from Canvas</span>
          </div>

          {audit.note && (
            <div className={audit.missingFileExtraction ? 'ui-card ui-status-warning' : 'ui-card-soft'} style={{ borderRadius: 'var(--radius-tight)', padding: '0.95rem 1rem', marginBottom: '1rem' }}>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.65 }}>
                {audit.note}
              </p>
            </div>
          )}

          <div className="ui-tab-group" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="ui-button ui-button-ghost ui-button-xs"
                style={{ textDecoration: 'none' }}
              >
                {section.title}
              </a>
            ))}
          </div>

          {resources.length > 0 && (
            <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', marginBottom: '1rem' }}>
              <p className="ui-kicker">Source map</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
                {resources.slice(0, 8).map((resource) => (
                  <article key={resource.id} style={{ padding: '0.85rem', borderRadius: 'var(--radius-tight)', border: '1px solid var(--border-subtle)', background: 'color-mix(in srgb, var(--surface-elevated) 94%, transparent)' }}>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                      <span className="ui-chip ui-chip-soft">{resource.type}</span>
                      {resource.extractionStatus && (
                        <span className="ui-chip ui-chip-soft">{labelForExtractionStatus(resource.extractionStatus)}</span>
                      )}
                      {resource.required && (
                        <span className="ui-chip ui-status-warning" style={{ padding: '0.28rem 0.6rem', fontSize: '11px', fontWeight: 700 }}>Required</span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 600 }}>{resource.title}</p>
                    {resource.moduleName && (
                      <p style={{ margin: '0.3rem 0 0', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>{resource.moduleName}</p>
                    )}
                    {resource.extractedTextPreview && (
                      <p style={{ margin: '0.55rem 0 0', fontSize: '12px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                        {resource.extractedTextPreview}
                      </p>
                    )}
                    {resource.extractionError && (
                      <p style={{ margin: '0.55rem 0 0', fontSize: '12px', lineHeight: 1.6, color: 'var(--red)' }}>
                        {resource.extractionError}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="ui-list-divider" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {sections.map((section, index) => (
              <article
                key={section.id}
                id={section.id}
                style={{
                  paddingTop: index === 0 ? 0 : '1.2rem',
                  paddingBottom: index === sections.length - 1 ? 0 : '1.2rem',
                }}
              >
                <p className="ui-kicker">
                  {section.title}
                </p>
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {section.body.split('\n').filter(Boolean).map((paragraph, paragraphIndex) => (
                    <p
                      key={`${section.id}-${paragraphIndex}`}
                      className="ui-reading-copy"
                      style={{
                        margin: 0,
                        fontSize: section.id === 'quick-summary' || section.id === 'explain-simply' ? '16px' : '15px',
                        lineHeight: section.id === 'quick-summary' || section.id === 'explain-simply' ? 1.78 : 1.72,
                        color: section.id === 'quick-summary' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </ModuleLensShell>
  )
}

function labelForExtractionStatus(status: 'pending' | 'extracted' | 'metadata_only' | 'unsupported' | 'empty' | 'failed') {
  if (status === 'extracted') return 'Text extracted'
  if (status === 'unsupported') return 'Unsupported'
  if (status === 'failed') return 'Extraction failed'
  if (status === 'empty') return 'No text found'
  if (status === 'pending') return 'Pending'
  return 'Metadata only'
}
