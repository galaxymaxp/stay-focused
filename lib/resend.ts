export interface TransactionalEmailInput {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey?: string
  tags?: Array<{ name: string; value: string }>
}

export interface TransactionalEmailResult {
  ok: boolean
  messageId?: string
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  if (!isResendConfigured()) {
    console.info('[resend] not configured — skipping send', {
      to: input.to,
      subject: input.subject,
    })
    return { ok: false }
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY!)

    const options: Parameters<typeof resend.emails.send>[0] = {
      from: process.env.EMAIL_FROM!,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }

    if (input.idempotencyKey) {
      options.headers = { 'Idempotency-Key': input.idempotencyKey }
    }

    if (input.tags) {
      options.tags = input.tags.map((t) => ({ name: t.name, value: t.value }))
    }

    const { data, error } = await resend.emails.send(options)

    if (error) {
      console.warn('[resend] send failed', {
        subject: input.subject,
        name: error.name,
      })
      return { ok: false }
    }

    return { ok: true, messageId: data?.id }
  } catch (err) {
    console.warn('[resend] unexpected error', {
      message: err instanceof Error ? err.message : String(err),
    })
    return { ok: false }
  }
}
