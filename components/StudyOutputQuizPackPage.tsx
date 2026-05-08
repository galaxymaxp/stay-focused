'use client'

import { useState } from 'react'
import { ReviewerPrintButton } from '@/components/ReviewerPrintButton'
import type { StudyOutput, StudyOutputQuizPackContent, StudyOutputQuizPackItem } from '@/lib/types'

type SelfReviewState = 'correct' | 'needs_review' | null

export function StudyOutputQuizPackPage({
  output,
  courseLabel,
  moduleTitle,
}: {
  output: StudyOutput
  courseLabel: string | null
  moduleTitle: string | null
}) {
  const quizPack = output.content as StudyOutputQuizPackContent
  const [selectedCount, setSelectedCount] = useState<number | null>(quizPack.questionCountOptions[0] ?? null)
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [draftAnswer, setDraftAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [selfReview, setSelfReview] = useState<Record<string, SelfReviewState>>({})

  const resolvedSelectedCount = selectedCount && quizPack.questionCountOptions.includes(selectedCount)
    ? selectedCount
    : (quizPack.questionCountOptions[0] ?? null)
  const resolvedActiveCount = activeCount && quizPack.questionCountOptions.includes(activeCount)
    ? activeCount
    : null
  const activeItems = quizPack.items.slice(0, resolvedActiveCount ?? 0)
  const currentItem = activeItems[activeIndex] ?? null
  const reviewedCount = activeItems.filter((item: StudyOutputQuizPackItem) => selfReview[item.id]).length
  const correctCount = activeItems.filter((item: StudyOutputQuizPackItem) => selfReview[item.id] === 'correct').length

  if (quizPack.version !== 'quiz-pack-v1') {
    return null
  }

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

  function markSelfReview(state: Exclude<SelfReviewState, null>) {
    if (!currentItem) return
    setSelfReview((current) => ({ ...current, [currentItem.id]: state }))
  }

  if (!resolvedActiveCount || !currentItem) {
    return (
      <section className="motion-card section-shell section-shell-elevated reviewer-sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p className="ui-kicker">Saved quiz pack</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{quizPack.title}</h2>
            <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
              {quizPack.summary}
            </p>
          </div>
          <ReviewerPrintButton />
        </div>

        {(courseLabel || moduleTitle) ? (
          <div className="reviewer-meta-row">
            {courseLabel ? <span>{courseLabel}</span> : null}
            {moduleTitle ? <span>{moduleTitle}</span> : null}
          </div>
        ) : null}

        <section className="reviewer-panel reviewer-panel-hero">
          <p className="reviewer-section-label">Quiz modes</p>
          <p className="reviewer-intro">{quizPack.intro}</p>
          <div className="reviewer-answer-list" style={{ paddingLeft: 0 }}>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span className="ui-chip ui-chip-soft">{quizPack.items.length} grounded questions</span>
              <span className="ui-chip ui-chip-soft">Answer reveal mode</span>
              <span className="ui-chip ui-chip-soft">Self-review scoring</span>
            </div>
          </div>
        </section>

        <section className="reviewer-panel">
          <p className="reviewer-section-label">Question count</p>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
            {quizPack.questionCountOptions.map((count: number) => (
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
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
            <button type="button" onClick={startQuiz} className="ui-button ui-button-secondary ui-button-xs" disabled={!resolvedSelectedCount}>
              Start quiz pack
            </button>
          </div>
        </section>
      </section>
    )
  }

  const isChoiceQuestion = currentItem.type === 'multiple_choice' || currentItem.type === 'true_false'
  const isMatchingQuestion = currentItem.type === 'matching'
  const currentReviewState = selfReview[currentItem.id] ?? null
  const hasInput = isChoiceQuestion ? Boolean(selectedChoice) : Boolean(draftAnswer.trim())

  return (
    <section className="motion-card section-shell section-shell-elevated reviewer-sheet">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p className="ui-kicker">Saved quiz pack</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{quizPack.title}</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
            {quizPack.summary}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span className="ui-chip ui-chip-soft">{correctCount}/{activeItems.length} correct</span>
          <span className="ui-chip ui-chip-soft">{reviewedCount} reviewed</span>
          <ReviewerPrintButton />
        </div>
      </div>

      <div className="reviewer-grid">
        <section className="reviewer-panel">
          <p className="reviewer-section-label">Question tracker</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
            {activeItems.map((item: StudyOutputQuizPackItem, index: number) => {
              const state = selfReview[item.id]
              const className = index === activeIndex ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'
              return (
                <button key={item.id} type="button" onClick={() => moveToIndex(index)} className={className}>
                  {index + 1}
                  {state === 'correct' ? ' ✓' : state === 'needs_review' ? ' •' : ''}
                </button>
              )
            })}
          </div>
        </section>

        <section className="reviewer-panel reviewer-panel-hero">
          <p className="reviewer-section-label">{labelForQuizItemType(currentItem.type)}</p>
          <p className="reviewer-intro" style={{ marginTop: '0.7rem' }}>{currentItem.prompt}</p>
          {isMatchingQuestion && currentItem.matchingPrompt && (
            <p className="reviewer-muted" style={{ marginTop: '0.6rem' }}>
              Match prompt: {currentItem.matchingPrompt}
            </p>
          )}

          {isChoiceQuestion ? (
            <div className="reviewer-block-grid" style={{ marginTop: '0.9rem' }}>
              {currentItem.choices.map((choice: string) => {
                const isSelected = selectedChoice === choice
                const isAnswer = revealed && choice === currentItem.answer
                const isMistake = revealed && isSelected && choice !== currentItem.answer
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setSelectedChoice(choice)}
                    className="reviewer-mini-card"
                    style={{
                      textAlign: 'left',
                      borderColor: isAnswer
                        ? 'color-mix(in srgb, var(--accent) 30%, var(--border-subtle) 70%)'
                        : isMistake
                          ? 'color-mix(in srgb, var(--amber) 28%, var(--border-subtle) 72%)'
                          : isSelected
                            ? 'color-mix(in srgb, var(--accent-border) 26%, var(--border-subtle) 74%)'
                            : undefined,
                      background: isAnswer
                        ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
                        : isMistake
                          ? 'color-mix(in srgb, var(--amber-light) 84%, transparent)'
                          : isSelected
                            ? 'color-mix(in srgb, var(--surface-soft) 76%, var(--accent-light) 24%)'
                            : undefined,
                    }}
                  >
                    <strong>{choice}</strong>
                  </button>
                )
              })}
            </div>
          ) : (
            <label style={{ display: 'grid', gap: '0.35rem', marginTop: '0.9rem' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Your answer</span>
              <textarea
                value={draftAnswer}
                onChange={(event) => setDraftAnswer(event.target.value)}
                rows={3}
                className="ui-input"
                style={{ padding: '0.75rem 0.8rem', resize: 'vertical' }}
                placeholder={isMatchingQuestion ? 'Write the matching distinction from memory.' : 'Answer from memory, then reveal the grounded answer.'}
              />
            </label>
          )}

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="ui-button ui-button-secondary ui-button-xs"
              disabled={revealed || !hasInput}
            >
              {quizPack.answerRevealLabel}
            </button>
            <button type="button" onClick={resetQuestionState} className="ui-button ui-button-ghost ui-button-xs">
              Reset question
            </button>
            <button
              type="button"
              onClick={() => moveToIndex((activeIndex + 1) % activeItems.length)}
              className="ui-button ui-button-ghost ui-button-xs"
            >
              Next question
            </button>
            <button type="button" onClick={returnToLauncher} className="ui-button ui-button-ghost ui-button-xs">
              Change count
            </button>
          </div>

          {revealed && (
            <div className="reviewer-mini-card" style={{ marginTop: '0.9rem' }}>
              <p className="reviewer-section-label">Grounded answer</p>
              <strong>{currentItem.answer}</strong>
              <p>{currentItem.explanation}</p>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                <button type="button" onClick={() => markSelfReview('correct')} className={currentReviewState === 'correct' ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}>
                  {quizPack.selfReviewLabel}
                </button>
                <button type="button" onClick={() => markSelfReview('needs_review')} className={currentReviewState === 'needs_review' ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}>
                  Mark for review
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

function labelForQuizItemType(type: StudyOutputQuizPackItem['type']) {
  if (type === 'multiple_choice') return 'Multiple choice'
  if (type === 'identification') return 'Identification'
  if (type === 'matching') return 'Matching'
  return 'True / false'
}
