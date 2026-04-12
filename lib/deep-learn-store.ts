import type { DeepLearnNote, DeepLearnNoteStatus } from '@/lib/types'
import {
  DEEP_LEARN_PROMPT_VERSION,
  buildDeepLearnNoteBody,
  buildDeepLearnNoteRecord,
  computeDeepLearnQuizReady,
  createEmptyDeepLearnSourceGrounding,
  normalizeDeepLearnSourceGrounding,
  normalizeDeepLearnStatus,
} from '@/lib/deep-learn'
import { getAuthenticatedSupabaseServerContext } from '@/lib/supabase-auth-app'
import { serializeErrorForLogging } from '@/lib/supabase'

const TABLE_NAME = 'deep_learn_notes'

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

export async function listDeepLearnNotesForModule(moduleId: string) {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) return []

  const { data, error } = await auth.client
    .from(TABLE_NAME)
    .select('*')
    .eq('module_id', moduleId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[deep-learn-store] list_failed', {
      moduleId,
      error: serializeErrorForLogging(error),
    })
    throw new Error('Could not load Deep Learn notes.')
  }

  return (data ?? []).map((row) => adaptDeepLearnNoteRow(row as DeepLearnNoteRow))
}

export async function getDeepLearnNoteForResource(moduleId: string, resourceId: string) {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) return null

  const { data, error } = await auth.client
    .from(TABLE_NAME)
    .select('*')
    .eq('module_id', moduleId)
    .eq('resource_id', resourceId)
    .maybeSingle()

  if (error) {
    console.error('[deep-learn-store] load_failed', {
      moduleId,
      resourceId,
      error: serializeErrorForLogging(error),
    })
    throw new Error('Could not load the Deep Learn note.')
  }

  return data ? adaptDeepLearnNoteRow(data as DeepLearnNoteRow) : null
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
  coreTerms?: DeepLearnNote['coreTerms']
  keyFacts?: DeepLearnNote['keyFacts']
  distinctions?: DeepLearnNote['distinctions']
  likelyQuizPoints?: DeepLearnNote['likelyQuizPoints']
  cautionNotes?: DeepLearnNote['cautionNotes']
  sourceGrounding?: DeepLearnNote['sourceGrounding']
  quizReady?: boolean
  promptVersion?: string
  errorMessage?: string | null
  generatedAt?: string | null
}) {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) {
    throw new Error('You need to sign in before saving Deep Learn notes.')
  }

  const sections = input.sections ?? []
  const coreTerms = input.coreTerms ?? []
  const keyFacts = input.keyFacts ?? []
  const distinctions = input.distinctions ?? []
  const likelyQuizPoints = input.likelyQuizPoints ?? []
  const cautionNotes = input.cautionNotes ?? []
  const sourceGrounding = normalizeDeepLearnSourceGrounding(input.sourceGrounding ?? createEmptyDeepLearnSourceGrounding())

  const row = {
    user_id: auth.user.id,
    module_id: input.moduleId,
    course_id: input.courseId,
    resource_id: input.resourceId,
    status: input.status,
    title: input.title ?? 'Deep Learn note',
    overview: input.overview ?? '',
    sections,
    note_body: input.noteBody ?? buildDeepLearnNoteBody(sections),
    core_terms: coreTerms,
    key_facts: keyFacts,
    distinctions,
    likely_quiz_points: likelyQuizPoints,
    caution_notes: cautionNotes,
    source_grounding: sourceGrounding,
    quiz_ready: input.quizReady ?? computeDeepLearnQuizReady({
      coreTerms,
      keyFacts,
      distinctions,
      likelyQuizPoints,
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
    console.error('[deep-learn-store] save_failed', {
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      status: input.status,
      error: serializeErrorForLogging(error),
    })
    throw new Error('Could not save the Deep Learn note.')
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
    title: row.title ?? 'Deep Learn note',
    overview: row.overview ?? '',
    sections: Array.isArray(row.sections) ? row.sections as DeepLearnNote['sections'] : [],
    noteBody: row.note_body ?? '',
    coreTerms: Array.isArray(row.core_terms) ? row.core_terms as DeepLearnNote['coreTerms'] : [],
    keyFacts: Array.isArray(row.key_facts) ? row.key_facts as DeepLearnNote['keyFacts'] : [],
    distinctions: Array.isArray(row.distinctions) ? row.distinctions as DeepLearnNote['distinctions'] : [],
    likelyQuizPoints: Array.isArray(row.likely_quiz_points) ? row.likely_quiz_points as DeepLearnNote['likelyQuizPoints'] : [],
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
