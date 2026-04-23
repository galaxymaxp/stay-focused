import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CourseLearnExplorer } from '@/components/CourseLearnExplorer'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseLearnOverview, type CourseLearnModuleCard, type CourseLearnTaskRow } from '@/lib/course-learn-overview'
import { buildModuleDoHref, getSearchParamValue } from '@/lib/stay-focused-links'

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function CourseWorkspacePage({ params, searchParams }: Props) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const rawTab = getSearchParamValue(resolvedSearchParams?.tab)
  const showDo   = rawTab === 'do'
  const showQuiz = rawTab === 'quiz'

  const workspace = await getClarityWorkspace()
  const courseOverview = await buildCourseLearnOverview(workspace, id)
  if (!courseOverview) notFound()

  const { course, modules } = courseOverview

  const allPendingTasks = modules.flatMap((m) =>
    m.pendingTasks.map((t) => ({ ...t, moduleId: m.id, moduleTitle: m.title })),
  )
  const allCompletedTasks = modules.flatMap((m) =>
    m.completedTasks.map((t) => ({ ...t, moduleId: m.id, moduleTitle: m.title })),
  )
  const quizModules = modules.filter(
    (m) => m.quizCount > 0 || m.studyMaterials.some((s) => s.deepLearnQuizReady),
  )

  const initialOpenModuleId = getSearchParamValue(resolvedSearchParams?.module)
  const initialOpenResourceId = getSearchParamValue(resolvedSearchParams?.resource)
  const initialTaskId = getSearchParamValue(resolvedSearchParams?.task)
  const initialFocusedModuleId =
    getSearchParamValue(resolvedSearchParams?.focus) === '1' ? initialOpenModuleId : null

  const deepLearnReadyCount = modules.reduce(
    (total, m) => total + m.studyMaterials.filter((s) => s.deepLearnStatus === 'ready').length,
    0,
  )

  const activeLabel = showDo ? 'Tasks' : showQuiz ? 'Quiz' : 'Modules'

  return (
    <main className="page-shell command-page">
      {/* ── Course header ── */}
      <section
        className="motion-card section-shell section-shell-elevated"
        style={{ padding: '1.05rem 1.15rem', display: 'grid', gap: '0.85rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <p className="ui-kicker">Course</p>
              <span className="ui-chip ui-chip-soft">{course.code}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{activeLabel}</span>
            </div>
            <h1 className="ui-page-title" style={{ marginTop: '0.5rem' }}>{course.name}</h1>
            {course.instructor && (
              <p className="ui-page-copy" style={{ marginTop: '0.28rem' }}>{course.instructor}</p>
            )}
          </div>

          <div className="command-stat-grid" style={{ flex: '0 1 auto' }}>
            <StatTile label="Modules" value={String(courseOverview.visibleModuleCount)} />
            <StatTile label="Tasks" value={String(courseOverview.actionCount)} tone="warning" />
            <StatTile label="Prep packs" value={String(deepLearnReadyCount)} tone="accent" />
          </div>
        </div>

        {/* Quick-access row — no big tab UI, just ghost buttons */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <Link
            href={`/courses/${id}`}
            className={!showDo && !showQuiz ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
          >
            Modules
          </Link>
          <Link
            href={`/courses/${id}?tab=do`}
            className={showDo ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
          >
            Tasks
          </Link>
          <Link
            href={`/courses/${id}?tab=quiz`}
            className={showQuiz ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
          >
            Quiz
          </Link>
          <Link href={`/library?course=${encodeURIComponent(id)}`} className="ui-button ui-button-ghost ui-button-xs">
            Study library
          </Link>
        </div>
      </section>

      {/* ── Modules (default view) ── */}
      {!showDo && !showQuiz && (
        <section
          className="motion-card motion-delay-1 section-shell"
          style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.9rem' }}
        >
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
      )}

      {/* ── Tasks view ── */}
      {showDo && (
        <section
          className="motion-card motion-delay-1 section-shell"
          style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.9rem' }}
        >
          <div>
            <p className="ui-kicker">Tasks</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Course tasks</h2>
            <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '46rem' }}>
              All active tasks across modules in this course.
            </p>
          </div>

          {allPendingTasks.length === 0 ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
              No pending tasks for this course. All caught up.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.55rem' }}>
              {allPendingTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}

          {allCompletedTasks.length > 0 && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                padding: '0.5rem 0',
                userSelect: 'none',
              }}>
                {allCompletedTasks.length} completed task{allCompletedTasks.length === 1 ? '' : 's'}
              </summary>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.55rem 0 0', display: 'grid', gap: '0.55rem' }}>
                {allCompletedTasks.map((task) => (
                  <TaskRow key={task.id} task={task} muted />
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* ── Quiz view ── */}
      {showQuiz && (
        <section
          className="motion-card motion-delay-1 section-shell"
          style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.9rem' }}
        >
          <div>
            <p className="ui-kicker">Quiz</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Course quiz options</h2>
            <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '46rem' }}>
              Modules with ready exam prep packs or term quizzes.
            </p>
          </div>

          {quizModules.length === 0 ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
              No quiz-ready packs in this course yet. Build exam prep packs from the Modules view first.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.55rem' }}>
              {quizModules.map((m) => (
                <QuizModuleRow key={m.id} module={m} />
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}

function TaskRow({
  task,
  muted = false,
}: {
  task: CourseLearnTaskRow & { moduleId: string; moduleTitle: string }
  muted?: boolean
}) {
  const href = buildModuleDoHref(task.moduleId, { taskId: task.id })

  return (
    <li>
      <Link
        href={href}
        className="section-shell ui-interactive-card"
        style={{ textDecoration: 'none', display: 'grid', gap: '0.3rem', padding: '0.8rem 0.9rem', borderRadius: 'var(--radius-tight)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
          <p style={{
            margin: 0,
            fontSize: '14px',
            lineHeight: 1.55,
            fontWeight: 650,
            color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: muted ? 'line-through' : 'none',
          }}>
            {task.title}
          </p>
          {task.deadline && (
            <span
              className="ui-chip ui-chip-soft"
              style={{ fontSize: '11px', flexShrink: 0, color: isOverdue(task.deadline) ? 'var(--amber)' : undefined }}
            >
              {formatDeadlineLabel(task.deadline)}
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
          {task.moduleTitle}
        </p>
      </Link>
    </li>
  )
}

function QuizModuleRow({ module }: { module: CourseLearnModuleCard }) {
  const quizReadyMaterials = module.studyMaterials.filter((s) => s.deepLearnQuizReady)
  const hasTermQuiz = module.quizCount > 0

  return (
    <li
      className="section-shell"
      style={{ padding: '0.8rem 0.9rem', borderRadius: 'var(--radius-tight)', display: 'grid', gap: '0.5rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, fontWeight: 650, color: 'var(--text-primary)' }}>
          {module.title}
        </p>
        <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
          {quizReadyMaterials.length > 0 && (
            <span className="ui-chip ui-chip-soft" style={{ fontSize: '11px', color: 'var(--accent)' }}>
              {quizReadyMaterials.length} pack{quizReadyMaterials.length === 1 ? '' : 's'} ready
            </span>
          )}
          {hasTermQuiz && (
            <span className="ui-chip ui-chip-soft" style={{ fontSize: '11px' }}>
              {module.quizCount} term{module.quizCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {quizReadyMaterials.map((material) => (
          <Link
            key={material.id}
            href={material.deepLearnQuizHref}
            className="ui-button ui-button-ghost ui-button-xs"
          >
            {material.title}
          </Link>
        ))}
        {hasTermQuiz && (
          <Link
            href={`/modules/${module.id}/quiz`}
            className="ui-button ui-button-ghost ui-button-xs"
          >
            Term quiz
          </Link>
        )}
      </div>
    </li>
  )
}

function StatTile({ label, value, tone = 'muted' }: { label: string; value: string; tone?: 'accent' | 'warning' | 'muted' }) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.72rem 0.78rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p style={{
        margin: '0.34rem 0 0',
        fontSize: '20px',
        lineHeight: 1.1,
        fontWeight: 650,
        color: tone === 'warning' ? 'var(--amber)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-primary)',
      }}>
        {value}
      </p>
    </div>
  )
}

function isOverdue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() < Date.now()
}

function formatDeadlineLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const daysUntil = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return 'Overdue'
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  if (daysUntil <= 7) return `Due in ${daysUntil} days`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}
