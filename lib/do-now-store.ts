import { createHash, randomUUID } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'
import {
  buildTaskDraftUserPrompt,
  isTaskDraftResponse,
  TASK_DRAFT_SYSTEM_PROMPT,
  type TaskDraftApiRequest,
  type TaskDraftResponse,
} from '@/lib/do-now'
import { getAuthenticatedUserIdFromRequest } from '@/lib/auth'
import { isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'
import { serializeErrorForLogging } from '@/lib/supabase'

const AUTO_PROMPT_USER_COOKIE = 'stay-focused-user-key'
const AUTO_PROMPT_PROMPT_VERSION = 'v1'
const AUTHENTICATED_AUTO_PROMPT_KEY_PREFIX = 'auth:'

interface AutoPromptResultRow {
  user_id: string | null
  user_key: string
  source_key: string
  content_hash: string
  prompt_text: string
  output_json: unknown
  output_text: string | null
  created_at: string
  updated_at: string
}

export interface AutoPromptLookupResult {
  userId: string | null
  userKey: string
  storageKey: string
  promptText: string
  contentHash: string
  cachedDraft: TaskDraftResponse | null
}

export async function loadSavedAutoPrompt(
  request: NextRequest,
  payload: TaskDraftApiRequest,
): Promise<AutoPromptLookupResult> {
  const userKey = getAutoPromptUserKey(request)
  const userId = await getAuthenticatedUserIdFromRequest(request)
  const storageKey = getAutoPromptStorageKey(userKey, userId)
  const promptText = buildTaskDraftUserPrompt(payload)
  const contentHash = getAutoPromptContentHash(promptText)
  const client = getAutoPromptRouteClient(request)

  if (!client) {
    return {
      userId,
      userKey,
      storageKey,
      promptText,
      contentHash,
      cachedDraft: null,
    }
  }

  const authenticatedResult = await readAutoPromptResult({
    client,
    userKey,
    sourceKey: payload.sourceKey,
    contentHash,
  })

  if (authenticatedResult?.row) {
    return {
      userId,
      userKey,
      storageKey,
      promptText,
      contentHash,
      cachedDraft: isTaskDraftResponse(authenticatedResult.row.output_json) ? authenticatedResult.row.output_json : null,
    }
  }

  if (userId) {
    const anonymousFallbackResult = await readAutoPromptResult({
      client,
      userKey,
      sourceKey: payload.sourceKey,
      contentHash,
      legacyAnonymous: true,
    })

    if (anonymousFallbackResult?.row) {
      const cachedDraft = isTaskDraftResponse(anonymousFallbackResult.row.output_json)
        ? anonymousFallbackResult.row.output_json
        : null

      await saveAutoPromptRow({
        request,
        payload,
        userId,
        userKey,
        storageKey,
        promptText: anonymousFallbackResult.row.prompt_text,
        contentHash,
        draft: cachedDraft,
        rawText: anonymousFallbackResult.row.output_text ?? undefined,
      })

      return {
        userId,
        userKey,
        storageKey,
        promptText,
        contentHash,
        cachedDraft,
      }
    }
  }

  return {
    userId,
    userKey,
    storageKey,
    promptText,
    contentHash,
    cachedDraft: null,
  }
}

export async function saveAutoPromptResult(input: {
  request: NextRequest
  payload: TaskDraftApiRequest
  userId: string | null
  userKey: string
  storageKey: string
  promptText: string
  contentHash: string
  draft: TaskDraftResponse
  rawText?: string
}) {
  await saveAutoPromptRow(input)
}

async function saveAutoPromptRow(input: {
  request: NextRequest
  payload: TaskDraftApiRequest
  userId: string | null
  userKey: string
  storageKey: string
  promptText: string
  contentHash: string
  draft: TaskDraftResponse | null
  rawText?: string
}) {
  if (!input.draft) return

  const client = getAutoPromptRouteClient(input.request)
  if (!client) return

  const { error } = await client.rpc('upsert_auto_prompt_result_for_request', {
    p_user_key: input.userKey,
    p_source_key: input.payload.sourceKey,
    p_content_hash: input.contentHash,
    p_prompt_text: input.promptText,
    p_output_json: input.draft,
    p_output_text: input.rawText ?? null,
  })

  if (error) {
    logAutoPromptStoreIssue('save_failed', error, {
      userId: input.userId,
      userKey: input.userKey,
      storageKey: input.storageKey,
      sourceKey: input.payload.sourceKey,
      contentHash: input.contentHash,
    })
  }
}

export function applyAutoPromptUserCookie(response: NextResponse, userKey: string) {
  response.cookies.set(AUTO_PROMPT_USER_COOKIE, userKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}

function getAutoPromptUserKey(request: NextRequest) {
  const existing = request.cookies.get(AUTO_PROMPT_USER_COOKIE)?.value?.trim()
  if (existing) return existing
  return randomUUID()
}

function getAutoPromptStorageKey(userKey: string, userId: string | null) {
  if (!userId) return userKey
  return `${AUTHENTICATED_AUTO_PROMPT_KEY_PREFIX}${userId}`
}

function getAutoPromptContentHash(promptText: string) {
  return createHash('sha256')
    .update(AUTO_PROMPT_PROMPT_VERSION)
    .update('\n')
    .update(TASK_DRAFT_SYSTEM_PROMPT)
    .update('\n')
    .update(promptText)
    .digest('hex')
}

function logAutoPromptStoreIssue(step: string, error: PostgrestError, context: Record<string, unknown>) {
  console.error('[auto-prompt-store]', {
    step,
    ...context,
    error: serializeErrorForLogging(error),
  })
}

async function readAutoPromptResult(input: {
  client: ReturnType<typeof createSupabaseRouteClient>
  userKey: string
  sourceKey: string
  contentHash: string
  legacyAnonymous?: boolean
}) {
  const rpcName = input.legacyAnonymous
    ? 'get_legacy_anonymous_auto_prompt_result'
    : 'get_auto_prompt_result_for_request'

  const { data, error } = await input.client.rpc(rpcName, {
    p_user_key: input.userKey,
    p_source_key: input.sourceKey,
    p_content_hash: input.contentHash,
  })

  if (error) {
    logAutoPromptStoreIssue('load_failed', error, {
      legacyAnonymous: Boolean(input.legacyAnonymous),
      userKey: input.userKey,
      sourceKey: input.sourceKey,
      contentHash: input.contentHash,
    })
    return null
  }

  const row = Array.isArray(data)
    ? (data[0] as AutoPromptResultRow | undefined)
    : (data as AutoPromptResultRow | null)

  return { row: row ?? null }
}

function getAutoPromptRouteClient(request: NextRequest) {
  if (!isSupabaseAuthConfigured) return null

  try {
    return createSupabaseRouteClient(request)
  } catch (error) {
    console.error('[auto-prompt-store] Failed to create route client.', serializeErrorForLogging(error))
    return null
  }
}
