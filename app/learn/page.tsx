import { getClarityWorkspace, getCourseModules, getModuleLearnItems, getModuleTasks } from '@/lib/clarity-workspace'

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
                  const items = getModuleLearnItems(workspace, module.id)
                  const taskCount = getModuleTasks(workspace, module.id).filter((task) => task.status !== 'completed').length

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
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
                        {items.map((item) => (
                          <section key={item.id} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem' }}>
                            <p className="ui-kicker">{labelForLearnType(item.type)}</p>
                            <h4 style={{ margin: '0.45rem 0 0', fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>{item.title}</h4>
                            <p style={{ margin: '0.55rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{item.body}</p>
                          </section>
                        ))}
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

function labelForLearnType(type: 'summary' | 'concept' | 'connection' | 'review') {
  if (type === 'summary') return 'Summary'
  if (type === 'concept') return 'Concept'
  if (type === 'connection') return 'Connection'
  return 'Review prompt'
}
