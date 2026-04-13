import type {
  DeepLearnNote,
  DeepLearnNoteLoadAvailability,
  DeepLearnNoteLoadReason,
  DeepLearnNoteStatus,
} from '@/lib/types'
import {
  DEEP_LEARN_PROMPT_VERSION,
  buildDeepLearnNoteBody,
  buildDeepLearnNoteRecord,
  computeDeepLearnQuizReady,
  createEmptyDeepLearnSourceGrounding,
  normalizeDeepLearnSourceGrounding,
  normalizeDeepLearnStatus,
} from '@/lib/deep-learn'
import {
  getAuthenticatedSupabaseServerContext,
  type AuthenticatedSupabaseServerContext,
} from '@/lib/supabase-auth-app'
import { isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
import { serializeErrorForLogging } from '@/lib/supabase'

const TABLE_NAME = 'deep_learn_notes'

export interface DeepLearnNoteListResult {
  notes: DeepLearnNote[]
  availability: DeepLearnNoteLoadAvailability
  reason: DeepLearnNoteLoadReason
  message: string | null
  userId: string | null
}

export interface DeepLearnNoteResult {
  note: DeepLearnNote | null
  availability: DeepLearnNoteLoadAvailability
  reason: DeepLearnNoteLoadReason
  message: string | null
  userId: string | null
}

interface DeepLearnStoreDependencies {
  isAuthConfigured?: boolean
  getAuthContext?: () => Promise<AuthenticatedSupabaseServerContext | null>
  executeListModuleQuery?: (auth: AuthenticatedSupabaseServerContext, moduleId: string) => Promise<{ data: unknown[] | null; error: unknown | null }>
  executeResourceNoteQuery?: (auth: AuthenticatedSupabaseServerContext, moduleId: string, resourceId: string) => Promise<{ data: unknown | null; error: unknown | null }>
}

interface DeepLearnNoteRow {
  id: string
  user_id: string
  module_id: string
  course_id: string | null
  resource_id: string
  status: DeepLearnNoteStatus
  title: string | null
  overview: string | null
  sections: unknown
  note_body: string | null
  core_terms: unknown
  key_facts: unknown
  distinctions: unknown
  likely_quiz_points: unknown
  caution_notes: unknown
  source_grounding: unknown
  quiz_ready: boolean | null
  prompt_version: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  generated_at: string | null
}

export async function listDeepLearnNotesForModule(
  moduleId: string,
  dependencies: DeepLearnStoreDependencies = {},
): Promise<DeepLearnNoteListResult> {
  const isAuthConfigured = dependencies.isAuthConfigured ?? isSupabaseAuthConfigured
  if (!isAuthConfigured) {
    return buildUnavailableDeepLearnNoteListResult('not_configured', null)
  }

  const getAuthContext = dependencies.getAuthContext ?? getAuthenticatedSupabaseServerContext
  const executeListModuleQuery = dependencies.executeListModuleQuery ?? defaultExecuteListModuleQuery
  const auth = await getAuthContext()
  if (!auth) {
    return buildUnavailableDeepLearnNoteListResult('unauthenticated', null)
  }

  try {
    const { data, error } = await executeListModuleQuery(auth, moduleId)

    if (error) {
      const failure = classifyDeepLearnStoreFailure(error)
      if (failure.reason === 'missing') {
        return {
          notes: [],
          availability: 'available',
          reason: 'ok',
          message: null,
          userId: auth.user.id,
        }
      }

      logDeepLearnStoreFailure('list_failed', {
        moduleId,
        userId: auth.user.id,
        queryIntent: 'list_notes_for_module_learn',
        authConfigured: isAuthConfigured,
        failureReason: failure.reason,
        error,
      })
      return buildUnavailableDeepLearnNoteListResult(failure.reason, auth.user.id)
    }

    return {
      notes: (data ?? []).map((row) => adaptDeepLearnNoteRow(row as DeepLearnNoteRow)),
      availability: 'available',
      reason: 'ok',
      message: null,
      userId: auth.user.id,
    }
  } catch (error) {
    const failure = classifyDeepLearnStoreFailure(error)
    if (failure.reason === 'missing') {
      return {
        notes: [],
        availability: 'available',
        reason: 'ok',
        message: null,
        userId: auth.user.id,
      }
    }

    logDeepLearnStoreFailure('list_failed', {
      moduleId,
      userId: auth.user.id,
      queryIntent: 'list_notes_for_module_learn',
      authConfigured: isAuthConfigured,
      failureReason: failure.reason,
      error,
    })
    return buildUnavailableDeepLearnNoteListResult(failure.reason, auth.user.id)
  }
}

export async function getDeepLearnNoteForResource(
  moduleId: string,
  resourceId: string,
  dependencies: DeepLearnStoreDependencies = {},
): Promise<DeepLearnNoteResult> {
  const isAuthConfigured = dependencies.isAuthConfigured ?? isSupabaseAuthConfigured
  if (!isAuthConfigured) {
    return buildUnavailableDeepLearnNoteResult('not_configured', null)
  }

  const getAuthContext = dependencies.getAuthContext ?? getAuthenticatedSupabaseServerContext
  const executeResourceNoteQuery = dependencies.executeResourceNoteQuery ?? defaultExecuteResourceNoteQuery
  const auth = await getAuthContext()
  if (!auth) {
    return buildUnavailableDeepLearnNoteResult('unauthenticated', null)
  }

  try {
    const { data, error } = await executeResourceNoteQuery(auth, moduleId, resourceId)

    if (error) {
      const failure = classifyDeepLearnStoreFailure(error)
      if (failure.reason === 'missing') {
        return buildMissingDeepLearnNoteResult(auth.user.id)
      }

      logDeepLearnStoreFailure('load_failed', {
        moduleId,
        resourceId,
        userId: auth.user.id,
        queryIntent: 'load_note_for_resource',
        authConfigured: isAuthConfigured,
        failureReason: failure.reason,
        error,
      })
      return buildUnavailableDeepLearnNoteResult(failure.reason, auth.user.id)
    }

    if (!data) {
      return buildMissingDeepLearnNoteResult(auth.user.id)
    }

    return {
      note: adaptDeepLearnNoteRow(data as DeepLearnNoteRow),
      availability: 'available',
      reason: 'ok',
      message: null,
      userId: auth.user.id,
    }
  } catch (error) {
    const failure = classifyDeepLearnStoreFailure(error)
    if (failure.reason === 'missing') {
      return buildMissingDeepLearnNoteResult(auth.user.id)
    }

    logDeepLearnStoreFailure('load_failed', {
      moduleId,
      resourceId,
      userId: auth.user.id,
      queryIntent: 'load_note_for_resource',
      authConfigured: isAuthConfigured,
      failureReason: failure.reason,
      error,
    })
    return buildUnavailableDeepLearnNoteResult(failure.reason, auth.user.id)
  }
}

export async function saveDeepLearnNote(input: {
  moduleId: string
  courseId: string | null
  resourceId: string
  status: DeepLearnNoteStatus
  title?: string | null
  overview?: string | null
  sections?: DeepLearnNote['sections']
  noteBody?: string | null
  answerBank?: DeepLearnNote['answerBank']
  identificationItems?: DeepLearnNote['identificationItems']
  distinctions?: DeepLearnNote['distinctions']
  likelyQuizTargets?: DeepLearnNote['likelyQuizTargets']
  cautionNotes?: DeepLearnNote['cautionNotes']
  sourceGrounding?: DeepLearnNote['sourceGrounding']
  quizReady?: boolean
  promptVersion?: string
  errorMessage?: string | null
  generatedAt?: string | null
}) {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) {
    throw new Error('You need to sign in before saving Deep Learn exam prep packs.')
  }

  const sections = input.sections ?? []
  const answerBank = input.answerBank ?? []
  const identificationItems = input.identificationItems ?? []
  const distinctions = input.distinctions ?? []
  const likelyQuizTargets = input.likelyQuizTargets ?? []
  const cautionNotes = input.cautionNotes ?? []
  const sourceGrounding = normalizeDeepLearnSourceGrounding(input.sourceGrounding ?? createEmptyDeepLearnSourceGrounding())

  const row = {
    user_id: auth.user.id,
    module_id: input.moduleId,
    course_id: input.courseId,
    resource_id: input.resourceId,
    status: input.status,
    title: input.title ?? 'Exam Prep Pack',
    overview: input.overview ?? '',
    sections,
    note_body: input.noteBody ?? buildDeepLearnNoteBody(sections),
    core_terms: identificationItems,
    key_facts: answerBank,
    distinctions,
    likely_quiz_points: likelyQuizTargets,
    caution_notes: cautionNotes,
    source_grounding: sourceGrounding,
    quiz_ready: input.quizReady ?? computeDeepLearnQuizReady({
      answerBank,
      identificationItems,
      distinctions,
      likelyQuizTargets,
    }),
    prompt_version: input.promptVersion ?? DEEP_LEARN_PROMPT_VERSION,
    error_message: input.errorMessage ?? null,
    generated_at: input.generatedAt ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await auth.client
    .from(TABLE_NAME)
    .upsert(row, { onConflict: 'user_id,resource_id' })
    .select('*')
    .single()

  if (error || !data) {
    const failure = classifyDeepLearnStoreFailure(error)
    console.error('[deep-learn-store] save_failed', {
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      userId: auth.user.id,
      status: input.status,
      tableName: TABLE_NAME,
      queryIntent: 'save_note',
      failureReason: failure.reason,
      error: serializeErrorForLogging(error),
    })
    throw new Error('Could not save the exam prep pack.')
  }

  return adaptDeepLearnNoteRow(data as DeepLearnNoteRow)
}

function adaptDeepLearnNoteRow(row: DeepLearnNoteRow): DeepLearnNote {
  return buildDeepLearnNoteRecord({
    id: row.id,
    userId: row.user_id,
    moduleId: row.module_id,
    courseId: row.course_id,
    resourceId: row.resource_id,
    status: normalizeDeepLearnStatus(row.status),
    title: row.title ?? 'Exam Prep Pack',
    overview: row.overview ?? '',
    sections: Array.isArray(row.sections) ? row.sections as DeepLearnNote['sections'] : [],
    noteBody: row.note_body ?? '',
    answerBank: Array.isArray(row.key_facts) ? row.key_facts as DeepLearnNote['answerBank'] : [],
    identificationItems: Array.isArray(row.core_terms) ? row.core_terms as DeepLearnNote['identificationItems'] : [],
    distinctions: Array.isArray(row.distinctions) ? row.distinctions as DeepLearnNote['distinctions'] : [],
    likelyQuizTargets: Array.isArray(row.likely_quiz_points) ? row.likely_quiz_points as DeepLearnNote['likelyQuizTargets'] : [],
    cautionNotes: Array.isArray(row.caution_notes) ? row.caution_notes as DeepLearnNote['cautionNotes'] : [],
    sourceGrounding: normalizeDeepLearnSourceGrounding(row.source_grounding),
    quizReady: Boolean(row.quiz_ready),
    promptVersion: row.prompt_version ?? DEEP_LEARN_PROMPT_VERSION,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    generatedAt: row.generated_at,
  })
}

async function defaultExecuteListModuleQuery(auth: AuthenticatedSupabaseServerContext, moduleId: string) {
  return auth.client
    .from(TABLE_NAME)
    .select('*')
    .eq('module_id', moduleId)
    .order('updated_at', { ascending: false })
}

async function defaultExecuteResourceNoteQuery(auth: AuthenticatedSupabaseServerContext, moduleId: string, resourceId: string) {
  return auth.client
    .from(TABLE_NAME)
    .select('*')
    .eq('module_id', moduleId)
    .eq('resource_id', resourceId)
    .maybeSingle()
}

function buildUnavailableDeepLearnNoteListResult(reason: Exclude<DeepLearnNoteLoadReason, 'ok' | 'missing'>, userId: string | null): DeepLearnNoteListResult {
  return {
    notes: [],
    availability: 'unavailable',
    reason,
    message: messageForDeepLearnLoadReason(reason),
    userId,
  }
}

function buildMissingDeepLearnNoteResult(userId: string | null): DeepLearnNoteResult {
  return {
    note: null,
    availability: 'available',
    reason: 'missing',
    message: null,
    userId,
  }
}

function buildUnavailableDeepLearnNoteResult(reason: Exclude<DeepLearnNoteLoadReason, 'ok' | 'missing'>, userId: string | null): DeepLearnNoteResult {
  return {
    note: null,
    availability: 'unavailable',
    reason,
    message: messageForDeepLearnLoadReason(reason),
    userId,
  }
}

function classifyDeepLearnStoreFailure(error: unknown): { reason: Exclude<DeepLearnNoteLoadReason, 'ok' | 'not_configured' | 'unauthenticated'> } {
  const serialized = serializeErrorForLogging(error)
  const code = typeof serialized?.code === 'string' ? serialized.code : null
  const message = typeof serialized?.message === 'string'
    ? serialized.message.toLowerCase()
    : ''

  if (code === 'PGRST116' || message.includes('multiple (or no) rows returned')) {
    return { reason: 'missing' }
  }

  if (code === 'PGRST205' || code === '42P01' || message.includes('could not find the table') || message.includes('relation') && message.includes('does not exist')) {
    return { reason: 'table_missing' }
  }

  if (code === 'PGRST204' || code === '42703' || message.includes('column') && message.includes('does not exist')) {
    return { reason: 'column_missing' }
  }

  if (code === '42501' || message.includes('permission denied') || message.includes('insufficient privilege')) {
    return { reason: 'permission_denied' }
  }

  return { reason: 'query_failed' }
}

function messageForDeepLearnLoadReason(reason: Exclude<DeepLearnNoteLoadReason, 'ok' | 'missing'>) {
  if (reason === 'not_configured') {
    return 'Saved Deep Learn exam prep packs are unavailable because Supabase auth is not configured in this environment.'
  }

  if (reason === 'unauthenticated') {
    return 'Saved Deep Learn exam prep packs are unavailable until you are signed in.'
  }

  if (reason === 'table_missing') {
    return 'Saved Deep Learn exam prep packs are unavailable because the deep_learn_notes table is missing in this environment.'
  }

  if (reason === 'column_missing') {
    return 'Saved Deep Learn exam prep packs are unavailable because the database schema is behind the current code.'
  }

  if (reason === 'permission_denied') {
    return 'Saved Deep Learn exam prep packs are unavailable because this session cannot read them right now.'
  }

  return 'Saved Deep Learn exam prep packs are temporarily unavailable right now.'
}

function logDeepLearnStoreFailure(
  event: 'list_failed' | 'load_failed',
  input: {
    moduleId: string
    resourceId?: string
    userId: string | null
    queryIntent: string
    authConfigured: boolean
    failureReason: Exclude<DeepLearnNoteLoadReason, 'ok' | 'not_configured' | 'unauthenticated'>
    error: unknown
  },
) {
  console.error(`[deep-learn-store] ${event}`, {
    tableName: TABLE_NAME,
    moduleId: input.moduleId,
    resourceId: input.resourceId ?? null,
    userId: input.userId,
    queryIntent: input.queryIntent,
    authConfigured: input.authConfigured,
    failureReason: input.failureReason,
    error: serializeErrorForLogging(input.error),
  })
}
