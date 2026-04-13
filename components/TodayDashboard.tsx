import Link from 'next/link'
import { EmptyState } from '@/components/EmptyState'
import { TaskStatusToggle } from '@/components/TaskStatusToggle'
import type { HomeActivityItem, HomeCourseSnapshot, HomeDueSoonItem } from '@/lib/home-overview'
import type { TodayItem } from '@/lib/types'

export function TodayDashboard({
  primaryAction,
  upNext,
  dueSoon,
  recentActivity,
  courseSnapshots,
  undatedTaskCount,
}: {
  primaryAction: TodayItem | null
  upNext: TodayItem[]
  dueSoon: HomeDueSoonItem[]
  recentActivity: HomeActivityItem[]
  courseSnapshots: HomeCourseSnapshot[]
  undatedTaskCount: number
}) {
  const primaryHref = primaryAction ? resolveItemHref(primaryAction) : null

  return (
    <section className="home-page">
      <header className="home-page-header">
        <div className="home-page-copy">
          <p className="ui-kicker">Home</p>
          <h1 className="ui-page-title">What should I do right now?</h1>
          <p className="ui-page-copy" style={{ maxWidth: '38rem' }}>
            One place to start, what is due next, and what changed since you last checked.
          </p>
        </div>

        {undatedTaskCount > 0 ? (
          <p className="home-page-note">
            {undatedTaskCount} task{undatedTaskCount === 1 ? '' : 's'}{' '}still need a due date, so they stay out of today&apos;s first recommendation.
          </p>
        ) : null}
      </header>

      <div className="home-layout">
        <div className="home-main-column">
          <section className="home-focus-card">
            <SectionHeading
              eyebrow="Start here"
              title={primaryAction ? 'One clear next move' : 'Nothing urgent right now'}
              description={primaryAction
                ? 'Keep the first move obvious, then leave the rest of the list in the background.'
                : 'The queue is calm enough that you can review a course or check the calendar at your own pace.'}
              actionHref="/do"
              actionLabel="Open Do Now"
            />

            {primaryAction ? (
              <>
                <div className="home-focus-layout">
                  <div className="home-focus-main">
                    {primaryHref ? (
                      <Link href={primaryHref} className="ui-interactive-row home-focus-target">
                        <div className="home-focus-meta">
                          <ToneBadge item={primaryAction} />
                          {primaryAction.effortLabel ? <MetaBadge>{primaryAction.effortLabel}</MetaBadge> : null}
                        </div>

                        <h2 className="home-focus-title">{primaryAction.title}</h2>
                        <p className="home-focus-copy">{primaryAction.whyNow}</p>

                        {primaryAction.supportingText ? (
                          <p className="home-focus-support">{primaryAction.supportingText}</p>
                        ) : null}
                      </Link>
                    ) : (
                      <>
                        <div className="home-focus-meta">
                          <ToneBadge item={primaryAction} />
                          {primaryAction.effortLabel ? <MetaBadge>{primaryAction.effortLabel}</MetaBadge> : null}
                        </div>

                        <h2 className="home-focus-title">{primaryAction.title}</h2>
                        <p className="home-focus-copy">{primaryAction.whyNow}</p>

                        {primaryAction.supportingText ? (
                          <p className="home-focus-support">{primaryAction.supportingText}</p>
                        ) : null}
                      </>
                    )}

                    <div className="home-focus-actions">
                      {primaryHref ? (
                        <Link href={primaryHref} className="ui-button ui-button-primary">
                          {primaryButtonLabel(primaryAction)}
                        </Link>
                      ) : null}

                      {primaryAction.kind === 'task' ? (
                        primaryAction.canvasUrl ? (
                          <a href={primaryAction.canvasUrl} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary">
                            Open in Canvas
                          </a>
                        ) : (
                          <Link href="/tasks" className="ui-button ui-button-secondary">
                            Open task list
                          </Link>
                        )
                      ) : (
                        <Link href="/tasks" className="ui-button ui-button-secondary">
                          Open task list
                        </Link>
                      )}
                    </div>
                  </div>

                  <aside className="home-focus-aside">
                    {primaryAction.kind === 'task' && primaryAction.taskItemId ? (
                      <TaskStatusToggle
                        status={primaryAction.completionStatus ?? 'pending'}
                        moduleId={primaryAction.moduleId}
                        title={primaryAction.title}
                        taskItemId={primaryAction.taskItemId}
                        align="end"
                      />
                    ) : null}

                    <dl className="home-focus-facts">
                      <FactItem label="Due" value={primaryAction.dateTime ? formatDateTime(primaryAction.dateTime) : 'No due date'} />
                      <FactItem label="Course" value={primaryAction.courseName} />
                      <FactItem label="Where" value={primaryAction.moduleTitle || fallbackAreaLabel(primaryAction)} />
                    </dl>
                  </aside>
                </div>

                {upNext.length > 0 ? (
                  <div className="home-inline-list">
                    <div className="home-inline-list-header">
                      <p className="ui-kicker">After that</p>
                      <Link href="/tasks" className="home-subtle-link">
                        See all tasks
                      </Link>
                    </div>

                    <div className="home-sheet-list">
                      {upNext.map((item) => (
                        <CompactActionRow key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState message="Nothing urgent is competing for attention right now." />
            )}
          </section>

          <section className="home-sheet home-sheet-bounded home-sheet-bounded-tall">
            <SectionHeading
              eyebrow="Due soon"
              description="Work with dates close enough to affect today."
              actionHref="/tasks"
              actionLabel="Open Tasks"
            />

            <div className="home-panel-scroll home-panel-scroll-tall">
              {dueSoon.length > 0 ? (
                <div className="home-sheet-list">
                  {dueSoon.map((item) => (
                    <DueSoonRow key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyState message="Nothing with a due date is crowding the next few days." />
              )}
            </div>
          </section>
        </div>

        <aside className="home-rail">
          <section className="home-sheet">
            <SectionHeading
              eyebrow="Quick scan"
              title="How today is shaped"
              description="Keep the key counts nearby while the main surface stays open."
            />

            <div className="workspace-summary-grid">
              <CompactSummaryCard label="Up next" value={String(upNext.length)} note="Backup moves ready after the first recommendation." />
              <CompactSummaryCard label="Due soon" value={String(dueSoon.length)} note="Dated tasks near enough to change today." />
              <CompactSummaryCard label="Recent changes" value={String(recentActivity.length)} note="New items or updates worth a quick scan." />
              <CompactSummaryCard label="Courses" value={String(courseSnapshots.length)} note="Course lanes with enough context to reopen fast." />
            </div>
          </section>

          <section className="home-sheet home-sheet-bounded home-sheet-bounded-rail">
            <SectionHeading
              eyebrow="What changed"
              title="What's new"
              description="Recent updates without the full course feed."
            />

            <div className="home-panel-scroll home-panel-scroll-rail">
              {recentActivity.length > 0 ? (
                <div className="home-sheet-list">
                  {recentActivity.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyState message="No recent changes have been captured yet." />
              )}
            </div>
          </section>

          <section className="home-sheet home-sheet-bounded home-sheet-bounded-rail">
            <SectionHeading
              eyebrow="Courses"
              title="Course snapshot"
              description="Keep course context nearby without turning the page into a boxed dashboard."
              actionHref="/courses"
              actionLabel="Open Courses"
            />

            <div className="home-panel-scroll home-panel-scroll-rail">
              {courseSnapshots.length > 0 ? (
                <div className="home-sheet-list" aria-label="Course snapshot">
                  {courseSnapshots.map((course) => (
                    <CourseSnapshotRow key={course.id} course={course} />
                  ))}
                </div>
              ) : (
                <EmptyState message="No course snapshot is available yet." />
              )}
            </div>
          </section>
        </aside>
      </div>
    </section>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  eyebrow: string
  title?: string
  description: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div className="home-section-heading">
      <div style={{ minWidth: 0 }}>
        <p className="ui-kicker">{eyebrow}</p>
        {title ? (
          <h2 className="ui-section-title" style={{ marginTop: '0.36rem' }}>{title}</h2>
        ) : null}
        <p className="ui-section-copy" style={{ marginTop: title ? '0.32rem' : '0.4rem', maxWidth: '30rem' }}>{description}</p>
      </div>

      {actionHref && actionLabel ? (
        <Link href={actionHref} className="home-subtle-link">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}

function CompactActionRow({ item }: { item: TodayItem }) {
  const href = resolveItemHref(item)
  const content = (
    <>
      <div className="home-row-meta">
        <ToneBadge item={item} subtle />
        <span>{item.courseName}</span>
        {item.dateTime ? <span>{formatActionTiming(item)}</span> : null}
      </div>
      <p className="home-row-title">{item.title}</p>
      <p className="home-row-copy">{item.whyNow}</p>
    </>
  )

  return (
    <article className="home-sheet-row">
      {href ? (
        <Link href={href} className="ui-interactive-row home-row-main">
          {content}
        </Link>
      ) : (
        <div className="home-row-main">
          {content}
        </div>
      )}
    </article>
  )
}

function DueSoonRow({ item }: { item: HomeDueSoonItem }) {
  const content = (
    <>
      <div className="home-row-meta">
        <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
          {item.urgencyLabel}
        </span>
        <span>{item.courseName}</span>
      </div>
      <p className="home-row-title">{item.title}</p>
      <p className="home-row-copy">{item.moduleTitle}. {item.timingLabel}</p>
    </>
  )

  return (
    <article className="home-sheet-row">
      <Link href={item.href} className="ui-interactive-row home-row-main">
        {content}
      </Link>
    </article>
  )
}

function ActivityRow({ item }: { item: HomeActivityItem }) {
  const content = (
    <>
      <div className="home-row-meta">
        <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
          {item.label}
        </span>
        <span>{item.meta}</span>
      </div>
      <p className="home-row-title">{item.title}</p>
      <p className="home-row-copy">{item.detail}</p>
    </>
  )

  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className="home-activity-link ui-interactive-row home-row-main">
        {content}
      </a>
    )
  }

  return (
    <Link href={item.href} className="home-activity-link ui-interactive-row home-row-main">
      {content}
    </Link>
  )
}

function CourseSnapshotRow({ course }: { course: HomeCourseSnapshot }) {
  return (
    <article className="home-sheet-row home-course-row">
      <Link href={course.href} className="home-course-link ui-interactive-row home-row-main">
        <div className="home-row-meta">
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {course.code}
          </span>
          {course.urgentCount > 0 ? (
            <span className="ui-chip ui-status-warning" style={{ padding: '0.24rem 0.55rem', fontSize: '11px', fontWeight: 700 }}>
              {course.urgentCount} urgent
            </span>
          ) : (
            <span className="ui-chip ui-chip-soft" style={{ padding: '0.24rem 0.55rem', fontSize: '11px', fontWeight: 700 }}>
              {course.pendingCount} open
            </span>
          )}
        </div>

        <p className="home-row-title">{course.name}</p>
        <p className="home-row-copy">{course.nextActionSummary}</p>

        <div className="home-row-meta">
          <span>{course.moduleCount} module{course.moduleCount === 1 ? '' : 's'}</span>
          <span>{course.pendingCount} active task{course.pendingCount === 1 ? '' : 's'}</span>
        </div>

        {course.latestChange ? (
          <p className="home-row-note">Latest: {course.latestChange}</p>
        ) : (
          <p className="home-row-note">{course.statusSummary}</p>
        )}
      </Link>

      <div className="home-course-actions">
        <Link href={course.nextActionHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
          {course.nextActionLabel}
        </Link>
        <Link href={course.href} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
          Course workspace
        </Link>
      </div>
    </article>
  )
}

function ToneBadge({ item, subtle = false }: { item: TodayItem; subtle?: boolean }) {
  const toneStyle = item.tone === 'attention'
      ? {
          background: 'color-mix(in srgb, var(--accent-light) 46%, var(--surface-soft) 54%)',
          color: 'var(--accent-foreground)',
          border: '1px solid color-mix(in srgb, var(--accent-border) 28%, var(--border-subtle) 72%)',
        }
      : item.tone === 'review'
      ? {
          background: 'color-mix(in srgb, var(--blue-light) 38%, var(--surface-soft) 62%)',
          color: 'var(--blue)',
          border: '1px solid color-mix(in srgb, var(--blue) 18%, var(--border-subtle) 82%)',
        }
      : {
          background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
        }

  return (
    <span
      className="ui-chip"
      style={{
        padding: subtle ? '0.16rem 0.48rem' : '0.24rem 0.58rem',
        fontSize: subtle ? '11px' : '12px',
        fontWeight: 700,
        ...toneStyle,
      }}
    >
      {item.toneLabel}
    </span>
  )
}

function MetaBadge({ children }: { children: string }) {
  return (
    <span className="ui-chip ui-chip-soft" style={{ fontWeight: 600 }}>
      {children}
    </span>
  )
}

function CompactSummaryCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className="workspace-quiet-panel">
      <p className="ui-kicker" style={{ margin: 0 }}>{label}</p>
      <p className="workspace-quiet-panel-title" style={{ fontSize: '1.3rem', lineHeight: 1.05 }}>{value}</p>
      <p className="workspace-quiet-panel-copy">{note}</p>
    </div>
  )
}

function FactItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="home-focus-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function resolveItemHref(item: TodayItem) {
  if (item.kind === 'task') return item.href
  return item.learnHref ?? item.href
}

function primaryButtonLabel(item: TodayItem) {
  if (item.kind === 'task') return 'Open task'
  if (item.kind === 'module') return 'Review module'
  return 'Open study view'
}

function fallbackAreaLabel(item: TodayItem) {
  if (item.kind === 'task') return 'Task'
  if (item.kind === 'module') return 'Module'
  return 'Study item'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const includesTime = /T\d{2}:\d{2}/.test(value)
  return new Intl.DateTimeFormat(undefined, includesTime
    ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { weekday: 'short', month: 'short', day: 'numeric' }
  ).format(date)
}

function formatActionTiming(item: TodayItem) {
  if (!item.dateTime) return ''

  const daysUntil = Math.ceil((new Date(item.dateTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (item.kind === 'task' && daysUntil < 0) return 'Overdue'
  if (item.kind === 'task' && daysUntil === 0) return 'Due today'
  if (item.kind === 'task' && daysUntil === 1) return 'Due tomorrow'
  if (item.kind === 'task' && daysUntil <= 7) return `Due in ${daysUntil} days`
  return formatDateTime(item.dateTime)
}
