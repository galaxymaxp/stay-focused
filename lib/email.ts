/**
 * Email adapter for Stay Focused notifications.
 *
 * Required env vars (set in Vercel/production):
 *   EMAIL_FROM          — sender address, e.g. "Stay Focused <noreply@stayfocused.app>"
 *   EMAIL_SMTP_HOST     — SMTP host, e.g. "smtp.resend.com"
 *   EMAIL_SMTP_PORT     — SMTP port (default 587)
 *   EMAIL_SMTP_USER     — SMTP username
 *   EMAIL_SMTP_PASS     — SMTP password / API key
 *
 * If no provider is configured, sendEmail() logs the email and returns { ok: false }.
 * Wire up nodemailer or a provider SDK here when ready.
 */

export interface EmailPayload {
  to: string
  subject: string
  bodyText: string
  bodyHtml?: string
}

export interface EmailResult {
  ok: boolean
  error?: string
}

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.EMAIL_FROM?.trim() &&
    process.env.EMAIL_SMTP_HOST?.trim() &&
    process.env.EMAIL_SMTP_USER?.trim() &&
    process.env.EMAIL_SMTP_PASS?.trim(),
  )
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    console.info('[email] provider not configured — skipping send', {
      to: payload.to,
      subject: payload.subject,
    })
    return { ok: false, error: 'Email provider not configured.' }
  }

  // TODO: wire up nodemailer or provider SDK here.
  // Example with nodemailer:
  //
  // const nodemailer = await import('nodemailer')
  // const transporter = nodemailer.createTransport({
  //   host: process.env.EMAIL_SMTP_HOST,
  //   port: Number(process.env.EMAIL_SMTP_PORT ?? 587),
  //   secure: false,
  //   auth: { user: process.env.EMAIL_SMTP_USER, pass: process.env.EMAIL_SMTP_PASS },
  // })
  // await transporter.sendMail({
  //   from: process.env.EMAIL_FROM,
  //   to: payload.to,
  //   subject: payload.subject,
  //   text: payload.bodyText,
  //   html: payload.bodyHtml,
  // })
  //
  // Example with Resend:
  // const { Resend } = await import('resend')
  // const resend = new Resend(process.env.EMAIL_SMTP_PASS)
  // await resend.emails.send({ from: process.env.EMAIL_FROM!, to: payload.to, subject: payload.subject, html: payload.bodyHtml ?? payload.bodyText })

  console.info('[email] TODO: send via provider', { to: payload.to, subject: payload.subject })
  return { ok: false, error: 'Email adapter not implemented. See lib/email.ts.' }
}

export function buildNotificationEmail(opts: {
  recipientEmail: string
  subject: string
  title: string
  body: string
  href?: string | null
  appBaseUrl?: string
}): EmailPayload {
  const baseUrl = opts.appBaseUrl
    || process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://stayfocused.app')

  const actionLink = opts.href
    ? `${baseUrl}${opts.href.startsWith('/') ? opts.href : `/${opts.href}`}`
    : baseUrl

  const bodyText = [
    opts.title,
    '',
    opts.body,
    '',
    opts.href ? `Open in Stay Focused: ${actionLink}` : `Open Stay Focused: ${baseUrl}`,
    '',
    '— Stay Focused',
  ].join('\n')

  const bodyHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f1913;background:#f6f4ef;">
  <div style="background:#fff;border-radius:14px;padding:24px;border:1px solid rgba(82,67,42,0.1);">
    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#74695d;">Stay Focused</p>
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;line-height:1.3;color:#1f1913;">${escapeHtml(opts.title)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#61584f;">${escapeHtml(opts.body)}</p>
    ${opts.href ? `<a href="${actionLink}" style="display:inline-block;background:#d7aa38;color:#2c2107;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:600;text-decoration:none;">Open →</a>` : ''}
  </div>
  <p style="margin:16px 0 0;font-size:12px;color:#74695d;text-align:center;">You received this because you have email notifications enabled in Stay Focused.</p>
</body>
</html>`.trim()

  return {
    to: opts.recipientEmail,
    subject: opts.subject,
    bodyText,
    bodyHtml,
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
