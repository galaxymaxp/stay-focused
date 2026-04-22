'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import OpenAI from 'openai'
import { getRequiredSupabaseAuthEnv, isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
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
    sourceType: row.source_type as Draft['sourceType'],
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
    sourceType: row.source_type as Draft['sourceType'],
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

function revalidateUnifiedDraftPaths(moduleId: string | null, resourceId: string | null) {
  if (!moduleId || !resourceId) return

  revalidatePath(`/modules/${moduleId}/learn/resources/${encodeURIComponent(resourceId)}`)
  revalidatePath(`/modules/${moduleId}/learn/notes/${encodeURIComponent(resourceId)}`)
  revalidatePath(`/modules/${moduleId}/learn`)
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
      'id, user_id, source_type, source_module_id, source_resource_id, source_title, draft_type, title, status, token_count, created_at, updated_at, modules!source_module_id ( course_id, title )'
    )
    .order('updated_at', { ascending: false })

  const drafts: DraftShelfItem[] = (draftRows ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const mod = r.modules as { course_id: string | null; title: string } | null
    return {
      id: r.id as string,
      userId: r.user_id as string,
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
      courseId: mod?.course_id ?? null,
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
    .select('id, user_id, source_type, source_resource_id, source_title, draft_type, title, status, token_count, created_at, updated_at')
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
  const { data, error } = await client
    .from('drafts')
    .select('*')
    .eq('source_module_id', moduleId)
    .eq('source_resource_id', resourceId)
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
      source_type: 'module',
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

  revalidatePath(`/modules/${workspace.module.id}/learn/resources/${encodeURIComponent(input.resourceId)}`)
  revalidateUnifiedDraftPaths(workspace.module.id, canonicalResourceId)

  return { draftId, moduleId: workspace.module.id, resourceId: canonicalResourceId }
}

export async function createDraft(formData: FormData): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) throw new Error('You must be signed in to create a draft.')

  const sourceType = formData.get('source_type') as string
  const draftType = formData.get('draft_type') as DraftType
  const moduleId = formData.get('module_id') as string | null
  const pasteContent = formData.get('paste_content') as string | null
  const pasteTitle = formData.get('paste_title') as string | null

  if (!draftType) throw new Error('Draft type is required.')

  let rawContent = ''
  let sourceTitle = ''
  let sourceModuleId: string | null = null

  if (sourceType === 'module' && moduleId) {
    const { data: mod } = await client
      .from('modules')
      .select('id, title, raw_content')
      .eq('id', moduleId)
      .maybeSingle()
    if (!mod) throw new Error('Module not found.')
    rawContent = (mod.raw_content as string) ?? ''
    sourceTitle = (mod.title as string) ?? 'Untitled Module'
    sourceModuleId = mod.id as string
  } else if (sourceType === 'paste' && pasteContent?.trim()) {
    rawContent = pasteContent.trim()
    sourceTitle = pasteTitle?.trim() || 'Pasted Content'
  } else {
    throw new Error('Invalid source: provide a module or paste content.')
  }

  if (!rawContent.trim()) throw new Error('Source content is empty.')

  const { data: draft, error: insertError } = await client
    .from('drafts')
    .insert({
      user_id: user.id,
      source_type: sourceType,
      source_module_id: sourceModuleId,
      source_raw_content: rawContent,
      source_title: sourceTitle,
      draft_type: draftType,
      title: `${draftType.replace(/_/g, ' ')} — ${sourceTitle}`,
      body_markdown: '',
      status: 'generating',
    })
    .select('id')
    .single()

  if (insertError || !draft) throw new Error('Failed to create draft record.')

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

  revalidatePath('/drafts')
  redirect(`/drafts/${draftId}`)
}

export async function regenerateDraft(draftId: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()

  const { data: existing } = await client
    .from('drafts')
    .select('source_raw_content, source_title, draft_type, source_module_id, source_resource_id')
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
  revalidatePath('/drafts')
  revalidateUnifiedDraftPaths(
    (existing.source_module_id as string | null) ?? null,
    (existing.source_resource_id as string | null) ?? null,
  )
}

export async function refineDraft(draftId: string, instruction: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')
  if (!instruction.trim()) throw new Error('Refinement instruction is required.')

  const client = await createDraftsClient()

  const { data: existing } = await client
    .from('drafts')
    .select('body_markdown, source_raw_content, draft_type, refinement_history, source_module_id, source_resource_id')
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
  revalidateUnifiedDraftPaths(
    (existing.source_module_id as string | null) ?? null,
    (existing.source_resource_id as string | null) ?? null,
  )
}

export async function continueDraft(draftId: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()

  const { data: existing } = await client
    .from('drafts')
    .select('body_markdown, source_raw_content, draft_type, source_module_id, source_resource_id')
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
  revalidateUnifiedDraftPaths(
    (existing.source_module_id as string | null) ?? null,
    (existing.source_resource_id as string | null) ?? null,
  )
}

export async function updateDraftBody(draftId: string, newMarkdown: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()
  const { data } = await client
    .from('drafts')
    .update({ body_markdown: newMarkdown })
    .eq('id', draftId)
    .select('source_module_id, source_resource_id')
    .maybeSingle()

  revalidatePath(`/drafts/${draftId}`)
  revalidateUnifiedDraftPaths(
    (data?.source_module_id as string | null) ?? null,
    (data?.source_resource_id as string | null) ?? null,
  )
}

export async function deleteDraft(draftId: string): Promise<void> {
  if (!isSupabaseAuthConfigured) throw new Error('Supabase is not configured.')

  const client = await createDraftsClient()
  await client.from('drafts').delete().eq('id', draftId)

  revalidatePath('/drafts')
  redirect('/drafts')
}

export async function makeQuizzable(draftId: string): Promise<void> {
  const draft = await getDraft(draftId)
  if (!draft) throw new Error('Draft not found.')
  redirect(`/modules/${draft.sourceModuleId ?? ''}/quiz?from_draft=${draftId}`)
}
