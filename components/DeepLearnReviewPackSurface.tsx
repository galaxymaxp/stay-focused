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

  return (
    <div style={{ display: 'grid', gap: '0.9rem', minHeight: 0 }}>
      <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="ui-kicker">Review presets</p>
            <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
              Switch between answer-ready views instead of reading one long note.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <StateChip label={`${note.answerBank.length} key answer${note.answerBank.length === 1 ? '' : 's'}`} />
            <StateChip label={`${note.identificationItems.length} ID item${note.identificationItems.length === 1 ? '' : 's'}`} />
            <StateChip label={`${note.mcqDrill.length} MCQ${note.mcqDrill.length === 1 ? '' : 's'}`} />
            {note.timeline.length > 0 && <StateChip label={`${note.timeline.length} timeline cue${note.timeline.length === 1 ? '' : 's'}`} />}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <PresetButton label="Answer Mode" active={preset === 'answer_bank'} onClick={() => setPreset('answer_bank')} />
          <PresetButton label="Identification" active={preset === 'identification'} onClick={() => setPreset('identification')} />
          <PresetButton label="MCQ Drill" active={preset === 'mcq'} onClick={() => setPreset('mcq')} />
          <PresetButton label="Timeline" active={preset === 'timeline'} onClick={() => setPreset('timeline')} />
          <PresetButton label="Compare" active={preset === 'distinctions'} onClick={() => setPreset('distinctions')} />
          <PresetButton label="Support Note" active={preset === 'support'} onClick={() => setPreset('support')} />
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <PresetButton label="Exam-safe wording" active={wordingMode === 'exam_safe'} onClick={() => setWordingMode('exam_safe')} />
          <PresetButton label="Exact source" active={wordingMode === 'exact_source'} onClick={() => setWordingMode('exact_source')} />
          <PresetButton label="Simplified" active={wordingMode === 'simplified'} onClick={() => setWordingMode('simplified')} />
        </div>
      </section>

      <div className="contained-scroll-frame">
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          <section
            className="ui-card-soft"
            style={{
              borderRadius: 'var(--radius-panel)',
              padding: '0.95rem 1rem',
              border: '1px solid color-mix(in srgb, var(--accent) 42%, transparent)',
              boxShadow: '0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <p className="ui-kicker" style={{ margin: 0 }}>
                Likely Exam Points
              </p>
              <StateChip label={`${note.likelyQuizTargets.length} target${note.likelyQuizTargets.length === 1 ? '' : 's'}`} />
            </div>
            {note.likelyQuizTargets.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.65rem' }}>
                {note.likelyQuizTargets.map((item, index) => (
                  <li
                    key={item.target}
                    style={{
                      borderRadius: 'var(--radius-tight)',
                      padding: '0.55rem 0.6rem',
                      background: 'color-mix(in srgb, var(--surface-2) 82%, var(--accent) 18%)',
                      borderLeft: '3px solid color-mix(in srgb, var(--accent) 66%, transparent)',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 700 }}>
                      #{index + 1} {item.target}
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

          {preset === 'answer_bank' && (
            <section className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
              <p className="ui-kicker">Key Answers / Answer Bank</p>
              <p style={{ margin: '0.4rem 0 0', fontSize: '12px', lineHeight: 1.58, color: 'var(--text-muted)' }}>
                Study move: cover the answer and recall the compact response out loud before checking.
              </p>
              {note.answerBank.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.7rem' }}>
                  {note.answerBank.map((item) => (
                    <li key={`${item.cue}-${item.kind}`}>
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
              <p className="ui-kicker">Identification Mode</p>
              <p style={{ margin: '0.4rem 0 0', fontSize: '12px', lineHeight: 1.58, color: 'var(--text-muted)' }}>
                Practice cue: treat each prompt like a short-answer ID check and answer before reading.
              </p>
              {note.identificationItems.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.7rem' }}>
                  {note.identificationItems.map((item) => (
                    <li key={`${item.prompt}-${item.kind}`}>
                      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.55, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
              <p className="ui-kicker">Multiple Choice Mode</p>
              <p style={{ margin: '-0.25rem 0 0', fontSize: '12px', lineHeight: 1.58, color: 'var(--text-muted)' }}>
                Exam drill: pick an answer first, then verify with the key and explanation.
              </p>
              {note.mcqDrill.length > 0 ? (
                note.mcqDrill.map((item, index) => (
                  <article key={`${item.question}-${index}`} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.55rem' }}>
                    <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.4, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
              <p className="ui-kicker">Timeline Mode</p>
              {note.timeline.length > 0 ? (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.7rem' }}>
                  {note.timeline.map((item) => (
                    <li key={`${item.label}-${item.sortKey ?? 'none'}`}>
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
              <p className="ui-kicker">Distinctions / Confusable Items</p>
              {note.distinctions.length > 0 ? (
                note.distinctions.map((item) => (
                  <article key={`${item.conceptA}-${item.conceptB}`} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.35rem' }}>
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
              <p className="ui-kicker">Support Note</p>
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
        </div>
      </div>
    </div>
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
