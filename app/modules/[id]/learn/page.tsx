import { notFound } from 'next/navigation'
import Link from 'next/link'
import { LearnResourceCard } from '@/components/LearnResourceCard'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { buildLearnExperience, extractCourseName, findRecommendedStepTargets, getLearnResourceHref, getModuleWorkspace, getResourceCanvasHref } from '@/lib/module-workspace'

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
  const { sections, resources, learnUnits, doItems, supportItems, audit } = experience
  const suggestedSteps = findRecommendedStepTargets(module, experience, tasks)

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
        <section className="section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <p className="ui-kicker">Learn-first resources</p>
              <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Attachment-backed study units</h2>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem' }}>
                PDFs, slide decks, extracted files, practice links, and reference materials are surfaced first so Learn behaves more like your actual Canvas study flow.
              </p>
            </div>
            <span className="ui-chip ui-chip-soft">{learnUnits.length} study unit{learnUnits.length === 1 ? '' : 's'}</span>
          </div>

          {learnUnits.length === 0 ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.65 }}>
              No Learn-first resources were classified for this module yet, so Learn is falling back to the module overview below.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {learnUnits.map((unit) => (
                <LearnResourceCard key={unit.id} moduleId={module.id} unit={unit} />
              ))}
            </div>
          )}
        </section>

        {suggestedSteps.length > 0 && (
          <section className="section-shell" style={{ padding: '1.2rem 1.3rem' }}>
            <p className="ui-kicker">Suggested order</p>
            <p className="ui-section-copy" style={{ marginTop: '0.45rem' }}>
              Each step opens the most relevant resource or action surface instead of staying as passive text.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.85rem' }}>
              {suggestedSteps.map((step, index) => (
                <Link
                  key={step.id}
                  href={step.href}
                  className="glass-panel glass-hover"
                  style={{
                    ['--glass-panel-bg' as string]: 'var(--glass-surface-soft)',
                    ['--glass-panel-border' as string]: 'var(--glass-border)',
                    ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
                    borderRadius: 'var(--radius-panel)',
                    padding: '0.9rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.8rem',
                    alignItems: 'center',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <span style={{ width: '1.5rem', height: '1.5rem', borderRadius: '999px', background: 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
                      {index + 1}
                    </span>
                    <span style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{step.label}</span>
                  </div>
                  <span className="ui-chip ui-chip-soft">{step.destinationLabel}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

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
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.7rem' }}>
                      <Link href={getLearnResourceHref(module.id, resource.id)} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Deep view
                      </Link>
                      {getResourceCanvasHref(resource) && (
                        <a href={getResourceCanvasHref(resource)!} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                          Open in Canvas
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {doItems.length > 0 && (
            <div className="ui-card" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', marginBottom: '1rem' }}>
              <p className="ui-kicker">Do-first items</p>
              <p style={{ margin: '0.45rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                These are action-oriented items. They still matter, but they are separated from the study resources so Learn stays attachment-first.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.85rem' }}>
                {doItems.map((item) => (
                  <article key={item.id} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                      <span className="ui-chip ui-chip-soft">{labelForResourceKind(item.kind)}</span>
                      {item.required && (
                        <span className="ui-chip ui-status-warning" style={{ padding: '0.28rem 0.6rem', fontSize: '11px', fontWeight: 700 }}>Required</span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 600 }}>{item.title}</p>
                    {item.whyItMatters && (
                      <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{item.whyItMatters}</p>
                    )}
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
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
            </div>
          )}

          {supportItems.length > 0 && (
            <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', marginBottom: '1rem' }}>
              <p className="ui-kicker">Support context</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.75rem' }}>
                {supportItems.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 600 }}>{item.title}</p>
                      {item.moduleName && (
                        <p style={{ margin: '0.25rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{item.moduleName}</p>
                      )}
                      {item.linkedContext && (
                        <p style={{ margin: '0.3rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>{item.linkedContext}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span className="ui-chip ui-chip-soft">{labelForResourceKind(item.kind)}</span>
                      <Link href={getLearnResourceHref(module.id, item.id)} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Detail
                      </Link>
                    </div>
                  </div>
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

function labelForResourceKind(kind: 'study_file' | 'practice_link' | 'assignment' | 'quiz' | 'discussion' | 'reference' | 'announcement') {
  if (kind === 'study_file') return 'Study File'
  if (kind === 'practice_link') return 'Practice Link'
  if (kind === 'assignment') return 'Assignment'
  if (kind === 'quiz') return 'Quiz'
  if (kind === 'discussion') return 'Discussion'
  if (kind === 'reference') return 'Reference'
  return 'Announcement'
}
