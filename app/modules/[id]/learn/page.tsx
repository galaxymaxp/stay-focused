import { notFound } from 'next/navigation'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { buildLearnSections, extractCourseName, getModuleWorkspace } from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LearnPage({ params }: Props) {
  const { id } = await params
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, deadlines } = workspace
  const courseName = extractCourseName(module.raw_content)
  const sections = buildLearnSections(module)

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
          </div>

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
                        fontSize: section.id === 'summary' || section.id === 'explanation' ? '16px' : '15px',
                        lineHeight: section.id === 'summary' || section.id === 'explanation' ? 1.78 : 1.72,
                        color: section.id === 'summary' ? 'var(--text-primary)' : 'var(--text-secondary)',
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
