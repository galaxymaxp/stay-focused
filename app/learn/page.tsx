import Link from 'next/link'
import { getClarityWorkspace, getCourseModules, getModuleTasks } from '@/lib/clarity-workspace'
import { buildLearnExperience } from '@/lib/module-workspace'

export default async function LearnPage() {
  const workspace = await getClarityWorkspace()

  return (
    <main className="page-shell page-stack">
      <header>
        <p className="ui-kicker">Learn</p>
        <h1 className="ui-page-title">Understanding output, organized by course and module</h1>
        <p className="ui-page-copy">
          This is the clarity layer for comprehension: what each module is saying, the key ideas worth keeping, and the prompts that help the content stick before it turns into work.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {workspace.courses.map((course) => {
          const modules = getCourseModules(workspace, course.id)

          return (
            <section key={course.id} className="section-shell section-shell-elevated" style={{ padding: '1.25rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <p className="ui-kicker">{course.code}</p>
                <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>{course.name}</h2>
                <p className="ui-section-copy" style={{ marginTop: '0.45rem' }}>{course.focusLabel}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
                {modules.map((module) => {
                  const taskCount = getModuleTasks(workspace, module.id).filter((task) => task.status !== 'completed').length
                  const experience = buildLearnExperience(module, { taskCount })
                  const previewSections = experience.sections.slice(0, 3)

                  return (
                    <article key={module.id} id={module.id} className="glass-panel glass-hover" style={{
                      ['--glass-panel-bg' as string]: 'var(--glass-surface-strong)',
                      ['--glass-panel-border' as string]: 'var(--glass-border)',
                      ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
                      borderRadius: 'var(--radius-panel)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.9rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div>
                          <p className="ui-kicker">Module {module.order}</p>
                          <h3 style={{ margin: '0.4rem 0 0', fontSize: '20px', lineHeight: 1.2, fontWeight: 650, color: 'var(--text-primary)' }}>{module.title}</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span className="ui-chip ui-chip-soft">{module.estimated_minutes} min</span>
                          <span className="ui-chip ui-chip-soft">{taskCount} action item{taskCount === 1 ? '' : 's'}</span>
                          {experience.audit.hasFileBasedResources && (
                            <span className="ui-chip ui-chip-soft">{experience.audit.fileResourceCount} file resource{experience.audit.fileResourceCount === 1 ? '' : 's'}</span>
                          )}
                        </div>
                      </div>

                      <div className="ui-tab-group" style={{ flexWrap: 'wrap' }}>
                        {experience.sections.map((section) => (
                          <Link
                            key={section.id}
                            href={`/modules/${module.id}/learn#${section.id}`}
                            className="ui-button ui-button-ghost ui-button-xs"
                            style={{ textDecoration: 'none' }}
                          >
                            {section.title}
                          </Link>
                        ))}
                      </div>

                      {experience.audit.note && (
                        <div className={experience.audit.missingFileExtraction ? 'ui-card ui-status-warning' : 'ui-card-soft'} style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.95rem' }}>
                          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>{experience.audit.note}</p>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
                        {previewSections.map((item) => (
                          <section key={item.id} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem' }}>
                            <p className="ui-kicker">{item.title}</p>
                            <p style={{ margin: '0.55rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{item.body}</p>
                          </section>
                        ))}
                      </div>

                      <div>
                        <Link href={`/modules/${module.id}/learn`} className="ui-button ui-button-secondary" style={{ textDecoration: 'none' }}>
                          Open Full Learn View
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
