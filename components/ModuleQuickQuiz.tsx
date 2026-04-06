'use client'

import { useState } from 'react'
import { labelForTermQuizStyle, type ModuleTermQuizItem } from '@/lib/module-term-bank'

export function ModuleQuickQuiz({
  quizItems,
  finalTermCount,
}: {
  quizItems: ModuleTermQuizItem[]
  finalTermCount: number
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [draftAnswer, setDraftAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)

  const currentItem = quizItems[activeIndex] ?? null

  function moveToIndex(nextIndex: number) {
    setActiveIndex(nextIndex)
    setSelectedChoice(null)
    setDraftAnswer('')
    setRevealed(false)
  }

  if (quizItems.length === 0) {
    return (
      <section className="motion-card motion-delay-3 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem' }}>
        <p className="ui-kicker">Quick self-quiz</p>
        <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.08rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
          Quiz from the same grounded term set when it is ready
        </h3>
        <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.7, marginTop: '1rem' }}>
          {finalTermCount === 0
            ? 'The module does not have a strong enough grounded term set yet, so the quiz stays empty instead of faking confidence.'
            : 'The current term set is still a little too small for a mixed quiz. You can keep reviewing the terms above or add a missing one if the module is under-extracted.'}
        </div>
      </section>
    )
  }

  if (!currentItem) {
    return null
  }

  const isChoiceQuestion = currentItem.choices.length > 0
  const hasInput = isChoiceQuestion ? Boolean(selectedChoice) : Boolean(draftAnswer.trim())
  const isCorrectChoice = isChoiceQuestion ? selectedChoice === currentItem.answer : null

  return (
    <section className="motion-card motion-delay-3 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 460px' }}>
          <p className="ui-kicker">Quick self-quiz</p>
          <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.08rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
            Check the same terms you just reviewed without leaving Learn
          </h3>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '46rem' }}>
            Every question here comes from the grounded term set already on this page, so review and quiz stay in the same module flow.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span className="ui-chip ui-chip-soft">{quizItems.length} question{quizItems.length === 1 ? '' : 's'}</span>
          <span className="ui-chip ui-chip-soft">{finalTermCount} ready term{finalTermCount === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {quizItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => moveToIndex(index)}
            className={index === activeIndex ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <article className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.9rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <StateChip label={`Question ${activeIndex + 1}`} tone="accent" />
            <StateChip label={labelForTermQuizStyle(currentItem.style)} tone="muted" />
          </div>
          {currentItem.sourceLabel && <span className="ui-chip ui-chip-soft">{currentItem.sourceLabel}</span>}
        </div>

        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.74, color: 'var(--text-primary)', fontWeight: 600 }}>
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
                  className="ui-card-soft"
                  style={{
                    borderRadius: 'var(--radius-tight)',
                    padding: '0.82rem 0.9rem',
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
                    fontSize: '14px',
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
              style={{ padding: '0.75rem 0.85rem', resize: 'vertical' }}
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
          <button
            type="button"
            onClick={() => {
              setSelectedChoice(null)
              setDraftAnswer('')
              setRevealed(false)
            }}
            className="ui-button ui-button-ghost ui-button-xs"
          >
            Reset question
          </button>
          {quizItems.length > 1 && (
            <button
              type="button"
              onClick={() => moveToIndex((activeIndex + 1) % quizItems.length)}
              className="ui-button ui-button-ghost ui-button-xs"
            >
              Next question
            </button>
          )}
        </div>

        {revealed && (
          <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.45rem' }}>
            {isChoiceQuestion && (
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: isCorrectChoice ? 'var(--accent-foreground)' : 'var(--amber)' }}>
                {isCorrectChoice ? 'Nice. That matches the grounded term set.' : 'The strongest grounded answer is shown below.'}
              </p>
            )}
            {!isChoiceQuestion && hasInput && (
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                Compare your answer with the grounded version below and tighten any missing detail.
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
