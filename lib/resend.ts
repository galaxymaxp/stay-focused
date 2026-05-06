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

/**
 * In non-production, returns EMAIL_TEST_TO if set; otherwise returns userEmail.
 * In production, always returns userEmail regardless of EMAIL_TEST_TO.
 */
export function resolveTestEmailRecipient(userEmail: string, isProduction: boolean): string {
  if (!isProduction) {
    const override = process.env.EMAIL_TEST_TO?.trim()
    if (override) return override
  }
  return userEmail
}

/**
 * Returns a user-facing error string for a failed test email send.
 * The onboarding@resend.dev sender can only deliver to the Resend account owner's email;
 * any other recipient will be rejected with 403. When that sender is detected, surface a
 * specific message pointing to the fix (add a verified domain).
 */
export function classifyTestEmailError(emailFrom: string): string {
  if (emailFrom.toLowerCase().includes('@resend.dev')) {
    return (
      'The onboarding@resend.dev sender is test-only and can only deliver to your Resend account email. ' +
      'Add a verified domain in Resend and update EMAIL_FROM to send to other addresses.'
    )
  }
  return 'Failed to send. Check that RESEND_API_KEY and EMAIL_FROM are configured correctly.'
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
      const resendError = error as { name: string; message?: string; statusCode?: number }
      console.warn('[resend] send failed', {
        to: input.to,
        subject: input.subject,
        errorName: resendError.name,
        errorMessage: resendError.message,
        statusCode: resendError.statusCode,
      })
      return { ok: false }
    }

    return { ok: true, messageId: data?.id }
  } catch (err) {
    console.warn('[resend] unexpected error', {
      to: input.to,
      subject: input.subject,
      message: err instanceof Error ? err.message : String(err),
    })
    return { ok: false }
  }
}
