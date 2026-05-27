// Generates the Canvas profile settings URL from a user-provided base URL.
// Returns null when the input is empty or unparseable — callers show manual
// instructions as the fallback.
export function getCanvasTokenPageUrl(canvasUrl: string): string | null {
  const trimmed = canvasUrl.trim()
  if (!trimmed) return null
  try {
    const normalizedInput = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    const url = new URL(normalizedInput)
    return `${url.origin}/profile/settings`
  } catch {
    return null
  }
}

export const CANVAS_ONBOARDING_STEPS = [
  'Open your Canvas settings page using the link below.',
  'Scroll to "Approved Integrations" or "Access Tokens".',
  'Click "+ New Access Token" and name it "Stay Focused".',
  'Leave the expiry date blank, then click Generate Token.',
  'Copy the token — Canvas only shows it this one time.',
  'Return here and paste the token into the Access Token field.',
  'Click "Test connection" to verify and load your courses.',
] as const

export const CANVAS_VIDEO_PLACEHOLDER_TEXT = 'A step-by-step walkthrough video will be added here.'
