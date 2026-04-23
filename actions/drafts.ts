'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import OpenAI from 'openai'
import { getRequiredSupabaseAuthEnv, isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
import type { TaskDraftContext, TaskDraftResponse } from '@/lib/do-now'
import { getDraftPrompt } from '@/lib/prompts/drafts/index'
import {
  buildLearnExperience,
  getModuleWorkspace,
  resolveLearnResourceSelection,
} from '@/lib/module-workspace'
import type {
  Draft,
  DraftLoadAvailability,
  DraftSummary,
  DraftType,
  DraftStatus,
  DraftSourceType,
  DraftShelfItem,
} from '@/lib/types'

// Auth-aware Supabase client — uses cookie session so auth.uid() works in RLS
async function createDraftsClient() {
  const cookieStore = await cookies()
  const { supabaseUrl, supabaseAnonKey } = getRequiredSupabaseAuthEnv()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // setAll may fail in read-only server component contexts
        }
      },
    },
  })
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  return new OpenAI({ apiKey })
}

interface GenerateResult {
  title: string
  body_markdown: string
  metadata: Record<string, unknown>
  tokenCount: number
  model: string
}

async function generateDraftContent(rawContent: string, draftType: DraftType): Promise<GenerateResult> {
  const model = 'gpt-4o'
  const openai = getOpenAIClient()
  const { systemPrompt } = getDraftPrompt(draftType)

  // Chunk if content is very long — preserve beginning and end with middle summary
  const MAX_CHARS = 80000
  let content = rawContent
  if (content.length > MAX_CHARS) {
    const chunkSize = Math.floor(MAX_CHARS / 2)
    const start = content.slice(0, chunkSize)
    const end = content.slice(-chunkSize)
    content = `${start}\n\n[... middle section omitted for length ...]\n\n${end}`
  }

  const response = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Generate a ${draftType.replace(/_/g, ' ')} from this source material:\n\n${content}`,
      },
    ],
    max_tokens: 16384,
    temperature: 0.2,
  })

  const choice = response.choices[0]
  if (choice.finish_reason === 'length') {
    throw new Error('AI response truncated — content may be too long')
  }

  const raw = choice?.message?.content
  if (!raw) throw new Error('Empty response from OpenAI')

  let parsed: { title?: string; body_markdown?: string; metadata?: Record<string, unknown> }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Failed to parse AI response: ${raw.slice(0, 200)}`)
  }

  if (!parsed.title || !parsed.body_markdown) {
    throw new Error('AI response missing required fields: title or body_markdown')
  }

  return {
    title: parsed.title,
    body_markdown: parsed.body_markdown,
    metadata: parsed.metadata ?? {},
    tokenCount: response.usage?.total_tokens ?? 0,
    model,
  }
}

function mapDraftRow(row: Record<string, unknown>): Draft {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    courseId: (row.course_id as string | null) ?? null,
    sourceType: row.source_type as Draft['sourceType'],
    canonicalSourceId: ((row.canonical_source_id as string | null) ?? `legacy:${row.id as string}`),
    sourceModuleId: (row.source_module_id as string | null) ?? null,
    sourceResourceId: (row.source_resource_id as string | null) ?? null,
    sourceFilePath: (row.source_file_path as string | null) ?? null,
    sourceRawContent: (row.source_raw_content as string) ?? '',
    sourceTitle: row.source_title as string,
    draftType: row.draft_type as DraftType,
    title: row.title as string,
    bodyMarkdown: (row.body_markdown as string) ?? '',
    status: row.status as Draft['status'],
    refinementHistory: (row.refinement_history as Draft['refinementHistory']) ?? [],
    tokenCount: (row.token_count as number | null) ?? null,
    generationModel: (row.generation_model as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapDraftSummaryRow(row: Record<string, unknown>): DraftSummary {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    courseId: (row.course_id as string | null) ?? null,
    sourceType: row.source_type as Draft['sourceType'],
    canonicalSourceId: ((row.canonical_source_id as string | null) ?? `legacy:${row.id as string}`),
    sourceModuleId: (row.source_module_id as string | null) ?? null,
    sourceResourceId: (row.source_resource_id as string | null) ?? null,
    sourceTitle: row.source_title as string,
    draftType: row.draft_type as DraftType,
    title: row.title as string,
    status: row.status as Draft['status'],
    tokenCount: (row.token_count as number | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function revalidateUnifiedDraftPaths(input: {
  courseId: string | null
  moduleId: string | null
  resourceId: string | null
  draftId?: string | null
}) {
  revalidatePath('/drafts')

  if (input.draftId) {
    revalidatePath(`/drafts/${input.draftId}`)
  }

  if (input.courseId) {
    revalidatePath(`/courses/${input.courseId}`)
  }

  if (input.moduleId) {
    revalidatePath(`/modules/${input.moduleId}/learn`)
    revalidatePath(`/modules/${input.moduleId}/do`)
  }

  if (input.moduleId && input.resourceId) {
    revalidatePath(`/modules/${input.moduleId}/learn/resources/${encodeURIComponent(input.resourceId)}`)
    revalidatePath(`/modules/${input.moduleId}/learn/notes/${encodeURIComponent(input.resourceId)}`)
  }
}

function buildModuleResourceCanonicalSourceId(resourceId: string) {
  return `resource:${resourceId}`
}

function buildTaskCanonicalSourceId(taskId: string, fallbackSourceKey?: string | null) {
  return taskId ? `task:${taskId}` : `task-fallback:${fallbackSourceKey ?? 'unknown'}`
}

function buildTaskDraftMarkdown(draft: TaskDraftResponse) {
  return [
    '# Working Draft',
    '',
    draft.draftOutput.trim(),
    '',
    '## Requirement Summary',
    draft.requirementSummary.trim(),
    '',
    '## Missing Or Unclear',
    draft.missingDetails.trim(),
    '',
    '## What To Do Right Now',
    draft.paperAction.trim(),
    '',
    '## Smallest Next Step',
    draft.smallestNextStep.trim(),
  ].join('\n')
}

function buildTaskDraftTitle(context: TaskDraftContext) {
  return context.taskTitle.trim() || context.sourceTitle?.trim() || 'Task draft'
}

// ─── Public actions ────────────────────────────────────────────────────────

export async function listDraftsForShelves(): Promise<{
  drafts: DraftShelfItem[]
  courses: Array<{ id: string; name: string; code: string }>
}> {
  if (!isSupabaseAuthConfigured) return { drafts: [], courses: [] }

  const client = await createDraftsClient()

  const { data: draftRows } = await client
    .from('drafts')
    .select(
      'id, user_id, course_id, source_type, canonical_source_id, source_module_id, source_resource_id, source_title, draft_type, title, status, token_count, created_at, updated_at, modules!source_module_id ( course_id, title )'
    )
    .order('updated_at', { ascending: false })

  const drafts: DraftShelfItem[] = (draftRows ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const mod = r.modules as { course_id: string | null; title: string } | null
    return {
      id: r.id as string,
      userId: r.user_id as string,
      courseId: (r.course_id as string | null) ?? mod?.course_id ?? null,
      canonicalSourceId: ((r.canonical_source_id as string | null) ?? `legacy:${r.id as string}`),
      title: r.title as string,
      draftType: r.draft_type as DraftType,
      status: r.status as DraftStatus,
      sourceType: r.source_type as DraftSourceType,
      sourceTitle: r.source_title as string,
      tokenCount: (r.token_count as number | null) ?? null,
      updatedAt: r.updated_at as string,
      createdAt: r.created_at as string,
      sourceModuleId: (r.source_module_id as string | null) ?? null,
      sourceResourceId: (r.source_resource_id as string | null) ?? null,
      moduleTitle: mod?.title ?? null,
    }
  })

  const courseIds = [...new Set(drafts.flatMap((d) => (d.courseId ? [d.courseId] : [])))]

  let courses: Array<{ id: string; name: string; code: string }> = []
  if (courseIds.length > 0) {
    const { data: courseRows } = await client
      .from('courses')
      .select('id, name, code')
      .in('id', courseIds)
    courses = (courseRows ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      code: r.code as string,
    }))
  }

  return { drafts, courses }
}

export async function listDrafts(): Promise<DraftSummary[]> {
  if (!isSupabaseAuthConfigured) return []

  const client = await createDraftsClient()
  const { data } = await client
    .from('drafts')
    .select('id, user_id, course_id, source_type, canonical_source_id, source_module_id, source_resource_id, source_title, draft_type, title, status, token_count, created_at, updated_at')
    .order('updated_at', { ascending: false })

  return (data ?? []).map((row) => mapDraftSummaryRow(row as Record<string, unknown>))
}

export async function getDraft(draftId: string): Promise<Draft | null> {
  if (!isSupabaseAuthConfigured) return null

  const client = await createDraftsClient()
  const { data } = await client
    .from('drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle()

  if (!data) return null
  return mapDraftRow(data as Record<string, unknown>)
}

export async function getDraftForDeepLearnResource(
  moduleId: string,
  resourceId: string,
): Promise<{
  draft: Draft | null
  availability: DraftLoadAvailability
  message: string | null
}> {
  if (!isSupabaseAuthConfigured) {
    return {
      draft: null,
      availability: 'unavailable',
      message: 'Draft loading is unavailable because Supabase is not configured.',
    }
  }

  const client = await createDraftsClient()
  const canonicalSourceId = buildModuleResourceCanonicalSourceId(resourceId)
  const { data, error } = await client
    .from('drafts')
    .select('*')
    .eq('source_module_id', moduleId)
    .eq('canonical_source_id', canonicalSourceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return {
      draft: null,
      availability: 'failed',
      message: 'Draft could not be loaded for this Deep Learn item.',
    }
  }

  return {
    draft: data ? mapDraftRow(data as Record<string, unknown>) : null,
    availability: 'available',
    message: null,
  }
}

export async function createDraftForDeepLearnResource(input: {
  moduleId: string
  resourceId: string
  courseId?: string | null
  draftType?: DraftType
}): Promise<{ draftId: string; moduleId: string; resourceId: string }> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) throw new Error('You must be signed in to create a draft.')

  const workspace = await getModuleWorkspace(input.moduleId)
  if (!workspace) throw new Error('The module could not be loaded for Draft.')

  const experience = buildLearnExperience(workspace.module, {
    taskCount: workspace.tasks.length,
    deadlineCount: workspace.deadlines.length,
    resources: workspace.resources,
    resourceStudyStates: workspace.resourceStudyStates,
  })
  const selection = resolveLearnResourceSelection(experience, workspace.resources, input.resourceId)
  if (!selection) throw new Error('The selected study resource is not available in Learn.')

  const canonicalResourceId = selection.canonicalResourceId
  if (!canonicalResourceId) {
    throw new Error('Draft needs a synced resource record before it can save a draft for this item.')
  }

  const existing = await getDraftForDeepLearnResource(workspace.module.id, canonicalResourceId)
  if (existing.draft) {
    return { draftId: existing.draft.id, moduleId: workspace.module.id, resourceId: canonicalResourceId }
  }
  if (existing.availability === 'failed') {
    throw new Error(existing.message ?? 'Draft could not confirm whether this item already has a draft.')
  }

  const sourceResource = selection.storedResource
  const renderedResource = selection.resource
  const rawContent = (
    sourceResource?.extractedText
    ?? renderedResource.extractedText
    ?? sourceResource?.extractedTextPreview
    ?? renderedResource.extractedTextPreview
    ?? ''
  ).trim()
  if (!rawContent) throw new Error('This resource has no extracted source text for Draft yet.')

  const draftType = input.draftType ?? 'study_notes'
  const sourceTitle = renderedResource.title || sourceResource?.title || workspace.module.title
  const { data: draft, error: insertError } = await client
    .from('drafts')
    .insert({
      user_id: user.id,
      course_id: workspace.module.courseId ?? null,
      source_type: 'module_resource',
      canonical_source_id: buildModuleResourceCanonicalSourceId(canonicalResourceId),
      source_module_id: workspace.module.id,
      source_resource_id: canonicalResourceId,
      source_file_path: `module_resource:${canonicalResourceId}`,
      source_raw_content: rawContent,
      source_title: sourceTitle,
      draft_type: draftType,
      title: `${draftType.replace(/_/g, ' ')} - ${sourceTitle}`,
      body_markdown: '',
      status: 'generating',
    })
    .select('id')
    .single()

  if (insertError || !draft) {
    const refreshedExisting = await getDraftForDeepLearnResource(workspace.module.id, canonicalResourceId)
    if (refreshedExisting.draft) {
      return { draftId: refreshedExisting.draft.id, moduleId: workspace.module.id, resourceId: canonicalResourceId }
    }
    throw new Error('Failed to create draft record.')
  }

  const draftId = draft.id as string

  try {
    const result = await generateDraftContent(rawContent, draftType)
    await client
      .from('drafts')
      .update({
        title: result.title,
        body_markdown: result.body_markdown,
        status: 'ready',
        token_count: result.tokenCount,
        generation_model: result.model,
      })
      .eq('id', draftId)
  } catch {
    await client.from('drafts').update({ status: 'failed' }).eq('id', draftId)
  }

  revalidateUnifiedDraftPaths({
    courseId: workspace.module.courseId ?? null,
    moduleId: workspace.module.id,
    resourceId: canonicalResourceId,
    draftId,
  })

  return { draftId, moduleId: workspace.module.id, resourceId: canonicalResourceId }
}

export async function saveDraftFromTaskOutput(input: {
  context: TaskDraftContext
  draft: TaskDraftResponse
}): Promise<{ draftId: string }> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')
  if (!input.context.moduleId) throw new Error('Task drafts need a module context.')

  const client = await createDraftsClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) throw new Error('You must be signed in to save a draft.')

  const canonicalSourceId = buildTaskCanonicalSourceId(
    input.context.taskId ?? '',
    input.context.sourceHref ?? input.context.canvasUrl ?? input.context.learnHref ?? input.context.taskTitle,
  )
  const rawContent = (
    input.context.sourceText
    ?? input.context.resourceSnippet
    ?? input.context.taskDetails
    ?? input.context.moduleSummary
    ?? input.context.taskTitle
  ).trim()
  const title = buildTaskDraftTitle(input.context)
  const bodyMarkdown = buildTaskDraftMarkdown(input.draft)

  const { data: existing } = await client
    .from('drafts')
    .select('id')
    .eq('canonical_source_id', canonicalSourceId)
    .maybeSingle()

  if (existing?.id) {
    await client
      .from('drafts')
      .update({
        course_id: input.context.courseId ?? null,
        source_type: 'task',
        source_module_id: input.context.moduleId,
        source_resource_id: null,
        source_file_path: input.context.sourceHref ?? input.context.canvasUrl ?? input.context.learnHref ?? null,
        source_raw_content: rawContent,
        source_title: input.context.sourceTitle?.trim() || input.context.taskTitle.trim(),
        draft_type: 'study_notes',
        title,
        body_markdown: bodyMarkdown,
        status: 'ready',
      })
      .eq('id', existing.id as string)

    revalidateUnifiedDraftPaths({
      courseId: input.context.courseId ?? null,
      moduleId: input.context.moduleId,
      resourceId: null,
      draftId: existing.id as string,
    })

    return { draftId: existing.id as string }
  }

  const { data: created, error } = await client
    .from('drafts')
    .insert({
      user_id: user.id,
      course_id: input.context.courseId ?? null,
      source_type: 'task',
      canonical_source_id: canonicalSourceId,
      source_module_id: input.context.moduleId,
      source_resource_id: null,
      source_file_path: input.context.sourceHref ?? input.context.canvasUrl ?? input.context.learnHref ?? null,
      source_raw_content: rawContent,
      source_title: input.context.sourceTitle?.trim() || input.context.taskTitle.trim(),
      draft_type: 'study_notes',
      title,
      body_markdown: bodyMarkdown,
      status: 'ready',
    })
    .select('id')
    .single()

  if (error || !created) throw new Error('Failed to save task draft.')

  revalidateUnifiedDraftPaths({
    courseId: input.context.courseId ?? null,
    moduleId: input.context.moduleId,
    resourceId: null,
    draftId: created.id as string,
  })

  return { draftId: created.id as string }
}

export async function regenerateDraft(draftId: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()

  const { data: existing } = await client
    .from('drafts')
    .select('source_raw_content, source_title, draft_type, course_id, source_module_id, source_resource_id')
    .eq('id', draftId)
    .maybeSingle()

  if (!existing) throw new Error('Draft not found.')

  await client.from('drafts').update({ status: 'generating', body_markdown: '' }).eq('id', draftId)

  try {
    const result = await generateDraftContent(
      existing.source_raw_content as string,
      existing.draft_type as DraftType
    )
    await client
      .from('drafts')
      .update({
        title: result.title,
        body_markdown: result.body_markdown,
        status: 'ready',
        token_count: result.tokenCount,
        generation_model: result.model,
      })
      .eq('id', draftId)
  } catch {
    await client.from('drafts').update({ status: 'failed' }).eq('id', draftId)
  }

  revalidatePath(`/drafts/${draftId}`)
  revalidateUnifiedDraftPaths({
    courseId: (existing as { course_id?: string | null }).course_id ?? null,
    moduleId: (existing.source_module_id as string | null) ?? null,
    resourceId: (existing.source_resource_id as string | null) ?? null,
    draftId,
  })
}

export async function refineDraft(draftId: string, instruction: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')
  if (!instruction.trim()) throw new Error('Refinement instruction is required.')

  const client = await createDraftsClient()

  const { data: existing } = await client
    .from('drafts')
    .select('body_markdown, source_raw_content, draft_type, refinement_history, course_id, source_module_id, source_resource_id')
    .eq('id', draftId)
    .maybeSingle()

  if (!existing) throw new Error('Draft not found.')

  await client.from('drafts').update({ status: 'refining' }).eq('id', draftId)

  const model = 'gpt-4o'
  const openai = getOpenAIClient()

  try {
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are refining an existing study document. Apply the user's instruction to improve the draft. Return JSON with { "title": "string", "body_markdown": "string" }. Keep all existing content that the instruction doesn't ask to change. Do not add filler or reduce quality.`,
        },
        {
          role: 'user',
          content: `Current draft:\n\n${existing.body_markdown}\n\n---\n\nSource material (for reference):\n\n${(existing.source_raw_content as string).slice(0, 20000)}\n\n---\n\nRefinement instruction: ${instruction}`,
        },
      ],
      max_tokens: 16384,
      temperature: 0.3,
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('Empty OpenAI response')
    const parsed = JSON.parse(raw) as { title?: string; body_markdown?: string }
    if (!parsed.body_markdown) throw new Error('Missing body_markdown in response')

    const history = (existing.refinement_history as Array<{ instruction: string; refinedAt: string }>) ?? []
    history.push({ instruction: instruction.trim(), refinedAt: new Date().toISOString() })

    await client
      .from('drafts')
      .update({
        title: parsed.title ?? existing.body_markdown.split('\n')[0]?.replace(/^#\s*/, '') ?? 'Draft',
        body_markdown: parsed.body_markdown,
        status: 'ready',
        token_count: response.usage?.total_tokens ?? null,
        generation_model: model,
        refinement_history: history,
      })
      .eq('id', draftId)
  } catch {
    await client.from('drafts').update({ status: 'ready' }).eq('id', draftId)
    throw new Error('Refinement failed. Your draft is unchanged.')
  }

  revalidatePath(`/drafts/${draftId}`)
  revalidateUnifiedDraftPaths({
    courseId: (existing as { course_id?: string | null }).course_id ?? null,
    moduleId: (existing.source_module_id as string | null) ?? null,
    resourceId: (existing.source_resource_id as string | null) ?? null,
    draftId,
  })
}

export async function continueDraft(draftId: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()

  const { data: existing } = await client
    .from('drafts')
    .select('body_markdown, source_raw_content, draft_type, course_id, source_module_id, source_resource_id')
    .eq('id', draftId)
    .maybeSingle()

  if (!existing) throw new Error('Draft not found.')

  await client.from('drafts').update({ status: 'refining' }).eq('id', draftId)

  const model = 'gpt-4o'
  const openai = getOpenAIClient()

  try {
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are continuing an existing study document. The current draft may be incomplete. Add more content, expanding on topics not yet covered or adding more depth to existing sections. Return JSON with { "body_markdown": "string" } containing the FULL document (existing + new content appended). Do not truncate or remove existing sections.`,
        },
        {
          role: 'user',
          content: `Current draft:\n\n${existing.body_markdown}\n\n---\n\nSource material:\n\n${(existing.source_raw_content as string).slice(0, 40000)}\n\n---\n\nContinue the draft by adding more depth, additional examples, or sections that weren't fully covered.`,
        },
      ],
      max_tokens: 16384,
      temperature: 0.3,
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('Empty OpenAI response')
    const parsed = JSON.parse(raw) as { body_markdown?: string }
    if (!parsed.body_markdown) throw new Error('Missing body_markdown in response')

    await client
      .from('drafts')
      .update({
        body_markdown: parsed.body_markdown,
        status: 'ready',
        token_count: response.usage?.total_tokens ?? null,
        generation_model: model,
      })
      .eq('id', draftId)
  } catch {
    await client.from('drafts').update({ status: 'ready' }).eq('id', draftId)
    throw new Error('Continue failed. Your draft is unchanged.')
  }

  revalidatePath(`/drafts/${draftId}`)
  revalidateUnifiedDraftPaths({
    courseId: (existing as { course_id?: string | null }).course_id ?? null,
    moduleId: (existing.source_module_id as string | null) ?? null,
    resourceId: (existing.source_resource_id as string | null) ?? null,
    draftId,
  })
}

export async function updateDraftBody(draftId: string, newMarkdown: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()
  const { data } = await client
    .from('drafts')
    .update({ body_markdown: newMarkdown })
    .eq('id', draftId)
    .select('course_id, source_module_id, source_resource_id')
    .maybeSingle()

  revalidateUnifiedDraftPaths({
    courseId: (data?.course_id as string | null) ?? null,
    moduleId: (data?.source_module_id as string | null) ?? null,
    resourceId: (data?.source_resource_id as string | null) ?? null,
    draftId,
  })
}

export async function deleteDraft(draftId: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()
  const { data: existing } = await client
    .from('drafts')
    .select('course_id, source_module_id, source_resource_id')
    .eq('id', draftId)
    .maybeSingle()
  await client.from('drafts').delete().eq('id', draftId)

  revalidateUnifiedDraftPaths({
    courseId: (existing?.course_id as string | null) ?? null,
    moduleId: (existing?.source_module_id as string | null) ?? null,
    resourceId: (existing?.source_resource_id as string | null) ?? null,
    draftId,
  })
  redirect('/drafts')
}

export async function makeQuizzable(draftId: string): Promise<void> {
  const draft = await getDraft(draftId)
  if (!draft) throw new Error('Draft not found.')
  redirect(`/modules/${draft.sourceModuleId ?? ''}/quiz?from_draft=${draftId}`)
}
