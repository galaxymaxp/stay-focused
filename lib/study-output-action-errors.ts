import { getStudyOutputKindLabel } from '@/lib/study-output-content'
import type { StudyOutputKind } from '@/lib/types'

const RAW_STUDY_OUTPUT_ERROR_PATTERN = /an error occurred in the server components render|digest property is included|study_outputs|public\.|schema cache|on conflict|constraint|relation |column |uuid|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|pgrst\d+|42p10|23505|42703/i

export function getSafeStudyOutputActionErrorMessage(outputKind: StudyOutputKind, error: unknown) {
  const fallback = `Could not make this ${getStudyOutputKindLabel(outputKind).toLowerCase()} right now.`
  const message = error instanceof Error ? error.message.trim() : ''

  if (!message) return fallback
  if (RAW_STUDY_OUTPUT_ERROR_PATTERN.test(message)) return fallback
  return message
}
