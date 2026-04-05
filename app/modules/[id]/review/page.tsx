import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { buildModuleLearnOverview } from '@/lib/module-learn-overview'
import {
  buildModuleReviewModel,
  labelForQuizStyle,
  labelForReviewConceptKind,
  type ModuleReviewConceptCard,
  type ModuleReviewQuizItem,
} from '@/lib/module-review'
import {
  buildLearnExperience,
  extractCourseName,
  getLearnResourceHref,
  getModuleWorkspace,
  getResourceCanvasHref,
} from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ReviewPage({ params }: Props) {
  const { id } = await params
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, deadlines, resources: storedResources, resourceStudyStates } = workspace
  const courseName = extractCourseName(module.raw_content)
  const experience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount: deadlines.length,
    resources: storedResources,
    resourceStudyStates,
  })
  const overview = buildModuleLearnOverview({
    moduleId: module.id,
    resources: experience.resources,
    doItems: experience.doItems,
    tasks,
  })
  const review = buildModuleReviewModel({
    moduleTitle: module.title,
    overview,
  })

  if (module.status === 'error') {
    return (
      <main className="page-shell page-shell-compact page-stack">
        <div className="ui-card ui-card-soft ui-status-danger" style={{ borderRadius: 'var(--radius-control)', padding: '14px', fontSize: '14px' }}>
          Processing failed. Delete this module and try again.
        </div>
      </main>
    )
  }

  return (
    <ModuleLensShell
      currentLens="review"
      moduleId={module.id}
      courseId={module.courseId}
      courseName={courseName}
      title={module.title}
      summary={review.availability === 'ready' ? review.coverageNote : null}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.95rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 440px' }}>
              <p className="ui-kicker">Grounded review layer</p>
              <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Reviewer mode for quiz prep</h2>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '46rem' }}>
                Review only turns on when the active study lane already has enough extracted text to support real terms, concept cards, and practice questions.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="ui-chip ui-chip-soft">{overview.readyStudyFileCount} grounded source{overview.readyStudyFileCount === 1 ? '' : 's'}</span>
              <span className="ui-chip ui-chip-soft">{review.groundedCharCount.toLocaleString()} readable chars</span>
              {review.availability === 'ready' && (
                <>
                  <span className="ui-chip ui-chip-soft">{review.keyTerms.length} review term{review.keyTerms.length === 1 ? '' : 's'}</span>
                  <span className="ui-chip ui-chip-soft">{review.quizItems.length} practice question{review.quizItems.length === 1 ? '' : 's'}</span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(300px, 0.95fr)', gap: '0.9rem', marginTop: '1rem' }}>
            <div className={review.availability === 'ready' ? 'glass-panel glass-accent' : 'glass-panel glass-soft'} style={{ borderRadius: 'var(--radius-panel)', padding: '1rem 1.05rem' }}>
              <p className="ui-kicker">{review.availabilityLabel}</p>
              <p style={{ margin: '0.55rem 0 0', fontSize: '15px', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
                {review.availabilityMessage}
              </p>
              <p style={{ margin: '0.65rem 0 0', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-muted)' }}>
                {review.coverageNote}
              </p>
            </div>

            <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem 1.05rem', display: 'grid', gap: '0.8rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.7rem' }}>
                <ReviewStatCard label="Study lane" value={String(overview.activeStudyFileCount)} />
                <ReviewStatCard label="Grounded review" value={String(overview.readyStudyFileCount)} />
                <ReviewStatCard label="Limited" value={String(overview.limitedStudyFileCount)} />
                <ReviewStatCard label="Need Canvas" value={String(overview.unavailableStudyFileCount)} />
              </div>

              <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
                <p className="ui-kicker">Honest unlock rule</p>
                <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                  Review only uses materials that are already strong enough for grounded reading. Metadata-only or unreadable sources stay visible in Learn, but they do not feed reviewer content here.
                </p>
              </div>
            </div>
          </div>
        </section>

        {review.availability === 'ready' ? (
          <>
            <section className="motion-card motion-delay-2 section-shell" style={{ padding: '1.25rem 1.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p className="ui-kicker">Grounded sources</p>
                  <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>Study materials feeding this reviewer</h3>
                </div>
                <span className="ui-chip ui-chip-soft">{review.sourceMaterials.length} source{review.sourceMaterials.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem', marginTop: '0.95rem' }}>
                {review.sourceMaterials.map((source) => (
                  <article key={source.id} className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem 1rem', display: 'grid', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <StatusBadge tone="muted" label={source.fileTypeLabel} />
                      <StatusBadge tone="accent" label={`${source.charCount.toLocaleString()} chars`} />
                      {source.required && <StatusBadge tone="warning" label="Required" />}
                    </div>
                    <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.55, fontWeight: 650, color: 'var(--text-primary)' }}>{source.title}</p>
                    <div>
                      <ActionLink href={getLearnResourceHref(module.id, source.id)} label="Open study reader" tone="secondary" />
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="motion-card motion-delay-2 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem' }}>
              <p className="ui-kicker">Key terms and concepts</p>
              <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.1rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>A reviewer built from extracted lesson content</h3>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
                {review.keyTerms.map((term) => (
                  <span key={term} className="ui-chip ui-chip-soft" style={{ fontWeight: 600 }}>{term}</span>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem', marginTop: '1rem' }}>
                {review.conceptCards.map((card) => (
                  <ConceptCard key={card.id} card={card} />
                ))}
              </div>
            </section>

            <section className="motion-card motion-delay-3 section-shell" style={{ padding: '1.25rem 1.35rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(300px, 0.95fr)', gap: '0.95rem' }}>
                <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                  <p className="ui-kicker">Likely quiz focus</p>
                  <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.75rem' }}>
                    {review.focusPoints.map((point) => (
                      <div key={point} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
                        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{point}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                  <p className="ui-kicker">How this stays grounded</p>
                  <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Term selection</p>
                      <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{review.selectionNote}</p>
                    </div>
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Quiz grounding</p>
                      <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{review.quizGroundingNote}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="motion-card motion-delay-4 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem' }}>
              <p className="ui-kicker">Practice quiz</p>
              <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.1rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>First-pass quiz set grounded in extracted text</h3>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '44rem' }}>
                These prompts are deliberately conservative. They stay inside the reviewer cards surfaced from readable extracted study text and avoid inventing extra lesson facts.
              </p>
              <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
                {review.quizItems.map((item, index) => (
                  <QuizCard key={item.id} item={item} index={index} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="motion-card motion-delay-2 section-shell" style={{ padding: '1.25rem 1.35rem' }}>
              <p className="ui-kicker">Current study sources</p>
              <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>What Review can and cannot use right now</h3>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '44rem' }}>
                The source list stays visible so you can inspect what is already in the study lane, but reviewer cards and quiz items stay off until the extracted coverage is strong enough.
              </p>

              {overview.studyMaterials.length === 0 ? (
                <EmptySurface body="No active study-lane materials are available for this module yet, so Review has nothing honest to build from." />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem', marginTop: '0.95rem' }}>
                  {overview.studyMaterials.map((material) => (
                    <article key={material.resource.id} className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', display: 'grid', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <StatusBadge tone="muted" label={material.fileTypeLabel} />
                        <StatusBadge
                          tone={material.readiness === 'ready' ? 'accent' : material.readiness === 'limited' ? 'warning' : 'muted'}
                          label={material.readinessLabel}
                        />
                        {material.resource.required && <StatusBadge tone="warning" label="Required" />}
                      </div>

                      <div>
                        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.55, fontWeight: 650, color: 'var(--text-primary)' }}>{material.resource.title}</p>
                        <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{material.note}</p>
                      </div>

                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <ActionLink href={getLearnResourceHref(module.id, material.resource.id)} label="Open study reader" tone="secondary" />
                        {getResourceCanvasHref(material.resource) && (
                          <ActionLink href={getResourceCanvasHref(material.resource)!} label="Open in Canvas" external />
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="motion-card motion-delay-3 section-shell section-shell-elevated" style={{ padding: '1.3rem 1.4rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.95fr)', gap: '0.95rem' }}>
                <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                  <p className="ui-kicker">Unlock notes</p>
                  <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Term selection</p>
                      <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{review.selectionNote}</p>
                    </div>
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Quiz grounding</p>
                      <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{review.quizGroundingNote}</p>
                    </div>
                  </div>
                </div>

                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                  <p className="ui-kicker">Best next move</p>
                  <p style={{ margin: '0.55rem 0 0', fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                    Open the strongest study reader first. Once enough of the active study lane has real extracted text, this tab can surface key terms, concept cards, and a fuller mixed quiz set.
                  </p>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <Link href={`/modules/${module.id}/learn`} className="ui-button ui-button-secondary">Open Learn</Link>
                    {overview.resumeTarget && (
                      overview.resumeTarget.external ? (
                        <a href={overview.resumeTarget.href} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost">
                          {overview.resumeTarget.actionLabel}
                        </a>
                      ) : (
                        <Link href={overview.resumeTarget.href} className="ui-button ui-button-ghost">
                          {overview.resumeTarget.actionLabel}
                        </Link>
                      )
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </ModuleLensShell>
  )
}

function ConceptCard({ card }: { card: ModuleReviewConceptCard }) {
  return (
    <article className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <StatusBadge tone="accent" label={labelForReviewConceptKind(card.kind)} />
          <StatusBadge tone="muted" label={`${card.sourceCount} source${card.sourceCount === 1 ? '' : 's'}`} />
        </div>
        <span className="ui-chip ui-chip-soft">{card.sourceLabels[0]}</span>
      </div>

      <div>
        <h4 style={{ margin: 0, fontSize: '16px', lineHeight: 1.42, color: 'var(--text-primary)' }}>{card.term}</h4>
        <p style={{ margin: '0.38rem 0 0', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>{card.simpleExplanation}</p>
      </div>

      {card.formalDefinition && (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
          <p className="ui-kicker">Formal definition</p>
          <p style={{ margin: '0.4rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{card.formalDefinition}</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <MetaLine label="Why it matters" value={card.whyItMatters} />
        <MetaLine label="Likely quiz focus" value={card.quizFocus} />
        {card.quickExample && <MetaLine label="Quick example" value={card.quickExample} />}
      </div>

      <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
        <p className="ui-kicker">Evidence</p>
        <p style={{ margin: '0.4rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{card.evidence}</p>
      </div>
    </article>
  )
}

function QuizCard({ item, index }: { item: ModuleReviewQuizItem; index: number }) {
  return (
    <article className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <StatusBadge tone="accent" label={`Question ${index + 1}`} />
          <StatusBadge tone="muted" label={labelForQuizStyle(item.style)} />
        </div>
        <span className="ui-chip ui-chip-soft">{item.sourceLabel}</span>
      </div>

      <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.72, color: 'var(--text-primary)', fontWeight: 600 }}>
        {item.prompt}
      </p>

      {item.choices.length > 0 && (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {item.choices.map((choice, choiceIndex) => (
            <div key={choice} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.75rem 0.85rem', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{String.fromCharCode(65 + choiceIndex)}.</strong> {choice}
            </div>
          ))}
        </div>
      )}

      <details className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
        <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Show grounded answer
        </summary>
        <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.7rem' }}>
          <MetaLine label="Answer" value={item.answer} />
          <MetaLine label="Why" value={item.explanation} />
        </div>
      </details>
    </article>
  )
}

function ReviewStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.85rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.4rem 0 0', fontSize: '20px', lineHeight: 1.1, fontWeight: 650, color: 'var(--text-primary)' }}>{value}</p>
    </div>
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

function StatusBadge({
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
      padding: '0.34rem 0.68rem',
      borderRadius: '999px',
      border: `1px solid ${border}`,
      background,
      fontSize: '12px',
      fontWeight: 600,
      lineHeight: 1.2,
      color: 'var(--text-primary)',
    }}>
      {label}
    </span>
  )
}

function ActionLink({
  href,
  label,
  external = false,
  tone = 'ghost',
}: {
  href: string
  label: string
  external?: boolean
  tone?: 'ghost' | 'secondary'
}) {
  const className = `ui-button ${tone === 'secondary' ? 'ui-button-secondary' : 'ui-button-ghost'} ui-button-xs`
  const style = { textDecoration: 'none' }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} style={style}>
        {label}
      </a>
    )
  }

  return (
    <Link href={href} className={className} style={style}>
      {label}
    </Link>
  )
}

function EmptySurface({ body }: { body: string }) {
  return (
    <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.7, marginTop: '0.95rem' }}>
      {body}
    </div>
  )
}
