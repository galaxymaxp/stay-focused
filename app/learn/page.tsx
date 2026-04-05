import Link from 'next/link'
import { LearnResourceCard } from '@/components/LearnResourceCard'
import { getClarityWorkspace, getCourseModules, getModuleTasks } from '@/lib/clarity-workspace'
import { buildLearnExperience, findRecommendedStepTargets } from '@/lib/module-workspace'

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
          const modules = getCourseModules(workspace, course.id).filter((module) => module.showInLearn !== false)
          if (modules.length === 0) return null

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
                  const topLearnUnits = experience.learnUnits.slice(0, 2)
                  const suggestedSteps = findRecommendedStepTargets(module, experience, [])

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
                          <Link href={`/modules/${module.id}/learn`} style={{ textDecoration: 'none' }}>
                            <h3 style={{ margin: '0.4rem 0 0', fontSize: '20px', lineHeight: 1.2, fontWeight: 650, color: 'var(--text-primary)' }}>{module.title}</h3>
                          </Link>
                        </div>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span className="ui-chip ui-chip-soft">{module.estimated_minutes} min</span>
                          <span className="ui-chip ui-chip-soft">{experience.learnUnits.length} learn unit{experience.learnUnits.length === 1 ? '' : 's'}</span>
                          <span className="ui-chip ui-chip-soft">{experience.doItems.length} do-first item{experience.doItems.length === 1 ? '' : 's'}</span>
                          {experience.audit.hasFileBasedResources && (
                            <span className="ui-chip ui-chip-soft">{experience.audit.fileResourceCount} file resource{experience.audit.fileResourceCount === 1 ? '' : 's'}</span>
                          )}
                        </div>
                      </div>

                      {topLearnUnits.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.8rem' }}>
                          {topLearnUnits.map((unit) => (
                            <LearnResourceCard key={unit.id} moduleId={module.id} unit={unit} compact />
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
                          {experience.sections.slice(0, 2).map((item) => (
                            <section key={item.id} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem' }}>
                              <p className="ui-kicker">{item.title}</p>
                              <p style={{ margin: '0.55rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{item.body}</p>
                            </section>
                          ))}
                        </div>
                      )}

                      {suggestedSteps.length > 0 && (
                        <div className="ui-card" style={{ borderRadius: 'var(--radius-tight)', padding: '0.95rem' }}>
                          <p className="ui-kicker">Suggested order</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.7rem' }}>
                            {suggestedSteps.slice(0, 3).map((step, index) => (
                              <Link key={step.id} href={step.href} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                                {index + 1}. {step.destinationLabel}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {experience.audit.note && (
                        <div className={experience.audit.missingFileExtraction ? 'ui-card ui-status-warning' : 'ui-card-soft'} style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.95rem' }}>
                          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>{experience.audit.note}</p>
                        </div>
                      )}

                      {experience.doItems.length > 0 && (
                        <div className="ui-card" style={{ borderRadius: 'var(--radius-tight)', padding: '0.95rem' }}>
                          <p className="ui-kicker">Do-first items</p>
                          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                            {experience.doItems.slice(0, 4).map((item) => (
                              <span key={item.id} className="ui-chip ui-chip-soft">{labelForResourceKind(item.kind)}: {item.title}</span>
                            ))}
                          </div>
                        </div>
                      )}

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

function labelForResourceKind(kind: 'study_file' | 'practice_link' | 'assignment' | 'quiz' | 'discussion' | 'reference' | 'announcement') {
  if (kind === 'study_file') return 'Study File'
  if (kind === 'practice_link') return 'Practice Link'
  if (kind === 'assignment') return 'Assignment'
  if (kind === 'quiz') return 'Quiz'
  if (kind === 'discussion') return 'Discussion'
  if (kind === 'reference') return 'Reference'
  return 'Announcement'
}
