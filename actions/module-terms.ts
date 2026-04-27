'use server'

import { revalidatePath } from 'next/cache'
import { buildModuleLearnOverview } from '@/lib/module-learn-overview'
import { buildModuleTermBank } from '@/lib/module-term-bank'
import { supabase } from '@/lib/supabase'
import { buildLearnExperience, getModuleWorkspace } from '@/lib/module-workspace'
import type { ModuleTermOrigin, ModuleTermStatus } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'

const TABLE_NAME = 'module_terms'

export async function saveModuleTerm(input: {
  id?: string
  moduleId: string
  courseId?: string
  resourceId?: string | null
  term: string
  definition?: string | null
  explanation?: string | null
  evidenceSnippet?: string | null
  sourceLabel?: string | null
  origin?: ModuleTermOrigin
  status?: ModuleTermStatus
}) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const term = input.term.trim()
  const normalizedTerm = normalizeTerm(term)
  if (!normalizedTerm) {
    throw new Error('A term is required before it can be saved.')
  }

  const row = {
    module_id: input.moduleId,
    resource_id: input.resourceId ?? null,
    normalized_term: normalizedTerm,
    term,
    definition: cleanNullable(input.definition),
    explanation: cleanNullable(input.explanation),
    evidence_snippet: cleanNullable(input.evidenceSnippet),
    source_label: cleanNullable(input.sourceLabel),
    origin: input.origin ?? 'user',
    status: input.status ?? 'approved',
    updated_at: new Date().toISOString(),
  }

  const result = input.id
    ? await supabase.from(TABLE_NAME).update(row).eq('id', input.id)
    : await supabase.from(TABLE_NAME).upsert(row, { onConflict: 'module_id,normalized_term' })

  if (result.error) throw createModuleTermError(input.id ? 'update module term' : 'save module term', result.error, input)

  revalidateTermPaths(input.moduleId, input.courseId)
}

export async function rejectModuleTerm(input: {
  id?: string
  moduleId: string
  courseId?: string
  resourceId?: string | null
  term: string
  evidenceSnippet?: string | null
  sourceLabel?: string | null
  origin?: ModuleTermOrigin
}) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const term = input.term.trim()
  const normalizedTerm = normalizeTerm(term)
  if (!normalizedTerm) {
    throw new Error('A term is required before it can be removed.')
  }

  const row = {
    module_id: input.moduleId,
    resource_id: input.resourceId ?? null,
    normalized_term: normalizedTerm,
    term,
    evidence_snippet: cleanNullable(input.evidenceSnippet),
    source_label: cleanNullable(input.sourceLabel),
    origin: input.origin ?? 'ai',
    status: 'rejected' as const,
    updated_at: new Date().toISOString(),
  }

  const result = input.id
    ? await supabase.from(TABLE_NAME).update(row).eq('id', input.id)
    : await supabase.from(TABLE_NAME).upsert(row, { onConflict: 'module_id,normalized_term' })

  if (result.error) throw createModuleTermError(input.id ? 'reject existing term' : 'reject generated term', result.error, input)

  revalidateTermPaths(input.moduleId, input.courseId)
}

export async function resetModuleReviewer(input: {
  moduleId: string
  courseId?: string
}) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const result = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('module_id', input.moduleId)
    .eq('origin', 'ai')

  if (result.error) throw createModuleTermError('reset module reviewer', result.error, input)

  revalidateTermPaths(input.moduleId, input.courseId)
}

export async function populateModuleTerms(input: {
  moduleId: string
  courseId?: string
}, supabaseClient?: SupabaseClient) {
  const db = supabaseClient ?? supabase
  if (!db) throw new Error('Supabase is not configured.')

  const workspace = await getModuleWorkspace(input.moduleId, db)
  if (!workspace) {
    throw new Error('The module could not be loaded for term population.')
  }

  const { module, tasks, deadlines, resources, resourceStudyStates, terms } = workspace
  const experience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount: deadlines.length,
    resources,
    resourceStudyStates,
  })
  const overview = buildModuleLearnOverview({
    moduleId: module.id,
    resources: experience.resources,
    doItems: experience.doItems,
    tasks,
  })
  const termBank = buildModuleTermBank({
    overview,
    storedTerms: terms,
  })

  const autoTerms = termBank.finalTerms.filter((term) => term.origin === 'auto')
  if (autoTerms.length === 0) {
    revalidateTermPaths(input.moduleId, input.courseId)
    return {
      populatedCount: 0,
      finalTermCount: termBank.finalTerms.length,
    }
  }

  const now = new Date().toISOString()
  const result = await db
    .from(TABLE_NAME)
    .upsert(
      autoTerms.map((term) => ({
        module_id: input.moduleId,
        resource_id: term.resourceId,
        normalized_term: term.key,
        term: term.term,
        definition: cleanNullable(term.definition),
        explanation: cleanNullable(term.explanation),
        evidence_snippet: cleanNullable(term.evidenceSnippet),
        source_label: cleanNullable(term.sourceLabel),
        origin: 'ai',
        status: 'approved',
        updated_at: now,
      })),
      { onConflict: 'module_id,normalized_term' },
    )

  if (result.error) throw createModuleTermError('populate module terms', result.error, {
    moduleId: input.moduleId,
    candidateCount: autoTerms.length,
  })

  revalidateTermPaths(input.moduleId, input.courseId)

  return {
    populatedCount: autoTerms.length,
    finalTermCount: termBank.finalTerms.length,
  }
}

type SupabaseLikeError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function revalidateTermPaths(moduleId: string, courseId?: string) {
  revalidatePath('/learn')
  revalidatePath('/courses')
  if (courseId) {
    revalidatePath(`/courses/${courseId}`)
  }
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath(`/modules/${moduleId}/learn`)
  revalidatePath(`/modules/${moduleId}/review`)
  revalidatePath(`/modules/${moduleId}/source`)
}

function normalizeTerm(term: string) {
  return term.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function cleanNullable(value: string | null | undefined) {
  const cleaned = value?.trim()
  return cleaned ? cleaned : null
}

function createModuleTermError(step: string, error: SupabaseLikeError | null | undefined, context?: Record<string, unknown>) {
  const code = error?.code ?? null
  const message = error?.message ?? 'Unknown Supabase error.'
  const details = error?.details ?? null
  const hint = error?.hint ?? null
  const contextText = context ? ` context=${JSON.stringify(context)}` : ''
  const migrationHelp = isMissingSchemaObjectError(error)
    ? ' Missing newer schema objects in the connected Supabase project. Apply supabase/migrations/20260408_add_module_terms.sql and refresh the PostgREST schema cache.'
    : ''
  const diagnostic = `[Module terms] step=${step} code=${code ?? 'unknown'} message=${message}${details ? ` details=${details}` : ''}${hint ? ` hint=${hint}` : ''}${migrationHelp}${contextText}`

  console.error(diagnostic)

  if (process.env.NODE_ENV !== 'production') {
    return new Error(diagnostic)
  }

  return new Error(isMissingSchemaObjectError(error)
    ? 'Term curation hit a schema mismatch in Supabase. Apply the latest migration and retry.'
    : `Term curation could not be saved during ${step}.`)
}

function isMissingSchemaObjectError(error: SupabaseLikeError | null | undefined) {
  return error?.code === 'PGRST204' || error?.code === 'PGRST205'
}
