import crypto from 'node:crypto'
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuthenticatedSupabaseServerClient, getAuthenticatedUserServer } from '@/lib/auth-server'
import { getModuleResourceQualityInfo, normalizeModuleResourceStudyText } from '@/lib/module-resource-quality'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'
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

export interface ModuleOverviewInput {
  module: Pick<Module, 'id' | 'title' | 'summary' | 'concepts' | 'recommended_order'>
  resources: ModuleResource[]
  resourceSummaries: Map<string, ResourceSummaryRow>
}

export interface CleanModuleOverviewInput {
  moduleTitle: string
  moduleSummary: string | null
  topicHints: string[]
  sourceLines: string[]
  suggestedFirstSource: string | null
  warnings: string[]
  cleanMaterialCharCount: number
  assignmentOnly: boolean
  enoughCleanMaterial: boolean
}

const MIN_RESOURCE_SUMMARY_TEXT = 220
const MIN_MODULE_CLEAN_TEXT = 260
const SUMMARY_MODEL_FALLBACK = 'gpt-4o-mini'
const NOT_ENOUGH_CLEAN_MATERIAL = 'Not enough clean study material yet. This module currently contains task instructions, but no readable study source has been processed.'
const MODULE_SUMMARIES_MISSING_MESSAGE = 'Module summaries are not installed yet. Apply supabase/migrations/20260427000000_add_source_summaries.sql, then reload the Supabase schema cache.'
const SUMMARY_PERMISSION_REPAIR_MESSAGE = 'Overview permissions need repair.'

const ADMIN_NOISE_PATTERN = /\b(?:canvas inbox|facebook messenger|credit hours?|prerequisites?|prepared by|instructor|contact\s*(?:no|number|email)?|course\s+introduction\s+and\s+orientation|dashboard|account|calendar|grades|people|syllabus|announcements|assignments|discussions|quizzes)\b/i
const ASSIGNMENT_PROMPT_PATTERN = /\b(?:as a group|answer the following|submit|submission|deadline|due date|1 whole sheet of paper|write your answer|upload|turn in|perform the following|situational cases?)\b/i
const FILE_NAME_ONLY_PATTERN = /^[\w\s().-]+\.(?:pdf|pptx?|docx?|txt|pkt)$/i

export async function listResourceSummaries(resourceIds: string[]) {
  const user = await getAuthenticatedUserServer()
  const client = await getAuthenticatedSummaryClient()
  if (!client || !user || resourceIds.length === 0) return new Map<string, ResourceSummaryRow>()

  const { data, error } = await client
    .from('resource_summaries')
    .select('*')
    .eq('user_id', user.id)
    .in('resource_id', resourceIds)

  if (isMissingSummarySchemaError(error)) return new Map<string, ResourceSummaryRow>()
  if (error) return new Map<string, ResourceSummaryRow>()

  return new Map((data ?? []).map((row) => {
    const summary = adaptResourceSummaryRow(row as Record<string, unknown>)
    return [summary.resourceId, summary]
  }))
}

export async function getModuleSummary(moduleId: string) {
  const user = await getAuthenticatedUserServer()
  const client = await getAuthenticatedSummaryClient()
  if (!client || !user) {
    logSummaryAvailabilityCheck({
      moduleId,
      hasUserId: Boolean(user?.id),
      error: null,
      tableMissing: false,
    })
    return null
  }

  const { data, error } = await client
    .from('module_summaries')
    .select('*')
    .eq('user_id', user.id)
    .eq('module_id', moduleId)
    .maybeSingle()

  const tableMissing = isMissingSummarySchemaError(error)
  logSummaryAvailabilityCheck({
    moduleId,
    hasUserId: Boolean(user.id),
    error,
    tableMissing,
  })

  if (tableMissing) {
    return {
      moduleId,
      userId: user.id,
      summary: null,
      topics: [],
      suggestedOrder: [],
      warnings: [],
      status: 'failed',
      model: null,
      sourceHash: null,
      error: MODULE_SUMMARIES_MISSING_MESSAGE,
      generatedAt: null,
    } satisfies ModuleSummaryRow
  }
  if (isSummaryPermissionError(error)) {
    return {
      moduleId,
      userId: user.id,
      summary: null,
      topics: [],
      suggestedOrder: [],
      warnings: [],
      status: 'failed',
      model: null,
      sourceHash: null,
      error: SUMMARY_PERMISSION_REPAIR_MESSAGE,
      generatedAt: null,
    } satisfies ModuleSummaryRow
  }
  if (error || !data) return null
  return adaptModuleSummaryRow(data as Record<string, unknown>)
}

export async function summarizeResourceForUser(resourceId: string) {
  const user = await getAuthenticatedUserServer()
  if (!user) throw new Error('Sign in before summarizing sources.')
  return summarizeResourceForUserId(resourceId, user.id)
}

export async function summarizeResourceForUserId(resourceId: string, userId: string, inputClient?: SupabaseClient | null) {
  const client = inputClient ?? await getAuthenticatedSummaryClient()
  if (!client) throw new Error('Supabase is not configured yet.')

  const { data: resourceRow, error: resourceError } = await client
    .from('module_resources')
    .select('*')
    .eq('id', resourceId)
    .single()
  if (resourceError || !resourceRow) throw new Error(resourceError?.message ?? 'Source not found.')

  const resource = adaptResourceForSummary(resourceRow as Record<string, unknown>)
  await verifyCourseOwnership(client, resource.courseId, userId)

  const quality = getModuleResourceQualityInfo(resource)
  if (!(quality.quality === 'strong' || quality.quality === 'usable') || !quality.meaningfulText.trim()) {
    throw new Error('This source does not have enough readable text to summarize yet.')
  }
  if ((resource.extension ?? '').toLowerCase() === 'pkt') {
    throw new Error('Packet Tracer files cannot be summarized directly.')
  }

  const sourceHash = buildResourceSummaryHash(resource)
  const cached = await getCachedResourceSummary(client, resource.id, userId)
  if (cached?.status === 'ready' && cached.sourceHash === sourceHash && cached.summary) return cached

  const model = getSummaryModel()
  const promptText = cleanStudyTextForOverview(quality.meaningfulText).slice(0, 18000)
  if (promptText.trim().length < MIN_RESOURCE_SUMMARY_TEXT) {
    throw new Error('This source does not have enough clean readable text to summarize yet.')
  }
  const generated = await generateResourceSummaryJson(resource.title, promptText, model)
  const now = new Date().toISOString()

  const { data, error } = await client
    .from('resource_summaries')
    .upsert({
      resource_id: resource.id,
      user_id: userId,
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

  if (isMissingSummarySchemaError(error)) {
    throw new Error('Resource summaries are not installed yet. Apply the source summaries migration and reload the Supabase schema cache.')
  }
  if (error || !data) throw new Error(error?.message ?? 'Could not save source summary.')
  return adaptResourceSummaryRow(data as Record<string, unknown>)
}

export async function summarizeModuleForUser(moduleId: string) {
  const user = await getAuthenticatedUserServer()
  if (!user) throw new Error('Sign in before summarizing modules.')
  return summarizeModuleForUserId(moduleId, user.id)
}

export async function summarizeModuleForUserId(moduleId: string, userId: string, inputClient?: SupabaseClient | null) {
  const client = inputClient ?? await getAuthenticatedSummaryClient()
  if (!client) throw new Error('Supabase is not configured yet.')

  const { data: moduleRow, error: moduleError } = await client
    .from('modules')
    .select('*')
    .eq('id', moduleId)
    .single()
  if (moduleError || !moduleRow) throw new Error(moduleError?.message ?? 'Module not found.')

  const moduleRecord = adaptModuleForSummary(moduleRow as Record<string, unknown>)
  if (!moduleRecord.courseId) throw new Error('Module is missing course context.')
  await verifyCourseOwnership(client, moduleRecord.courseId, userId)

  const { data: resourceRows, error: resourceError } = await client
    .from('module_resources')
    .select('*')
    .eq('module_id', moduleId)
    .order('created_at')
  if (resourceError) throw new Error(resourceError.message)

  const resources = (resourceRows ?? []).map((row) => adaptResourceForSummary(row as Record<string, unknown>))
  const sourceHash = buildModuleSummaryHash(moduleRecord, resources)
  const cached = await getCachedModuleSummary(client, moduleId, userId)
  if (cached?.status === 'ready' && cached.sourceHash === sourceHash && cached.summary) return cached

  const resourceSummaries = await getResourceSummaryMapForUser(client, resources.map((resource) => resource.id), userId)
  const cleanInput = buildCleanModuleOverviewInput({
    module: moduleRecord,
    resources,
    resourceSummaries,
  })

  if (!cleanInput.enoughCleanMaterial) {
    return upsertModuleSummaryFailure(client, {
      moduleId,
      userId,
      sourceHash,
      error: cleanInput.assignmentOnly ? NOT_ENOUGH_CLEAN_MATERIAL : 'Overview will appear after readable sources are processed.',
      warnings: cleanInput.warnings,
    })
  }

  const model = getSummaryModel()
  const generated = await generateModuleSummaryJson(moduleRecord, cleanInput, model)
  const now = new Date().toISOString()

  const { data, error } = await client
    .from('module_summaries')
    .upsert({
      module_id: moduleId,
      user_id: userId,
      summary: generated.summary,
      topics: generated.topics,
      suggested_order: generated.suggested_order,
      warnings: [...cleanInput.warnings, ...generated.warnings].slice(0, 8),
      status: 'ready',
      model,
      source_hash: sourceHash,
      error: null,
      generated_at: now,
      updated_at: now,
    }, { onConflict: 'module_id,user_id' })
    .select('*')
    .single()

  if (isMissingSummarySchemaError(error)) {
    throw new Error(MODULE_SUMMARIES_MISSING_MESSAGE)
  }
  if (isSummaryPermissionError(error)) throw new Error(SUMMARY_PERMISSION_REPAIR_MESSAGE)
  if (error || !data) throw new Error(error?.message ?? 'Could not save module summary.')
  return adaptModuleSummaryRow(data as Record<string, unknown>)
}

export async function generateSummariesForSyncedModule(input: {
  moduleId: string
  userId: string
}) {
  const client = createSupabaseServiceRoleClient()
  const counts = { resourceSummaries: 0, moduleSummaries: 0, skipped: 0, failed: 0 }
  if (!client) return counts

  const { data: resourceRows, error } = await client
    .from('module_resources')
    .select('id')
    .eq('module_id', input.moduleId)

  if (isMissingSummarySchemaError(error)) return counts
  if (error) {
    counts.failed += 1
    return counts
  }

  for (const row of resourceRows ?? []) {
    const resourceId = typeof row.id === 'string' ? row.id : null
    if (!resourceId) continue
    try {
      await summarizeResourceForUserId(resourceId, input.userId, client)
      counts.resourceSummaries += 1
    } catch (error) {
      if (isExpectedSummarySkip(error)) counts.skipped += 1
      else counts.failed += 1
    }
  }

  try {
    const summary = await summarizeModuleForUserId(input.moduleId, input.userId, client)
    if (summary.status === 'ready') counts.moduleSummaries += 1
    else counts.skipped += 1
  } catch (error) {
    if (isExpectedSummarySkip(error)) counts.skipped += 1
    else counts.failed += 1
  }

  return counts
}

export function buildResourceSummaryHash(resource: ModuleResource) {
  return hashObject({
    id: resource.id,
    status: resource.extractionStatus,
    text: normalizeModuleResourceStudyText(resource.extractedText ?? resource.extractedTextPreview ?? ''),
    count: resource.extractedCharCount,
    error: resource.extractionError,
    extension: resource.extension,
  })
}

export function buildCleanModuleOverviewInput(input: ModuleOverviewInput): CleanModuleOverviewInput {
  const rankedSources = input.resources
    .map((resource) => {
      const summary = input.resourceSummaries.get(resource.id)
      const quality = getModuleResourceQualityInfo(resource)
      const textFromSummary = summary?.status === 'ready' && summary.summary
        ? `${summary.summary}\nTopics: ${summary.topics.join(', ')}\nSuggested use: ${summary.suggestedUse ?? ''}`
        : ''
      const cleanText = textFromSummary || cleanStudyTextForOverview(quality.meaningfulText)
      const normalizedType = normalizeSourceType(resource)
      const assignmentLike = isAssignmentLike(resource, cleanText)
      const noiseScore = scoreNoise(cleanText) + scoreNoise(resource.title)
      const score = (summary?.status === 'ready' ? 80 : 0)
        + (quality.quality === 'strong' ? 45 : quality.quality === 'usable' ? 28 : 0)
        + (normalizedType === 'file' ? 16 : normalizedType === 'page' ? 8 : 0)
        - (assignmentLike ? 70 : 0)
        - noiseScore

      return {
        resource,
        cleanText,
        score,
        assignmentLike,
        hasCachedSummary: summary?.status === 'ready' && Boolean(summary.summary),
        usable: cleanText.length >= (summary?.status === 'ready' ? 80 : MIN_RESOURCE_SUMMARY_TEXT) && !assignmentLike && score > 0,
      }
    })
    .sort((left, right) => right.score - left.score)

  const usableSources = rankedSources.filter((source) => source.usable)
  const sourceLines = usableSources.slice(0, 8).map((source) => {
    const label = summarizeResourceLabel(source.resource)
    return `- ${source.resource.title}${label ? ` (${label})` : ''}: ${source.cleanText.slice(0, 1200)}`
  })
  const cleanMaterialCharCount = sourceLines.join('\n').length
  const assignmentOnly = rankedSources.length > 0 && usableSources.length === 0 && rankedSources.every((source) => source.assignmentLike || scoreNoise(source.cleanText) >= 30)
  const warningCount = input.resources.filter((resource) => {
    const quality = getModuleResourceQualityInfo(resource)
    return quality.quality === 'empty' || quality.quality === 'failed' || quality.quality === 'unsupported'
  }).length
  const warnings = [
    warningCount > 0 ? `${warningCount} source${warningCount === 1 ? '' : 's'} need attention before the overview can be complete.` : null,
    assignmentOnly ? 'Only task instructions were found.' : null,
  ].filter((value): value is string => Boolean(value))

  return {
    moduleTitle: input.module.title,
    moduleSummary: cleanShortText(input.module.summary),
    topicHints: (input.module.concepts ?? []).map(cleanShortText).filter((value): value is string => Boolean(value)).slice(0, 8),
    sourceLines,
    suggestedFirstSource: usableSources[0]?.resource.title ?? null,
    warnings,
    cleanMaterialCharCount,
    assignmentOnly,
    enoughCleanMaterial: cleanMaterialCharCount >= MIN_MODULE_CLEAN_TEXT || usableSources.some((source) => source.hasCachedSummary),
  }
}

export function buildModuleOverviewFallback(input: {
  readyCount: number
  needsActionCount: number
  summary: ModuleSummaryRow | null
}) {
  if (input.summary?.status === 'failed' && input.summary.error) return input.summary.error
  if (input.readyCount > 0) return 'Overview is being prepared from readable study sources.'
  if (input.needsActionCount > 0) return 'No overview yet. Refresh overview after processing sources.'
  return 'No readable study source is available for an overview yet.'
}

function buildModuleSummaryHash(module: Module, resources: ModuleResource[]) {
  return hashObject({
    module: {
      id: module.id,
      title: module.title,
      summary: cleanShortText(module.summary),
      concepts: module.concepts,
      recommended_order: module.recommended_order,
    },
    resources: resources.map((resource) => ({
      id: resource.id,
      title: resource.title,
      status: resource.extractionStatus,
      extension: resource.extension,
      count: resource.extractedCharCount,
      hash: buildResourceSummaryHash(resource),
    })),
  })
}

async function getResourceSummaryMapForUser(client: SupabaseClient, resourceIds: string[], userId: string) {
  if (resourceIds.length === 0) return new Map<string, ResourceSummaryRow>()

  const { data, error } = await client
    .from('resource_summaries')
    .select('*')
    .eq('user_id', userId)
    .in('resource_id', resourceIds)

  if (isMissingSummarySchemaError(error) || error) return new Map<string, ResourceSummaryRow>()
  return new Map((data ?? []).map((row) => {
    const summary = adaptResourceSummaryRow(row as Record<string, unknown>)
    return [summary.resourceId, summary]
  }))
}

async function getCachedResourceSummary(client: SupabaseClient, resourceId: string, userId: string) {
  const { data, error } = await client
    .from('resource_summaries')
    .select('*')
    .eq('resource_id', resourceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return adaptResourceSummaryRow(data as Record<string, unknown>)
}

async function getCachedModuleSummary(client: SupabaseClient, moduleId: string, userId: string) {
  const { data, error } = await client
    .from('module_summaries')
    .select('*')
    .eq('module_id', moduleId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return adaptModuleSummaryRow(data as Record<string, unknown>)
}

async function upsertModuleSummaryFailure(client: SupabaseClient, input: {
  moduleId: string
  userId: string
  sourceHash: string
  error: string
  warnings: string[]
}) {
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('module_summaries')
    .upsert({
      module_id: input.moduleId,
      user_id: input.userId,
      summary: null,
      topics: [],
      suggested_order: [],
      warnings: input.warnings,
      status: 'failed',
      model: null,
      source_hash: input.sourceHash,
      error: input.error,
      generated_at: null,
      updated_at: now,
    }, { onConflict: 'module_id,user_id' })
    .select('*')
    .single()

  if (isMissingSummarySchemaError(error)) throw new Error(MODULE_SUMMARIES_MISSING_MESSAGE)
  if (isSummaryPermissionError(error)) throw new Error(SUMMARY_PERMISSION_REPAIR_MESSAGE)
  if (error || !data) throw new Error(error?.message ?? 'Could not save module overview status.')
  return adaptModuleSummaryRow(data as Record<string, unknown>)
}

async function generateResourceSummaryJson(title: string, text: string, model: string) {
  const client = new OpenAI({ apiKey: getOpenAIApiKey() })
  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'Summarize student study sources. Return only strict JSON with summary, topics, study_value, and suggested_use. Avoid Canvas navigation, instructor contact details, due dates, and assignment submission instructions unless they are the source purpose.' },
      {
        role: 'user',
        content: `Source title: ${title}\n\nReturn JSON exactly shaped like {"summary":"...","topics":["..."],"study_value":"high | medium | low","suggested_use":"read first | review before quiz | use for lab practice | reference only"}.\n\nClean readable study text:\n${text}`,
      },
    ],
  })
  return parseResourceSummary(response.choices[0]?.message.content)
}

async function generateModuleSummaryJson(
  module: Module,
  cleanInput: CleanModuleOverviewInput,
  model: string,
) {
  const client = new OpenAI({ apiKey: getOpenAIApiKey() })
  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: [
          'Create compact module overviews for students.',
          'Use the cleaned/ranked study sources and cached source summaries.',
          'Do not quote raw slide headers, Canvas inbox/navigation, Facebook Messenger, credit hours, prerequisites, prepared-by metadata, filenames alone, or assignment submission prompts as the overview.',
          'If a source is a task prompt, mention it only as a warning or suggested action, not as the module concept.',
          'Return only strict JSON.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Return JSON exactly shaped like {"summary":"...","topics":["..."],"suggested_order":["..."],"warnings":["..."]}.',
          `Module: ${module.title}`,
          `Existing clean topic hints: ${cleanInput.topicHints.join(', ') || 'None'}`,
          `Suggested first source: ${cleanInput.suggestedFirstSource ?? 'None'}`,
          `Needs-action warnings: ${cleanInput.warnings.join(' ') || 'None'}`,
          'Clean ranked source material:',
          cleanInput.sourceLines.join('\n'),
        ].join('\n\n'),
      },
    ],
  })
  return parseModuleSummary(response.choices[0]?.message.content, cleanInput)
}

async function verifyCourseOwnership(client: SupabaseClient, courseId: string | null, userId: string) {
  if (!courseId) throw new Error('Missing course context.')
  const { data, error } = await client
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
    visualExtractionStatus: normalizeVisualExtractionStatus(row.visual_extraction_status),
    visualExtractedText: typeof row.visual_extracted_text === 'string' ? row.visual_extracted_text : null,
    visualExtractionError: typeof row.visual_extraction_error === 'string' ? row.visual_extraction_error : null,
    pageCount: typeof row.page_count === 'number' ? row.page_count : null,
    pagesProcessed: typeof row.pages_processed === 'number' ? row.pages_processed : 0,
    extractionProvider: typeof row.extraction_provider === 'string' ? row.extraction_provider : null,
    required: typeof row.required === 'boolean' ? row.required : false,
    metadata: typeof row.metadata === 'object' && row.metadata !== null && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function normalizeVisualExtractionStatus(value: unknown): ModuleResource['visualExtractionStatus'] {
  return value === 'not_started'
    || value === 'available'
    || value === 'queued'
    || value === 'running'
    || value === 'completed'
    || value === 'failed'
    || value === 'skipped'
    ? value
    : 'not_started'
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
    summary: typeof parsed.summary === 'string' ? sanitizeGeneratedText(parsed.summary) : 'Summary unavailable.',
    topics: Array.isArray(parsed.topics) ? parsed.topics.filter((topic): topic is string => typeof topic === 'string').map(sanitizeGeneratedText).filter(Boolean).slice(0, 8) : [],
    study_value: studyValue,
    suggested_use: typeof parsed.suggested_use === 'string' ? sanitizeGeneratedText(parsed.suggested_use) : 'review before quiz',
  }
}

function parseModuleSummary(value: string | null | undefined, cleanInput: CleanModuleOverviewInput) {
  const parsed = JSON.parse(value ?? '{}') as Record<string, unknown>
  const summary = typeof parsed.summary === 'string' ? sanitizeGeneratedText(parsed.summary) : 'Module summary unavailable.'
  return {
    summary: cleanGeneratedOverview(summary, cleanInput),
    topics: Array.isArray(parsed.topics) ? parsed.topics.filter((topic): topic is string => typeof topic === 'string').map(sanitizeGeneratedText).filter(Boolean).slice(0, 10) : [],
    suggested_order: Array.isArray(parsed.suggested_order) ? parsed.suggested_order.filter((item): item is string => typeof item === 'string').map(sanitizeGeneratedText).filter(Boolean).slice(0, 8) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((item): item is string => typeof item === 'string').map(sanitizeGeneratedText).filter(Boolean).slice(0, 8) : [],
  }
}

export function cleanStudyTextForOverview(text: string) {
  const normalized = normalizeModuleResourceStudyText(text)
  const seen = new Set<string>()
  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/^slide:\s*/i, '').trim())
    .filter((line) => {
      if (!line || line.length < 24) return false
      if (ADMIN_NOISE_PATTERN.test(line) || ASSIGNMENT_PROMPT_PATTERN.test(line) || FILE_NAME_ONLY_PATTERN.test(line)) return false
      const key = normalizeLookup(line)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function cleanShortText(value: string | null | undefined) {
  if (!value) return null
  const cleaned = cleanStudyTextForOverview(value)
  if (cleaned.length >= 80) return cleaned.slice(0, 700)
  const trimmed = sanitizeGeneratedText(value)
  if (ADMIN_NOISE_PATTERN.test(trimmed) || ASSIGNMENT_PROMPT_PATTERN.test(trimmed) || FILE_NAME_ONLY_PATTERN.test(trimmed)) return null
  return trimmed || null
}

function cleanGeneratedOverview(value: string, cleanInput: CleanModuleOverviewInput) {
  const cleaned = sanitizeGeneratedText(value)
  if (!cleaned || scoreNoise(cleaned) >= 30 || ASSIGNMENT_PROMPT_PATTERN.test(cleaned)) {
    return cleanInput.suggestedFirstSource
      ? `This module has readable study material ready. Start with ${cleanInput.suggestedFirstSource}, then review the remaining sources before generating a learning pack.`
      : 'This module has readable study material ready for review.'
  }
  return cleaned
}

function sanitizeGeneratedText(value: string) {
  return value
    .replace(/^slide:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreNoise(value: string) {
  if (!value) return 0
  let score = 0
  if (ADMIN_NOISE_PATTERN.test(value)) score += 30
  if (ASSIGNMENT_PROMPT_PATTERN.test(value)) score += 25
  if (FILE_NAME_ONLY_PATTERN.test(value.trim())) score += 20
  if (/^slide:/i.test(value.trim())) score += 10
  return score
}

function normalizeSourceType(resource: ModuleResource) {
  const metadataType = typeof resource.metadata.normalizedSourceType === 'string' ? resource.metadata.normalizedSourceType.toLowerCase() : ''
  const type = `${metadataType} ${resource.resourceType}`.toLowerCase()
  if (type.includes('assignment')) return 'assignment'
  if (type.includes('quiz')) return 'assignment'
  if (type.includes('discussion')) return 'assignment'
  if (type.includes('page')) return 'page'
  if (type.includes('file') || resource.extension) return 'file'
  if (type.includes('external')) return 'external'
  return 'source'
}

function isAssignmentLike(resource: ModuleResource, text: string) {
  const type = normalizeSourceType(resource)
  return type === 'assignment' || ASSIGNMENT_PROMPT_PATTERN.test(resource.title) || ASSIGNMENT_PROMPT_PATTERN.test(text)
}

function summarizeResourceLabel(resource: ModuleResource) {
  const type = normalizeSourceType(resource)
  const extension = resource.extension ? `.${resource.extension}` : null
  if (type === 'file' && extension) return extension
  if (type === 'page') return 'Canvas page'
  if (type === 'assignment') return 'task instructions'
  if (type === 'external') return 'external link'
  return resource.resourceType
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
  return process.env.OPENAI_SUMMARY_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || SUMMARY_MODEL_FALLBACK
}

async function getAuthenticatedSummaryClient() {
  return await createAuthenticatedSupabaseServerClient()
}

function normalizeExtractionStatus(value: unknown): ModuleResource['extractionStatus'] {
  return value === 'pending' || value === 'processing' || value === 'extracted' || value === 'completed' || value === 'metadata_only' || value === 'unsupported' || value === 'empty' || value === 'failed'
    ? value
    : 'metadata_only'
}

export function isMissingSummarySchemaError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? ''
  return error?.code === 'PGRST205'
    || error?.code === '42P01'
    || /relation .* does not exist/i.test(message)
    || /could not find (?:the )?table .* in (?:the )?schema cache/i.test(message)
}

export function isSummaryPermissionError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? ''
  return error?.code === '42501'
    || /permission denied/i.test(message)
    || /row-level security|row level security|\brls\b/i.test(message)
}

function logSummaryAvailabilityCheck(input: {
  moduleId: string
  hasUserId: boolean
  error: { code?: string | null; message?: string | null } | null | undefined
  tableMissing: boolean
}) {
  console.info('[Summary availability]', {
    moduleId: input.moduleId,
    userIdPresent: input.hasUserId,
    errorCode: input.error?.code ?? null,
    errorMessage: input.error?.message ?? null,
    tableMissing: input.tableMissing,
  })
}

function isExpectedSummarySkip(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /not enough|cannot be summarized|packet tracer|OPENAI_API_KEY is not set/i.test(message)
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
