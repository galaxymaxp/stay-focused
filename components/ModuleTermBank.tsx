'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { rejectModuleTerm, resetModuleReviewer, saveModuleTerm } from '@/actions/module-terms'
import {
  labelForCandidateKind,
  type FinalReviewerTerm,
  type ModuleTermSuggestion,
} from '@/lib/module-term-bank'

interface TermDraft {
  term: string
  definition: string
  explanation: string
  sourceLabel: string
  evidenceSnippet: string
}

const EMPTY_DRAFT: TermDraft = {
  term: '',
  definition: '',
  explanation: '',
  sourceLabel: '',
  evidenceSnippet: '',
}

export function ModuleTermBank({
  moduleId,
  courseId,
  finalTerms,
  suggestedTerms,
  dismissedCount,
  embedded = false,
}: {
  moduleId: string
  courseId?: string
  finalTerms: FinalReviewerTerm[]
  suggestedTerms: ModuleTermSuggestion[]
  dismissedCount: number
  embedded?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editingFinalId, setEditingFinalId] = useState<string | null>(null)
  const [finalDraft, setFinalDraft] = useState<TermDraft>(EMPTY_DRAFT)
  const [isAddingCustom, setIsAddingCustom] = useState(false)
  const [customDraft, setCustomDraft] = useState<TermDraft>(EMPTY_DRAFT)

  function runAction(action: () => Promise<void>, fallbackMessage: string) {
    setErrorMessage(null)
    startTransition(() => {
      void action().catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : fallbackMessage)
      })
    })
  }

  function beginFinalEdit(term: FinalReviewerTerm) {
    setEditingFinalId(term.id)
    setFinalDraft({
      term: term.term,
      definition: term.definition ?? '',
      explanation: term.explanation,
      sourceLabel: term.sourceLabel ?? '',
      evidenceSnippet: term.evidenceSnippet,
    })
    setErrorMessage(null)
  }

  function handleFinalSave(term: FinalReviewerTerm) {
    const draftKey = normalizeLookup(finalDraft.term)

    runAction(async () => {
      await saveModuleTerm({
        id: term.savedTermId ?? undefined,
        moduleId,
        courseId,
        resourceId: term.resourceId,
        term: finalDraft.term,
        definition: finalDraft.definition,
        explanation: finalDraft.explanation,
        sourceLabel: finalDraft.sourceLabel,
        evidenceSnippet: finalDraft.evidenceSnippet,
        origin: 'user',
        status: 'approved',
      })

      if (!term.savedTermId && draftKey && draftKey !== term.key) {
        await rejectModuleTerm({
          moduleId,
          courseId,
          resourceId: term.resourceId,
          term: term.term,
          sourceLabel: term.sourceLabel,
          evidenceSnippet: term.evidenceSnippet,
          origin: 'ai',
        })
      }

      setEditingFinalId(null)
      setFinalDraft(EMPTY_DRAFT)
      router.refresh()
    }, 'This module term could not be updated.')
  }

  function handlePin(term: FinalReviewerTerm) {
    runAction(async () => {
      await saveModuleTerm({
        id: term.savedTermId ?? undefined,
        moduleId,
        courseId,
        resourceId: term.resourceId,
        term: term.term,
        definition: term.definition,
        explanation: term.explanation,
        sourceLabel: term.sourceLabel,
        evidenceSnippet: term.evidenceSnippet,
        origin: 'user',
        status: 'approved',
      })
      router.refresh()
    }, 'This module term could not be pinned.')
  }

  function handleRemove(term: FinalReviewerTerm) {
    runAction(async () => {
      await rejectModuleTerm({
        id: term.savedTermId ?? undefined,
        moduleId,
        courseId,
        resourceId: term.resourceId,
        term: term.term,
        sourceLabel: term.sourceLabel,
        evidenceSnippet: term.evidenceSnippet,
        origin: term.origin === 'auto' ? 'ai' : term.origin,
      })
      router.refresh()
    }, 'This module term could not be removed.')
  }

  function handleSuggestionAdd(term: ModuleTermSuggestion) {
    runAction(async () => {
      await saveModuleTerm({
        moduleId,
        courseId,
        resourceId: term.resourceId,
        term: term.term,
        definition: term.definition,
        explanation: term.explanation,
        sourceLabel: term.sourceLabel,
        evidenceSnippet: term.evidenceSnippet,
        origin: 'user',
        status: 'approved',
      })
      router.refresh()
    }, 'This suggested term could not be added.')
  }

  function handleSuggestionDismiss(term: ModuleTermSuggestion) {
    runAction(async () => {
      await rejectModuleTerm({
        moduleId,
        courseId,
        resourceId: term.resourceId,
        term: term.term,
        sourceLabel: term.sourceLabel,
        evidenceSnippet: term.evidenceSnippet,
        origin: 'ai',
      })
      router.refresh()
    }, 'This suggested term could not be dismissed.')
  }

  function handleCustomSave() {
    runAction(async () => {
      await saveModuleTerm({
        moduleId,
        courseId,
        term: customDraft.term,
        definition: customDraft.definition,
        explanation: customDraft.explanation,
        sourceLabel: customDraft.sourceLabel,
        evidenceSnippet: customDraft.evidenceSnippet,
        origin: 'user',
        status: 'approved',
      })
      setIsAddingCustom(false)
      setCustomDraft(EMPTY_DRAFT)
      router.refresh()
    }, 'Your new term could not be saved.')
  }

  function handleRegenerate() {
    runAction(async () => {
      await resetModuleReviewer({
        moduleId,
        courseId,
      })
      setEditingFinalId(null)
      setFinalDraft(EMPTY_DRAFT)
      router.refresh()
    }, 'The term set could not be refreshed.')
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <section
        className={embedded ? 'ui-card-soft' : 'motion-card motion-delay-2 section-shell section-shell-elevated'}
        style={{
          padding: embedded ? '1rem 1.05rem' : '1.3rem 1.4rem',
          borderRadius: embedded ? 'var(--radius-panel)' : undefined,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="ui-kicker">Key terms</p>
            <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>Review the strongest grounded terms from this module</h3>
            <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '42rem' }}>
              The strongest extracted terms are already laid out here for scanning and the quick quiz below. Step in only when you want to pin one, remove one, refresh the set, or add something missing.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setEditingFinalId(null)
                setIsAddingCustom((current) => !current)
                setErrorMessage(null)
              }}
              className="ui-button ui-button-secondary ui-button-xs"
              disabled={isPending}
            >
              {isAddingCustom ? 'Close add term' : 'Add term'}
            </button>
            <button type="button" onClick={handleRegenerate} className="ui-button ui-button-ghost ui-button-xs" disabled={isPending}>
              {isPending ? 'Refreshing...' : 'Refresh terms'}
            </button>
          </div>
        </div>

        {isAddingCustom && (
          <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', marginTop: '0.95rem' }}>
            <p className="ui-kicker">Add term</p>
            <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
              Add a term the grounded set missed. Terms you add here stay in the module set and feed the quick quiz too.
            </p>
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
              <TermInput label="Term" value={customDraft.term} onChange={(value) => setCustomDraft((current) => ({ ...current, term: value }))} />
              <TermTextarea label="Definition" value={customDraft.definition} onChange={(value) => setCustomDraft((current) => ({ ...current, definition: value }))} rows={3} />
              <TermTextarea label="Simple explanation" value={customDraft.explanation} onChange={(value) => setCustomDraft((current) => ({ ...current, explanation: value }))} rows={3} />
              <TermInput label="Source label (optional)" value={customDraft.sourceLabel} onChange={(value) => setCustomDraft((current) => ({ ...current, sourceLabel: value }))} />
              <TermTextarea label="Evidence (optional)" value={customDraft.evidenceSnippet} onChange={(value) => setCustomDraft((current) => ({ ...current, evidenceSnippet: value }))} rows={3} />
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
              <button type="button" onClick={handleCustomSave} className="ui-button ui-button-secondary ui-button-xs" disabled={isPending}>
                {isPending ? 'Saving...' : 'Save term'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingCustom(false)
                  setCustomDraft(EMPTY_DRAFT)
                }}
                className="ui-button ui-button-ghost ui-button-xs"
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {finalTerms.length === 0 ? (
          <EmptySurface body="Strong grounded terms have not surfaced yet. You can still keep learning from the study content above, open the extracted source support when you need evidence, or add a term manually if you already know what belongs here." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem', marginTop: '0.95rem' }}>
            {finalTerms.map((term) => {
              const isEditing = editingFinalId === term.id
              const showPinAction = !term.persisted || term.origin !== 'user'

              return (
                <article key={term.id} className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <StateChip label={labelForReviewerOrigin(term)} tone={term.origin === 'user' ? 'warning' : 'accent'} />
                      <StateChip label={labelForCandidateKind(term.kind)} tone="muted" />
                      {term.sourceCount > 1 && <StateChip label={`${term.sourceCount} sources`} tone="muted" />}
                      {term.sourceLabel && <StateChip label={term.sourceLabel} tone="muted" />}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {showPinAction && (
                        <button type="button" onClick={() => handlePin(term)} className="ui-button ui-button-ghost ui-button-xs" disabled={isPending}>
                          Pin
                        </button>
                      )}
                      <button type="button" onClick={() => beginFinalEdit(term)} className="ui-button ui-button-ghost ui-button-xs" disabled={isPending}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleRemove(term)} className="ui-button ui-button-ghost ui-button-xs" disabled={isPending}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px', lineHeight: 1.4, color: 'var(--text-primary)' }}>{term.term}</h4>
                    <p style={{ margin: '0.36rem 0 0', fontSize: '13px', lineHeight: 1.64, color: 'var(--text-muted)' }}>
                      This term is already part of the module study set and powers the quick quiz directly.
                    </p>
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'grid', gap: '0.7rem' }}>
                      <TermInput label="Term" value={finalDraft.term} onChange={(value) => setFinalDraft((current) => ({ ...current, term: value }))} />
                      <TermTextarea label="Definition" value={finalDraft.definition} onChange={(value) => setFinalDraft((current) => ({ ...current, definition: value }))} rows={3} />
                      <TermTextarea label="Simple explanation" value={finalDraft.explanation} onChange={(value) => setFinalDraft((current) => ({ ...current, explanation: value }))} rows={3} />
                      <TermInput label="Source label" value={finalDraft.sourceLabel} onChange={(value) => setFinalDraft((current) => ({ ...current, sourceLabel: value }))} />
                      <TermTextarea label="Evidence" value={finalDraft.evidenceSnippet} onChange={(value) => setFinalDraft((current) => ({ ...current, evidenceSnippet: value }))} rows={3} />
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => handleFinalSave(term)} className="ui-button ui-button-secondary ui-button-xs" disabled={isPending}>
                          {isPending ? 'Saving...' : 'Save term'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFinalId(null)
                            setFinalDraft(EMPTY_DRAFT)
                          }}
                          className="ui-button ui-button-ghost ui-button-xs"
                          disabled={isPending}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.55rem' }}>
                      <MetaLine label="Definition" value={term.definition ?? term.explanation} />
                      {normalizeLookup(term.definition ?? '') !== normalizeLookup(term.explanation) && (
                        <MetaLine label="Simple explanation" value={term.explanation} />
                      )}
                      <MetaLine label="Why it matters" value={term.whyItMatters} />
                      <details className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
                        <summary className="ui-interactive-summary" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Show source support
                        </summary>
                        <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.7rem' }}>
                          {term.sourceLabel && <MetaLine label="Source" value={term.sourceLabel} />}
                          <MetaLine label="Evidence" value={term.evidenceSnippet} />
                        </div>
                      </details>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <details className="motion-card motion-delay-3 section-shell" style={{ padding: '1.25rem 1.35rem' }}>
        <summary className="ui-interactive-summary">
          <div>
            <p className="ui-kicker" style={{ margin: 0 }}>Correction path</p>
            <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>Only open extra suggestions if the grounded term set missed something</h3>
          </div>
          <span className="ui-chip ui-chip-soft">{suggestedTerms.length} hidden suggestion{suggestedTerms.length === 1 ? '' : 's'}</span>
        </summary>

        <p className="ui-section-copy" style={{ marginTop: '0.7rem', maxWidth: '42rem' }}>
          These are grounded leftovers the selector did not trust enough for the main term set. Open them when you want to correct the page, not as the default learning path.
        </p>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <span className="ui-chip ui-chip-soft">{dismissedCount} dismissed</span>
          <span className="ui-chip ui-chip-soft">Quick quiz ignores these until you add them</span>
        </div>

        {suggestedTerms.length === 0 ? (
          <EmptySurface body="No extra suggestions are waiting right now. The main term set either already captured the strongest grounded terms or the remaining text was too noisy to trust." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem', marginTop: '0.95rem' }}>
            {suggestedTerms.map((term) => (
              <article key={term.id} className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <StateChip label={labelForCandidateKind(term.kind)} tone="accent" />
                    {term.sourceCount > 1 && <StateChip label={`${term.sourceCount} sources`} tone="muted" />}
                    {term.sourceLabel && <StateChip label={term.sourceLabel} tone="muted" />}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => handleSuggestionAdd(term)} className="ui-button ui-button-secondary ui-button-xs" disabled={isPending}>
                      {isPending ? 'Saving...' : 'Add'}
                    </button>
                    <button type="button" onClick={() => handleSuggestionDismiss(term)} className="ui-button ui-button-ghost ui-button-xs" disabled={isPending}>
                      Dismiss
                    </button>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', lineHeight: 1.4, color: 'var(--text-primary)' }}>{term.term}</h4>
                  <p style={{ margin: '0.38rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                    {term.explanation}
                  </p>
                </div>

                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {term.definition && <MetaLine label="Candidate definition" value={term.definition} />}
                  <MetaLine label="Evidence" value={term.evidenceSnippet} />
                </div>
              </article>
            ))}
          </div>
        )}
      </details>

      {errorMessage && (
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--red)' }}>
          {errorMessage}
        </p>
      )}
    </div>
  )
}

function TermInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label style={{ display: 'grid', gap: '0.35rem' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="ui-input" style={{ padding: '0.7rem 0.85rem' }} />
    </label>
  )
}

function TermTextarea({
  label,
  value,
  onChange,
  rows,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
}) {
  return (
    <label style={{ display: 'grid', gap: '0.35rem' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="ui-input"
        style={{ padding: '0.7rem 0.85rem', resize: 'vertical' }}
      />
    </label>
  )
}

function StateChip({ label, tone }: { label: string; tone: 'accent' | 'warning' | 'muted' }) {
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 88%, transparent)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
  const border = tone === 'accent'
    ? 'color-mix(in srgb, var(--accent) 30%, var(--border-subtle) 70%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
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

function EmptySurface({ body }: { body: string }) {
  return (
    <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.7, marginTop: '0.95rem' }}>
      {body}
    </div>
  )
}

function labelForReviewerOrigin(term: FinalReviewerTerm) {
  if (term.origin === 'user') {
    return 'Added by you'
  }

  if (term.persisted) {
    return 'Saved edit'
  }

  return 'Auto-selected'
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
