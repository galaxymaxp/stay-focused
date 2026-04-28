import type { CSSProperties } from 'react'
import type { CanvasSyncPhase, SyncActivitySnapshot } from '@/components/useCanvasSyncStatus'
import { SAVING_SUB_STEPS } from '@/components/useCanvasSyncStatus'

// Ordered list of user-visible stages shown in the checklist.
// 'starting' is handled by the hook and resolves immediately, so we skip it here.
const SYNC_STAGES: Array<{ phase: CanvasSyncPhase; label: string }> = [
  { phase: 'connecting',      label: 'Connecting to Canvas' },
  { phase: 'fetchingCourses', label: 'Reading selected courses' },
  { phase: 'fetchingModules', label: 'Importing module content' },
  { phase: 'merging',         label: 'Organizing data' },
  { phase: 'saving',          label: 'Saving to Stay Focused' },
]

// The order matters: a phase's position determines done/active/pending state.
const PHASE_ORDER: CanvasSyncPhase[] = [
  'starting',
  'connecting',
  'fetchingCourses',
  'fetchingModules',
  'merging',
  'saving',
  'done',
]

type StageStatus = 'pending' | 'active' | 'done'

function getStageStatus(stagePhase: CanvasSyncPhase, currentPhase: CanvasSyncPhase): StageStatus {
  if (currentPhase === 'done') return 'done'
  if (currentPhase === 'error' || currentPhase === 'idle') return 'pending'

  const currentIndex = PHASE_ORDER.indexOf(currentPhase)
  const stageIndex   = PHASE_ORDER.indexOf(stagePhase)

  if (stageIndex < currentIndex)  return 'done'
  if (stageIndex === currentIndex) return 'active'
  return 'pending'
}

export function CanvasSyncStatusCard({
  phase,
  progressValue,
  title,
  detail,
  lastSync,
  onRetry,
  showWhenIdle = true,
  selectedCourseCount = 0,
  savingSubStepIndex = 0,
}: {
  detail: string
  lastSync: SyncActivitySnapshot | null
  onRetry?: () => void
  phase: CanvasSyncPhase
  progressValue: number
  showWhenIdle?: boolean
  title: string
  selectedCourseCount?: number
  savingSubStepIndex?: number
}) {
  if (!showWhenIdle && phase === 'idle' && !lastSync) {
    return null
  }

  const isSyncing      = phase !== 'idle' && phase !== 'done' && phase !== 'error'
  const showStages     = isSyncing || phase === 'done'
  const isSavingPhase  = phase === 'saving'
  const courseLabel    = selectedCourseCount > 1 ? `${selectedCourseCount} courses` : '1 course'
  const syncingTitle   = selectedCourseCount > 0 ? `Syncing ${courseLabel}` : title
  const progressPct    = Math.round(progressValue * 100)

  return (
    <div
      className="glass-panel glass-soft"
      style={cardStyle(phase)}
      aria-live="polite"
      aria-busy={isSyncing}
    >
      {/* ── Header ── */}
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
            <p style={titleStyle}>{isSyncing ? syncingTitle : title}</p>
            <p style={detailStyle}>{detail}</p>
          </div>
        </div>
        <span style={phaseChipStyle(phase)}>
          {isSyncing ? `${progressPct}%` : getPhaseChipLabel(phase)}
        </span>
      </div>

      {/* ── Stage checklist ── */}
      {showStages && (
        <div style={stageListStyle(phase)}>
          {SYNC_STAGES.map((stage) => {
            const status = getStageStatus(stage.phase, phase)
            return (
              <div key={stage.phase} style={stageRowStyle}>
                <div style={stageDotWrapStyle(status)} aria-hidden="true">
                  {status === 'done'
                    ? <CheckMark color="var(--green)" />
                    : status === 'active'
                      ? <div className="sync-stage-active-dot" />
                      : <div style={pendingDotStyle} />}
                </div>
                <span style={stageLabelStyle(status)}>{stage.label}</span>
                {status === 'active' && isSavingPhase && (
                  <span style={savingHintStyle}>{SAVING_SUB_STEPS[savingSubStepIndex]?.label ?? 'Processing'}</span>
                )}
              </div>
            )
          })}

          {/* Granular sub-steps shown during saving phase */}
          {isSavingPhase && (
            <div style={subStepListStyle}>
              {SAVING_SUB_STEPS.map((subStep, index) => {
                const subStatus: StageStatus = index < savingSubStepIndex ? 'done' : index === savingSubStepIndex ? 'active' : 'pending'
                return (
                  <div key={subStep.label} style={{ ...stageRowStyle, paddingLeft: '1.6rem' }}>
                    <div style={stageDotWrapStyle(subStatus)} aria-hidden="true">
                      {subStatus === 'done'
                        ? <CheckMark color="var(--green)" />
                        : subStatus === 'active'
                          ? <div className="sync-stage-active-dot" />
                          : <div style={pendingDotStyle} />}
                    </div>
                    <span style={stageLabelStyle(subStatus)}>{subStep.label}</span>
                    {subStatus !== 'pending' && (
                      <span style={{ ...savingHintStyle, marginLeft: 'auto' }}>
                        {Math.round(subStep.progressValue * 100)}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Final "Sync complete" row appears only when fully done */}
          {phase === 'done' && (
            <div style={stageRowStyle}>
              <div style={stageDotWrapStyle('done')} aria-hidden="true">
                <CheckMark color="var(--green)" />
              </div>
              <span style={stageLabelStyle('done')}>Sync complete</span>
            </div>
          )}
        </div>
      )}

      {/* ── Progress bar ── */}
      {phase !== 'idle' && (
        <div style={progressTrackStyle} aria-hidden="true">
          <div style={progressFillStyle(phase, progressValue)} />
        </div>
      )}

      {/* ── Footer ── */}
      <div style={footerStyle}>
        <span style={footerTextStyle}>
          {isSyncing
            ? selectedCourseCount > 1
              ? `Syncing ${selectedCourseCount} courses — AI extraction may take a few minutes.`
              : 'AI extraction may take a few minutes for large courses.'
            : lastSync
              ? lastSync.label
              : 'No sync has completed yet.'}
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

// ── Icons ────────────────────────────────────────────────────────────────────

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

function CheckMark({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 14 14" fill="none" width="12" height="12">
      <path d="M2.5 7.2L5.2 9.9L11.5 3.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Label helpers ─────────────────────────────────────────────────────────────

function getPhaseChipLabel(phase: CanvasSyncPhase) {
  if (phase === 'starting')        return 'Starting'
  if (phase === 'connecting')      return 'Connecting'
  if (phase === 'fetchingCourses') return 'Fetching courses'
  if (phase === 'fetchingModules') return 'Fetching modules'
  if (phase === 'merging')         return 'Merging'
  if (phase === 'saving')          return 'Saving'
  if (phase === 'done')            return 'Done'
  if (phase === 'error')           return 'Error'
  return 'Idle'
}

// ── Styles ────────────────────────────────────────────────────────────────────

function cardStyle(phase: CanvasSyncPhase): CSSProperties {
  const base: CSSProperties = {
    borderRadius: 'var(--radius-panel)',
    padding: '0.95rem 1rem',
    display: 'grid',
    gap: '0.75rem',
  }

  if (phase === 'done') {
    return {
      ...base,
      border: '1px solid color-mix(in srgb, var(--green) 22%, var(--border-subtle) 78%)',
      background: 'color-mix(in srgb, var(--green-light) 18%, var(--surface-elevated) 82%)',
    }
  }
  if (phase === 'error') {
    return {
      ...base,
      border: '1px solid color-mix(in srgb, var(--red) 22%, var(--border-subtle) 78%)',
      background: 'color-mix(in srgb, var(--red-light) 18%, var(--surface-elevated) 82%)',
    }
  }
  if (phase !== 'idle') {
    return {
      ...base,
      border: '1px solid color-mix(in srgb, var(--blue) 20%, var(--border-subtle) 80%)',
      background: 'color-mix(in srgb, var(--blue-light) 15%, var(--surface-elevated) 85%)',
    }
  }
  return base
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
  const color = phase === 'done' ? 'var(--green)' : phase === 'error' ? 'var(--red)' : 'var(--blue)'
  const bg    = phase === 'done'
    ? 'color-mix(in srgb, var(--green-light) 60%, var(--surface-base) 40%)'
    : phase === 'error'
      ? 'color-mix(in srgb, var(--red-light) 62%, var(--surface-base) 38%)'
      : 'color-mix(in srgb, var(--blue-light) 60%, var(--surface-base) 40%)'
  const border = phase === 'done'
    ? 'color-mix(in srgb, var(--green) 18%, var(--border-subtle) 82%)'
    : phase === 'error'
      ? 'color-mix(in srgb, var(--red) 18%, var(--border-subtle) 82%)'
      : 'color-mix(in srgb, var(--blue) 18%, var(--border-subtle) 82%)'

  return {
    width: '2.1rem',
    height: '2.1rem',
    borderRadius: '999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color,
    background: bg,
    border: `1px solid ${border}`,
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
  const isActive = phase !== 'idle' && phase !== 'done' && phase !== 'error'
  return {
    padding: '0.28rem 0.58rem',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    background: phase === 'done'
      ? 'color-mix(in srgb, var(--green-light) 60%, var(--surface-base) 40%)'
      : phase === 'error'
        ? 'color-mix(in srgb, var(--red-light) 62%, var(--surface-base) 38%)'
        : isActive
          ? 'color-mix(in srgb, var(--blue-light) 62%, var(--surface-base) 38%)'
          : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
    color: phase === 'done'
      ? 'var(--green)'
      : phase === 'error'
        ? 'var(--red)'
        : isActive
          ? 'var(--blue)'
          : 'var(--text-muted)',
    border: `1px solid ${phase === 'done'
      ? 'color-mix(in srgb, var(--green) 18%, var(--border-subtle) 82%)'
      : phase === 'error'
        ? 'color-mix(in srgb, var(--red) 18%, var(--border-subtle) 82%)'
        : isActive
          ? 'color-mix(in srgb, var(--blue) 18%, var(--border-subtle) 82%)'
          : 'var(--border-subtle)'}`,
  }
}

function stageListStyle(phase: CanvasSyncPhase): CSSProperties {
  return {
    display: 'grid',
    gap: 0,
    borderRadius: '10px',
    border: `1px solid ${phase === 'done'
      ? 'color-mix(in srgb, var(--green) 14%, var(--border-subtle) 86%)'
      : 'color-mix(in srgb, var(--blue) 12%, var(--border-subtle) 88%)'}`,
    background: phase === 'done'
      ? 'color-mix(in srgb, var(--green-light) 10%, var(--surface-elevated) 90%)'
      : 'color-mix(in srgb, var(--blue-light) 8%, var(--surface-elevated) 92%)',
    overflow: 'hidden',
  }
}

const stageRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.52rem 0.8rem',
  borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent)',
}

function stageDotWrapStyle(status: StageStatus): CSSProperties {
  return {
    flexShrink: 0,
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    background: status === 'done'
      ? 'color-mix(in srgb, var(--green-light) 70%, var(--surface-base) 30%)'
      : status === 'active'
        ? 'color-mix(in srgb, var(--blue-light) 70%, var(--surface-base) 30%)'
        : 'color-mix(in srgb, var(--surface-soft) 80%, transparent)',
    border: `1px solid ${status === 'done'
      ? 'color-mix(in srgb, var(--green) 22%, var(--border-subtle) 78%)'
      : status === 'active'
        ? 'color-mix(in srgb, var(--blue) 22%, var(--border-subtle) 78%)'
        : 'color-mix(in srgb, var(--border-subtle) 80%, transparent)'}`,
  }
}

const pendingDotStyle: CSSProperties = {
  width: '5px',
  height: '5px',
  borderRadius: '50%',
  background: 'var(--text-muted)',
  opacity: 0.4,
}

function stageLabelStyle(status: StageStatus): CSSProperties {
  return {
    flex: '1 1 0',
    fontSize: '12.5px',
    lineHeight: 1.5,
    fontWeight: status === 'active' ? 600 : status === 'done' ? 500 : 400,
    color: status === 'active'
      ? 'var(--text-primary)'
      : status === 'done'
        ? 'var(--text-secondary)'
        : 'var(--text-muted)',
  }
}

const savingHintStyle: CSSProperties = {
  fontSize: '11px',
  lineHeight: 1.4,
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  flexShrink: 0,
}

const subStepListStyle: CSSProperties = {
  borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent)',
  background: 'color-mix(in srgb, var(--surface-soft) 30%, transparent)',
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

const footerTextStyle: CSSProperties = {
  fontSize: '12px',
  lineHeight: 1.55,
  color: 'var(--text-muted)',
}
