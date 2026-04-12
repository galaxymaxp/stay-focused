'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ModuleQuickQuiz } from '@/components/ModuleQuickQuiz'
import type { StudyNoteQuizItem } from '@/lib/study-note-quiz'

export interface QuizSection {
  id: string
  title: string
  resourceTitle: string
  noteHref: string
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
  initialSelectedId = null,
  inspectHref,
  learnHref,
  withheldMaterialCount = 0,
  notReadyDeepLearnCount = 0,
}: {
  quizSections: QuizSection[]
  initialSelectedId?: string | null
  inspectHref?: string
  learnHref?: string
  withheldMaterialCount?: number
  notReadyDeepLearnCount?: number
}) {
  const defaultSelectedId = initialSelectedId && quizSections.some((section) => section.id === initialSelectedId)
    ? initialSelectedId
    : quizSections[0]?.id ?? null
  const [selectedId, setSelectedId] = useState<string | null>(
    defaultSelectedId,
  )

  const selected = quizSections.find((s) => s.id === selectedId) ?? null

  if (quizSections.length === 0) {
    return (
      <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'grid', gap: '0.8rem' }}>
        <p className="ui-kicker">Quiz</p>
        <h2 className="ui-section-title">No quiz-ready notes yet</h2>
        <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem 1.1rem', fontSize: '14px', lineHeight: 1.68 }}>
          {withheldMaterialCount > 0
            ? notReadyDeepLearnCount > 0
              ? 'Quiz only opens from saved Deep Learn notes that keep enough exact terms, key facts, and distinctions. This module has notes, but they are not structured strongly enough for quiz yet.'
              : 'Quiz only opens after a Deep Learn note exists. Generate a saved note from Learn first, then come back once the note is ready.'
            : 'No saved Deep Learn notes are ready for quiz yet. Open Learn to generate a note, or inspect the resource state if the source grounding is still too weak.'}
        </div>
        {(learnHref || inspectHref) && (
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {learnHref && (
              <Link href={learnHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                Open Learn
              </Link>
            )}
            {inspectHref && (
              <Link href={inspectHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                Inspect resources
              </Link>
            )}
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
            <p className="ui-kicker">Select a Deep Learn note to quiz</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>
              {quizSections.length} quiz-ready note{quizSections.length === 1 ? '' : 's'}
            </h2>
            <p className="ui-section-copy" style={{ marginTop: '0.42rem' }}>
              Questions come from each saved note&apos;s preserved terms, key facts, and distinctions. Pick a note, choose how many questions to run, then start.
            </p>
            {withheldMaterialCount > 0 && (
              <p style={{ margin: '0.55rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {notReadyDeepLearnCount > 0
                  ? `${notReadyDeepLearnCount} saved note${notReadyDeepLearnCount === 1 ? ' is' : 's are'} still below the quiz-ready threshold because the current term, fact, or distinction structure is too thin.`
                  : `${withheldMaterialCount} study source${withheldMaterialCount === 1 ? ' is' : 's are'} still outside the quiz lane because no saved Deep Learn note is ready yet.`}
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
                id={section.id}
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
          description={`Questions drawn from the saved Deep Learn note for "${selected.resourceTitle}". Pick a count and start.`}
          emptyMessage="This Deep Learn note does not have enough quiz-ready structure yet."
        />
      )}

      {selected && (
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href={selected.noteHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Open note
          </Link>
          {learnHref && (
            <Link href={learnHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Back to Learn
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
