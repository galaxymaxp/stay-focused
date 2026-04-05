import Link from 'next/link'
import { getClarityWorkspace, getCourseModules, getModuleTasks, getTaskUrgencyLabel } from '@/lib/clarity-workspace'
import { buildLearnExperience } from '@/lib/module-workspace'

export default async function CoursesPage() {
  const workspace = await getClarityWorkspace()

  return (
    <main className="page-shell page-stack">
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div>
          <p className="ui-kicker">Courses</p>
          <h1 className="ui-page-title">Where each class stands right now</h1>
          <p className="ui-page-copy">
            A quieter course view built from the same clarity layer as Today, Learn, and Do. Each card shows what is new, what is due, and where the next useful move lives.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {workspace.courses.map((course) => {
          const modules = getCourseModules(workspace, course.id)
          const tasks = modules.flatMap((module) => getModuleTasks(workspace, module.id))
          const pendingTasks = tasks.filter((task) => task.status !== 'completed')
          const nextTask = pendingTasks[0] ?? null
          const moduleSnapshots = modules.map((module) => ({
            module,
            taskCount: getModuleTasks(workspace, module.id).filter((task) => task.status !== 'completed').length,
            experience: buildLearnExperience(module, {
              taskCount: getModuleTasks(workspace, module.id).filter((task) => task.status !== 'completed').length,
            }),
          }))
          const newestModule = [...modules].sort(
            (a, b) => new Date(b.released_at ?? b.created_at).getTime() - new Date(a.released_at ?? a.created_at).getTime(),
          )[0] ?? null
          const bestLearnModule = [...moduleSnapshots].sort((a, b) =>
            b.experience.learnUnits.length - a.experience.learnUnits.length
            || b.taskCount - a.taskCount
            || new Date(b.module.released_at ?? b.module.created_at).getTime() - new Date(a.module.released_at ?? a.module.created_at).getTime(),
          )[0]?.module ?? newestModule
          const courseHref = bestLearnModule ? `/modules/${bestLearnModule.id}/learn` : '/learn'

          return (
            <section key={course.id} className="section-shell section-shell-elevated" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p className="ui-kicker">{course.code}</p>
                  <Link href={courseHref} style={{ textDecoration: 'none' }}>
                    <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>{course.name}</h2>
                  </Link>
                  <p className="ui-section-copy" style={{ marginTop: '0.45rem' }}>{course.focusLabel}</p>
                </div>
                <span className="ui-chip ui-chip-soft">{modules.length} module{modules.length === 1 ? '' : 's'}</span>
              </div>

              <div className="ui-meta-list">
                <span><strong>Instructor:</strong> {course.instructor}</span>
                <span><strong>Term:</strong> {course.term}</span>
                <span><strong>Active tasks:</strong> {pendingTasks.length}</span>
              </div>

              {newestModule && (
                <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Freshest module</p>
                  <Link href={`/modules/${newestModule.id}/learn`} style={{ textDecoration: 'none' }}>
                    <p style={{ margin: '0.45rem 0 0', fontSize: '16px', fontWeight: 650, color: 'var(--text-primary)' }}>{newestModule.title}</p>
                  </Link>
                  <p style={{ margin: '0.45rem 0 0', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{newestModule.summary}</p>
                </div>
              )}

              {nextTask && (
                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Next action</p>
                  <Link href={`/modules/${nextTask.moduleId}/do#${nextTask.id}`} style={{ textDecoration: 'none' }}>
                    <p style={{ margin: '0.45rem 0 0', fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>{nextTask.title}</p>
                  </Link>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>{getTaskUrgencyLabel(nextTask)} in {nextTask.moduleTitle}</p>
                </div>
              )}

              {moduleSnapshots.length > 0 && (
                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                    <p className="ui-kicker">Modules</p>
                    <span className="ui-chip ui-chip-soft">Direct learn links</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.8rem', maxHeight: '19rem', overflowY: 'auto', paddingRight: '0.2rem' }}>
                    {moduleSnapshots.map(({ module, experience, taskCount }) => (
                      <Link
                        key={module.id}
                        href={`/modules/${module.id}/learn`}
                        className="glass-panel glass-hover"
                        style={{
                          ['--glass-panel-bg' as string]: 'var(--glass-surface)',
                          ['--glass-panel-border' as string]: 'var(--glass-border)',
                          ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
                          borderRadius: 'var(--radius-tight)',
                          padding: '0.85rem 0.9rem',
                          textDecoration: 'none',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>{module.title}</p>
                          <p style={{ margin: '0.25rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                            {experience.learnUnits.length} learn unit{experience.learnUnits.length === 1 ? '' : 's'} • {taskCount} active task{taskCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="ui-button ui-button-ghost ui-button-xs">Open Learn</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                <Link href={courseHref} className="ui-button ui-button-secondary">Open course Learn</Link>
                <Link href={nextTask ? `/modules/${nextTask.moduleId}/do#${nextTask.id}` : '/do'} className="ui-button ui-button-secondary">Open next Do item</Link>
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
