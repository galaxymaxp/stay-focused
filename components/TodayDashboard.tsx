'use client'

import { useState } from 'react'
import Link from 'next/link'
import { EmptyState } from '@/components/EmptyState'
import { TaskStatusToggle } from '@/components/TaskStatusToggle'
import type { HomeActivityItem, HomeCourseSnapshot, HomeDueSoonItem } from '@/lib/home-overview'
import type { TodayItem } from '@/lib/types'

const AFTER_THAT_DEFAULT_VISIBLE = 2

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
  const [showAllUpNext, setShowAllUpNext] = useState(false)
  const [dismissedActivity, setDismissedActivity] = useState<Set<string>>(new Set())

  const visibleUpNext = showAllUpNext ? upNext : upNext.slice(0, AFTER_THAT_DEFAULT_VISIBLE)
  const hiddenUpNextCount = upNext.length - AFTER_THAT_DEFAULT_VISIBLE
  const visibleActivity = recentActivity.filter((item) => !dismissedActivity.has(item.id))

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
                      {visibleUpNext.map((item) => (
                        <CompactActionRow key={item.id} item={item} />
                      ))}
                    </div>

                    {!showAllUpNext && hiddenUpNextCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllUpNext(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '0.45rem 0.6rem',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          letterSpacing: '0.01em',
                        }}
                      >
                        + Show {hiddenUpNextCount} more task{hiddenUpNextCount === 1 ? '' : 's'}
                      </button>
                    )}

                    {showAllUpNext && upNext.length > AFTER_THAT_DEFAULT_VISIBLE && (
                      <button
                        type="button"
                        onClick={() => setShowAllUpNext(false)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '0.45rem 0.6rem',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        Show less
                      </button>
                    )}
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
          {/* Quick Scan */}
          <section className="home-sheet">
            <div className="home-section-heading">
              <div style={{ minWidth: 0 }}>
                <p className="ui-kicker">Quick scan</p>
                <h2 className="ui-section-title" style={{ marginTop: '0.36rem' }}>How today is shaped</h2>
                <p className="ui-section-copy" style={{ marginTop: '0.32rem', maxWidth: '30rem' }}>
                  A quick look at what&apos;s queued, due soon, and recently changed.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 0, marginTop: '0.5rem' }}>
              {upNext.length > 0 && (
                <QuickScanGroup label="Up next">
                  {upNext.slice(0, 4).map((item) => (
                    <QuickScanRow key={item.id} title={item.title} href={resolveItemHref(item)} />
                  ))}
                </QuickScanGroup>
              )}

              {dueSoon.length > 0 && (
                <QuickScanGroup label="Due soon">
                  {dueSoon.slice(0, 4).map((item) => (
                    <QuickScanRow key={item.id} title={item.title} href={item.href} urgencyLabel={item.urgencyLabel} />
                  ))}
                </QuickScanGroup>
              )}

              {visibleActivity.length > 0 && (
                <QuickScanGroup label="Recent changes">
                  {visibleActivity.slice(0, 4).map((item) => (
                    <QuickScanRow key={item.id} title={item.title} href={item.href} external={item.external} />
                  ))}
                </QuickScanGroup>
              )}

              {upNext.length === 0 && dueSoon.length === 0 && visibleActivity.length === 0 && (
                <p style={{ padding: '0.6rem 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Nothing to scan right now.
                </p>
              )}
            </div>
          </section>

          <section className="home-sheet home-sheet-bounded home-sheet-bounded-rail">
            <SectionHeading
              eyebrow="What changed"
              title="What&apos;s new"
              description="Recent updates without the full course feed."
            />

            <div className="home-panel-scroll home-panel-scroll-rail">
              {visibleActivity.length > 0 ? (
                <div className="home-sheet-list">
                  {visibleActivity.map((item) => (
                    <ActivityRow
                      key={item.id}
                      item={item}
                      onDismiss={() => setDismissedActivity((prev) => new Set([...prev, item.id]))}
                    />
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
    <article className="home-sheet-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        {href ? (
          <Link href={href} className="ui-interactive-row home-row-main">
            {content}
          </Link>
        ) : (
          <div className="home-row-main">
            {content}
          </div>
        )}
      </div>
      {item.kind === 'task' && item.taskItemId ? (
        <div style={{ flexShrink: 0, paddingTop: '0.25rem' }}>
          <TaskStatusToggle
            status={item.completionStatus ?? 'pending'}
            moduleId={item.moduleId}
            title={item.title}
            taskItemId={item.taskItemId}
            align="end"
          />
        </div>
      ) : null}
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

function ActivityRow({ item, onDismiss }: { item: HomeActivityItem; onDismiss: () => void }) {
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

  return (
    <article className="home-sheet-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        {item.external ? (
          <a href={item.href} target="_blank" rel="noreferrer" className="home-activity-link ui-interactive-row home-row-main">
            {content}
          </a>
        ) : (
          <Link href={item.href} className="home-activity-link ui-interactive-row home-row-main">
            {content}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss"
        style={{
          flexShrink: 0,
          paddingTop: '0.5rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: 1,
        }}
        aria-label={`Dismiss: ${item.title}`}
      >
        ✕
      </button>
    </article>
  )
}

function QuickScanGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 60%, transparent)', paddingTop: '0.55rem', paddingBottom: '0.45rem' }}>
      <p style={{ margin: '0 0 0.3rem', fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </p>
      <div style={{ display: 'grid', gap: '0.1rem' }}>
        {children}
      </div>
    </div>
  )
}

function QuickScanRow({ title, href, urgencyLabel, external }: { title: string; href: string | null; urgencyLabel?: string; external?: boolean }) {
  const rowStyle = {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'baseline',
    padding: '0.18rem 0',
    fontSize: '12.5px',
    lineHeight: 1.45,
    color: 'var(--text-secondary)',
    textDecoration: 'none',
  }

  const inner = (
    <>
      <span style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </span>
      {urgencyLabel && (
        <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>
          {urgencyLabel}
        </span>
      )}
    </>
  )

  if (!href) {
    return <div style={rowStyle}>{inner}</div>
  }

  if (external) {
    return <a href={href} target="_blank" rel="noreferrer" style={rowStyle}>{inner}</a>
  }

  return <Link href={href} style={rowStyle}>{inner}</Link>
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
