import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { isReviewerStudyOutputContent } from '@/lib/study-output-content'
import { ReviewerPrintButton } from '@/components/ReviewerPrintButton'
import { StudyOutputPrintHeader } from '@/components/StudyOutputPrintHeader'
import type { StudyOutput } from '@/lib/types'

export function StudyOutputReviewerPage({
  output,
  courseLabel,
  moduleTitle,
}: {
  output: StudyOutput
  courseLabel: string | null
  moduleTitle: string | null
}) {
  if (!isReviewerStudyOutputContent(output.content)) {
    return (
      <GeneratedContentState
        title="This reviewer could not be rendered safely."
        description="The saved reviewer payload is missing fields this app version expects."
        tone="warning"
      />
    )
  }
  const reviewer = output.content

  return (
    <section className="motion-card section-shell section-shell-elevated reviewer-sheet study-output-document">
      <div className="reviewer-print-hide study-output-screen-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p className="ui-kicker">Printable reviewer</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{reviewer.title}</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
            {reviewer.summary}
          </p>
        </div>
        <ReviewerPrintButton />
      </div>

      <StudyOutputPrintHeader
        title={reviewer.title}
        outputLabel="Reviewer"
        courseLabel={courseLabel}
        moduleTitle={moduleTitle}
        generatedAt={output.generatedAt ?? output.createdAt}
      />

      <div className="reviewer-grid">
        <section className="reviewer-panel reviewer-panel-hero study-output-keep-together">
          <p className="reviewer-section-label">High-yield first</p>
          <p className="reviewer-intro">{reviewer.intro}</p>
          {(courseLabel || moduleTitle) ? (
            <div className="reviewer-meta-row">
              {courseLabel ? <span>{courseLabel}</span> : null}
              {moduleTitle ? <span>{moduleTitle}</span> : null}
            </div>
          ) : null}
          {reviewer.highYieldConcepts.length > 0 ? (
            <ul className="reviewer-answer-list">
              {reviewer.highYieldConcepts.map((item) => (
                <li key={`${item.cue}-${item.answer}`}>
                  <strong>{item.cue}</strong>
                  <span style={{ whiteSpace: 'pre-line' }}><b>{item.answer.includes(':') ? 'Key list' : 'Definition'}:</b> {item.answer}</span>
                  {item.plainExplanation || item.support ? (
                    <span><b>Exam cue:</b> {item.plainExplanation ?? item.support}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {reviewer.identificationReview.length > 0 ? (
          <section className="reviewer-panel study-output-keep-together">
            <p className="reviewer-section-label">Identification review</p>
            <div className="reviewer-two-column-list">
              {reviewer.identificationReview.map((item) => (
                <article key={`${item.prompt}-${item.answer}`} className="reviewer-mini-card">
                  <p>{item.prompt}</p>
                  <strong>{item.answer}</strong>
                  {item.plainExplanation || item.support ? (
                    <p className="reviewer-muted">Exam cue: {item.plainExplanation ?? item.support}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {reviewer.quickReviewBlocks.length > 0 ? (
          <section className="reviewer-panel study-output-keep-together">
            <p className="reviewer-section-label">Quick-answer blocks</p>
            <div className="reviewer-block-grid">
              {reviewer.quickReviewBlocks.map((block) => (
                <article key={block.heading} className="reviewer-mini-card">
                  <h3>{block.heading}</h3>
                  <ul>
                    {block.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {reviewer.distinctions.length > 0 ? (
          <section className="reviewer-panel study-output-keep-together">
            <p className="reviewer-section-label">Distinctions</p>
            <div className="reviewer-block-grid">
              {reviewer.distinctions.map((item) => (
                <article key={`${item.conceptA}-${item.conceptB}`} className="reviewer-mini-card">
                  <h3>{item.conceptA} vs {item.conceptB}</h3>
                  <p>{item.difference}</p>
                  {item.confusionNote ? <p className="reviewer-muted">{item.confusionNote}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {reviewer.likelyQuizTargets.length > 0 ? (
          <section className="reviewer-panel study-output-keep-together">
            <p className="reviewer-section-label">Likely quiz targets</p>
            <ol className="reviewer-target-list">
              {reviewer.likelyQuizTargets.map((item) => (
                <li key={item.target}>
                  <strong>{item.target}</strong>
                  <span>{item.reason}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {reviewer.cautionNotes.length > 0 ? (
          <section className="reviewer-panel study-output-keep-together">
            <p className="reviewer-section-label">Caution notes</p>
            <ul className="reviewer-caution-list">
              {reviewer.cautionNotes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  )
}
