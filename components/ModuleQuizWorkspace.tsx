'use client'

import { useState } from 'react'
import Link from 'next/link'
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
  inspectHref,
  withheldMaterialCount = 0,
  weakMaterialCount = 0,
}: {
  quizSections: QuizSection[]
  inspectHref?: string
  withheldMaterialCount?: number
  weakMaterialCount?: number
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
          {withheldMaterialCount > 0
            ? weakMaterialCount > 0
              ? 'Quiz questions are only generated from strong or usable study notes. This module has extracted material, but the current notes are still too weak or noisy to trust for quiz generation.'
              : 'Quiz questions are only generated from strong or usable study notes. This module still needs stronger grounded study notes before quiz can use them safely.'
            : 'Quiz questions are generated from extracted study note bullets. This module does not have enough grounded study notes to quiz from yet. Open Learn to inspect the study sources, or use the resource inspection view to see which items are partial, unsupported, or failed.'}
        </div>
        {inspectHref && (
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <Link href={inspectHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Inspect resources
            </Link>
          </div>
        )}
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
            {withheldMaterialCount > 0 && (
              <p style={{ margin: '0.55rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {weakMaterialCount > 0
                  ? `${withheldMaterialCount} study source${withheldMaterialCount === 1 ? ' was' : 's were'} withheld because the extracted text is still weak or too noisy for a trustworthy quiz.`
                  : `${withheldMaterialCount} study source${withheldMaterialCount === 1 ? ' is' : 's are'} still outside the quiz lane because the current extraction quality is not strong enough yet.`}
              </p>
            )}
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
