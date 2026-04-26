import crypto from 'node:crypto'
import OpenAI from 'openai'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { getModuleResourceQualityInfo, normalizeModuleResourceStudyText } from '@/lib/module-resource-quality'
import { supabase } from '@/lib/supabase'
import type { Module, ModuleResource } from '@/lib/types'

export interface ResourceSummaryRow {
  resourceId: string
  userId: string
  summary: string | null
  topics: string[]
  studyValue: 'high' | 'medium' | 'low' | null
  suggestedUse: string | null
  status: 'ready' | 'pending' | 'failed'
  model: string | null
  sourceHash: string | null
  error: string | null
  generatedAt: string | null
}

export interface ModuleSummaryRow {
  moduleId: string
  userId: string
  summary: string | null
  topics: string[]
  suggestedOrder: string[]
  warnings: string[]
  status: 'ready' | 'pending' | 'failed'
  model: string | null
  sourceHash: string | null
  error: string | null
  generatedAt: string | null
}

export async function listResourceSummaries(resourceIds: string[]) {
  const user = await getAuthenticatedUserServer()
  if (!supabase || !user || resourceIds.length === 0) return new Map<string, ResourceSummaryRow>()

  const { data, error } = await supabase
    .from('resource_summaries')
    .select('*')
    .eq('user_id', user.id)
    .in('resource_id', resourceIds)

  if (isMissingSchemaObjectError(error)) return new Map<string, ResourceSummaryRow>()
  if (error) return new Map<string, ResourceSummaryRow>()

  return new Map((data ?? []).map((row) => {
    const summary = adaptResourceSummaryRow(row as Record<string, unknown>)
    return [summary.resourceId, summary]
  }))
}

export async function getModuleSummary(moduleId: string) {
  const user = await getAuthenticatedUserServer()
  if (!supabase || !user) return null

  const { data, error } = await supabase
    .from('module_summaries')
    .select('*')
    .eq('user_id', user.id)
    .eq('module_id', moduleId)
    .maybeSingle()

  if (isMissingSchemaObjectError(error) || error || !data) return null
  return adaptModuleSummaryRow(data as Record<string, unknown>)
}

export async function summarizeResourceForUser(resourceId: string) {
  const user = await getAuthenticatedUserServer()
  if (!supabase || !user) throw new Error('Sign in before summarizing sources.')

  const { data: resourceRow, error: resourceError } = await supabase
    .from('module_resources')
    .select('*')
    .eq('id', resourceId)
    .single()
  if (resourceError || !resourceRow) throw new Error(resourceError?.message ?? 'Source not found.')

  const resource = adaptResourceForSummary(resourceRow as Record<string, unknown>)
  await verifyCourseOwnership(resource.courseId, user.id)

  const quality = getModuleResourceQualityInfo(resource)
  if (!(quality.quality === 'strong' || quality.quality === 'usable') || !quality.meaningfulText.trim()) {
    throw new Error('This source does not have enough readable text to summarize yet.')
  }
  if ((resource.extension ?? '').toLowerCase() === 'pkt') {
    throw new Error('Packet Tracer files cannot be summarized directly.')
  }

  const sourceHash = buildResourceSummaryHash(resource)
  const cached = await getCachedResourceSummary(resource.id, user.id)
  if (cached?.status === 'ready' && cached.sourceHash === sourceHash && cached.summary) return cached

  const model = getSummaryModel()
  const promptText = quality.meaningfulText.slice(0, 18000)
  const generated = await generateResourceSummaryJson(resource.title, promptText, model)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('resource_summaries')
    .upsert({
      resource_id: resource.id,
      user_id: user.id,
      summary: generated.summary,
      topics: generated.topics,
      study_value: generated.study_value,
      suggested_use: generated.suggested_use,
      status: 'ready',
      model,
      source_hash: sourceHash,
      error: null,
      generated_at: now,
      updated_at: now,
    }, { onConflict: 'resource_id,user_id' })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Could not save source summary.')
  return adaptResourceSummaryRow(data as Record<string, unknown>)
}

export async function summarizeModuleForUser(moduleId: string) {
  const user = await getAuthenticatedUserServer()
  if (!supabase || !user) throw new Error('Sign in before summarizing modules.')

  const { data: moduleRow, error: moduleError } = await supabase
    .from('modules')
    .select('*')
    .eq('id', moduleId)
    .single()
  if (moduleError || !moduleRow) throw new Error(moduleError?.message ?? 'Module not found.')

  const moduleRecord = adaptModuleForSummary(moduleRow as Record<string, unknown>)
  if (!moduleRecord.courseId) throw new Error('Module is missing course context.')
  await verifyCourseOwnership(moduleRecord.courseId, user.id)

  const { data: resourceRows, error: resourceError } = await supabase
    .from('module_resources')
    .select('*')
    .eq('module_id', moduleId)
    .order('created_at')
  if (resourceError) throw new Error(resourceError.message)

  const resources = (resourceRows ?? []).map((row) => adaptResourceForSummary(row as Record<string, unknown>))
  const sourceHash = buildModuleSummaryHash(moduleRecord, resources)
  const cached = await getCachedModuleSummary(moduleId, user.id)
  if (cached?.status === 'ready' && cached.sourceHash === sourceHash && cached.summary) return cached

  const resourceSummaries = await listResourceSummaries(resources.map((resource) => resource.id))
  const model = getSummaryModel()
  const generated = await generateModuleSummaryJson(moduleRecord, resources, resourceSummaries, model)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('module_summaries')
    .upsert({
      module_id: moduleId,
      user_id: user.id,
      summary: generated.summary,
      topics: generated.topics,
      suggested_order: generated.suggested_order,
      warnings: generated.warnings,
      status: 'ready',
      model,
      source_hash: sourceHash,
      error: null,
      generated_at: now,
      updated_at: now,
    }, { onConflict: 'module_id,user_id' })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Could not save module summary.')
  return adaptModuleSummaryRow(data as Record<string, unknown>)
}

export function buildResourceSummaryHash(resource: ModuleResource) {
  return hashObject({
    id: resource.id,
    status: resource.extractionStatus,
    text: normalizeModuleResourceStudyText(resource.extractedText ?? resource.extractedTextPreview ?? ''),
    error: resource.extractionError,
    extension: resource.extension,
  })
}

function buildModuleSummaryHash(module: Module, resources: ModuleResource[]) {
  return hashObject({
    module: {
      id: module.id,
      title: module.title,
      summary: module.summary,
      concepts: module.concepts,
      recommended_order: module.recommended_order,
    },
    resources: resources.map((resource) => ({
      id: resource.id,
      title: resource.title,
      status: resource.extractionStatus,
      extension: resource.extension,
      hash: buildResourceSummaryHash(resource),
    })),
  })
}

async function getCachedResourceSummary(resourceId: string, userId: string) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('resource_summaries')
    .select('*')
    .eq('resource_id', resourceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return adaptResourceSummaryRow(data as Record<string, unknown>)
}

async function getCachedModuleSummary(moduleId: string, userId: string) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('module_summaries')
    .select('*')
    .eq('module_id', moduleId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return adaptModuleSummaryRow(data as Record<string, unknown>)
}

async function generateResourceSummaryJson(title: string, text: string, model: string) {
  const client = new OpenAI({ apiKey: getOpenAIApiKey() })
  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'Summarize student study sources. Return only strict JSON with summary, topics, study_value, and suggested_use.' },
      {
        role: 'user',
        content: `Source title: ${title}\n\nReturn JSON exactly shaped like {"summary":"...","topics":["..."],"study_value":"high | medium | low","suggested_use":"read first | review before quiz | use for lab practice | reference only"}.\n\nReadable text:\n${text}`,
      },
    ],
  })
  return parseResourceSummary(response.choices[0]?.message.content)
}

async function generateModuleSummaryJson(
  module: Module,
  resources: ModuleResource[],
  summaries: Map<string, ResourceSummaryRow>,
  model: string,
) {
  const client = new OpenAI({ apiKey: getOpenAIApiKey() })
  const sourceLines = resources.map((resource) => {
    const summary = summaries.get(resource.id)
    return `- ${resource.title} (${resource.resourceType}${resource.extension ? ` .${resource.extension}` : ''}, ${resource.extractionStatus}): ${summary?.summary ?? resource.extractionError ?? 'No cached summary'}`
  }).join('\n')
  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'Create compact module overviews for students. Return only strict JSON.' },
      {
        role: 'user',
        content: `Return JSON exactly shaped like {"summary":"...","topics":["..."],"suggested_order":["..."],"warnings":["..."]}.\n\nModule: ${module.title}\nExisting module summary: ${module.summary ?? 'None'}\nExisting topics: ${(module.concepts ?? []).join(', ') || 'None'}\nSources:\n${sourceLines}`,
      },
    ],
  })
  return parseModuleSummary(response.choices[0]?.message.content)
}

async function verifyCourseOwnership(courseId: string | null, userId: string) {
  if (!supabase || !courseId) throw new Error('Missing course context.')
  const { data, error } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) throw new Error('You do not have access to this source.')
}

function adaptResourceSummaryRow(row: Record<string, unknown>): ResourceSummaryRow {
  return {
    resourceId: String(row.resource_id ?? ''),
    userId: String(row.user_id ?? ''),
    summary: typeof row.summary === 'string' ? row.summary : null,
    topics: Array.isArray(row.topics) ? row.topics.filter((topic): topic is string => typeof topic === 'string') : [],
    studyValue: row.study_value === 'high' || row.study_value === 'medium' || row.study_value === 'low' ? row.study_value : null,
    suggestedUse: typeof row.suggested_use === 'string' ? row.suggested_use : null,
    status: row.status === 'pending' || row.status === 'failed' ? row.status : 'ready',
    model: typeof row.model === 'string' ? row.model : null,
    sourceHash: typeof row.source_hash === 'string' ? row.source_hash : null,
    error: typeof row.error === 'string' ? row.error : null,
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
  }
}

function adaptModuleSummaryRow(row: Record<string, unknown>): ModuleSummaryRow {
  return {
    moduleId: String(row.module_id ?? ''),
    userId: String(row.user_id ?? ''),
    summary: typeof row.summary === 'string' ? row.summary : null,
    topics: Array.isArray(row.topics) ? row.topics.filter((topic): topic is string => typeof topic === 'string') : [],
    suggestedOrder: Array.isArray(row.suggested_order) ? row.suggested_order.filter((item): item is string => typeof item === 'string') : [],
    warnings: Array.isArray(row.warnings) ? row.warnings.filter((item): item is string => typeof item === 'string') : [],
    status: row.status === 'pending' || row.status === 'failed' ? row.status : 'ready',
    model: typeof row.model === 'string' ? row.model : null,
    sourceHash: typeof row.source_hash === 'string' ? row.source_hash : null,
    error: typeof row.error === 'string' ? row.error : null,
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
  }
}

function adaptResourceForSummary(row: Record<string, unknown>): ModuleResource {
  return {
    id: String(row.id ?? ''),
    moduleId: String(row.module_id ?? ''),
    courseId: typeof row.course_id === 'string' ? row.course_id : null,
    canvasModuleId: typeof row.canvas_module_id === 'number' ? row.canvas_module_id : null,
    canvasItemId: typeof row.canvas_item_id === 'number' ? row.canvas_item_id : null,
    canvasFileId: typeof row.canvas_file_id === 'number' ? row.canvas_file_id : null,
    title: typeof row.title === 'string' ? row.title : 'Source',
    resourceType: typeof row.resource_type === 'string' ? row.resource_type : 'Resource',
    contentType: typeof row.content_type === 'string' ? row.content_type : null,
    extension: typeof row.extension === 'string' ? row.extension : null,
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : null,
    htmlUrl: typeof row.html_url === 'string' ? row.html_url : null,
    extractionStatus: normalizeExtractionStatus(row.extraction_status),
    extractedText: typeof row.extracted_text === 'string' ? row.extracted_text : null,
    extractedTextPreview: typeof row.extracted_text_preview === 'string' ? row.extracted_text_preview : null,
    extractedCharCount: typeof row.extracted_char_count === 'number' ? row.extracted_char_count : 0,
    extractionError: typeof row.extraction_error === 'string' ? row.extraction_error : null,
    required: typeof row.required === 'boolean' ? row.required : false,
    metadata: typeof row.metadata === 'object' && row.metadata !== null && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function adaptModuleForSummary(row: Record<string, unknown>): Module {
  return {
    id: String(row.id ?? ''),
    courseId: typeof row.course_id === 'string' ? row.course_id : undefined,
    title: typeof row.title === 'string' ? row.title : 'Module',
    raw_content: typeof row.raw_content === 'string' ? row.raw_content : '',
    summary: typeof row.summary === 'string' ? row.summary : null,
    concepts: Array.isArray(row.concepts) ? row.concepts.filter((item): item is string => typeof item === 'string') : [],
    study_prompts: Array.isArray(row.study_prompts) ? row.study_prompts.filter((item): item is string => typeof item === 'string') : [],
    recommended_order: Array.isArray(row.recommended_order) ? row.recommended_order.filter((item): item is string => typeof item === 'string') : [],
    status: row.status === 'processed' || row.status === 'error' ? row.status : 'pending',
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function parseResourceSummary(value: string | null | undefined) {
  const parsed = JSON.parse(value ?? '{}') as Record<string, unknown>
  const studyValue = parsed.study_value === 'high' || parsed.study_value === 'medium' || parsed.study_value === 'low'
    ? parsed.study_value
    : 'medium'
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : 'Summary unavailable.',
    topics: Array.isArray(parsed.topics) ? parsed.topics.filter((topic): topic is string => typeof topic === 'string').slice(0, 8) : [],
    study_value: studyValue,
    suggested_use: typeof parsed.suggested_use === 'string' ? parsed.suggested_use : 'review before quiz',
  }
}

function parseModuleSummary(value: string | null | undefined) {
  const parsed = JSON.parse(value ?? '{}') as Record<string, unknown>
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : 'Module summary unavailable.',
    topics: Array.isArray(parsed.topics) ? parsed.topics.filter((topic): topic is string => typeof topic === 'string').slice(0, 10) : [],
    suggested_order: Array.isArray(parsed.suggested_order) ? parsed.suggested_order.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((item): item is string => typeof item === 'string').slice(0, 8) : [],
  }
}

function hashObject(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function getOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set.')
  return apiKey
}

function getSummaryModel() {
  return process.env.OPENAI_SUMMARY_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
}

function normalizeExtractionStatus(value: unknown): ModuleResource['extractionStatus'] {
  return value === 'pending' || value === 'extracted' || value === 'metadata_only' || value === 'unsupported' || value === 'empty' || value === 'failed'
    ? value
    : 'metadata_only'
}

function isMissingSchemaObjectError(error: { code?: string | null } | null | undefined) {
  return error?.code === 'PGRST205'
}
