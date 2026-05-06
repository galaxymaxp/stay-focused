import type { DeadlineReminderWindow } from '@/lib/deadline-reminders'

export interface DeadlineReminderTemplateInput {
  title: string
  courseName: string | null
  dueAt: string
  appHref: string | null
  appBaseUrl: string
  reminderWindow: DeadlineReminderWindow
}

export function buildDeadlineReminderSubject(input: Pick<DeadlineReminderTemplateInput, 'title' | 'reminderWindow'>): string {
  const prefix = input.reminderWindow === 'due_today' ? 'Due today' : 'Due tomorrow'
  return `${prefix}: ${input.title}`
}

export function buildDeadlineReminderHtml(input: DeadlineReminderTemplateInput): string {
  const dueLabel = formatDueDate(input.dueAt)
  const windowLabel = input.reminderWindow === 'due_today' ? 'due today' : 'due tomorrow'
  const courseLine = input.courseName ? `<p style="margin:0 0 8px;font-size:14px;color:#6b5d4f;">${escapeHtml(input.courseName)}</p>` : ''
  const href = input.appHref ? absoluteHref(input.appBaseUrl, input.appHref) : input.appBaseUrl

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f1e8;font-family:Inter,Arial,sans-serif;color:#1d1711;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f1e8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffaf2;border:1px solid #eadcca;border-radius:12px;padding:24px;">
            <tr>
              <td>
                <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#9a6a1d;text-transform:uppercase;letter-spacing:.04em;">Stay Focused reminder</p>
                <h1 style="margin:0 0 10px;font-size:22px;line-height:1.25;color:#1d1711;">${escapeHtml(input.title)} is ${windowLabel}</h1>
                ${courseLine}
                <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#3d342b;">Due ${escapeHtml(dueLabel)}</p>
                <a href="${escapeHtml(href)}" style="display:inline-block;background:#1d1711;color:#fffaf2;text-decoration:none;border-radius:8px;padding:10px 14px;font-size:14px;font-weight:700;">Open in Stay Focused</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function buildDeadlineReminderText(input: DeadlineReminderTemplateInput): string {
  const windowLabel = input.reminderWindow === 'due_today' ? 'due today' : 'due tomorrow'
  const lines = [
    `Stay Focused reminder`,
    `${input.title} is ${windowLabel}.`,
    input.courseName ? `Course: ${input.courseName}` : null,
    `Due: ${formatDueDate(input.dueAt)}`,
    `Open: ${input.appHref ? absoluteHref(input.appBaseUrl, input.appHref) : input.appBaseUrl}`,
  ]
  return lines.filter(Boolean).join('\n')
}

function absoluteHref(appBaseUrl: string, href: string): string {
  try {
    return new URL(href, appBaseUrl).toString()
  } catch {
    return appBaseUrl
  }
}

function formatDueDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
