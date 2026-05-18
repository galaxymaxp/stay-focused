'use client'

import { Download, Printer } from 'lucide-react'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { StudyOutputPrintHeader } from '@/components/StudyOutputPrintHeader'
import { isTaskOutputStudyOutputContent } from '@/lib/study-output-content'
import { buildTaskOutputActivitySubmissionHtml } from '@/lib/task-output-template'
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
  if (!isTaskOutputStudyOutputContent(output.content)) {
    return (
      <GeneratedContentState
        title="This task output could not be rendered safely."
        description="The saved task output payload is incomplete or uses a version this app build does not support."
        tone="warning"
      />
    )
  }

  const taskOutput = output.content as StudyOutputTaskOutputContent
  const printableHtml = taskOutput.version === 'task-output-v1'
    ? taskOutput.exports.find((item) => item.filename.endsWith('.html'))?.content ?? null
    : null
  const activityExportHtml = printableHtml?.includes('activity-submission') ? printableHtml : null
  const activitySubmissionHtml = activityExportHtml ?? buildTaskOutputActivitySubmissionHtml({
    title: taskOutput.title,
    taskTitle: taskOutput.taskTitle,
    courseLabel,
    moduleTitle,
    generatedAt: output.generatedAt ?? output.createdAt,
    previewMode: taskOutput.previewMode,
    previewContent: taskOutput.previewContent,
    stylesheet: taskOutput.stylesheet,
    script: taskOutput.script,
  })
  const activitySubmissionMarkup = extractMainMarkup(activitySubmissionHtml)

  return (
    <section className="motion-card section-shell section-shell-elevated reviewer-sheet study-output-document">
      <div className="reviewer-print-hide study-output-screen-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p className="ui-kicker">Activity</p>
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

      <StudyOutputPrintHeader
        title={taskOutput.title}
        outputLabel="Activity"
        courseLabel={courseLabel}
        moduleTitle={moduleTitle}
        generatedAt={output.generatedAt ?? output.createdAt}
      />

      <div className="reviewer-meta-row reviewer-print-hide">
        {courseLabel ? <span>{courseLabel}</span> : null}
        {moduleTitle ? <span>{moduleTitle}</span> : null}
        <span>{taskOutput.preset}</span>
        <span>{taskOutput.outputType.toUpperCase()}</span>
        <span>{taskOutput.groundingStatus === 'limited' ? 'Limited grounding' : 'Grounded output'}</span>
        {taskOutput.readinessStatus && taskOutput.readinessStatus !== 'ready' ? (
          <span>{taskOutput.readinessLabel ?? 'Needs more content'}</span>
        ) : null}
      </div>

      <div
        className="reviewer-print-only task-output-print-document"
        dangerouslySetInnerHTML={{ __html: activitySubmissionMarkup }}
      />

      <div className="reviewer-grid reviewer-print-hide">
        <section className="reviewer-panel reviewer-panel-hero study-output-keep-together">
          <p className="reviewer-section-label">Grounding contract</p>
          <p className="reviewer-intro">{taskOutput.groundingNote}</p>
          {taskOutput.limitationNote ? (
            <p className="reviewer-muted" style={{ marginTop: '0.6rem' }}>{taskOutput.limitationNote}</p>
          ) : null}
        </section>

        <section className="reviewer-panel study-output-keep-together">
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
          <section className="reviewer-panel study-output-keep-together">
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

        <section className="reviewer-panel study-output-keep-together">
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
          <section className="reviewer-panel reviewer-print-hide study-output-keep-together">
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
          <section className="reviewer-panel study-output-keep-together">
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

function extractMainMarkup(html: string) {
  const main = html.match(/<main[^>]*class=["'][^"']*activity-submission[^"']*["'][^>]*>[\s\S]*?<\/main>/i)
  if (main?.[0]) return main[0]

  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  return body?.[1]?.trim() ?? html
}
