'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import type { TodayItem } from '@/lib/types'

export function TodayDashboard({
  nextBestMove,
  needsAction,
  needsUnderstanding,
  comingUp,
  undatedTaskCount,
}: {
  nextBestMove: TodayItem | null
  needsAction: TodayItem[]
  needsUnderstanding: TodayItem[]
  comingUp: TodayItem[]
  undatedTaskCount: number
}) {
  return (
    <section className="page-stack" style={{ gap: '1.25rem' }}>
      <header className="motion-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        <div>
          <p className="ui-kicker">Today</p>
          <h1 className="ui-page-title">What should I do right now?</h1>
          <p className="ui-page-copy">
            A calmer read on your workload. Start with the clearest next move, then scan what needs action, what is worth understanding, and what is coming up soon.
          </p>
        </div>

        {undatedTaskCount > 0 && (
          <div className="glass-panel glass-soft ui-empty" style={noticeStyle}>
            {undatedTaskCount} task{undatedTaskCount === 1 ? '' : 's'} still need a due date, so they are kept out of the recommendation flow for now.
          </div>
        )}
      </header>

      {nextBestMove ? (
        <FocusHeroCard item={nextBestMove} />
      ) : (
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ textAlign: 'center', padding: '3.2rem 1.5rem' }}>
          <p className="ui-kicker">Best next step</p>
          <h2 style={{ margin: '0.5rem 0 0', fontSize: '26px', lineHeight: 1.15, fontWeight: 650, letterSpacing: '-0.03em' }}>You are clear for now</h2>
          <p style={{ margin: '0.85rem auto 0', maxWidth: '38rem', fontSize: '15px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            Nothing urgent is asking for you right now. Use this quieter moment to review a module or sync another course.
          </p>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        <SectionBlock
          eyebrow="Needs attention"
          title="Needs Action"
          description="Assignments, submissions, and deadlines that are best handled soon."
          items={needsAction}
          emptyMessage="Your action list is clear right now."
          actionHref="/do"
          actionLabel="Open Do"
        />

        <SectionBlock
          eyebrow="Worth reviewing"
          title="Needs Understanding"
          description="Modules and course material to read through before they turn into rushed work."
          items={needsUnderstanding}
          emptyMessage="Nothing new needs a closer read at the moment."
          actionHref="/learn"
          actionLabel="Open Learn"
        />
      </div>

      <SectionBlock
        eyebrow="Looking ahead"
        title="Coming Up"
        description="Near-future work and learning items so the next few days stay predictable."
        items={comingUp}
        emptyMessage="There is nothing notable coming up just yet."
      />
    </section>
  )
}

function FocusHeroCard({ item }: { item: TodayItem }) {
  return (
    <section className="glass-panel glass-accent motion-card" style={heroCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 420px' }}>
          <p className="ui-kicker" style={{ color: 'var(--accent-foreground)' }}>Best next step</p>
          {item.href ? (
            <Link href={item.href} style={{ textDecoration: 'none' }}>
              <h2 style={heroTitleStyle}>{item.title}</h2>
            </Link>
          ) : (
            <h2 style={heroTitleStyle}>{item.title}</h2>
          )}
          <p style={heroBodyStyle}>{item.whyNow}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <TonePill item={item} emphasis />
          {item.effortLabel && <MetaPill>{item.effortLabel}</MetaPill>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
        <MetaCard label="Course" value={item.courseName} />
        <MetaCard label="Focus" value={item.moduleTitle ?? fallbackFocusLabel(item.kind)} />
        <MetaCard label="Suggested action" value={item.actionLabel} />
        <MetaCard label="Timing" value={item.dateTime ? formatDateTime(item.dateTime) : 'When you are ready'} />
      </div>

      {item.supportingText && (
        <div className="glass-panel glass-soft" style={supportCardStyle}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Why this is the clearest move</p>
          <p style={{ margin: '0.45rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{item.supportingText}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <ItemActionButton item={item} primary />
        {item.href && (
          <Link href={item.href} className="ui-button ui-button-secondary" style={secondaryButtonStyle}>
            Open details
          </Link>
        )}
      </div>
    </section>
  )
}

function SectionBlock({
  eyebrow,
  title,
  description,
  items,
  emptyMessage,
  actionHref,
  actionLabel,
}: {
  eyebrow: string
  title: string
  description: string
  items: TodayItem[]
  emptyMessage: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <section className="motion-card motion-delay-1 section-shell section-shell-elevated">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <p className="ui-kicker">{eyebrow}</p>
          <h2 className="ui-section-title">{title}</h2>
          <p className="ui-section-copy">{description}</p>
        </div>
        {actionHref && actionLabel && (
          <Link href={actionHref} className="ui-button ui-button-ghost ui-button-xs">
            {actionLabel}
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="ui-empty" style={emptyBlockStyle}>{emptyMessage}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {items.map((item) => (
            <TodayItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}

function TodayItemCard({ item }: { item: TodayItem }) {
  const tone = getToneStyle(item.tone)

  return (
    <article className="glass-panel glass-hover" style={itemCardStyle(item.tone)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
            <TonePill item={item} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.courseName}</span>
          </div>
          {item.href ? (
            <Link href={item.href} style={{ textDecoration: 'none' }}>
              <h3 style={itemTitleStyle}>{item.title}</h3>
            </Link>
          ) : (
            <h3 style={itemTitleStyle}>{item.title}</h3>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {item.effortLabel && <MetaPill>{item.effortLabel}</MetaPill>}
          {item.dateTime && <MetaPill>{formatDateTime(item.dateTime)}</MetaPill>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{item.whyNow}</p>
        {item.supportingText && (
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.55, color: 'var(--text-muted)' }}>{item.supportingText}</p>
        )}
        <div className="ui-meta-list">
          {item.moduleTitle && <span><strong>Module:</strong> {item.moduleTitle}</span>}
          {!item.moduleTitle && <span><strong>Type:</strong> {tone.kindLabel}</span>}
          <span><strong>Suggested action:</strong> {item.actionLabel}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
        <ItemActionButton item={item} />
        {item.href && (
          <Link href={item.href} className="ui-button ui-button-ghost" style={ghostButtonStyle}>
            Open details
          </Link>
        )}
      </div>
    </article>
  )
}

function ItemActionButton({ item, primary = false }: { item: TodayItem; primary?: boolean }) {
  if (!item.href) return null
  return (
    <Link href={item.href} className={`ui-button ${primary ? 'ui-button-primary' : 'ui-button-secondary'}`} style={primary ? primaryButtonStyle : secondaryButtonStyle}>
      {item.actionLabel}
    </Link>
  )
}

function TonePill({ item, emphasis = false }: { item: TodayItem; emphasis?: boolean }) {
  const tone = getToneStyle(item.tone)

  return (
    <span className="ui-chip" style={{
      gap: '0.38rem',
      padding: emphasis ? '0.32rem 0.68rem' : '0.25rem 0.55rem',
      fontSize: emphasis ? '12px' : '11px',
      fontWeight: 700,
      background: tone.background,
      color: tone.color,
      border: `1px solid ${tone.border}`,
    }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: tone.dot }} />
      {item.toneLabel}
    </span>
  )
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="ui-chip" style={{
      padding: '0.25rem 0.55rem',
      fontSize: '11px',
      fontWeight: 600,
      color: 'var(--text-secondary)',
    }}>
      {children}
    </span>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel glass-soft" style={metaCardStyle}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.42rem 0 0', fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function getToneStyle(tone: TodayItem['tone']) {
  if (tone === 'attention') {
    return {
      dot: 'var(--amber)',
      color: 'var(--amber)',
      border: 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)',
      background: 'color-mix(in srgb, var(--amber-light) 34%, var(--surface-soft) 66%)',
      kindLabel: 'Action item',
    }
  }

  if (tone === 'review') {
    return {
      dot: 'var(--blue)',
      color: 'var(--blue)',
      border: 'color-mix(in srgb, var(--blue) 24%, var(--border-subtle) 76%)',
      background: 'color-mix(in srgb, var(--blue-light) 42%, var(--surface-soft) 58%)',
      kindLabel: 'Learning item',
    }
  }

  return {
    dot: 'var(--text-muted)',
    color: 'var(--text-secondary)',
    border: 'var(--border-subtle)',
    background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
    kindLabel: 'Upcoming item',
  }
}

function fallbackFocusLabel(kind: TodayItem['kind']) {
  if (kind === 'module') return 'Review this module'
  if (kind === 'learning') return 'Learning focus'
  return 'Assignment focus'
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

const heroTitleStyle: CSSProperties = {
  margin: '0.55rem 0 0',
  fontSize: '30px',
  lineHeight: 1.08,
  fontWeight: 650,
  letterSpacing: '-0.04em',
  color: 'var(--text-primary)',
}

const heroBodyStyle: CSSProperties = {
  margin: '0.9rem 0 0',
  maxWidth: '42rem',
  fontSize: '16px',
  lineHeight: 1.65,
  color: 'var(--text-secondary)',
}

const heroCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-page)',
  padding: '1.4rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  boxShadow: 'var(--shadow-medium), var(--highlight-sheen)',
}

const supportCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '0.95rem 1rem',
}

const itemTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '17px',
  lineHeight: 1.3,
  fontWeight: 650,
  color: 'var(--text-primary)',
}

const noticeStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '0.8rem 0.95rem',
  fontSize: '13px',
}

const emptyBlockStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '1rem',
  fontSize: '14px',
  lineHeight: 1.6,
}

const metaCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '0.85rem 0.9rem',
}

function itemCardStyle(tone: TodayItem['tone']): CSSProperties {
  const toneStyle = getToneStyle(tone)

  return {
    ['--glass-panel-bg' as string]: tone === 'review'
      ? 'color-mix(in srgb, var(--glass-surface-soft) 72%, var(--blue-light) 28%)'
      : tone === 'attention'
        ? 'color-mix(in srgb, var(--glass-surface-strong) 76%, var(--accent-light) 24%)'
        : 'var(--glass-surface)',
    ['--glass-panel-border' as string]: toneStyle.border,
    ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
    borderRadius: 'var(--radius-panel)',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  }
}

const primaryButtonStyle: CSSProperties = {
  minHeight: '2.6rem',
  padding: '0.72rem 1rem',
  fontSize: '13px',
}

const secondaryButtonStyle: CSSProperties = {
  minHeight: '2.6rem',
  padding: '0.72rem 1rem',
  fontSize: '13px',
}

const ghostButtonStyle: CSSProperties = {
  minHeight: '2.6rem',
  padding: '0.72rem 1rem',
  fontSize: '13px',
}
