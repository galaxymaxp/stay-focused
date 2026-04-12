import Link from 'next/link'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { getDeepLearnResourceUiState } from '@/lib/deep-learn-ui'
import { buildModuleQuizHref } from '@/lib/stay-focused-links'
import type { DeepLearnNote, DeepLearnNoteLoadAvailability } from '@/lib/types'
import type { ModuleSourceResource } from '@/lib/module-workspace'

export function DeepLearnNoteView({
  moduleId,
  courseId,
  resource,
  deepLearnResourceId = resource.id,
  note,
  noteAvailability = 'available',
  noteAvailabilityMessage = null,
  readerHref,
  sourceHref,
}: {
  moduleId: string
  courseId: string | null
  resource: ModuleSourceResource
  deepLearnResourceId?: string | null
  note: DeepLearnNote | null
  noteAvailability?: DeepLearnNoteLoadAvailability
  noteAvailabilityMessage?: string | null
  readerHref: string
  sourceHref: string | null
}) {
  const resolvedDeepLearnResourceId = deepLearnResourceId ?? resource.id
  const effectiveAvailability = deepLearnResourceId ? noteAvailability : 'unavailable'
  const effectiveAvailabilityMessage = deepLearnResourceId
    ? noteAvailabilityMessage
    : noteAvailabilityMessage ?? 'Deep Learn needs a synced resource record for this item before it can save notes.'
  const ui = getDeepLearnResourceUiState(moduleId, resolvedDeepLearnResourceId, note, {
    notesAvailability: effectiveAvailability,
    unavailableMessage: effectiveAvailabilityMessage,
  })
  const quizHref = buildModuleQuizHref(moduleId, { resourceId: resolvedDeepLearnResourceId })

  return (
    <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 460px' }}>
          <p className="ui-kicker">Deep Learn note</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>
            {note?.status === 'ready' ? note.title : resource.title}
          </h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
            {ui.detail}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {note?.status === 'ready' ? (
            <Link href={ui.noteHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Open Deep Learn note
            </Link>
          ) : ui.status === 'unavailable' ? (
            <Link href={readerHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              {ui.primaryLabel}
            </Link>
          ) : (
            <DeepLearnGenerateButton
              moduleId={moduleId}
              resourceId={resolvedDeepLearnResourceId}
              courseId={courseId}
              label={ui.primaryLabel}
              className="ui-button ui-button-secondary ui-button-xs"
            />
          )}
          {note?.status === 'ready' && note.quizReady && (
            <Link href={quizHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Quiz this
            </Link>
          )}
          <Link href={readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Open reader fallback
          </Link>
          {sourceHref && (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open original source
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <StatePill label={ui.statusLabel} tone={ui.tone} />
        <StatePill label={resource.type} tone="muted" />
        {note?.status === 'ready' && <StatePill label={`${note.coreTerms.length} core term${note.coreTerms.length === 1 ? '' : 's'}`} tone="muted" />}
        {note?.status === 'ready' && <StatePill label={`${note.keyFacts.length} key fact${note.keyFacts.length === 1 ? '' : 's'}`} tone="muted" />}
        {note?.status === 'ready' && note.quizReady && <StatePill label="Quiz ready" tone="accent" />}
      </div>

      {note?.status === 'ready' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.18fr) minmax(280px, 0.82fr)', gap: '1rem', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
              <p className="ui-kicker">Overview</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '15px', lineHeight: 1.76, color: 'var(--text-secondary)' }}>
                {note.overview}
              </p>
            </section>

            {note.sections.map((section) => (
              <section key={section.heading} className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                <p className="ui-kicker">{section.heading}</p>
                <p style={{ margin: '0.5rem 0 0', fontSize: '15px', lineHeight: 1.76, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
                  {section.body}
                </p>
              </section>
            ))}
          </div>

          <aside style={{ display: 'grid', gap: '0.9rem' }}>
            <DetailCard title="Core terms">
              {note.coreTerms.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.7rem' }}>
                  {note.coreTerms.map((term) => (
                    <div key={term.term}>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.45, color: 'var(--text-primary)', fontWeight: 650 }}>
                          {term.term}
                        </p>
                        <StatePill label={`${term.importance} importance`} tone={term.importance === 'high' ? 'accent' : 'muted'} />
                        {term.preserveExactTerm && <StatePill label="Keep exact term" tone="accent" />}
                      </div>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                        {term.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBody body="Deep Learn did not surface stable terminology from the current evidence." />
              )}
            </DetailCard>

            <DetailCard title="Key facts">
              {note.keyFacts.length > 0 ? (
                <SimpleList items={note.keyFacts} />
              ) : (
                <EmptyBody body="No reliable key-fact list was produced from the current source support." />
              )}
            </DetailCard>

            <DetailCard title="Distinctions">
              {note.distinctions.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.7rem' }}>
                  {note.distinctions.map((item) => (
                    <div key={`${item.conceptA}-${item.conceptB}`}>
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.45, color: 'var(--text-primary)', fontWeight: 650 }}>
                        {item.conceptA} vs {item.conceptB}
                      </p>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                        {item.difference}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBody body="No stable distinction set was produced from the current source evidence." />
              )}
            </DetailCard>

            <DetailCard title="Likely quiz points">
              {note.likelyQuizPoints.length > 0 ? (
                <SimpleList items={note.likelyQuizPoints} />
              ) : (
                <EmptyBody body="The note does not yet flag specific likely test points." />
              )}
            </DetailCard>

            <DetailCard title="Source grounding">
              <MetaLine label="Source type" value={note.sourceGrounding.sourceType ?? resource.type} />
              <MetaLine label="Extraction quality" value={note.sourceGrounding.extractionQuality ?? 'Unknown'} />
              <MetaLine label="Grounding strategy" value={note.sourceGrounding.groundingStrategy} />
              <MetaLine label="AI fallback used" value={note.sourceGrounding.usedAiFallback ? 'Yes' : 'No'} />
              {note.sourceGrounding.qualityReason && <MetaLine label="Quality note" value={note.sourceGrounding.qualityReason} />}
              {note.sourceGrounding.warning && <MetaLine label="Warning" value={note.sourceGrounding.warning} />}
            </DetailCard>

            {note.cautionNotes.length > 0 && (
              <DetailCard title="Caution notes">
                <SimpleList items={note.cautionNotes} />
              </DetailCard>
            )}
          </aside>
        </div>
      ) : (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
          <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.76, color: 'var(--text-secondary)' }}>
            {ui.summary}
          </p>
          {ui.status === 'unavailable' && effectiveAvailabilityMessage && (
            <p style={{ margin: '0.6rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
              {effectiveAvailabilityMessage}
            </p>
          )}
          {note?.errorMessage && (
            <p style={{ margin: '0.6rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--red)' }}>
              {note.errorMessage}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
      <p className="ui-kicker">{title}</p>
      <div style={{ marginTop: '0.6rem' }}>
        {children}
      </div>
    </section>
  )
}

function SimpleList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.6rem' }}>
      {items.map((item) => (
        <li key={item} style={{ fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
          {item}
        </li>
      ))}
    </ul>
  )
}

function EmptyBody({ body }: { body: string }) {
  return (
    <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-muted)' }}>
      {body}
    </p>
  )
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: '0.15rem', marginBottom: '0.5rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
        {value}
      </p>
    </div>
  )
}

function StatePill({
  label,
  tone,
}: {
  label: string
  tone: 'accent' | 'warning' | 'muted'
}) {
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
      padding: '0.3rem 0.62rem',
      borderRadius: '999px',
      border: `1px solid ${border}`,
      background,
      color: 'var(--text-primary)',
      fontSize: '11px',
      fontWeight: 700,
      lineHeight: 1.2,
    }}>
      {label}
    </span>
  )
}
