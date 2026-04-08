import Link from 'next/link'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { getClarityWorkspace, getCourseModules, getModuleTasks, getTaskUrgencyLabel } from '@/lib/clarity-workspace'
import { buildLearnExperience } from '@/lib/module-workspace'
import { buildCourseLearnHref, buildModuleDoHref } from '@/lib/stay-focused-links'

export default async function CoursesPage() {
  const workspace = await getClarityWorkspace()

  if (!workspace.hasSyncedData) {
    return (
      <main className="page-shell page-stack">
        <SyncFirstEmptyState eyebrow="Courses" />
      </main>
    )
  }

  return (
    <main className="page-shell page-stack">
      <header className="motion-card section-shell section-shell-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', padding: '1.1rem 1.2rem' }}>
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
          const courseHref = `/courses/${course.id}/learn`

          return (
            <section key={course.id} className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1rem 1.05rem', display: 'flex', flexDirection: 'column', gap: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p className="ui-kicker">{course.code}</p>
                  <Link href={courseHref} style={{ textDecoration: 'none' }}>
                    <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>{course.name}</h2>
                  </Link>
                  <p className="ui-section-copy" style={{ marginTop: '0.38rem' }}>{toOneSentence(course.focusLabel)}</p>
                </div>
                <span className="ui-chip ui-chip-soft">{modules.length} module{modules.length === 1 ? '' : 's'}</span>
              </div>

              <div className="ui-meta-list">
                <span><strong>Instructor:</strong> {course.instructor}</span>
                <span><strong>Term:</strong> {course.term}</span>
                <span><strong>Active tasks:</strong> {pendingTasks.length}</span>
              </div>

              {newestModule && (
                <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.82rem 0.88rem' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Freshest module</p>
                  <Link href={buildCourseLearnHref(course.id, { moduleId: newestModule.id })} style={{ textDecoration: 'none' }}>
                    <p style={{ margin: '0.45rem 0 0', fontSize: '16px', fontWeight: 650, color: 'var(--text-primary)' }}>{newestModule.title}</p>
                  </Link>
                  <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>{toOneSentence(newestModule.summary)}</p>
                </div>
              )}

              {nextTask && (
                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.82rem 0.88rem' }}>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Next action</p>
                  <Link href={buildModuleDoHref(nextTask.moduleId, { taskId: nextTask.id })} style={{ textDecoration: 'none' }}>
                    <p style={{ margin: '0.45rem 0 0', fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>{nextTask.title}</p>
                  </Link>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>{getTaskUrgencyLabel(nextTask)} in {nextTask.moduleTitle}</p>
                </div>
              )}

              {moduleSnapshots.length > 0 && (
                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem 0.95rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                    <p className="ui-kicker">Modules</p>
                    <span className="ui-chip ui-chip-soft">Expand inline</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.72rem', maxHeight: '16.5rem', overflowY: 'auto', paddingRight: '0.2rem' }}>
                    {moduleSnapshots.map(({ module, experience, taskCount }) => (
                      <Link
                        key={module.id}
                        href={buildCourseLearnHref(course.id, { moduleId: module.id })}
                        className="glass-panel glass-hover"
                        style={{
                          ['--glass-panel-bg' as string]: 'var(--glass-surface)',
                          ['--glass-panel-border' as string]: 'var(--glass-border)',
                          ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
                          borderRadius: 'var(--radius-tight)',
                          padding: '0.72rem 0.78rem',
                          textDecoration: 'none',
                          display: 'grid',
                          gap: '0.22rem',
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>{module.title}</p>
                          <p style={{ margin: '0.25rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                            {experience.learnUnits.length} study unit{experience.learnUnits.length === 1 ? '' : 's'} / {taskCount} active task{taskCount === 1 ? '' : 's'}{module.showInLearn === false ? ' / hidden from global Learn' : ''}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                <Link href={courseHref} className="ui-button ui-button-secondary">Open course Learn</Link>
                <Link href={nextTask ? buildModuleDoHref(nextTask.moduleId, { taskId: nextTask.id }) : '/do'} className="ui-button ui-button-ghost">Open next Do item</Link>
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}

function toOneSentence(value: string | null | undefined) {
  const cleaned = value?.trim()
  if (!cleaned) return 'Synced course context stays compact here.'

  const sentenceMatch = cleaned.match(/(.+?[.!?])(\s|$)/)
  if (sentenceMatch) {
    return sentenceMatch[1].trim()
  }

  const clipped = cleaned.slice(0, 140)
  const spaceIndex = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, spaceIndex > 0 ? spaceIndex : clipped.length).trim()}...`
}
