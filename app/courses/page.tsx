import Link from 'next/link'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { getClarityWorkspace, type ClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseLearnOverview, type CourseLearnModuleCard, type CourseLearnOverview, type CourseLearnTaskRow } from '@/lib/course-learn-overview'
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

  const courseOverviews = (await Promise.all(
    workspace.courses.map((course) => buildCourseLearnOverview(workspace, course.id)),
  )).filter((course): course is CourseLearnOverview => Boolean(course))

  return (
    <main className="page-shell page-stack">
      <header className="motion-card page-intro">
        <p className="ui-kicker">Courses</p>
        <h1 className="ui-page-title">Open the course that makes the next decision obvious</h1>
        <p className="ui-page-copy page-intro-copy">
          Each course now acts like a command surface: the next task, the best module to reopen, and the exam-prep lane that is actually ready.
        </p>
      </header>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {courseOverviews.map((overview, index) => (
          <CourseCommandSurface
            key={overview.course.id}
            overview={overview}
            workspace={workspace}
            index={index}
          />
        ))}
      </div>
    </main>
  )
}

function CourseCommandSurface({
  overview,
  workspace,
  index,
}: {
  overview: CourseLearnOverview
  workspace: ClarityWorkspace
  index: number
}) {
  const courseHref = buildCourseLearnHref(overview.course.id)
  const nextTask = getNextCourseTask(overview.modules)
  const packReadyModule = overview.modules.find((module) => module.studyMaterials.some((material) => material.deepLearnStatus === 'ready')) ?? overview.modules[0] ?? null
  const activeModule = overview.modules.find((module) => module.pendingTasks.length > 0) ?? packReadyModule
  const latestModule = workspace.modules
    .filter((module) => module.courseId === overview.course.id)
    .sort((a, b) => new Date(b.released_at ?? b.created_at).getTime() - new Date(a.released_at ?? a.created_at).getTime())[0] ?? null
  const modulesToShow = [...overview.modules]
    .sort((left, right) => {
      const taskDiff = right.pendingTasks.length - left.pendingTasks.length
      if (taskDiff !== 0) return taskDiff

      const packDiff = countReadyPacks(right) - countReadyPacks(left)
      if (packDiff !== 0) return packDiff

      return left.title.localeCompare(right.title)
    })
    .slice(0, 4)
  const readyPackCount = overview.modules.reduce((total, module) => total + countReadyPacks(module), 0)

  return (
    <section
      className={`motion-card motion-delay-${Math.min(index + 1, 4)} section-shell section-shell-elevated`}
      style={{ padding: '1.05rem 1.1rem', display: 'grid', gap: '1rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 420px' }}>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <p className="ui-kicker" style={{ margin: 0 }}>{overview.course.code}</p>
            <span className="ui-chip ui-chip-soft">{overview.visibleModuleCount} module{overview.visibleModuleCount === 1 ? '' : 's'}</span>
            <span className="ui-chip ui-chip-soft">{readyPackCount} pack{readyPackCount === 1 ? '' : 's'} ready</span>
          </div>
            <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{overview.course.name}</h2>
            <p className="ui-section-copy" style={{ marginTop: '0.38rem', maxWidth: '48rem' }}>
              {nextTask
                ? `${formatCourseTaskUrgency(nextTask.deadline)} is already surfaced here, so the course should help you decide whether to open the task itself or the supporting module packs first.`
                : overview.note}
            </p>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href={courseHref} className="ui-button ui-button-secondary ui-button-xs">
            Open course workspace
          </Link>
          {nextTask && (
            <Link href={buildModuleDoHref(nextTask.moduleId, { taskTitle: nextTask.title })} className="ui-button ui-button-ghost ui-button-xs">
              Open next task
            </Link>
          )}
        </div>
      </div>

      <div className="workspace-summary-grid">
        <CommandCard
          eyebrow="Start now"
          title={nextTask ? nextTask.title : 'Course workspace'}
          body={nextTask
            ? `${formatCourseTaskUrgency(nextTask.deadline)} in ${nextTask.moduleTitle}. Open the task first, then use help from the task view if you need it.`
            : 'No urgent task is crowding this course right now, so the course workspace is the cleanest place to choose your next module.'}
          href={nextTask ? buildModuleDoHref(nextTask.moduleId, { taskTitle: nextTask.title }) : courseHref}
          actionLabel={nextTask ? 'Open task' : 'Open course'}
        />
        <CommandCard
          eyebrow="Exam prep lane"
          title={packReadyModule ? packReadyModule.title : 'No prep pack ready yet'}
          body={packReadyModule
            ? `${countReadyPacks(packReadyModule)} prep pack${countReadyPacks(packReadyModule) === 1 ? '' : 's'} ready. ${packReadyModule.pendingTasks.length} active task${packReadyModule.pendingTasks.length === 1 ? '' : 's'} still point back into this module.`
            : 'This course does not have a ready exam-prep module yet.'}
          href={packReadyModule ? buildCourseLearnHref(overview.course.id, { moduleId: packReadyModule.id }) : courseHref}
          actionLabel={packReadyModule ? 'Open module packs' : 'Open course'}
        />
        <CommandCard
          eyebrow={overview.resumeCue ? overview.resumeCue.promptLabel : 'Latest change'}
          title={overview.resumeCue?.title ?? latestModule?.title ?? overview.course.focusLabel}
          body={overview.resumeCue?.note ?? latestModule?.summary ?? 'No recent module update has been surfaced yet.'}
          href={overview.resumeCue?.href ?? (latestModule ? buildCourseLearnHref(overview.course.id, { moduleId: latestModule.id }) : courseHref)}
          actionLabel={overview.resumeCue?.actionLabel ?? (latestModule ? 'Open latest module' : 'Open course')}
          external={overview.resumeCue?.external ?? false}
        />
      </div>

      <div className="workspace-quiet-panel" style={{ gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p className="ui-kicker">Module commands</p>
            <p className="workspace-quiet-panel-copy" style={{ marginTop: '0.22rem' }}>
              Open the module that has either the next task or the best-prepared exam-prep surface.
            </p>
          </div>
          {activeModule && (
            <Link href={buildCourseLearnHref(overview.course.id, { moduleId: activeModule.id })} className="workspace-row-link">
              Jump to active module
            </Link>
          )}
        </div>

        {modulesToShow.length > 0 ? (
          <div className="contained-scroll-frame" data-density="dense">
            <div className="workspace-list">
              {modulesToShow.map((module) => (
                <Link
                  key={module.id}
                  href={buildCourseLearnHref(overview.course.id, { moduleId: module.id })}
                  className="workspace-row"
                  style={{ textDecoration: 'none' }}
                >
                  <div>
                    <div className="workspace-row-meta">
                      <span>{module.orderLabel ?? 'Module'}</span>
                      <span>{countReadyPacks(module)} pack{countReadyPacks(module) === 1 ? '' : 's'} ready</span>
                      <span>{module.pendingTasks.length} active task{module.pendingTasks.length === 1 ? '' : 's'}</span>
                    </div>
                    <p className="workspace-row-title">{module.title}</p>
                    <p className="workspace-row-copy">
                      {module.resumeCue?.note ?? module.coverageHint}
                    </p>
                  </div>
                  <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
                    {module.pendingTasks.length > 0 ? 'Open task lane' : 'Open packs'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', fontSize: '14px', lineHeight: 1.6 }}>
            No visible modules are ready in this course yet.
          </div>
        )}
      </div>
    </section>
  )
}

function CommandCard({
  eyebrow,
  title,
  body,
  href,
  actionLabel,
  external = false,
}: {
  eyebrow: string
  title: string
  body: string
  href: string
  actionLabel: string
  external?: boolean
}) {
  const content = (
    <div className="workspace-quiet-panel" style={{ height: '100%' }}>
      <p className="ui-kicker" style={{ margin: 0 }}>{eyebrow}</p>
      <p className="workspace-quiet-panel-title">{title}</p>
      <p className="workspace-quiet-panel-copy">{body}</p>
      <span className="workspace-row-link">{actionLabel}</span>
    </div>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="workspace-panel-link ui-interactive-card" style={{ textDecoration: 'none' }}>
        {content}
      </a>
    )
  }

  return (
    <Link href={href} className="workspace-panel-link ui-interactive-card" style={{ textDecoration: 'none' }}>
      {content}
    </Link>
  )
}

function getNextCourseTask(modules: CourseLearnModuleCard[]) {
  return modules
    .flatMap((module) => module.pendingTasks.map((task) => ({
      ...task,
      moduleId: module.id,
      moduleTitle: module.title,
    })))
    .sort(compareCourseTasks)[0] ?? null
}

function compareCourseTasks(
  left: CourseLearnTaskRow & { moduleId: string; moduleTitle: string },
  right: CourseLearnTaskRow & { moduleId: string; moduleTitle: string },
) {
  const leftDeadline = sortableDateValue(left.deadline)
  const rightDeadline = sortableDateValue(right.deadline)
  if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline

  const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority)
  if (priorityDiff !== 0) return priorityDiff

  return left.title.localeCompare(right.title)
}

function countReadyPacks(module: CourseLearnModuleCard) {
  return module.studyMaterials.filter((material) => material.deepLearnStatus === 'ready').length
}

function priorityWeight(priority: CourseLearnTaskRow['priority']) {
  if (priority === 'high') return 3
  if (priority === 'medium') return 2
  return 1
}

function sortableDateValue(value: string | null) {
  if (!value || value === 'No due date') return Number.POSITIVE_INFINITY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  return date.getTime()
}

function formatCourseTaskUrgency(value: string | null) {
  if (!value || value === 'No due date') return 'No due date'

  const dueAt = new Date(value)
  if (Number.isNaN(dueAt.getTime())) return value

  const daysUntil = Math.ceil((dueAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return 'Overdue'
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  if (daysUntil <= 7) return `Due in ${daysUntil} days`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(dueAt)
}
