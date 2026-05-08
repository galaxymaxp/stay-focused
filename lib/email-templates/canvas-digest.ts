export interface DigestDisplayLine {
  eventType: string
  label: string
  count: number
}

export interface DigestCourseSection {
  courseId: string | null
  courseName: string
  appHref: string | null
  lines: DigestDisplayLine[]
}

export interface CanvasDigestEmailInput {
  courseSections: DigestCourseSection[]
  totalDisplayLines: number
  maxItems: number
  appBaseUrl: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case 'new_announcement': return 'New announcement'
    case 'edited_announcement': return 'Announcement updated'
    case 'new_assignment': return 'New assignment'
    case 'edited_assignment': return 'Assignment updated'
    case 'new_quiz': return 'New quiz'
    case 'edited_quiz': return 'Quiz updated'
    case 'new_discussion': return 'New discussion'
    case 'edited_discussion': return 'Discussion updated'
    case 'due_date_change': return 'Due date updated'
    case 'new_module': return 'New module'
    case 'edited_module': return 'Module updated'
    case 'new_module_item': return 'New module item'
    case 'edited_module_item': return 'Module item updated'
    case 'new_resource': return 'New resource'
    case 'edited_resource': return 'Resource updated'
    case 'grade_update': return 'Grade updated'
    case 'ocr_completed': return 'OCR completed'
    case 'deep_learn_ready': return 'Deep Learn ready'
    case 'generic_canvas_update': return 'Canvas update'
    default: return 'Update'
  }
}

export function buildDigestSubject(courseSections: DigestCourseSection[]): string {
  const totalLines = courseSections.reduce((s, c) => s + c.lines.length, 0)
  const courseCount = courseSections.length

  if (totalLines === 1 && courseCount === 1) {
    return '📚 New Canvas update'
  }
  if (courseCount >= 2) {
    return `📚 Canvas updates from ${courseCount} courses`
  }
  return '📚 Canvas updates in Stay Focused'
}

export function buildDigestHtml(input: CanvasDigestEmailInput): string {
  const { courseSections, totalDisplayLines, maxItems, appBaseUrl } = input
  const hasOverflow = totalDisplayLines > maxItems

  const courseSectionHtml = courseSections
    .map((section) => {
      const linesHtml = section.lines
        .map((line) => {
          const prefix = `${eventTypeLabel(line.eventType)}: `
          const suffix = line.count > 1 ? ` <span style="color:#b8852a;font-weight:700;">×${line.count}</span>` : ''
          return `<li style="margin:0 0 5px;font-size:14px;line-height:1.5;color:#4a3f35;">${escapeHtml(prefix)}${escapeHtml(line.label)}${suffix}</li>`
        })
        .join('\n')

      const courseLink = section.appHref
        ? `${appBaseUrl}${section.appHref.startsWith('/') ? section.appHref : `/${section.appHref}`}`
        : null

      const courseHeading = courseLink
        ? `<a href="${escapeHtml(courseLink)}" style="font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#8a7356;text-decoration:none;">${escapeHtml(section.courseName)}</a>`
        : `<span style="font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#8a7356;">${escapeHtml(section.courseName)}</span>`

      return `
        <div style="margin-bottom:18px;">
          <div style="margin-bottom:7px;">${courseHeading}</div>
          <ul style="margin:0;padding:0 0 0 14px;list-style:disc;">${linesHtml}</ul>
        </div>`
    })
    .join('\n')

  const overflowHtml = hasOverflow
    ? `<p style="margin:12px 0 0;font-size:13px;color:#7a6a58;font-style:italic;">Open Stay Focused to see the rest.</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canvas updates — Stay Focused</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ec;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td>
            <!-- Card -->
            <div style="background:#fffef9;border-radius:14px;border:1px solid rgba(120,96,58,0.13);padding:28px 28px 24px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
              <!-- Eyebrow -->
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9e8662;">Stay Focused</p>
              <!-- Heading -->
              <h1 style="margin:0 0 6px;font-size:20px;font-weight:800;line-height:1.25;color:#1d1711;">Canvas updates</h1>
              <!-- Subhead -->
              <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#6b5d4f;">Stay Focused found new Canvas updates since your last check.</p>
              <!-- Divider -->
              <div style="border-top:1px solid rgba(120,96,58,0.12);margin-bottom:20px;"></div>
              <!-- Course sections -->
              ${courseSectionHtml}
              ${overflowHtml}
              <!-- Divider -->
              <div style="border-top:1px solid rgba(120,96,58,0.12);margin:20px 0 18px;"></div>
              <!-- CTA -->
              <a href="${escapeHtml(appBaseUrl)}" style="display:inline-block;background:#d7a82e;color:#2d1f00;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:.01em;">Open Stay Focused →</a>
            </div>
            <!-- Footer -->
            <p style="margin:16px 0 0;font-size:11px;color:#9e8662;text-align:center;line-height:1.5;">You're receiving this because email notifications are enabled in Stay Focused.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`.trim()
}

export function buildDigestText(input: CanvasDigestEmailInput): string {
  const { courseSections, totalDisplayLines, maxItems, appBaseUrl } = input
  const hasOverflow = totalDisplayLines > maxItems

  const lines: string[] = [
    'Stay Focused — Canvas updates',
    '',
    'Stay Focused found new Canvas updates since your last check.',
    '',
  ]

  for (const section of courseSections) {
    lines.push(section.courseName.toUpperCase())
    for (const line of section.lines) {
      const prefix = `${eventTypeLabel(line.eventType)}: `
      const suffix = line.count > 1 ? ` ×${line.count}` : ''
      lines.push(`- ${prefix}${line.label}${suffix}`)
    }
    lines.push('')
  }

  if (hasOverflow) {
    lines.push('Open Stay Focused to see the rest.')
    lines.push('')
  }

  lines.push(`Open Stay Focused: ${appBaseUrl}`)
  lines.push('')
  lines.push("You're receiving this because email notifications are enabled in Stay Focused.")

  return lines.join('\n')
}
