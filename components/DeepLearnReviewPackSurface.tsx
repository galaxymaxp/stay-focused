'use client'

import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { resolveDeepLearnWording } from '@/lib/deep-learn'
import type { DeepLearnNote, DeepLearnReviewLinkFields } from '@/lib/types'

type ReviewPreset =
  | 'answer_bank'
  | 'identification'
  | 'mcq'
  | 'timeline'
  | 'distinctions'

type WordingMode = 'exam_safe' | 'exact_source' | 'simplified'
type SupportMode = 'simple' | 'plain' | 'exact'

type ActiveSupport = {
  key: string
  modes: Record<SupportMode, string>
  top: number
  left: number
  width: number
}

const SUPPORT_OVERLAY_WIDTH = 280
const SUPPORT_OVERLAY_GAP = 8
const SUPPORT_OVERLAY_EDGE_GAP = 12

export function DeepLearnReviewPackSurface({ note }: { note: DeepLearnNote }) {
  const [preset, setPreset] = useState<ReviewPreset>('answer_bank')
  const [wordingMode, setWordingMode] = useState<WordingMode>('exam_safe')
  const [activeSupport, setActiveSupport] = useState<ActiveSupport | null>(null)
  const [supportMode, setSupportMode] = useState<SupportMode>('simple')

  useEffect(() => {
    if (!activeSupport) return

    function closeSupport() {
      setActiveSupport(null)
    }

    document.addEventListener('click', closeSupport)
    return () => document.removeEventListener('click', closeSupport)
  }, [activeSupport])

  function toggleSupport(key: string, item: DeepLearnReviewLinkFields, target: HTMLElement) {
    const modes = getSupportModes(item)
    if (!modes) {
      return
    }

    if (activeSupport?.key === key) {
      setActiveSupport(null)
      return
    }

    setSupportMode('simple')
    setActiveSupport({
      key,
      modes,
      ...getSupportOverlayPosition(getSupportTextRect(target)),
    })
  }

  function supportTextProps(key: string, item: DeepLearnReviewLinkFields) {
    const hasSupport = Boolean(getSupportModes(item))
    return {
      role: hasSupport ? 'button' : undefined,
      tabIndex: hasSupport ? 0 : undefined,
      'aria-pressed': hasSupport ? activeSupport?.key === key : undefined,
      'data-active': hasSupport ? activeSupport?.key === key : undefined,
      'data-review-support-trigger': hasSupport ? 'true' : undefined,
      className: hasSupport ? 'review-support-text' : undefined,
      onMouseDown: hasSupport ? (event: MouseEvent<HTMLElement>) => {
        event.preventDefault()
        event.stopPropagation()
      } : undefined,
      onPointerDown: hasSupport ? (event: PointerEvent<HTMLElement>) => {
        event.preventDefault()
        event.stopPropagation()
      } : undefined,
      onClick: hasSupport ? (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        toggleSupport(key, item, event.currentTarget)
      } : undefined,
      onKeyDown: hasSupport ? (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggleSupport(key, item, event.currentTarget)
        }
      } : undefined,
    }
  }

  function renderSupportText(key: string, item: DeepLearnReviewLinkFields, text: string) {
    return (
      <span {...supportTextProps(key, item)}>{text}</span>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0.9rem', minHeight: 0 }}>
      <section className="ui-card-soft deep-learn-review-controls" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <p className="ui-kicker" style={{ margin: 0 }}>Review presets</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <StateChip label={`${note.answerBank.length} key answer${note.answerBank.length === 1 ? '' : 's'}`} />
            <StateChip label={`${note.identificationItems.length} ID item${note.identificationItems.length === 1 ? '' : 's'}`} />
            <StateChip label={`${note.mcqDrill.length} MCQ${note.mcqDrill.length === 1 ? '' : 's'}`} />
            {note.timeline.length > 0 && <StateChip label={`${note.timeline.length} timeline cue${note.timeline.length === 1 ? '' : 's'}`} />}
          </div>
        </div>

        <div className="deep-learn-preset-row" style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <PresetButton label="Answer Mode" active={preset === 'answer_bank'} onClick={() => setPreset('answer_bank')} />
          <PresetButton label="Identification" active={preset === 'identification'} onClick={() => setPreset('identification')} />
          <PresetButton label="MCQ Drill" active={preset === 'mcq'} onClick={() => setPreset('mcq')} />
          <PresetButton label="Timeline" active={preset === 'timeline'} onClick={() => setPreset('timeline')} />
          <PresetButton label="Compare" active={preset === 'distinctions'} onClick={() => setPreset('distinctions')} />
        </div>

        <div className="deep-learn-preset-row" style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <PresetButton label="Exam-safe wording" active={wordingMode === 'exam_safe'} onClick={() => setWordingMode('exam_safe')} />
          <PresetButton label="Exact source" active={wordingMode === 'exact_source'} onClick={() => setWordingMode('exact_source')} />
          <PresetButton label="Simplified" active={wordingMode === 'simplified'} onClick={() => setWordingMode('simplified')} />
        </div>
      </section>

      <div className="contained-scroll-frame review-support-scroll-frame deep-learn-review-results">
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {preset === 'answer_bank' && (
            <section data-review-support-scope className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
              <p className="ui-kicker">Key Answers / Answer Bank</p>
              {note.answerBank.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.7rem' }}>
                  {note.answerBank.map((item) => {
                    const supportKey = `answer-${item.cue}-${item.kind}`
                    return (
                      <li key={supportKey}>
                        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 650 }}>
                          {renderSupportText(supportKey, item, item.cue)}
                        </p>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                          {resolveDeepLearnWording(item.compactAnswer, wordingMode)}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyBody body="No compact answer bank was recovered from this source." />
              )}
            </section>
          )}

          {preset === 'identification' && (
            <section data-review-support-scope className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
              <p className="ui-kicker">Identification Mode</p>
              {note.identificationItems.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.7rem' }}>
                  {note.identificationItems.map((item) => {
                    const supportKey = `identification-${item.prompt}-${item.kind}`
                    return (
                      <li key={supportKey}>
                        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.55, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {item.prompt}
                        </p>
                        <p style={{ margin: '0.22rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 650 }}>
                          {renderSupportText(supportKey, item, resolveDeepLearnWording(item.answer, wordingMode))}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyBody body="No direct identification list was produced from this source yet." />
              )}
            </section>
          )}

          {preset === 'mcq' && (
            <section data-review-support-scope className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.85rem' }}>
              <p className="ui-kicker">Multiple Choice Mode</p>
              {note.mcqDrill.length > 0 ? (
                note.mcqDrill.map((item, index) => {
                  const supportKey = `mcq-${item.question}-${index}`
                  return (
                    <article
                      key={supportKey}
                      className="ui-card-soft"
                      style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.55rem' }}
                    >
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 650 }}>
                        {renderSupportText(supportKey, item, item.question)}
                      </p>
                      <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.35rem' }}>
                        {item.choices.map((choice) => (
                          <li key={choice} style={{ fontSize: '13px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>
                            {choice}
                          </li>
                        ))}
                      </ol>
                      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                        <strong>Correct:</strong> {item.correctAnswer}
                      </p>
                      {item.explanation && (
                        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.58, color: 'var(--text-muted)' }}>
                          {item.explanation}
                        </p>
                      )}
                    </article>
                  )
                })
              ) : (
                <EmptyBody body="The current pack does not yet have enough contrastive answer units for MCQ drill mode." />
              )}
            </section>
          )}

          {preset === 'timeline' && (
            <section data-review-support-scope className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
              <p className="ui-kicker">Timeline Mode</p>
              {note.timeline.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.7rem' }}>
                  {note.timeline.map((item) => {
                    const supportKey = `timeline-${item.label}-${item.sortKey ?? 'none'}`
                    return (
                      <li key={supportKey}>
                        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 650 }}>
                          {renderSupportText(supportKey, item, item.label)}
                        </p>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                          {item.detail}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyBody body="No explicit chronology was strong enough to surface as a timeline." />
              )}
            </section>
          )}

          {preset === 'distinctions' && (
            <section data-review-support-scope className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
              <p className="ui-kicker">Distinctions / Confusable Items</p>
              {note.distinctions.length > 0 ? (
                note.distinctions.map((item) => {
                  const supportKey = `distinction-${item.conceptA}-${item.conceptB}`
                  return (
                    <article
                      key={supportKey}
                      className="ui-card-soft"
                      style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.35rem' }}
                    >
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>
                        {renderSupportText(supportKey, item, `${item.conceptA} vs ${item.conceptB}`)}
                      </p>
                      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                        {item.difference}
                      </p>
                      {item.confusionNote && (
                        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.58, color: 'var(--text-muted)' }}>
                          {item.confusionNote}
                        </p>
                      )}
                    </article>
                  )
                })
              ) : (
                <EmptyBody body="No stable confusion pairs were detected from this source." />
              )}
            </section>
          )}

          <section data-review-support-scope className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
            <p className="ui-kicker">Likely Quiz Targets</p>
            {note.likelyQuizTargets.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.65rem' }}>
                {note.likelyQuizTargets.map((item) => {
                  const supportKey = `target-${item.target}`
                  return (
                    <li key={supportKey}>
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 650 }}>
                        {renderSupportText(supportKey, item, item.target)}
                      </p>
                      <p style={{ margin: '0.18rem 0 0', fontSize: '12px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>
                        {item.reason}
                      </p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyBody body="The pack does not yet rank likely quiz targets." />
            )}
          </section>
        </div>
      </div>
      {activeSupport && (
        <FloatingSupportBox support={activeSupport} selectedMode={supportMode} onModeChange={setSupportMode} />
      )}
    </div>
  )
}

function getSupportModes(item: DeepLearnReviewLinkFields): Record<SupportMode, string> | null {
  const exact = item.sourceSnippet
    ?? item.draftExplanation
    ?? item.supportingContext
    ?? item.reviewText
    ?? null
  const plain = item.supportingContext
    ?? item.draftExplanation
    ?? item.simplifiedWording
    ?? exact
  const simple = item.simplifiedWording
    ?? item.draftExplanation
    ?? item.supportingContext
    ?? exact

  if (!simple && !plain && !exact) return null

  return {
    simple: makeSimpleSupport(simple ?? plain ?? exact ?? ''),
    plain: makePlainSupport(plain ?? simple ?? exact ?? ''),
    exact: truncateSupport(exact ?? plain ?? simple ?? '', 220),
  }
}

function makeSimpleSupport(value: string) {
  const cleaned = cleanSupportText(value)
  const firstSentence = cleaned.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? cleaned
  return truncateSupport(firstSentence, 140)
}

function makePlainSupport(value: string) {
  return truncateSupport(cleanSupportText(value), 170)
}

function truncateSupport(value: string, maxLength: number) {
  const cleaned = cleanSupportText(value)
  if (cleaned.length <= maxLength) return cleaned
  const clipped = cleaned.slice(0, maxLength)
  const breakIndex = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('; '), clipped.lastIndexOf(', '), clipped.lastIndexOf(' '))
  return `${clipped.slice(0, breakIndex > 80 ? breakIndex : maxLength).trim()}...`
}

function cleanSupportText(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.replace(/^(because|since)\s+/i, '')
}

function getSupportTextRect(target: HTMLElement) {
  return Array.from(target.getClientRects()).find((rect) => rect.width > 0 && rect.height > 0) ?? target.getBoundingClientRect()
}

function getSupportOverlayPosition(rect: DOMRect) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const width = Math.min(SUPPORT_OVERLAY_WIDTH, viewportWidth - (SUPPORT_OVERLAY_EDGE_GAP * 2))
  const preferredLeft = rect.left - 2
  const left = clamp(preferredLeft, SUPPORT_OVERLAY_EDGE_GAP, viewportWidth - width - SUPPORT_OVERLAY_EDGE_GAP)
  const preferredTop = rect.bottom + SUPPORT_OVERLAY_GAP - 2
  const fallbackTop = rect.top - SUPPORT_OVERLAY_GAP - 104
  const top = preferredTop + 104 <= viewportHeight - SUPPORT_OVERLAY_EDGE_GAP
    ? preferredTop
    : clamp(fallbackTop, SUPPORT_OVERLAY_EDGE_GAP, viewportHeight - 104 - SUPPORT_OVERLAY_EDGE_GAP)

  return { top, left, width }
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function FloatingSupportBox({
  support,
  selectedMode,
  onModeChange,
}: {
  support: ActiveSupport
  selectedMode: SupportMode
  onModeChange: (mode: SupportMode) => void
}) {
  const excerpt = support.modes[selectedMode] || support.modes.simple || support.modes.plain || support.modes.exact
  if (!excerpt) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      data-review-support-popover="true"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        top: support.top,
        left: support.left,
        zIndex: 90,
        width: support.width,
        borderRadius: '8px',
        border: '1px solid color-mix(in srgb, var(--accent-border) 24%, var(--border-subtle) 76%)',
        background: 'color-mix(in srgb, var(--surface-selected) 72%, transparent)',
        WebkitBackdropFilter: 'blur(18px) saturate(150%)',
        backdropFilter: 'blur(18px) saturate(150%)',
        padding: '0.42rem 0.58rem',
        fontSize: '12px',
        lineHeight: 1.55,
        color: 'var(--text-secondary)',
        boxShadow: '0 10px 28px color-mix(in srgb, var(--shadow-color) 14%, transparent)',
        display: 'grid',
        gap: '0.4rem',
        cursor: 'default',
        pointerEvents: 'auto',
      }}
    >
      <span>{excerpt}</span>
      <span style={{ display: 'inline-flex', gap: '0.18rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <SupportModeButton label="Simple" mode="simple" active={selectedMode === 'simple'} onModeChange={onModeChange} />
        <SupportModeButton label="Plain" mode="plain" active={selectedMode === 'plain'} onModeChange={onModeChange} />
        <SupportModeButton label="Exact" mode="exact" active={selectedMode === 'exact'} onModeChange={onModeChange} />
      </span>
    </div>,
    document.body,
  )
}

function SupportModeButton({
  label,
  mode,
  active,
  onModeChange,
}: {
  label: string
  mode: SupportMode
  active: boolean
  onModeChange: (mode: SupportMode) => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation()
        onModeChange(mode)
      }}
      aria-pressed={active}
      style={{
        border: `1px solid ${active ? 'color-mix(in srgb, var(--accent-border) 45%, var(--border-subtle) 55%)' : 'var(--border-subtle)'}`,
        background: active
          ? 'color-mix(in srgb, var(--accent-shadow) 72%, var(--surface-soft) 28%)'
          : 'color-mix(in srgb, var(--surface-soft) 72%, transparent)',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        borderRadius: '999px',
        padding: '0.14rem 0.42rem',
        fontSize: '10.5px',
        fontWeight: 700,
        lineHeight: 1.2,
      }}
    >
      {label}
    </button>
  )
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={active ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
    >
      {label}
    </button>
  )
}

function StateChip({ label }: { label: string }) {
  return (
    <span className="ui-chip ui-chip-soft" style={{ fontSize: '11px', fontWeight: 600 }}>
      {label}
    </span>
  )
}

function EmptyBody({ body }: { body: string }) {
  return (
    <p style={{ margin: '0.7rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-muted)' }}>
      {body}
    </p>
  )
}
