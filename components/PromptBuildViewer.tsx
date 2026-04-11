import type { CSSProperties } from 'react'
import type { PromptBuildPhase } from '@/components/usePromptBuild'

const PHASE_SEQUENCE: Array<Extract<PromptBuildPhase, 'preparing' | 'reading' | 'structuring' | 'streaming'>> = [
  'preparing',
  'reading',
  'structuring',
  'streaming',
]

const PHASE_LABELS: Record<Extract<PromptBuildPhase, 'preparing' | 'reading' | 'structuring' | 'streaming'>, string> = {
  preparing: 'Prepare',
  reading: 'Read',
  structuring: 'Structure',
  streaming: 'Write',
}

export function PromptBuildViewer({
  phase,
  progressValue,
  promptText,
  taskTitle,
}: {
  phase: PromptBuildPhase
  progressValue: number
  promptText: string
  taskTitle: string
}) {
  const phaseCopy = getPhaseCopy(phase)
  const visiblePromptText = promptText || buildPromptScaffold(taskTitle, phase)
  const progressPercent = Math.max(0, Math.min(100, Math.round(progressValue * 100)))

  return (
    <section
      className="glass-panel glass-soft motion-subsection"
      style={viewerShellStyle}
      aria-busy={phase !== 'done' && phase !== 'error'}
    >
      <div style={headerRowStyle}>
        <div style={headerCopyStyle}>
          <div className="prompt-build-icon" aria-hidden="true">
            <span className="prompt-build-icon-line prompt-build-icon-line-1" />
            <span className="prompt-build-icon-line prompt-build-icon-line-2" />
            <span className="prompt-build-icon-line prompt-build-icon-line-3" />
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="ui-kicker" style={{ margin: 0 }}>Starter draft</p>
            <h3 style={headerTitleStyle}>Building draft help</h3>
            <p aria-live="polite" style={phaseTextStyle}>{phaseCopy}</p>
          </div>
        </div>
        <div style={progressBadgeStyle}>{progressPercent}%</div>
      </div>

      <div style={phaseRailStyle}>
        {PHASE_SEQUENCE.map((entry) => {
          const state = getPhaseState(entry, phase)

          return (
            <span key={entry} style={phaseChipStyle(state)}>
              <span style={phaseDotStyle(state)} />
              {PHASE_LABELS[entry]}
            </span>
          )
        })}
      </div>

      <div style={progressTrackStyle} aria-hidden="true">
        <div style={progressBarStyle(progressValue)} />
      </div>

      <div style={codePanelStyle}>
        <pre style={codeTextStyle}>
          {visiblePromptText}
          {phase !== 'done' && phase !== 'error' && <span className="prompt-build-cursor" aria-hidden="true" />}
        </pre>
      </div>
    </section>
  )
}

function getPhaseCopy(phase: PromptBuildPhase) {
  if (phase === 'preparing') return 'Preparing task context...'
  if (phase === 'reading') return 'Reading assignment details...'
  if (phase === 'structuring') return 'Structuring prompt...'
  if (phase === 'streaming') return 'Writing draft prompt...'
  if (phase === 'done') return 'Draft ready'
  if (phase === 'error') return 'Draft build failed'
  return 'Waiting to begin...'
}

function buildPromptScaffold(taskTitle: string, phase: PromptBuildPhase) {
  const phaseLine = getPhaseCopy(phase)

  return [
    `// task: ${taskTitle}`,
    '// mode: output-first draft generation',
    '',
    `// ${phaseLine}`,
    'task_context {',
    '  title: [loading task title]',
    '  instructions: [reading surfaced assignment details]',
    '}',
    '',
    'draft_rules {',
    '  - ground the response in the assignment',
    '  - produce the deliverable before explanation',
    '  - keep the next step concrete',
    '}',
  ].join('\n')
}

function getPhaseState(
  entry: Extract<PromptBuildPhase, 'preparing' | 'reading' | 'structuring' | 'streaming'>,
  currentPhase: PromptBuildPhase,
) {
  const currentIndex = PHASE_SEQUENCE.indexOf(
    currentPhase === 'idle' || currentPhase === 'done' || currentPhase === 'error'
      ? 'streaming'
      : currentPhase,
  )
  const entryIndex = PHASE_SEQUENCE.indexOf(entry)

  if (currentPhase === 'idle') return 'pending' as const
  if (currentPhase === 'done') return 'complete' as const
  if (currentPhase === 'error') {
    return entryIndex < PHASE_SEQUENCE.length - 1 ? 'complete' as const : 'active' as const
  }

  if (entryIndex < currentIndex) return 'complete' as const
  if (entryIndex === currentIndex) return 'active' as const
  return 'pending' as const
}

const viewerShellStyle: CSSProperties = {
  borderRadius: 'var(--radius-page)',
  padding: '1rem',
  display: 'grid',
  gap: '0.9rem',
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.75rem',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const headerCopyStyle: CSSProperties = {
  display: 'flex',
  gap: '0.8rem',
  alignItems: 'flex-start',
  minWidth: 0,
}

const headerTitleStyle: CSSProperties = {
  margin: '0.34rem 0 0',
  fontSize: '18px',
  lineHeight: 1.1,
  fontWeight: 650,
  letterSpacing: '-0.03em',
  color: 'var(--text-primary)',
}

const phaseTextStyle: CSSProperties = {
  margin: '0.4rem 0 0',
  fontSize: '13px',
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
}

const progressBadgeStyle: CSSProperties = {
  minWidth: '3.2rem',
  padding: '0.36rem 0.58rem',
  borderRadius: '999px',
  border: '1px solid color-mix(in srgb, var(--accent-border) 24%, var(--border-subtle) 76%)',
  background: 'color-mix(in srgb, var(--accent-light) 38%, var(--surface-soft) 62%)',
  color: 'var(--accent-foreground)',
  fontSize: '11px',
  fontWeight: 700,
  textAlign: 'center',
}

const phaseRailStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
}

function phaseChipStyle(state: 'pending' | 'active' | 'complete'): CSSProperties {
  if (state === 'complete') {
    return {
      ...phaseChipBaseStyle,
      background: 'color-mix(in srgb, var(--accent-light) 44%, var(--surface-soft) 56%)',
      border: '1px solid color-mix(in srgb, var(--accent-border) 30%, var(--border-subtle) 70%)',
      color: 'var(--text-primary)',
    }
  }

  if (state === 'active') {
    return {
      ...phaseChipBaseStyle,
      background: 'color-mix(in srgb, var(--blue-light) 42%, var(--surface-soft) 58%)',
      border: '1px solid color-mix(in srgb, var(--blue) 24%, var(--border-subtle) 76%)',
      color: 'var(--text-primary)',
      boxShadow: '0 0 0 1px color-mix(in srgb, var(--blue) 10%, transparent)',
    }
  }

  return phaseChipBaseStyle
}

const phaseChipBaseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.32rem 0.58rem',
  borderRadius: '999px',
  border: '1px solid var(--border-subtle)',
  background: 'color-mix(in srgb, var(--surface-soft) 90%, transparent)',
  color: 'var(--text-muted)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.03em',
}

function phaseDotStyle(state: 'pending' | 'active' | 'complete'): CSSProperties {
  if (state === 'complete') {
    return {
      ...phaseDotBaseStyle,
      background: 'var(--accent)',
      boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)',
    }
  }

  if (state === 'active') {
    return {
      ...phaseDotBaseStyle,
      background: 'var(--blue)',
      boxShadow: '0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent)',
    }
  }

  return phaseDotBaseStyle
}

const phaseDotBaseStyle: CSSProperties = {
  width: '0.42rem',
  height: '0.42rem',
  borderRadius: '999px',
  background: 'color-mix(in srgb, var(--text-muted) 38%, transparent)',
}

const progressTrackStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '0.42rem',
  overflow: 'hidden',
  borderRadius: '999px',
  background: 'color-mix(in srgb, var(--surface-soft) 88%, transparent)',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent)',
}

function progressBarStyle(progressValue: number): CSSProperties {
  return {
    width: `${Math.max(6, Math.min(100, progressValue * 100))}%`,
    height: '100%',
    borderRadius: 'inherit',
    background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 74%, var(--blue) 26%), color-mix(in srgb, var(--blue) 72%, var(--accent) 28%))',
    boxShadow: '0 0 18px color-mix(in srgb, var(--accent) 16%, transparent)',
    transition: 'width 220ms ease',
  }
}

const codePanelStyle: CSSProperties = {
  position: 'relative',
  minHeight: '17.5rem',
  maxHeight: '20rem',
  overflow: 'auto',
  borderRadius: 'var(--radius-panel)',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent)',
  background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-base) 96%, transparent), color-mix(in srgb, var(--surface-soft) 94%, transparent))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 10px 28px rgba(25, 20, 12, 0.08)',
}

const codeTextStyle: CSSProperties = {
  margin: 0,
  minHeight: '100%',
  padding: '1rem 1rem 1.1rem',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace',
  fontSize: '12px',
  lineHeight: 1.72,
  color: 'var(--text-primary)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
}
