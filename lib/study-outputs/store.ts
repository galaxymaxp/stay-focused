import type {
  DraftShelfItem,
  StudyOutput,
  StudyOutputContent,
  StudyOutputKind,
  StudyOutputSourceKind,
  StudyOutputStatus,
} from '@/lib/types'
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
  output_kind: StudyOutputKind
  status: StudyOutputStatus
  title: string | null
  summary: string | null
  content: unknown
  created_at: string
  updated_at: string
  generated_at: string | null
}

export async function saveStudyOutput(input: {
  courseId: string | null
  moduleId: string | null
  resourceId: string | null
  sourceKind: StudyOutputSourceKind
  sourceNoteId: string | null
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

  const row = {
    user_id: auth.user.id,
    course_id: input.courseId,
    module_id: input.moduleId,
    resource_id: input.resourceId,
    source_kind: input.sourceKind,
    source_note_id: input.sourceNoteId,
    output_kind: input.outputKind,
    status: input.status,
    title: input.title,
    summary: input.summary,
    content: input.content,
    generated_at: input.generatedAt,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await auth.client
    .from(TABLE_NAME)
    .upsert(row, { onConflict: 'user_id,output_kind,source_note_id' })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error('Could not save the study output.')
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

export async function listStudyOutputShelfItems(): Promise<DraftShelfItem[]> {
  const auth = await getAuthenticatedSupabaseServerContext()
  if (!auth) return []

  const { data, error } = await auth.client
    .from(TABLE_NAME)
    .select('id, user_id, course_id, module_id, resource_id, source_note_id, output_kind, status, title, summary, created_at, updated_at, modules!module_id ( title )')
    .eq('user_id', auth.user.id)
    .eq('status', 'ready')
    .order('updated_at', { ascending: false })

  if (error) {
    return []
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    const moduleRow = record.modules as { title: string } | null
    const outputKind = record.output_kind as StudyOutputKind

    return {
      id: record.id as string,
      entryKind: 'study_output',
      userId: record.user_id as string,
      courseId: (record.course_id as string | null) ?? null,
      canonicalSourceId: `study_output:${record.id as string}`,
      title: (record.title as string | null) ?? 'Study output',
      draftType: null,
      status: 'ready',
      sourceType: 'module_resource',
      sourceTitle: (record.title as string | null) ?? 'Study output',
      tokenCount: null,
      updatedAt: record.updated_at as string,
      createdAt: record.created_at as string,
      sourceModuleId: (record.module_id as string | null) ?? null,
      sourceResourceId: (record.resource_id as string | null) ?? null,
      moduleTitle: moduleRow?.title ?? null,
      quizReady: false,
      summary: (record.summary as string | null) ?? null,
      studyOutputKind: outputKind,
      sourceNoteId: (record.source_note_id as string | null) ?? null,
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
    outputKind: row.output_kind,
    status: row.status,
    title: row.title ?? 'Study output',
    summary: row.summary ?? '',
    content: row.content as StudyOutputContent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    generatedAt: row.generated_at,
  }
}
