import type { CSSProperties } from 'react'
import type { CanvasSyncPhase, SyncActivitySnapshot } from '@/components/useCanvasSyncStatus'

export function CanvasSyncStatusCard({
  phase,
  progressValue,
  title,
  detail,
  lastSync,
  onRetry,
  showWhenIdle = true,
}: {
  detail: string
  lastSync: SyncActivitySnapshot | null
  onRetry?: () => void
  phase: CanvasSyncPhase
  progressValue: number
  showWhenIdle?: boolean
  title: string
}) {
  if (!showWhenIdle && phase === 'idle' && !lastSync) {
    return null
  }

  const isSyncing = phase !== 'idle' && phase !== 'done' && phase !== 'error'

  return (
    <div
      className="glass-panel glass-soft"
      style={cardStyle(phase)}
      aria-live="polite"
      aria-busy={isSyncing}
    >
      <div style={headerStyle}>
        <div style={iconAndCopyStyle}>
          <div
            className={isSyncing ? 'sync-status-icon sync-status-icon-spinning' : 'sync-status-icon'}
            style={iconShellStyle(phase)}
            aria-hidden="true"
          >
            <SyncStatusIcon phase={phase} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={titleStyle}>{title}</p>
            <p style={detailStyle}>{detail}</p>
          </div>
        </div>

        <span style={phaseChipStyle(phase)}>{getPhaseChipLabel(phase)}</span>
      </div>

      {phase !== 'idle' && (
        <div style={progressTrackStyle} aria-hidden="true">
          <div style={progressFillStyle(phase, progressValue)} />
        </div>
      )}

      <div style={footerStyle}>
        <span style={lastSyncStyle}>
          {lastSync ? lastSync.label : 'No sync has completed yet.'}
        </span>
        {phase === 'error' && onRetry && (
          <button type="button" onClick={onRetry} className="ui-button ui-button-ghost ui-button-xs">
            Retry sync
          </button>
        )}
      </div>
    </div>
  )
}

function SyncStatusIcon({ phase }: { phase: CanvasSyncPhase }) {
  if (phase === 'done') {
    return (
      <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
        <path d="M5 10.4L8.2 13.6L15 6.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (phase === 'error') {
    return (
      <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
        <path d="M10 6V10.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="10" cy="13.7" r="0.95" fill="currentColor" />
        <path d="M10 2.7L17 16.2H3L10 2.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
      <path d="M16.2 9.15A6.45 6.45 0 0 0 5.5 5.1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M5.75 2.95V5.35H8.15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.8 10.85A6.45 6.45 0 0 0 14.5 14.9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M14.25 17.05V14.65H11.85" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function getPhaseChipLabel(phase: CanvasSyncPhase) {
  if (phase === 'starting') return 'Starting'
  if (phase === 'connecting') return 'Connecting'
  if (phase === 'fetchingCourses') return 'Fetching courses'
  if (phase === 'fetchingModules') return 'Fetching modules'
  if (phase === 'merging') return 'Merging'
  if (phase === 'saving') return 'Saving'
  if (phase === 'done') return 'Done'
  if (phase === 'error') return 'Error'
  return 'Idle'
}

function cardStyle(phase: CanvasSyncPhase): CSSProperties {
  if (phase === 'done') {
    return {
      borderRadius: 'var(--radius-panel)',
      padding: '0.95rem 1rem',
      display: 'grid',
      gap: '0.75rem',
      border: '1px solid color-mix(in srgb, var(--green) 22%, var(--border-subtle) 78%)',
      background: 'color-mix(in srgb, var(--green-light) 18%, var(--surface-elevated) 82%)',
    }
  }

  if (phase === 'error') {
    return {
      borderRadius: 'var(--radius-panel)',
      padding: '0.95rem 1rem',
      display: 'grid',
      gap: '0.75rem',
      border: '1px solid color-mix(in srgb, var(--red) 22%, var(--border-subtle) 78%)',
      background: 'color-mix(in srgb, var(--red-light) 18%, var(--surface-elevated) 82%)',
    }
  }

  if (phase !== 'idle') {
    return {
      borderRadius: 'var(--radius-panel)',
      padding: '0.95rem 1rem',
      display: 'grid',
      gap: '0.75rem',
      border: '1px solid color-mix(in srgb, var(--blue) 20%, var(--border-subtle) 80%)',
      background: 'color-mix(in srgb, var(--blue-light) 15%, var(--surface-elevated) 85%)',
    }
  }

  return {
    borderRadius: 'var(--radius-panel)',
    padding: '0.95rem 1rem',
    display: 'grid',
    gap: '0.75rem',
  }
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.75rem',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const iconAndCopyStyle: CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'flex-start',
  minWidth: 0,
}

function iconShellStyle(phase: CanvasSyncPhase): CSSProperties {
  return {
    width: '2.1rem',
    height: '2.1rem',
    borderRadius: '999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: phase === 'done'
      ? 'var(--green)'
      : phase === 'error'
        ? 'var(--red)'
        : 'var(--blue)',
    background: phase === 'done'
      ? 'color-mix(in srgb, var(--green-light) 60%, var(--surface-base) 40%)'
      : phase === 'error'
        ? 'color-mix(in srgb, var(--red-light) 62%, var(--surface-base) 38%)'
        : 'color-mix(in srgb, var(--blue-light) 60%, var(--surface-base) 40%)',
    border: `1px solid ${phase === 'done'
      ? 'color-mix(in srgb, var(--green) 18%, var(--border-subtle) 82%)'
      : phase === 'error'
        ? 'color-mix(in srgb, var(--red) 18%, var(--border-subtle) 82%)'
        : 'color-mix(in srgb, var(--blue) 18%, var(--border-subtle) 82%)'}`,
    flexShrink: 0,
  }
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '14px',
  lineHeight: 1.35,
  fontWeight: 650,
  color: 'var(--text-primary)',
}

const detailStyle: CSSProperties = {
  margin: '0.28rem 0 0',
  fontSize: '13px',
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
}

function phaseChipStyle(phase: CanvasSyncPhase): CSSProperties {
  return {
    padding: '0.28rem 0.58rem',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    background: phase === 'done'
      ? 'color-mix(in srgb, var(--green-light) 60%, var(--surface-base) 40%)'
      : phase === 'error'
        ? 'color-mix(in srgb, var(--red-light) 62%, var(--surface-base) 38%)'
        : phase !== 'idle'
          ? 'color-mix(in srgb, var(--blue-light) 62%, var(--surface-base) 38%)'
          : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
    color: phase === 'done'
      ? 'var(--green)'
      : phase === 'error'
        ? 'var(--red)'
        : phase !== 'idle'
          ? 'var(--blue)'
          : 'var(--text-muted)',
    border: `1px solid ${phase === 'done'
      ? 'color-mix(in srgb, var(--green) 18%, var(--border-subtle) 82%)'
      : phase === 'error'
        ? 'color-mix(in srgb, var(--red) 18%, var(--border-subtle) 82%)'
        : phase !== 'idle'
          ? 'color-mix(in srgb, var(--blue) 18%, var(--border-subtle) 82%)'
          : 'var(--border-subtle)'}`,
  }
}

const progressTrackStyle: CSSProperties = {
  width: '100%',
  height: '0.3rem',
  overflow: 'hidden',
  borderRadius: '999px',
  background: 'color-mix(in srgb, var(--surface-soft) 90%, transparent)',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent)',
}

function progressFillStyle(phase: CanvasSyncPhase, progressValue: number): CSSProperties {
  return {
    width: `${Math.max(10, Math.min(100, Math.round(progressValue * 100)))}%`,
    height: '100%',
    borderRadius: 'inherit',
    background: phase === 'done'
      ? 'linear-gradient(90deg, color-mix(in srgb, var(--green) 80%, #ffffff 20%), color-mix(in srgb, var(--green) 64%, var(--blue) 36%))'
      : phase === 'error'
        ? 'linear-gradient(90deg, color-mix(in srgb, var(--red) 80%, #ffffff 20%), color-mix(in srgb, var(--amber) 56%, var(--red) 44%))'
        : 'linear-gradient(90deg, color-mix(in srgb, var(--blue) 78%, #ffffff 22%), color-mix(in srgb, var(--accent) 44%, var(--blue) 56%))',
    transition: 'width 220ms ease',
  }
}

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.75rem',
  alignItems: 'center',
  flexWrap: 'wrap',
}

const lastSyncStyle: CSSProperties = {
  fontSize: '12px',
  lineHeight: 1.55,
  color: 'var(--text-muted)',
}
