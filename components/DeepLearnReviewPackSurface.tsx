'use client'

import { useState } from 'react'
import { resolveDeepLearnWording } from '@/lib/deep-learn'
import type { DeepLearnNote } from '@/lib/types'

type ReviewPreset =
  | 'answer_bank'
  | 'identification'
  | 'mcq'
  | 'timeline'
  | 'distinctions'
  | 'support'

type WordingMode = 'exam_safe' | 'exact_source' | 'simplified'

export function DeepLearnReviewPackSurface({ note }: { note: DeepLearnNote }) {
  const [preset, setPreset] = useState<ReviewPreset>('answer_bank')
  const [wordingMode, setWordingMode] = useState<WordingMode>('exam_safe')
  const activePresetSummary = getPresetSummary(preset)

  return (
    <div style={{ display: 'grid', gap: '0.9rem', minHeight: 0 }}>
      <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="ui-kicker">Exam-ready reviewer</p>
            <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
              Use focused study modes to move from understanding to quizzing without leaving the source pair view.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <StateChip label={`${note.answerBank.length} key answer${note.answerBank.length === 1 ? '' : 's'}`} />
            <StateChip label={`${note.identificationItems.length} ID item${note.identificationItems.length === 1 ? '' : 's'}`} />
            <StateChip label={`${note.mcqDrill.length} MCQ${note.mcqDrill.length === 1 ? '' : 's'}`} />
            {note.timeline.length > 0 && <StateChip label={`${note.timeline.length} timeline cue${note.timeline.length === 1 ? '' : 's'}`} />}
          </div>
        </div>

        <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.75rem 0.8rem', display: 'grid', gap: '0.35rem' }}>
          <p className="ui-kicker">Selected study mode</p>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>
            {activePresetSummary.title}
          </p>
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>
            {activePresetSummary.description}
          </p>
        </section>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <PresetButton label="Key concepts" active={preset === 'answer_bank'} onClick={() => setPreset('answer_bank')} />
          <PresetButton label="Definitions" active={preset === 'identification'} onClick={() => setPreset('identification')} />
          <PresetButton label="Exam-style MCQ" active={preset === 'mcq'} onClick={() => setPreset('mcq')} />
          <PresetButton label="Timeline cues" active={preset === 'timeline'} onClick={() => setPreset('timeline')} />
          <PresetButton label="Common mix-ups" active={preset === 'distinctions'} onClick={() => setPreset('distinctions')} />
          <PresetButton label="Simplified review" active={preset === 'support'} onClick={() => setPreset('support')} />
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <PresetButton label="Exam-safe wording" active={wordingMode === 'exam_safe'} onClick={() => setWordingMode('exam_safe')} />
          <PresetButton label="Exact source" active={wordingMode === 'exact_source'} onClick={() => setWordingMode('exact_source')} />
          <PresetButton label="Simplified" active={wordingMode === 'simplified'} onClick={() => setWordingMode('simplified')} />
        </div>
      </section>

      <div className="contained-scroll-frame">
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {preset === 'answer_bank' && (
            <section className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
              <SectionHeading
                kicker="Key concepts"
                detail="Use these as short-answer anchors you should be able to explain in your own words."
              />
              {note.answerBank.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.7rem' }}>
                  {note.answerBank.map((item, index) => (
                    <li key={`${item.cue}-${item.kind}`}>
                      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Concept {index + 1}
                      </p>
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 650 }}>
                        {item.cue}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                        {resolveDeepLearnWording(item.compactAnswer, wordingMode)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyBody body="No compact answer bank was recovered from this source." />
              )}
            </section>
          )}

          {preset === 'identification' && (
            <section className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
              <SectionHeading
                kicker="Important definitions"
                detail="Review these like flashcards: identify the term, then say the definition without looking."
              />
              {note.identificationItems.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.7rem' }}>
                  {note.identificationItems.map((item, index) => (
                    <li key={`${item.prompt}-${item.kind}`}>
                      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Definition {index + 1}
                      </p>
                      <p style={{ margin: '0.12rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {item.prompt}
                      </p>
                      <p style={{ margin: '0.22rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 650 }}>
                        {resolveDeepLearnWording(item.answer, wordingMode)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyBody body="No direct identification list was produced from this source yet." />
              )}
            </section>
          )}

          {preset === 'mcq' && (
            <section className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.85rem' }}>
              <SectionHeading
                kicker="Quizzable practice drill"
                detail="Attempt each question first, then verify with the keyed answer and explanation."
              />
              {note.mcqDrill.length > 0 ? (
                note.mcqDrill.map((item, index) => (
                  <article key={`${item.question}-${index}`} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.55rem' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Practice question {index + 1}
                    </p>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 650 }}>
                      {item.question}
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
                ))
              ) : (
                <EmptyBody body="The current pack does not yet have enough contrastive answer units for MCQ drill mode." />
              )}
            </section>
          )}

          {preset === 'timeline' && (
            <section className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
              <SectionHeading
                kicker="Likely chronology checkpoints"
                detail="Use this when exam prompts require sequence, progression, or cause-and-effect ordering."
              />
              {note.timeline.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.7rem' }}>
                  {note.timeline.map((item, index) => (
                    <li key={`${item.label}-${item.sortKey ?? 'none'}`}>
                      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Timeline cue {index + 1}
                      </p>
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-primary)', fontWeight: 650 }}>
                        {item.label}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                        {item.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyBody body="No explicit chronology was strong enough to surface as a timeline." />
              )}
            </section>
          )}

          {preset === 'distinctions' && (
            <section className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
              <SectionHeading
                kicker="Likely exam confusion points"
                detail="Focus on contrasts that exam questions often use to test precision."
              />
              {note.distinctions.length > 0 ? (
                note.distinctions.map((item, index) => (
                  <article key={`${item.conceptA}-${item.conceptB}`} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.35rem' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Confusion check {index + 1}
                    </p>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>
                      {item.conceptA} vs {item.conceptB}
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
                ))
              ) : (
                <EmptyBody body="No stable confusion pairs were detected from this source." />
              )}
            </section>
          )}

          {preset === 'support' && (
            <section className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
              <SectionHeading
                kicker="Simplified explanation"
                detail="Use this pass to clarify difficult ideas, then return to concept and quiz modes."
              />
              {note.sections.length > 0 ? (
                note.sections.map((section) => (
                  <article key={section.heading} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                    <p className="ui-kicker">{section.heading}</p>
                    <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
                      {section.body}
                    </p>
                  </article>
                ))
              ) : (
                <EmptyBody body="No secondary support note was needed for this pack." />
              )}
            </section>
          )}

          <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
            <SectionHeading
              kicker="Likely exam points"
              detail="These are high-probability targets to prioritize before moving into the module quiz."
            />
            {note.likelyQuizTargets.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.65rem' }}>
                {note.likelyQuizTargets.map((item, index) => (
                  <li key={item.target}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Exam point {index + 1}
                    </p>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 650 }}>
                      {item.target}
                    </p>
                    <p style={{ margin: '0.18rem 0 0', fontSize: '12px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>
                      {item.reason}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyBody body="The pack does not yet rank likely quiz targets." />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function getPresetSummary(preset: ReviewPreset): { title: string; description: string } {
  if (preset === 'answer_bank') {
    return {
      title: 'Key concepts',
      description: 'Fast recall cues with compact answers for short-response exam prep.',
    }
  }
  if (preset === 'identification') {
    return {
      title: 'Important definitions',
      description: 'Prompt-and-answer format for term, figure, and concept identification.',
    }
  }
  if (preset === 'mcq') {
    return {
      title: 'Quizzable practice',
      description: 'MCQ sets with correct answers and explanations for self-testing.',
    }
  }
  if (preset === 'timeline') {
    return {
      title: 'Chronology checkpoints',
      description: 'Ordered cues to review progression, causality, and sequence questions.',
    }
  }
  if (preset === 'distinctions') {
    return {
      title: 'Common exam mix-ups',
      description: 'Side-by-side contrasts for confusable concepts and likely trick areas.',
    }
  }
  return {
    title: 'Simplified explanation',
    description: 'Plain-language section bodies for first-pass understanding before drilling.',
  }
}

function SectionHeading({ kicker, detail }: { kicker: string; detail: string }) {
  return (
    <header style={{ display: 'grid', gap: '0.28rem' }}>
      <p className="ui-kicker">{kicker}</p>
      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>
        {detail}
      </p>
    </header>
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
