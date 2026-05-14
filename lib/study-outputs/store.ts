import type {
  DraftShelfItem,
  StudyOutput,
  StudyOutputContent,
  StudyOutputKind,
  StudyOutputSourceKind,
  StudyOutputStatus,
} from '@/lib/types'
import { describeStudyOutputSaveFailure, StudyOutputSaveError } from '@/lib/study-output-errors'
import { validateStudyOutputSaveInput } from '@/lib/study-output-validation'
import { getAuthenticatedSupabaseServerContext } from '@/lib/supabase-auth-app'

const TABLE_NAME = 'study_outputs'

interface StudyOutputRow {
  id: string
  user_id: string
  course_id: string | null
  module_id: string | null
  resource_id: string | null
  source_kind: StudyOutputSourceKind
  source_note_id: string | null
  source_task_id: string | null
  output_kind: string
  status: StudyOutputStatus
  title: string | null
  summary: string | null
  content: unknown
  created_at: string
  updated_at: string
  generated_at: string | null
}

export async function saveStudyOutput(input: {
  existingId?: string | null
  courseId: string | null
  moduleId: string | null
  resourceId: string | null
  sourceKind: StudyOutputSourceKind
  sourceNoteId: string | null
  sourceTaskId: string | null
  outputKind: StudyOutputKind
  status: StudyOutputStatus
  title: string
  summary: string
  content: StudyOutputContent
  generatedAt: string | null
}) {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) {
    throw new Error('You need to sign in before saving this study output.')
  }

  const validationError = validateStudyOutputSaveInput(input)
  if (validationError) {
    throw new StudyOutputSaveError(validationError)
  }

  const row = {
    user_id: auth.user.id,
    course_id: input.courseId,
    module_id: input.moduleId,
    resource_id: input.resourceId,
    source_kind: input.sourceKind,
    source_note_id: input.sourceNoteId,
    source_task_id: input.sourceTaskId,
    output_kind: input.outputKind,
    status: input.status,
    title: input.title,
    summary: input.summary,
    content: input.content,
    generated_at: input.generatedAt,
    updated_at: new Date().toISOString(),
  }

  const query = input.existingId
    ? auth.client
      .from(TABLE_NAME)
      .update(row)
      .eq('id', input.existingId)
      .eq('user_id', auth.user.id)
      .select('*')
      .single()
    : input.sourceNoteId
      ? auth.client
        .from(TABLE_NAME)
        .upsert(row, { onConflict: 'user_id,output_kind,source_note_id' })
        .select('*')
        .single()
      : auth.client
        .from(TABLE_NAME)
        .insert(row)
        .select('*')
        .single()

  const { data, error } = await query

  if (error || !data) {
    const failure = describeStudyOutputSaveFailure(error ?? new Error('Study output save returned no row.'))
    console.error('[study-outputs] saveStudyOutput failed', {
      failureCode: failure.diagnosticCode,
      diagnostic: failure.diagnosticMessage,
      sourceKind: input.sourceKind,
      outputKind: input.outputKind,
      sourceNoteId: input.sourceNoteId,
      sourceTaskId: input.sourceTaskId,
    })
    throw new StudyOutputSaveError(failure, { cause: error ?? undefined })
  }

  return adaptStudyOutputRow(data as StudyOutputRow)
}

export async function getStudyOutputById(id: string): Promise<StudyOutput | null> {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) return null

  const { data } = await auth.client
    .from(TABLE_NAME)
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (!data) return null
  return adaptStudyOutputRow(data as StudyOutputRow)
}

export async function listDeepLearnStudyOutputsForNote(noteId: string): Promise<StudyOutput[]> {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) return []

  const { data, error } = await auth.client
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', auth.user.id)
    .eq('source_note_id', noteId)
    .eq('source_kind', 'deep_learn_note')
    .eq('status', 'ready')
    .order('updated_at', { ascending: false })

  if (error || !data) return []

  return (data as StudyOutputRow[]).map(adaptStudyOutputRow)
}

export async function listDeepLearnStudyOutputsForNotes(noteIds: string[]): Promise<StudyOutput[]> {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) return []

  const uniqueNoteIds = [...new Set(noteIds.filter((id) => id.trim().length > 0))]
  if (uniqueNoteIds.length === 0) return []

  const { data, error } = await auth.client
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', auth.user.id)
    .eq('source_kind', 'deep_learn_note')
    .eq('status', 'ready')
    .in('source_note_id', uniqueNoteIds)
    .order('updated_at', { ascending: false })

  if (error || !data) return []

  return (data as StudyOutputRow[]).map(adaptStudyOutputRow)
}

export async function listStudyOutputShelfItems(): Promise<DraftShelfItem[]> {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) return []

  const { data, error } = await auth.client
    .from(TABLE_NAME)
    .select('id, user_id, course_id, module_id, resource_id, source_note_id, source_task_id, output_kind, status, title, summary, created_at, updated_at, modules!module_id ( title ), tasks!source_task_id ( title )')
    .eq('user_id', auth.user.id)
    .eq('status', 'ready')
    .order('updated_at', { ascending: false })

  if (error) {
    return []
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    const moduleRow = record.modules as { title: string } | null
    const taskRow = record.tasks as { title: string } | null
    const outputKind = typeof record.output_kind === 'string' ? record.output_kind : null
    const isTaskOutput = outputKind === 'task_output' || typeof record.source_task_id === 'string'

    return {
      id: record.id as string,
      entryKind: 'study_output',
      userId: record.user_id as string,
      courseId: (record.course_id as string | null) ?? null,
      canonicalSourceId: `study_output:${record.id as string}`,
      title: (record.title as string | null) ?? 'Study output',
      draftType: null,
      status: 'ready',
      sourceType: isTaskOutput ? 'task' : 'module_resource',
      sourceTitle: isTaskOutput
        ? ((taskRow?.title ?? record.title) as string | null) ?? 'Activity'
        : ((record.title as string | null) ?? 'Study output'),
      tokenCount: null,
      updatedAt: record.updated_at as string,
      createdAt: record.created_at as string,
      sourceModuleId: (record.module_id as string | null) ?? null,
      sourceResourceId: (record.resource_id as string | null) ?? null,
      moduleTitle: moduleRow?.title ?? null,
      quizReady: false,
      summary: (record.summary as string | null) ?? null,
      studyOutputKind: outputKind as StudyOutputKind,
      sourceNoteId: (record.source_note_id as string | null) ?? null,
      sourceTaskId: (record.source_task_id as string | null) ?? null,
    } satisfies DraftShelfItem
  })
}

function adaptStudyOutputRow(row: StudyOutputRow): StudyOutput {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    moduleId: row.module_id,
    resourceId: row.resource_id,
    sourceKind: row.source_kind,
    sourceNoteId: row.source_note_id,
    sourceTaskId: row.source_task_id,
    outputKind: row.output_kind as StudyOutputKind,
    status: row.status,
    title: row.title ?? 'Study output',
    summary: row.summary ?? '',
    content: row.content as StudyOutputContent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    generatedAt: row.generated_at,
  }
}

export async function findTaskOutputStudyOutput(input: {
  taskId: string
  preset: string
  outputType: string
}): Promise<StudyOutput | null> {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) return null

  const { data, error } = await auth.client
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', auth.user.id)
    .eq('output_kind', 'task_output')
    .eq('source_kind', 'task')
    .eq('source_task_id', input.taskId)
    .order('updated_at', { ascending: false })

  if (error || !data) return null

  const matching = (data as StudyOutputRow[])
    .map(adaptStudyOutputRow)
    .find((row) => {
      const content = row.content as unknown as Record<string, unknown>
      return content.version === 'task-output-v1'
        && content.preset === input.preset
        && content.outputType === input.outputType
    })

  return matching ?? null
}
