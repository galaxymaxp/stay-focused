import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { ReviewerPrintButton } from '@/components/ReviewerPrintButton'
import { StudyOutputPrintHeader } from '@/components/StudyOutputPrintHeader'
import { isSheetStudyOutputContent } from '@/lib/study-output-content'
import type { StudyOutput, StudyOutputSheetContent } from '@/lib/types'

export function StudyOutputSheetPage({
  output,
  courseLabel,
  moduleTitle,
}: {
  output: StudyOutput
  courseLabel: string | null
  moduleTitle: string | null
}) {
  if (!isSheetStudyOutputContent(output.content)) {
    return (
      <GeneratedContentState
        title="This study sheet could not be rendered safely."
        description="The saved sheet payload is incomplete or uses a version this app build does not support."
        tone="warning"
      />
    )
  }
  const sheet = output.content as StudyOutputSheetContent

  const isCramSheet = sheet.mode === 'cram_sheet'

  return (
    <section className={`motion-card section-shell section-shell-elevated reviewer-sheet study-sheet-shell study-output-document${isCramSheet ? ' cram-sheet-shell' : ''}`}>
      <div className="reviewer-print-hide study-output-screen-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p className="ui-kicker">{isCramSheet ? 'Printable cram sheet' : 'Printable study sheet'}</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{sheet.title}</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
            {sheet.summary}
          </p>
        </div>
        <ReviewerPrintButton />
      </div>

      <StudyOutputPrintHeader
        title={sheet.title}
        outputLabel={isCramSheet ? 'Cram Sheet' : 'Study Sheet'}
        courseLabel={courseLabel}
        moduleTitle={moduleTitle}
        generatedAt={output.generatedAt ?? output.createdAt}
      />

      {(courseLabel || moduleTitle) ? (
        <div className="reviewer-meta-row reviewer-print-hide">
          {courseLabel ? <span>{courseLabel}</span> : null}
          {moduleTitle ? <span>{moduleTitle}</span> : null}
          <span>{isCramSheet ? 'Cram-first format' : 'Compact sheet'}</span>
        </div>
      ) : null}

      <section className="reviewer-panel reviewer-panel-hero study-output-keep-together">
        <p className="reviewer-section-label">{isCramSheet ? 'Last-minute pass' : 'Scan-first study pass'}</p>
        <p className="reviewer-intro">{sheet.intro}</p>
        <div className="reviewer-print-hide" style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          <span className="ui-chip ui-chip-soft">{sheet.keyTerms.length} key terms</span>
          {sheet.formulas.length > 0 ? (
            <span className="ui-chip ui-chip-soft">{sheet.formulas.length} formulas</span>
          ) : sheet.supplementalSectionTitle && sheet.supplementalSectionItems.length > 0 ? (
            <span className="ui-chip ui-chip-soft">{sheet.supplementalSectionItems.length} {sheet.supplementalSectionTitle.toLowerCase()}</span>
          ) : null}
          <span className="ui-chip ui-chip-soft">{sheet.likelyExamTraps.length} exam traps</span>
        </div>
      </section>

      <div className="study-sheet-grid">
        <section className="reviewer-panel study-output-keep-together">
          <p className="reviewer-section-label">Key terms</p>
          <div className="study-sheet-term-grid">
            {sheet.keyTerms.map((item) => (
              <article key={`${item.term}-${item.definition}`} className="reviewer-mini-card">
                <strong>{item.term}</strong>
                <p><b>Memorize:</b> {item.sourceWording ?? item.definition}</p>
                {item.plainExplanation ? <p className="reviewer-muted">Understand: {item.plainExplanation}</p> : null}
              </article>
            ))}
          </div>
        </section>

        {sheet.formulas.length > 0 ? (
          <section className="reviewer-panel study-output-keep-together">
            <p className="reviewer-section-label">Formulas</p>
            <div className="study-sheet-formula-list">
              {sheet.formulas.map((item) => (
                <article key={`${item.label}-${item.expression}`} className="reviewer-mini-card study-sheet-formula-card">
                  <p>{item.label}</p>
                  <strong style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{item.expression}</strong>
                  {item.note ? <p className="reviewer-muted" style={{ whiteSpace: 'pre-wrap' }}>{item.note}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {sheet.formulas.length === 0 && sheet.supplementalSectionTitle && sheet.supplementalSectionItems.length > 0 ? (
          <section className="reviewer-panel study-output-keep-together">
            <p className="reviewer-section-label">{sheet.supplementalSectionTitle}</p>
            <ul className="reviewer-answer-list">
              {sheet.supplementalSectionItems.map((item) => (
                <li key={`${item.cue}-${item.detail}`}>
                  <strong>{item.cue}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="reviewer-panel study-output-keep-together">
          <p className="reviewer-section-label">High-yield facts</p>
          <ul className="reviewer-answer-list">
            {sheet.highYieldFacts.map((item) => (
              <li key={`${item.cue}-${item.detail}`}>
                <strong>{item.cue}</strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        {sheet.confusingConcepts.length > 0 ? (
          <section className="reviewer-panel study-output-keep-together">
            <p className="reviewer-section-label">Confusing concepts</p>
            <div className="reviewer-block-grid">
              {sheet.confusingConcepts.map((item) => (
                <article key={`${item.conceptA}-${item.conceptB}`} className="reviewer-mini-card">
                  <h3>{item.conceptA} vs {item.conceptB}</h3>
                  <p>{item.difference}</p>
                  {item.confusionNote ? <p className="reviewer-muted">{item.confusionNote}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {sheet.likelyExamTraps.length > 0 ? (
          <section className="reviewer-panel study-output-keep-together">
            <p className="reviewer-section-label">Likely exam traps</p>
            <div className="study-sheet-trap-list">
              {sheet.likelyExamTraps.map((item) => (
                <article key={`${item.trap}-${item.explanation}`} className="reviewer-mini-card">
                  <strong>{item.trap}</strong>
                  <p>{item.explanation}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  )
}
