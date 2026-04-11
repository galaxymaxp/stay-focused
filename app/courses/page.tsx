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
      <header className="motion-card page-intro">
        <p className="ui-kicker">Courses</p>
        <h1 className="ui-page-title">What each class needs next</h1>
        <p className="ui-page-copy page-intro-copy">
          Each course is reduced to what changed, what needs attention, and where the next useful move lives.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.95rem' }}>
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
            <section key={course.id} className="motion-card motion-delay-1 section-shell" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p className="ui-kicker">{course.code}</p>
                  <Link href={courseHref} style={{ textDecoration: 'none' }}>
                    <h2 className="ui-section-title" style={{ marginTop: '0.38rem' }}>{course.name}</h2>
                  </Link>
                  <p className="ui-section-copy" style={{ marginTop: '0.3rem' }}>{toOneSentence(course.focusLabel)}</p>
                </div>
                <span className="ui-chip ui-chip-soft">{modules.length} module{modules.length === 1 ? '' : 's'}</span>
              </div>

              <div className="ui-meta-list">
                <span><strong>Instructor:</strong> {course.instructor}</span>
                <span><strong>Term:</strong> {course.term}</span>
                <span><strong>Active tasks:</strong> {pendingTasks.length}</span>
              </div>

              {(newestModule || nextTask) && (
                <div className="workspace-summary-grid">
                  {newestModule && (
                    <div className="workspace-quiet-panel">
                      <p className="ui-kicker" style={{ margin: 0 }}>Latest change</p>
                      <Link href={buildCourseLearnHref(course.id, { moduleId: newestModule.id })} style={{ textDecoration: 'none' }}>
                        <p className="workspace-quiet-panel-title">{newestModule.title}</p>
                      </Link>
                      <p className="workspace-quiet-panel-copy">{toOneSentence(newestModule.summary)}</p>
                    </div>
                  )}

                  {nextTask && (
                    <div className="workspace-quiet-panel">
                      <p className="ui-kicker" style={{ margin: 0 }}>Needs attention</p>
                      <Link href={buildModuleDoHref(nextTask.moduleId, { taskTitle: nextTask.title })} style={{ textDecoration: 'none' }}>
                        <p className="workspace-quiet-panel-title">{nextTask.title}</p>
                      </Link>
                      <p className="workspace-quiet-panel-copy">{getTaskUrgencyLabel(nextTask)} in {nextTask.moduleTitle}</p>
                    </div>
                  )}
                </div>
              )}

              {moduleSnapshots.length > 0 && (
                <div className="workspace-quiet-panel" style={{ gap: '0.7rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                    <p className="ui-kicker">Modules</p>
                    <Link href={courseHref} className="workspace-row-link">
                      Open course
                    </Link>
                  </div>
                  <div className="workspace-list" style={{ maxHeight: '16rem', overflowY: 'auto', paddingRight: '0.15rem' }}>
                    {moduleSnapshots.map(({ module, experience, taskCount }) => (
                      <Link
                        key={module.id}
                        href={buildCourseLearnHref(course.id, { moduleId: module.id })}
                        className="workspace-row"
                        style={{
                          textDecoration: 'none',
                        }}
                      >
                        <div>
                          <p className="workspace-row-title" style={{ marginTop: 0 }}>{module.title}</p>
                          <p className="workspace-row-copy" style={{ marginTop: '0.2rem' }}>
                            {experience.learnUnits.length} study unit{experience.learnUnits.length === 1 ? '' : 's'} / {taskCount} active task{taskCount === 1 ? '' : 's'}{module.showInLearn === false ? ' / hidden from global Learn' : ''}
                          </p>
                        </div>
                        <span className="workspace-row-link">Open</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                <Link href={courseHref} className="ui-button ui-button-secondary ui-button-xs">Open course</Link>
                <Link href={nextTask ? buildModuleDoHref(nextTask.moduleId, { taskTitle: nextTask.title }) : '/tasks'} className="ui-button ui-button-ghost ui-button-xs">Open next task</Link>
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
