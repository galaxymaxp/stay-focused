import Link from 'next/link'
import { TaskDraftButton } from '@/components/DoNowButton'
import { TaskStatusToggle } from '@/components/TaskStatusToggle'
import { buildManualCopyBundle } from '@/lib/manual-copy-bundle'
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
  return (
    <section className="page-stack" style={{ gap: '1.25rem' }}>
      <header className="section-shell" style={{ display: 'grid', gap: '0.85rem', padding: '1.35rem' }}>
        <div>
          <p className="ui-kicker">Home</p>
          <h1 className="ui-page-title">What should I do right now?</h1>
          <p className="ui-page-copy" style={{ maxWidth: '44rem' }}>
            Start with one clear move, then check what is due soon, what changed, and which courses need a quick look.
          </p>
        </div>

        {undatedTaskCount > 0 && (
          <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '0.85rem 0.95rem', fontSize: '14px', lineHeight: 1.6 }}>
            {undatedTaskCount} task{undatedTaskCount === 1 ? '' : 's'} still need a due date, so they stay out of the main recommendation for now.
          </div>
        )}
      </header>

      <div className="home-layout">
        <div className="home-main-column">
          <section className="section-shell section-shell-elevated home-section-card">
            <HomeSectionHeader
              eyebrow="Do this now"
              title={primaryAction ? 'Start here' : 'Nothing urgent right now'}
              description={primaryAction
                ? 'One recommended place to begin, with just enough context to get moving.'
                : 'The work queue is quiet enough that you can review material or check a course on your own pace.'}
              actionHref="/do"
              actionLabel="Open Do Now"
            />

            {primaryAction ? (
              <PrimaryActionCard item={primaryAction} />
            ) : (
              <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem 1.05rem', fontSize: '14px', lineHeight: 1.65 }}>
                Nothing urgent is competing for attention right now.
              </div>
            )}

            {upNext.length > 0 && (
              <div className="home-secondary-list">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <p className="ui-kicker">After that</p>
                    <p style={{ margin: '0.28rem 0 0', fontSize: '14px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                      Keep the queue short. These are the next few things worth touching.
                    </p>
                  </div>
                  <Link href="/tasks" className="ui-button ui-button-ghost ui-button-xs">
                    See all tasks
                  </Link>
                </div>

                <div className="home-compact-list">
                  {upNext.map((item) => (
                    <CompactActionRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="section-shell home-section-card">
            <HomeSectionHeader
              eyebrow="Due soon"
              title="Due soon"
              description="A short list of work with dates close enough to affect today."
              actionHref="/tasks"
              actionLabel="Open Tasks"
            />

            {dueSoon.length > 0 ? (
              <div className="home-compact-list">
                {dueSoon.map((item) => (
                  <DueSoonRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', fontSize: '14px', lineHeight: 1.6 }}>
                Nothing with a due date is crowding the next few days.
              </div>
            )}
          </section>
        </div>

        <div className="home-side-column">
          <section className="section-shell home-section-card">
            <HomeSectionHeader
              eyebrow="New activity"
              title="New activity"
              description="Recent updates without the full feed overload."
            />

            {recentActivity.length > 0 ? (
              <div className="home-compact-list">
                {recentActivity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', fontSize: '14px', lineHeight: 1.6 }}>
                No recent changes have been captured yet.
              </div>
            )}
          </section>

          <section className="section-shell home-section-card">
            <HomeSectionHeader
              eyebrow="Courses"
              title="Courses"
              description="A quick status line for each class, with urgent work surfaced first."
              actionHref="/courses"
              actionLabel="Open Courses"
            />

            <div className="home-compact-list">
              {courseSnapshots.map((course) => (
                <CourseSnapshotRow key={course.id} course={course} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

function HomeSectionHeader({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  eyebrow: string
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <p className="ui-kicker">{eyebrow}</p>
        <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{title}</h2>
        <p className="ui-section-copy" style={{ marginTop: '0.4rem', maxWidth: '34rem' }}>{description}</p>
      </div>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="ui-button ui-button-ghost ui-button-xs">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}

function PrimaryActionCard({ item }: { item: TodayItem }) {
  const manualCopy = item.kind === 'task'
    ? buildManualCopyBundle({
        taskTitle: item.title,
        courseName: item.courseName,
        moduleName: item.moduleTitle,
        dueDate: item.dateTime,
        taskDetails: item.supportingText,
      })
    : null
  const primaryHref = resolveItemHref(item)

  return (
    <article className="home-primary-card">
      <div className="home-primary-card-header">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <ToneBadge item={item} />
            {item.dateTime ? <MetaBadge>{formatDateTime(item.dateTime)}</MetaBadge> : null}
            {item.effortLabel ? <MetaBadge>{item.effortLabel}</MetaBadge> : null}
          </div>
          <h3 className="home-primary-title">{item.title}</h3>
          <p className="home-primary-copy">{item.whyNow}</p>
        </div>
        {item.kind === 'task' && item.taskItemId ? (
          <TaskStatusToggle
            status={item.completionStatus ?? 'pending'}
            moduleId={item.moduleId}
            title={item.title}
            taskItemId={item.taskItemId}
            align="end"
          />
        ) : null}
      </div>

      <div className="home-primary-meta-grid">
        <MetaBlock label="Course" value={item.courseName} />
        <MetaBlock label="Area" value={item.moduleTitle || fallbackAreaLabel(item)} />
        <MetaBlock label="Next move" value={primaryButtonLabel(item)} />
      </div>

      {item.supportingText ? (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
          <p className="ui-kicker" style={{ margin: 0 }}>What to keep in mind</p>
          <p style={{ margin: '0.4rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            {item.supportingText}
          </p>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {manualCopy ? (
          <TaskDraftButton
            copyBundle={manualCopy}
            entryOrigin="today"
            doPageHref={item.href ?? undefined}
            context={{
              taskTitle: item.title,
              taskDetails: item.supportingText,
              deadline: item.dateTime,
              priority: item.priority,
              courseName: item.courseName,
              moduleTitle: item.moduleTitle,
              canvasUrl: item.canvasUrl,
              learnHref: item.learnHref ?? item.href,
            }}
          />
        ) : null}
        {primaryHref ? (
          <Link href={primaryHref} className="ui-button ui-button-primary">
            {primaryButtonLabel(item)}
          </Link>
        ) : null}
        <Link href="/tasks" className="ui-button ui-button-ghost">
          See all tasks
        </Link>
      </div>
    </article>
  )
}

function CompactActionRow({ item }: { item: TodayItem }) {
  const href = resolveItemHref(item)

  return (
    <div className="home-list-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <ToneBadge item={item} subtle />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.courseName}</span>
        </div>
        <p style={{ margin: '0.42rem 0 0', fontSize: '15px', lineHeight: 1.4, fontWeight: 650, color: 'var(--text-primary)' }}>
          {item.title}
        </p>
        <p style={{ margin: '0.32rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          {item.whyNow}
        </p>
      </div>
      {href ? (
        <Link href={href} className="ui-button ui-button-secondary ui-button-xs">
          Open
        </Link>
      ) : null}
    </div>
  )
}

function DueSoonRow({ item }: { item: HomeDueSoonItem }) {
  return (
    <div className="home-list-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {item.urgencyLabel}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.courseName}</span>
        </div>
        <p style={{ margin: '0.42rem 0 0', fontSize: '15px', lineHeight: 1.4, fontWeight: 650, color: 'var(--text-primary)' }}>
          {item.title}
        </p>
        <p style={{ margin: '0.28rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          {item.moduleTitle} • {item.timingLabel}
        </p>
      </div>
      <Link href={item.href} className="ui-button ui-button-secondary ui-button-xs">
        Open
      </Link>
    </div>
  )
}

function ActivityRow({ item }: { item: HomeActivityItem }) {
  const inner = (
    <div className="home-list-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {item.label}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.meta}</span>
        </div>
        <p style={{ margin: '0.42rem 0 0', fontSize: '15px', lineHeight: 1.4, fontWeight: 650, color: 'var(--text-primary)' }}>
          {item.title}
        </p>
        <p style={{ margin: '0.32rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          {item.detail}
        </p>
      </div>
      <span className="ui-button ui-button-ghost ui-button-xs" style={{ pointerEvents: 'none' }}>
        Open
      </span>
    </div>
  )

  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        {inner}
      </a>
    )
  }

  return (
    <Link href={item.href} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  )
}

function CourseSnapshotRow({ course }: { course: HomeCourseSnapshot }) {
  return (
    <article className="home-list-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {course.code}
          </span>
          {course.urgentCount > 0 ? (
            <span className="ui-chip ui-status-warning" style={{ padding: '0.24rem 0.55rem', fontSize: '11px', fontWeight: 700 }}>
              {course.urgentCount} urgent
            </span>
          ) : null}
        </div>
        <Link href={course.href} style={{ textDecoration: 'none' }}>
          <p style={{ margin: '0.42rem 0 0', fontSize: '15px', lineHeight: 1.4, fontWeight: 650, color: 'var(--text-primary)' }}>
            {course.name}
          </p>
        </Link>
        <p style={{ margin: '0.28rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          {course.statusSummary}
        </p>
        {course.latestChange ? (
          <p style={{ margin: '0.22rem 0 0', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
            Latest: {course.latestChange}
          </p>
        ) : null}
      </div>
      <Link href={course.nextActionHref} className="ui-button ui-button-secondary ui-button-xs">
        {course.nextActionLabel}
      </Link>
    </article>
  )
}

function ToneBadge({ item, subtle = false }: { item: TodayItem; subtle?: boolean }) {
  const toneStyle = item.tone === 'attention'
    ? {
        background: 'color-mix(in srgb, var(--accent-light) 58%, var(--surface-soft) 42%)',
        color: 'var(--accent-foreground)',
        border: '1px solid color-mix(in srgb, var(--accent-border) 38%, var(--border-subtle) 62%)',
      }
    : item.tone === 'review'
      ? {
          background: 'color-mix(in srgb, var(--blue-light) 46%, var(--surface-soft) 54%)',
          color: 'var(--blue)',
          border: '1px solid color-mix(in srgb, var(--blue) 24%, var(--border-subtle) 76%)',
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
        padding: subtle ? '0.18rem 0.5rem' : '0.24rem 0.58rem',
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

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="home-meta-block">
      <p className="ui-kicker" style={{ margin: 0 }}>{label}</p>
      <p style={{ margin: '0.35rem 0 0', fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
        {value}
      </p>
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
