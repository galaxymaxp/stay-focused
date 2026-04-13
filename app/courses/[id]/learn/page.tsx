import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CourseLearnExplorer } from '@/components/CourseLearnExplorer'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseLearnOverview, type CourseLearnModuleCard, type CourseLearnTaskRow } from '@/lib/course-learn-overview'
import { buildCourseLearnHref, buildModuleDoHref, getSearchParamValue } from '@/lib/stay-focused-links'

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function CourseLearnPage({ params, searchParams }: Props) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const workspace = await getClarityWorkspace()
  const courseOverview = await buildCourseLearnOverview(workspace, id)

  if (!courseOverview) notFound()

  const { course, modules, resumeCue } = courseOverview
  const deepLearnReadyCount = modules.reduce(
    (total, module) => total + module.studyMaterials.filter((material) => material.deepLearnStatus === 'ready').length,
    0,
  )
  const quizReadyDeepLearnCount = modules.reduce(
    (total, module) => total + module.studyMaterials.filter((material) => material.deepLearnQuizReady).length,
    0,
  )
  const nextTask = getNextCourseTask(modules)
  const packReadyModule = modules.find((module) => module.studyMaterials.some((material) => material.deepLearnStatus === 'ready')) ?? modules[0] ?? null
  const actionModule = modules.find((module) => module.pendingTasks.length > 0) ?? packReadyModule
  const initialOpenModuleId = getSearchParamValue(resolvedSearchParams?.module)
  const initialOpenResourceId = getSearchParamValue(resolvedSearchParams?.resource)
  const initialTaskId = getSearchParamValue(resolvedSearchParams?.task)
  const initialFocusedModuleId = getSearchParamValue(resolvedSearchParams?.focus) === '1'
    ? initialOpenModuleId
    : null

  return (
    <main className="page-shell command-page">
      <section className="motion-card section-shell section-shell-elevated" style={{ padding: '1.05rem 1.15rem', display: 'grid', gap: '1rem' }}>
        <div className="command-header">
          <div className="command-header-main">
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <p className="ui-kicker">Learn</p>
              <span className="ui-chip ui-chip-soft">{course.code}</span>
            </div>
            <h1 className="ui-page-title" style={{ marginTop: '0.5rem' }}>{course.name}</h1>
            <p className="ui-page-copy" style={{ maxWidth: '48rem' }}>
              A tighter Deep Learn workspace. Scan compact module cards, generate or reopen saved exam prep packs inline, and drop to reader/source fallback only when you need direct evidence.
            </p>
          </div>

          <div className="command-header-side">
            <div className="command-header-actions">
              <Link href="/learn" className="ui-button ui-button-ghost">Back to Learn</Link>
            </div>

            <div className="workspace-quiet-panel">
              <p className="ui-kicker" style={{ margin: 0 }}>Course rule</p>
              <p className="workspace-quiet-panel-copy">
                Keep one module open at a time. Use this page to choose the module, then do the deeper work inside that module workspace.
              </p>
            </div>
          </div>
        </div>

        <div className="command-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <StatTile label="Modules in Learn" value={String(courseOverview.visibleModuleCount)} />
          <StatTile label="Prep packs" value={String(deepLearnReadyCount)} />
          <StatTile label="Quiz-ready packs" value={String(quizReadyDeepLearnCount)} />
          <StatTile label="Action items" value={String(courseOverview.actionCount)} />
          <StatTile label="Hidden modules" value={String(courseOverview.hiddenModuleCount)} />
        </div>

        {courseOverview.deepLearnUnavailableModuleCount > 0 && (
          <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', border: '1px solid color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)' }}>
            <p className="ui-kicker">Exam prep pack status unavailable</p>
            <p style={{ margin: '0.45rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
              {courseOverview.deepLearnUnavailableModuleCount} module{courseOverview.deepLearnUnavailableModuleCount === 1 ? '' : 's'} could not load saved exam prep packs right now. Course Learn still renders from the module resources and fallback reader/source surfaces.
            </p>
          </div>
        )}

        <div className="workspace-summary-grid">
          <CommandCard
            eyebrow="Start now"
            title={nextTask ? nextTask.title : 'Open course workspace'}
            body={nextTask
              ? `${formatUrgency(nextTask.deadline)} in ${nextTask.moduleTitle}. Open the task first, then use draft/help from the task view if you need it.`
              : courseOverview.note}
            href={nextTask ? buildModuleDoHref(nextTask.moduleId, { taskTitle: nextTask.title }) : buildCourseLearnHref(course.id)}
            actionLabel={nextTask ? 'Open task' : 'Open course'}
          />

          {resumeCue ? (
            <CommandCard
              eyebrow={resumeCue.promptLabel}
              title={resumeCue.title}
              body={resumeCue.note}
              href={resumeCue.href}
              actionLabel={resumeCue.actionLabel}
              external={resumeCue.external}
            />
          ) : (
            <CommandCard
              eyebrow="Resume course"
              title={actionModule?.title ?? course.name}
              body={actionModule
                ? `${actionModule.pendingTasks.length} active task${actionModule.pendingTasks.length === 1 ? '' : 's'} still point into this module.`
                : 'No focused module is surfaced yet, so the course list stays collapsed until you choose one.'}
              href={actionModule ? buildCourseLearnHref(course.id, { moduleId: actionModule.id }) : buildCourseLearnHref(course.id)}
              actionLabel={actionModule ? 'Open module' : 'Open course'}
            />
          )}

          <CommandCard
            eyebrow="Exam prep lane"
            title={packReadyModule ? packReadyModule.title : 'No prep pack ready yet'}
            body={packReadyModule
              ? `${countReadyPacks(packReadyModule)} pack${countReadyPacks(packReadyModule) === 1 ? '' : 's'} ready in this module. Source support stays secondary once you open it.`
              : 'This course does not have a ready pack yet, so the module list is the place to build one.'}
            href={packReadyModule ? buildCourseLearnHref(course.id, { moduleId: packReadyModule.id }) : buildCourseLearnHref(course.id)}
            actionLabel={packReadyModule ? 'Open module packs' : 'Open course'}
          />
        </div>
      </section>

      <section className="motion-card motion-delay-1 section-shell" style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.9rem' }}>
        <div>
          <p className="ui-kicker">Modules</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Open only what you need, and keep Deep Learn first</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '46rem' }}>
            Every module stays collapsed by default. Open one to generate or reopen saved exam prep packs, see quiz readiness, and keep source support nearby without turning the old reader into the main destination.
          </p>
        </div>

        {modules.length === 0 ? (
          <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
            {courseOverview.hiddenModuleCount > 0
              ? 'All modules in this course are currently hidden from Learn.'
              : 'No modules are available in Learn for this course yet.'}
          </div>
        ) : (
          <div className="command-scroll-body" data-density="tall">
            <CourseLearnExplorer
              modules={modules}
              initialOpenModuleId={initialOpenModuleId}
              initialFocusedModuleId={initialFocusedModuleId}
              initialOpenResourceId={initialOpenResourceId}
              initialTaskId={initialTaskId}
            />
          </div>
        )}
      </section>
    </main>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.82rem 0.9rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p style={{ margin: '0.38rem 0 0', fontSize: '20px', lineHeight: 1.1, fontWeight: 650, color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
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
    .sort((left, right) => sortableDateValue(left.deadline) - sortableDateValue(right.deadline) || priorityWeight(right.priority) - priorityWeight(left.priority))
    [0] ?? null
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
  if (!value) return Number.POSITIVE_INFINITY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  return date.getTime()
}

function formatUrgency(value: string | null) {
  if (!value) return 'No due date'
  const daysUntil = Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return 'Overdue'
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  if (daysUntil <= 7) return `Due in ${daysUntil} days`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}
