import { serializeErrorForLogging } from '@/lib/supabase'

export interface StudyOutputSaveFailure {
  diagnosticCode: string
  diagnosticMessage: string
  userMessage: string
}

export class StudyOutputSaveError extends Error {
  diagnosticCode: string
  diagnosticMessage: string

  constructor(failure: StudyOutputSaveFailure, options?: { cause?: unknown }) {
    super(failure.userMessage, options)
    this.name = 'StudyOutputSaveError'
    this.diagnosticCode = failure.diagnosticCode
    this.diagnosticMessage = failure.diagnosticMessage
  }
}

export function describeStudyOutputSaveFailure(error: unknown): StudyOutputSaveFailure {
  const serialized = serializeErrorForLogging(error)
  const code = typeof serialized?.code === 'string' ? serialized.code : null
  const message = typeof serialized?.message === 'string' ? serialized.message : 'Unknown study output save failure.'
  const details = typeof serialized?.details === 'string' ? serialized.details : null
  const hint = typeof serialized?.hint === 'string' ? serialized.hint : null
  const lower = `${code ?? ''} ${message} ${details ?? ''} ${hint ?? ''}`.toLowerCase()
  const diagnosticMessage = [code ? `code=${code}` : null, message, details, hint].filter(Boolean).join(' | ')

  if (
    code === '42P10'
    || lower.includes('on conflict')
    || lower.includes('there is no unique or exclusion constraint matching')
  ) {
    return {
      diagnosticCode: 'schema_outdated',
      diagnosticMessage,
      userMessage: 'Could not save this study output yet. Stay Focused still needs the latest saved-output database update.',
    }
  }

  if (
    code === '42703'
    || lower.includes('source_task_id')
    || lower.includes('source_kind')
    || lower.includes('output_kind')
    || lower.includes('schema cache')
    || lower.includes('could not find the')
    || lower.includes('does not exist')
  ) {
    return {
      diagnosticCode: 'schema_outdated',
      diagnosticMessage,
      userMessage: 'Could not save this study output yet. Stay Focused still needs the latest saved-output database update.',
    }
  }

  if (
    code === '42501'
    || lower.includes('row-level security')
    || lower.includes('permission denied')
    || lower.includes('insufficient privilege')
  ) {
    return {
      diagnosticCode: 'permissions',
      diagnosticMessage,
      userMessage: 'Could not save this study output for your account right now. Try signing in again and retrying.',
    }
  }

  if (code === '23514' || lower.includes('check constraint')) {
    return {
      diagnosticCode: 'constraint_mismatch',
      diagnosticMessage,
      userMessage: 'Could not save this study output because its saved format is not accepted by the database yet.',
    }
  }

  return {
    diagnosticCode: 'unknown',
    diagnosticMessage,
    userMessage: 'Could not save the study output.',
  }
}
