import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { TaskDraftButton } from '@/components/DoNowButton'
import { TaskStatusToggle } from '@/components/TaskStatusToggle'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildManualCopyBundle } from '@/lib/manual-copy-bundle'
import type { TodayItem } from '@/lib/types'

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function DoNowPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams
  const legacyQuery = toSearchParamsString(resolvedSearchParams)

  if (legacyQuery.has('task') || legacyQuery.has('taskTitle') || legacyQuery.has('donow')) {
    redirect(`/tasks${legacyQuery.toString() ? `?${legacyQuery.toString()}` : ''}`)
  }

  const workspace = await getClarityWorkspace()

  if (!workspace.hasSyncedData) {
    return (
      <main className="page-shell page-stack">
        <SyncFirstEmptyState eyebrow="Do Now" />
      </main>
    )
  }

  const primaryAction = workspace.today.nextBestMove
  const backupItems = [...workspace.today.needsAction, ...workspace.today.needsUnderstanding]
    .filter((item) => item.id !== primaryAction?.id)
    .slice(0, 3)

  return (
    <main className="page-shell page-stack">
      <header className="section-shell" style={{ display: 'grid', gap: '0.8rem', padding: '1.35rem' }}>
        <div>
          <p className="ui-kicker">Do Now</p>
          <h1 className="ui-page-title">Start with one thing</h1>
          <p className="ui-page-copy" style={{ maxWidth: '42rem' }}>
            This page is for momentum, not sorting. Pick one useful next move, get enough context to begin, and keep the full task list in the background until you need it.
          </p>
        </div>
      </header>

      {primaryAction ? (
        <section className="section-shell section-shell-elevated" style={{ display: 'grid', gap: '1rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <ToneBadge item={primaryAction} />
                {primaryAction.dateTime ? <MetaBadge>{formatDateTime(primaryAction.dateTime)}</MetaBadge> : null}
                {primaryAction.effortLabel ? <MetaBadge>{primaryAction.effortLabel}</MetaBadge> : null}
              </div>
              <h2 style={{ margin: '0.6rem 0 0', fontSize: 'clamp(1.9rem, 4vw, 2.7rem)', lineHeight: 1.04, letterSpacing: '-0.05em', fontWeight: 650, color: 'var(--text-primary)' }}>
                {primaryAction.title}
              </h2>
              <p style={{ margin: '0.8rem 0 0', maxWidth: '44rem', fontSize: '16px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                {primaryAction.whyNow}
              </p>
            </div>

            {primaryAction.kind === 'task' && primaryAction.taskItemId ? (
              <TaskStatusToggle
                status={primaryAction.completionStatus ?? 'pending'}
                moduleId={primaryAction.moduleId}
                title={primaryAction.title}
                taskItemId={primaryAction.taskItemId}
                align="end"
              />
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
            <MetaCard label="Course" value={primaryAction.courseName} />
            <MetaCard label="Area" value={primaryAction.moduleTitle || fallbackAreaLabel(primaryAction)} />
            <MetaCard label="Smallest next step" value={smallestNextStepLabel(primaryAction)} />
          </div>

          {primaryAction.supportingText ? (
            <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
              <p className="ui-kicker" style={{ margin: 0 }}>Why it matters</p>
              <p style={{ margin: '0.4rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {primaryAction.supportingText}
              </p>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {primaryAction.kind === 'task' ? (
              <TaskDraftButton
                copyBundle={buildManualCopyBundle({
                  taskTitle: primaryAction.title,
                  courseName: primaryAction.courseName,
                  moduleName: primaryAction.moduleTitle,
                  dueDate: primaryAction.dateTime,
                  taskDetails: primaryAction.supportingText,
                })}
                context={{
                  taskTitle: primaryAction.title,
                  taskDetails: primaryAction.supportingText,
                  deadline: primaryAction.dateTime,
                  priority: primaryAction.priority,
                  courseName: primaryAction.courseName,
                  moduleTitle: primaryAction.moduleTitle,
                  canvasUrl: primaryAction.canvasUrl,
                  learnHref: primaryAction.learnHref ?? primaryAction.href,
                }}
              />
            ) : null}
            {resolveItemHref(primaryAction) ? (
              <Link href={resolveItemHref(primaryAction)!} className="ui-button ui-button-primary">
                {primaryButtonLabel(primaryAction)}
              </Link>
            ) : null}
            <Link href="/tasks" className="ui-button ui-button-ghost">
              Open full task list
            </Link>
          </div>
        </section>
      ) : (
        <section className="section-shell section-shell-elevated" style={{ padding: '1.3rem' }}>
          <p className="ui-kicker">Do Now</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>You are clear for now</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '34rem' }}>
            Nothing urgent is asking for you right now. Use the quiet time to review a course or check the calendar.
          </p>
        </section>
      )}

      <section className="section-shell" style={{ display: 'grid', gap: '0.9rem', padding: '1.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="ui-kicker">If not that</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>Next options</h2>
            <p className="ui-section-copy" style={{ marginTop: '0.4rem', maxWidth: '32rem' }}>
              Keep backups short. These are the next few items worth touching if the main recommendation is blocked.
            </p>
          </div>
          <Link href="/tasks" className="ui-button ui-button-ghost ui-button-xs">
            Open Tasks
          </Link>
        </div>

        {backupItems.length > 0 ? (
          <div className="home-compact-list">
            {backupItems.map((item) => (
              <div key={item.id} className="home-list-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <ToneBadge item={item} subtle />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.courseName}</span>
                  </div>
                  <p style={{ margin: '0.42rem 0 0', fontSize: '15px', lineHeight: 1.4, fontWeight: 650, color: 'var(--text-primary)' }}>
                    {item.title}
                  </p>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                    {item.whyNow}
                  </p>
                </div>
                {resolveItemHref(item) ? (
                  <Link href={resolveItemHref(item)!} className="ui-button ui-button-secondary ui-button-xs">
                    Open
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', fontSize: '14px', lineHeight: 1.6 }}>
            No backup items need attention right now.
          </div>
        )}
      </section>
    </main>
  )
}

function toSearchParamsString(searchParams: Record<string, string | string[] | undefined> | undefined) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry)
      }
      continue
    }

    if (typeof value === 'string') {
      params.set(key, value)
    }
  }

  return params
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

function smallestNextStepLabel(item: TodayItem) {
  if (item.kind === 'task') return 'Open the task and start the first pass.'
  if (item.kind === 'module') return 'Review the module summary and key material.'
  return 'Open the study view and keep moving.'
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

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
      <p className="ui-kicker" style={{ margin: 0 }}>{label}</p>
      <p style={{ margin: '0.38rem 0 0', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  )
}
