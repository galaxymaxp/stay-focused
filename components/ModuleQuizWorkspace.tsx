'use client'

import { useState } from 'react'
import { ModuleQuickQuiz } from '@/components/ModuleQuickQuiz'
import type { StudyNoteQuizItem } from '@/lib/study-note-quiz'

export interface QuizSection {
  id: string
  title: string
  resourceTitle: string
  quizItems: StudyNoteQuizItem[]
  questionCountOptions: number[]
}

/**
 * Client-side quiz workspace for a module.
 * Receives pre-computed quiz sections (serialised from the server page)
 * and handles note selection + quiz rendering.
 */
export function ModuleQuizWorkspace({
  quizSections,
}: {
  quizSections: QuizSection[]
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    quizSections[0]?.id ?? null,
  )

  const selected = quizSections.find((s) => s.id === selectedId) ?? null

  if (quizSections.length === 0) {
    return (
      <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'grid', gap: '0.8rem' }}>
        <p className="ui-kicker">Quiz</p>
        <h2 className="ui-section-title">No quiz-ready notes yet</h2>
        <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem 1.1rem', fontSize: '14px', lineHeight: 1.68 }}>
          Quiz questions are generated from extracted study note bullets. This module does not have enough grounded study notes to quiz from yet. Open Learn and check whether the study sources have been extracted, or sync the course again if extraction has not run.
        </div>
      </section>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'grid', gap: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="ui-kicker">Select a note to quiz</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>
              {quizSections.length} quiz-ready note{quizSections.length === 1 ? '' : 's'}
            </h2>
            <p className="ui-section-copy" style={{ marginTop: '0.42rem' }}>
              Questions are grounded in extracted bullet content from each note. Pick a note, choose how many questions to run, then start.
            </p>
          </div>
          <span className="ui-chip ui-chip-soft" style={{ padding: '0.28rem 0.7rem', fontSize: '12px', fontWeight: 600 }}>
            {quizSections.reduce((sum, s) => sum + s.quizItems.length, 0)} total questions
          </span>
        </div>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {quizSections.map((section) => {
            const isSelected = section.id === selectedId
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setSelectedId(section.id)}
                aria-pressed={isSelected}
                className={isSelected ? 'ui-button ui-button-secondary' : 'ui-button ui-button-ghost'}
                style={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  minHeight: '3.2rem',
                  padding: '0.7rem 0.9rem',
                  gap: '0.7rem',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ flex: '1 1 220px', display: 'grid', gap: '0.2rem' }}>
                  <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                    {section.title}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                    {section.resourceTitle}
                  </span>
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {section.quizItems.length} question{section.quizItems.length === 1 ? '' : 's'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {selected && (
        <ModuleQuickQuiz
          key={selected.id}
          quizItems={selected.quizItems}
          questionCountOptions={selected.questionCountOptions}
          title={`Quiz: ${selected.title}`}
          description={`Questions drawn from grounded bullets in "${selected.resourceTitle}". Pick a count and start.`}
          emptyMessage="This note does not have enough extracted bullet detail for a reliable quiz."
        />
      )}
    </div>
  )
}
