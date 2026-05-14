import type { TaskOutputPreviewMode } from '@/lib/types'

export interface TaskOutputExportMetadata {
  courseLabel: string | null
  moduleTitle: string | null
  activityTitle: string
  studentName: string | null
  dateLabel: string | null
  sectionSchedule: string | null
}

export function wrapActivitySubmissionHtml(input: {
  title: string
  previewContent: string
  previewMode: TaskOutputPreviewMode
  metadata: TaskOutputExportMetadata
  stylesheet?: string | null
  script?: string | null
}) {
  const body = renderActivitySubmissionBody(input.previewContent, input.previewMode)

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(input.title)}</title>`,
    '  <style>',
    buildActivitySubmissionStyles(input.stylesheet ?? null),
    '  </style>',
    '</head>',
    '<body>',
    '  <main class="activity-submission">',
    '    <header class="activity-header">',
    `      <h1>${escapeHtml(input.metadata.courseLabel ?? 'Program / Course')}</h1>`,
    `      <p class="activity-title">${escapeHtml(input.metadata.activityTitle)}</p>`,
    '    </header>',
    '    <section class="activity-meta" aria-label="Submission details">',
    `      <p><strong>Names:</strong> ${escapeHtml(input.metadata.studentName ?? '______________________________')}</p>`,
    `      <p><strong>Date:</strong> ${escapeHtml(input.metadata.dateLabel ?? '________________')}</p>`,
    `      <p><strong>Section / Schedule:</strong> ${escapeHtml(input.metadata.sectionSchedule ?? '______________________________')}</p>`,
    `      <p><strong>Course / Module:</strong> ${escapeHtml(input.metadata.moduleTitle ?? input.metadata.courseLabel ?? '______________________________')}</p>`,
    '    </section>',
    '    <section class="activity-body">',
    body,
    '    </section>',
    '  </main>',
    input.script ? `  <script>\n${input.script}\n  </script>` : '',
    '</body>',
    '</html>',
  ].filter(Boolean).join('\n')
}

export function buildTaskOutputActivitySubmissionHtml(input: {
  title: string
  taskTitle?: string | null
  courseLabel?: string | null
  moduleTitle?: string | null
  generatedAt?: string | null
  previewMode: TaskOutputPreviewMode
  previewContent: string
  stylesheet?: string | null
  script?: string | null
}) {
  return wrapActivitySubmissionHtml({
    title: input.title,
    previewContent: input.previewContent,
    previewMode: input.previewMode,
    metadata: {
      courseLabel: input.courseLabel ?? null,
      moduleTitle: input.moduleTitle ?? null,
      activityTitle: input.taskTitle ?? input.title,
      studentName: null,
      dateLabel: formatTaskExportDate(input.generatedAt ?? null),
      sectionSchedule: null,
    },
    stylesheet: input.stylesheet ?? null,
    script: input.script ?? null,
  })
}

export function formatTaskExportDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function renderActivitySubmissionBody(previewContent: string, previewMode: TaskOutputPreviewMode) {
  const cleaned = cleanBlock(previewContent)
  if (!cleaned) return '<p></p>'

  if (previewMode === 'html') {
    return extractHtmlMain(cleaned)
  }

  if (previewMode === 'code') {
    return `<pre>${escapeHtml(cleaned)}</pre>`
  }

  return cleaned
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.includes('\n')
      ? `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`
      : `<p>${escapeHtml(block)}</p>`)
    .join('\n')
}

function extractHtmlMain(value: string) {
  const bodyMatch = value.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const body = bodyMatch?.[1]?.trim() ?? value
  const mainMatch = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  return (mainMatch?.[1]?.trim() ?? body).trim()
}

function buildActivitySubmissionStyles(extraStylesheet: string | null) {
  return [
    'body { margin: 0; background: #f4f1ea; color: #111111; font-family: "Times New Roman", Times, serif; }',
    '.activity-submission { box-sizing: border-box; width: min(100%, 8.5in); min-height: 11in; margin: 0 auto; padding: 0.72in 0.78in; background: #ffffff; }',
    '.activity-header { text-align: center; margin-bottom: 0.28in; }',
    '.activity-header p, .activity-header h1 { margin: 0; }',
    '.activity-header h1 { font-size: 13pt; line-height: 1.25; font-weight: 700; text-transform: uppercase; }',
    '.activity-title { margin-top: 0.08in !important; font-size: 12pt; line-height: 1.35; font-weight: 700; }',
    '.activity-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.08in 0.28in; margin: 0.18in 0 0.28in; font-size: 11pt; line-height: 1.35; }',
    '.activity-meta p { margin: 0; border-bottom: 1px solid #b9b9b9; padding-bottom: 0.03in; }',
    '.activity-body { font-size: 12pt; line-height: 1.6; }',
    '.activity-body p { margin: 0 0 0.14in; }',
    '.activity-body h1, .activity-body h2, .activity-body h3 { line-height: 1.25; margin: 0.22in 0 0.1in; }',
    '.activity-body pre { white-space: pre-wrap; font-family: "Times New Roman", Times, serif; line-height: 1.55; }',
    '@media print { body { background: #ffffff; } .activity-submission { width: auto; min-height: auto; margin: 0; padding: 0; } }',
    extraStylesheet ? `\n/* Generated content styles */\n${extraStylesheet}` : '',
  ].filter(Boolean).join('\n')
}

function cleanBlock(value: string | null | undefined) {
  return value
    ?.replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() ?? ''
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
