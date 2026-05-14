'use client'

import { useState } from 'react'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { ReviewerPrintButton } from '@/components/ReviewerPrintButton'
import { StudyOutputPrintHeader } from '@/components/StudyOutputPrintHeader'
import { isQuizPackStudyOutputContent } from '@/lib/study-output-content'
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
  const quizPack = isQuizPackStudyOutputContent(output.content)
    ? output.content as StudyOutputQuizPackContent
    : null
  const [selectedCount, setSelectedCount] = useState<number | null>(quizPack?.questionCountOptions[0] ?? null)
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [draftAnswer, setDraftAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [selfReview, setSelfReview] = useState<Record<string, SelfReviewState>>({})

  if (!quizPack) {
    return (
      <GeneratedContentState
        title="This quiz could not be rendered safely."
        description="The saved quiz payload is incomplete or uses a version this app build does not support."
        tone="warning"
      />
    )
  }

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
      <section className="motion-card section-shell section-shell-elevated reviewer-sheet study-output-document">
        <div className="reviewer-print-hide study-output-screen-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p className="ui-kicker">Saved Quiz</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{quizPack.title}</h2>
            <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
              {quizPack.summary}
            </p>
          </div>
          <ReviewerPrintButton />
        </div>

        <StudyOutputPrintHeader
          title={quizPack.title}
          outputLabel="Quiz"
          courseLabel={courseLabel}
          moduleTitle={moduleTitle}
          generatedAt={output.generatedAt ?? output.createdAt}
        />

        {(courseLabel || moduleTitle) ? (
          <div className="reviewer-meta-row reviewer-print-hide">
            {courseLabel ? <span>{courseLabel}</span> : null}
            {moduleTitle ? <span>{moduleTitle}</span> : null}
          </div>
        ) : null}

        <section className="reviewer-panel reviewer-panel-hero reviewer-print-hide">
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

        <section className="reviewer-panel reviewer-print-hide">
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
              Start Quiz
            </button>
          </div>
        </section>

        <QuizPackPrintDocument quizPack={quizPack} />
      </section>
    )
  }

  const isChoiceQuestion = currentItem.type === 'multiple_choice' || currentItem.type === 'true_false'
  const isMatchingQuestion = currentItem.type === 'matching'
  const currentReviewState = selfReview[currentItem.id] ?? null
  const hasInput = isChoiceQuestion ? Boolean(selectedChoice) : Boolean(draftAnswer.trim())
  const selectedIsCorrect = isChoiceQuestion && revealed && selectedChoice === currentItem.answer
  const selectedIsIncorrect = isChoiceQuestion && revealed && Boolean(selectedChoice) && selectedChoice !== currentItem.answer
  const sourceConceptTitle = getSourceConceptTitle(currentItem)

  return (
    <section className="motion-card section-shell section-shell-elevated reviewer-sheet study-output-document">
      <div className="reviewer-print-hide study-output-screen-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p className="ui-kicker">Saved Quiz</p>
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

      <StudyOutputPrintHeader
        title={quizPack.title}
        outputLabel="Quiz"
        courseLabel={courseLabel}
        moduleTitle={moduleTitle}
        generatedAt={output.generatedAt ?? output.createdAt}
      />

      <QuizPackPrintDocument quizPack={quizPack} />

      <div className="reviewer-grid">
        <section className="reviewer-panel reviewer-print-hide">
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

        <section className="reviewer-panel reviewer-panel-hero reviewer-print-hide">
          <p className="reviewer-section-label">{labelForQuizItemType(currentItem.type)}</p>
          <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.7rem' }}>
            <p className="reviewer-section-label">Question</p>
            <p className="reviewer-intro" style={{ marginTop: 0 }}>{currentItem.prompt}</p>
          </div>
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
                    <span className="reviewer-section-label">
                      {isSelected ? 'Selected answer' : isAnswer ? 'Correct answer' : 'Choice'}
                    </span>
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
              disabled={revealed || (isChoiceQuestion && !hasInput)}
            >
              {isChoiceQuestion ? 'Check answer' : quizPack.answerRevealLabel}
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
            <div className="reviewer-mini-card" style={{ marginTop: '0.9rem', display: 'grid', gap: '0.65rem' }}>
              {isChoiceQuestion ? (
                <div>
                  <p className="reviewer-section-label">Result</p>
                  <p style={{ margin: '0.25rem 0 0', color: selectedIsCorrect ? 'var(--accent-foreground)' : 'var(--amber)', fontWeight: 700 }}>
                    {selectedIsCorrect ? 'Correct' : selectedIsIncorrect ? 'Incorrect' : 'Answer revealed'}
                  </p>
                  {selectedChoice ? (
                    <p className="reviewer-muted" style={{ marginTop: '0.25rem' }}>Selected answer: {selectedChoice}</p>
                  ) : null}
                </div>
              ) : (
                <div>
                  <p className="reviewer-section-label">Identification review</p>
                  {draftAnswer.trim() ? (
                    <p className="reviewer-muted" style={{ marginTop: '0.25rem' }}>Your answer: {draftAnswer.trim()}</p>
                  ) : null}
                </div>
              )}

              <div>
                <p className="reviewer-section-label">Correct answer</p>
                <strong>{currentItem.answer}</strong>
              </div>

              <div>
                <p className="reviewer-section-label">Explanation</p>
                <p>{currentItem.explanation}</p>
              </div>

              <div>
                <p className="reviewer-section-label">Review cue</p>
                <p className="reviewer-muted">Review this concept: {sourceConceptTitle}</p>
              </div>

              {currentItem.sourceWording ? (
                <p className="reviewer-muted">Source-backed note: &quot;{currentItem.sourceWording}&quot;</p>
              ) : currentItem.sourceBasis ? (
                <p className="reviewer-muted">Source-backed note: {currentItem.sourceBasis}</p>
              ) : null}
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

function getSourceConceptTitle(item: StudyOutputQuizPackItem) {
  const key = normalizeLookup(item.sourceUnitId ?? '')
  if (key === 'it security definition') return 'IT Security'
  if (key === 'infosec vs it sec') return 'InfoSec vs IT Sec'
  if (key === 'cia triad') return 'CIA Triad'
  if (key === 'domains of it security') return 'Domains of IT Security'
  if (key === 'cybersecurity definitions') return 'Cybersecurity'
  if (key === 'vulnerability exploit breach') return 'Vulnerability / Exploit / Breach'
  if (key === 'malware types') return 'Malware Types'
  if (key === 'malware symptoms') return 'Malware Symptoms'
  if (key === 'methods of infiltration') return 'Methods of Infiltration'
  if (key === 'denial of service methods') return 'Denial of Service Methods'
  if (key === 'blended attacks') return 'Blended Attacks'
  if (key === 'impact reduction') return 'Impact Reduction'
  if (item.sourceUnitId) return toConceptTitle(item.sourceUnitId)
  return item.sourceLabel ?? labelForQuizItemType(item.type)
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function toConceptTitle(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function QuizPackPrintDocument({ quizPack }: { quizPack: StudyOutputQuizPackContent }) {
  return (
    <section className="reviewer-print-only reviewer-panel study-output-keep-together">
      <p className="reviewer-section-label">Printable Quiz</p>
      <p className="reviewer-intro">{quizPack.summary}</p>
      <ol className="study-output-quiz-print-list">
        {quizPack.items.map((item, index) => (
          <li key={item.id} className="study-output-quiz-print-item">
            <article className="study-output-print-question study-output-keep-together">
              <p className="study-output-print-question-number">
                Question {index + 1} - {labelForQuizItemType(item.type)}
              </p>
              <p className="study-output-print-question-prompt">{item.prompt}</p>
              {item.type === 'matching' && item.matchingPrompt ? (
                <p className="study-output-print-question-note">Match prompt: {item.matchingPrompt}</p>
              ) : null}
              {item.choices.length > 0 ? (
                <ul className="study-output-print-choice-list">
                  {item.choices.map((choice) => (
                    <li key={choice}>{choice}</li>
                  ))}
                </ul>
              ) : null}
              <div className="study-output-print-answer">
                <p className="study-output-print-answer-label">Answer</p>
                <p>{item.answer}</p>
                <p className="study-output-print-question-note">{item.explanation}</p>
                <p className="study-output-print-question-note">Review this concept: {getSourceConceptTitle(item)}</p>
                {item.sourceWording ? (
                  <p className="study-output-print-question-note">Source-backed note: &quot;{item.sourceWording}&quot;</p>
                ) : item.sourceBasis ? (
                  <p className="study-output-print-question-note">Source-backed note: {item.sourceBasis}</p>
                ) : null}
              </div>
            </article>
          </li>
        ))}
      </ol>
    </section>
  )
}
