'use client'

import { useState } from 'react'
import type { StudyNoteQuizItem } from '@/lib/study-note-quiz'

export function ModuleQuickQuiz({
  quizItems,
  questionCountOptions,
  embedded = false,
  title = 'Quiz this note',
  description = 'Choose how many grounded questions to run from this note before starting.',
  emptyMessage,
}: {
  quizItems: StudyNoteQuizItem[]
  questionCountOptions: number[]
  embedded?: boolean
  title?: string
  description?: string
  emptyMessage: string
}) {
  const [selectedCount, setSelectedCount] = useState<number | null>(questionCountOptions[0] ?? null)
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [draftAnswer, setDraftAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const resolvedSelectedCount = selectedCount && questionCountOptions.includes(selectedCount)
    ? selectedCount
    : (questionCountOptions[0] ?? null)
  const resolvedActiveCount = activeCount && questionCountOptions.includes(activeCount)
    ? activeCount
    : null
  const activeQuizItems = quizItems.slice(0, resolvedActiveCount ?? 0)
  const currentItem = activeQuizItems[activeIndex] ?? null

  function resetQuestionState() {
    setSelectedChoice(null)
    setDraftAnswer('')
    setRevealed(false)
  }

  function moveToIndex(nextIndex: number) {
    setActiveIndex(nextIndex)
    resetQuestionState()
  }

  function startQuiz() {
    if (!resolvedSelectedCount) return
    setActiveCount(resolvedSelectedCount)
    setActiveIndex(0)
    resetQuestionState()
  }

  function returnToLauncher() {
    setActiveCount(null)
    setActiveIndex(0)
    resetQuestionState()
  }

  if (questionCountOptions.length === 0 || quizItems.length === 0) {
    return (
      <section
        className={embedded ? 'ui-card-soft' : 'motion-card motion-delay-3 section-shell section-shell-elevated'}
        style={{
          padding: embedded ? '0.95rem 1rem' : '1.35rem 1.45rem',
          borderRadius: embedded ? 'var(--radius-panel)' : undefined,
          display: 'grid',
          gap: '0.7rem',
        }}
      >
        <p className="ui-kicker">Note quiz</p>
        <h3 style={{ margin: 0, fontSize: '1rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
          {title}
        </h3>
        <div className="ui-empty" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem', fontSize: '13px', lineHeight: 1.7 }}>
          {emptyMessage}
        </div>
      </section>
    )
  }

  if (!resolvedActiveCount || !currentItem) {
    return (
      <section
        className={embedded ? 'ui-card-soft' : 'motion-card motion-delay-3 section-shell section-shell-elevated'}
        style={{
          padding: embedded ? '0.95rem 1rem' : '1.35rem 1.45rem',
          borderRadius: embedded ? 'var(--radius-panel)' : undefined,
          display: 'grid',
          gap: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 280px' }}>
            <p className="ui-kicker">Note quiz</p>
            <h3 style={{ margin: '0.38rem 0 0', fontSize: '1rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
              {title}
            </h3>
            <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
              {description}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className="ui-chip ui-chip-soft">{quizItems.length} grounded question{quizItems.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {questionCountOptions.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setSelectedCount(count)}
              aria-pressed={resolvedSelectedCount === count}
              className={resolvedSelectedCount === count ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
            >
              {count}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={startQuiz} className="ui-button ui-button-secondary ui-button-xs" disabled={!resolvedSelectedCount}>
            Start quiz
          </button>
        </div>
      </section>
    )
  }

  const isChoiceQuestion = currentItem.choices.length > 0
  const hasInput = isChoiceQuestion ? Boolean(selectedChoice) : Boolean(draftAnswer.trim())
  const isCorrectChoice = isChoiceQuestion ? selectedChoice === currentItem.answer : null

  return (
    <section
      className={embedded ? 'ui-card-soft' : 'motion-card motion-delay-3 section-shell section-shell-elevated'}
      style={{
        padding: embedded ? '0.95rem 1rem' : '1.35rem 1.45rem',
        borderRadius: embedded ? 'var(--radius-panel)' : undefined,
        display: 'grid',
        gap: '0.85rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <p className="ui-kicker">Note quiz</p>
          <h3 style={{ margin: '0.38rem 0 0', fontSize: '1rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
            {title}
          </h3>
          <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
            Only this note&apos;s grounded study content is used here.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span className="ui-chip ui-chip-soft">{activeQuizItems.length} selected</span>
          <span className="ui-chip ui-chip-soft">{quizItems.length} available</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {activeQuizItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => moveToIndex(index)}
            aria-pressed={index === activeIndex}
            className={index === activeIndex ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <article className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.95rem 1rem', display: 'grid', gap: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <StateChip label={`Question ${activeIndex + 1}`} tone="accent" />
            <StateChip label={labelForQuizStyle(currentItem.style)} tone="muted" />
          </div>
          {currentItem.sourceLabel && <span className="ui-chip ui-chip-soft">{currentItem.sourceLabel}</span>}
        </div>

        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.72, color: 'var(--text-primary)', fontWeight: 600 }}>
          {currentItem.prompt}
        </p>

        {isChoiceQuestion ? (
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {currentItem.choices.map((choice, choiceIndex) => {
              const isSelected = selectedChoice === choice
              const shouldHighlightAnswer = revealed && choice === currentItem.answer
              const shouldHighlightMistake = revealed && isSelected && choice !== currentItem.answer

              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setSelectedChoice(choice)}
                  aria-pressed={isSelected}
                  className="ui-card-soft ui-interactive-card"
                  data-open={shouldHighlightAnswer || shouldHighlightMistake || isSelected ? 'true' : 'false'}
                  style={{
                    borderRadius: 'var(--radius-tight)',
                    padding: '0.8rem 0.85rem',
                    border: `1px solid ${shouldHighlightAnswer
                      ? 'color-mix(in srgb, var(--accent) 34%, var(--border-subtle) 66%)'
                      : shouldHighlightMistake
                        ? 'color-mix(in srgb, var(--amber) 32%, var(--border-subtle) 68%)'
                        : isSelected
                          ? 'color-mix(in srgb, var(--accent-border) 30%, var(--border-subtle) 70%)'
                          : 'var(--border-subtle)'}`,
                    background: shouldHighlightAnswer
                      ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
                      : shouldHighlightMistake
                        ? 'color-mix(in srgb, var(--amber-light) 84%, transparent)'
                        : isSelected
                          ? 'color-mix(in srgb, var(--surface-soft) 76%, var(--accent-light) 24%)'
                          : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                    textAlign: 'left',
                  }}
                >
                  <strong style={{ color: 'var(--text-primary)' }}>{String.fromCharCode(65 + choiceIndex)}.</strong> {choice}
                </button>
              )
            })}
          </div>
        ) : (
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Your answer</span>
            <textarea
              value={draftAnswer}
              onChange={(event) => setDraftAnswer(event.target.value)}
              rows={3}
              className="ui-input"
              style={{ padding: '0.75rem 0.8rem', resize: 'vertical' }}
              placeholder="Answer from memory, then reveal the grounded answer."
            />
          </label>
        )}

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="ui-button ui-button-secondary ui-button-xs"
            disabled={revealed || (isChoiceQuestion && !hasInput)}
          >
            {isChoiceQuestion ? 'Check answer' : 'Show answer'}
          </button>
          <button type="button" onClick={resetQuestionState} className="ui-button ui-button-ghost ui-button-xs">
            Reset question
          </button>
          {activeQuizItems.length > 1 && (
            <button
              type="button"
              onClick={() => moveToIndex((activeIndex + 1) % activeQuizItems.length)}
              className="ui-button ui-button-ghost ui-button-xs"
            >
              Next question
            </button>
          )}
          <button type="button" onClick={returnToLauncher} className="ui-button ui-button-ghost ui-button-xs">
            Change count
          </button>
        </div>

        {revealed && (
          <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem', display: 'grid', gap: '0.45rem' }}>
            {isChoiceQuestion && (
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: isCorrectChoice ? 'var(--accent-foreground)' : 'var(--amber)' }}>
                {isCorrectChoice ? 'This matches the grounded note.' : 'The grounded answer is shown below.'}
              </p>
            )}
            {!isChoiceQuestion && hasInput && (
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                Compare your answer with the extracted note and tighten what you missed.
              </p>
            )}
            <MetaLine label="Answer" value={currentItem.answer} />
            <MetaLine label="Why" value={currentItem.explanation} />
          </div>
        )}
      </article>
    </section>
  )
}

function labelForQuizStyle(style: StudyNoteQuizItem['style']) {
  if (style === 'multiple_choice') return 'Multiple choice'
  if (style === 'identification') return 'Identification'
  return 'Short answer'
}

function StateChip({ label, tone }: { label: string; tone: 'accent' | 'muted' }) {
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
  const border = tone === 'accent'
    ? 'color-mix(in srgb, var(--accent) 30%, var(--border-subtle) 70%)'
    : 'var(--border-subtle)'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.32rem 0.64rem',
      borderRadius: '999px',
      border: `1px solid ${border}`,
      background,
      fontSize: '11px',
      fontWeight: 700,
      lineHeight: 1.2,
      color: 'var(--text-primary)',
    }}>
      {label}
    </span>
  )
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.22rem 0 0', fontSize: '14px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>{value}</p>
    </div>
  )
}
