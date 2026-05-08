'use client'

import { Download, Printer } from 'lucide-react'
import type { StudyOutput, StudyOutputTaskOutputContent } from '@/lib/types'

export function StudyOutputTaskOutputPage({
  output,
  courseLabel,
  moduleTitle,
}: {
  output: StudyOutput
  courseLabel: string | null
  moduleTitle: string | null
}) {
  const taskOutput = output.content as StudyOutputTaskOutputContent
  const printableHtml = taskOutput.version === 'task-output-v1'
    ? taskOutput.exports.find((item) => item.filename.endsWith('.html'))?.content ?? null
    : null

  if (taskOutput.version !== 'task-output-v1') {
    return null
  }

  return (
    <section className="motion-card section-shell section-shell-elevated reviewer-sheet">
      <div className="reviewer-print-hide" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p className="ui-kicker">Task output</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{taskOutput.title}</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>
            {taskOutput.summary}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {taskOutput.previewMode !== 'code' && (
            <button type="button" onClick={() => window.print()} className="ui-button ui-button-secondary ui-button-xs reviewer-print-hide">
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </button>
          )}
          {taskOutput.exports.map((file) => (
            <button
              key={file.filename}
              type="button"
              onClick={() => downloadExportFile(file.filename, file.mimeType, file.content)}
              className="ui-button ui-button-ghost ui-button-xs"
            >
              <Download className="h-3.5 w-3.5" />
              {file.label}
            </button>
          ))}
        </div>
      </div>

      <div className="reviewer-print-only reviewer-print-meta">
        <p>{taskOutput.title}</p>
        {courseLabel ? <p>{courseLabel}</p> : null}
        {moduleTitle ? <p>{moduleTitle}</p> : null}
      </div>

      <div className="reviewer-meta-row">
        {courseLabel ? <span>{courseLabel}</span> : null}
        {moduleTitle ? <span>{moduleTitle}</span> : null}
        <span>{taskOutput.preset}</span>
        <span>{taskOutput.outputType.toUpperCase()}</span>
        <span>{taskOutput.groundingStatus === 'limited' ? 'Limited grounding' : 'Grounded output'}</span>
      </div>

      <div className="reviewer-grid">
        <section className="reviewer-panel reviewer-panel-hero">
          <p className="reviewer-section-label">Grounding contract</p>
          <p className="reviewer-intro">{taskOutput.groundingNote}</p>
          {taskOutput.limitationNote ? (
            <p className="reviewer-muted" style={{ marginTop: '0.6rem' }}>{taskOutput.limitationNote}</p>
          ) : null}
        </section>

        <section className="reviewer-panel">
          <p className="reviewer-section-label">Requirements used</p>
          <ul className="reviewer-answer-list">
            {taskOutput.requirements.map((item) => (
              <li key={item}>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {taskOutput.selectedContext.length > 0 ? (
          <section className="reviewer-panel">
            <p className="reviewer-section-label">Selected context</p>
            <ul className="reviewer-answer-list">
              {taskOutput.selectedContext.map((item) => (
                <li key={item}>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="reviewer-panel">
          <p className="reviewer-section-label">Preview</p>
          {taskOutput.previewMode === 'html' ? (
            <iframe
              title={`${taskOutput.title} preview`}
              srcDoc={printableHtml ?? taskOutput.previewContent}
              className="task-output-preview-frame"
            />
          ) : taskOutput.previewMode === 'code' ? (
            <pre className="task-output-code-block">{taskOutput.previewContent}</pre>
          ) : (
            <pre className="task-output-rich-block">{taskOutput.previewContent}</pre>
          )}
        </section>

        {taskOutput.revisionHistory.length > 0 ? (
          <section className="reviewer-panel">
            <p className="reviewer-section-label">Revision history</p>
            <div className="reviewer-block-grid">
              {taskOutput.revisionHistory.map((item) => (
                <article key={item.id} className="reviewer-mini-card">
                  <strong>{item.label}</strong>
                  <p>{item.summary}</p>
                  <p className="reviewer-muted">
                    {new Date(item.createdAt).toLocaleString()} · {item.groundingStatus}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {taskOutput.warnings.length > 0 ? (
          <section className="reviewer-panel">
            <p className="reviewer-section-label">Warnings</p>
            <ul className="reviewer-caution-list">
              {taskOutput.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  )
}

function downloadExportFile(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}
