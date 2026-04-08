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
import { serializeErrorForLogging, supabase } from '@/lib/supabase'

const AUTO_PROMPT_USER_COOKIE = 'stay-focused-user-key'
const AUTO_PROMPT_PROMPT_VERSION = 'v1'

interface AutoPromptResultRow {
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
  userKey: string
  promptText: string
  contentHash: string
  cachedDraft: TaskDraftResponse | null
}

export async function loadSavedAutoPrompt(
  request: NextRequest,
  payload: TaskDraftApiRequest,
): Promise<AutoPromptLookupResult> {
  const userKey = getAutoPromptUserKey(request)
  const promptText = buildTaskDraftUserPrompt(payload)
  const contentHash = getAutoPromptContentHash(promptText)

  if (!supabase) {
    return {
      userKey,
      promptText,
      contentHash,
      cachedDraft: null,
    }
  }

  const { data, error } = await supabase
    .from('auto_prompt_results')
    .select('user_key, source_key, content_hash, prompt_text, output_json, output_text, created_at, updated_at')
    .eq('user_key', userKey)
    .eq('source_key', payload.sourceKey)
    .eq('content_hash', contentHash)
    .maybeSingle<AutoPromptResultRow>()

  if (error) {
    logAutoPromptStoreIssue('load_failed', error, {
      userKey,
      sourceKey: payload.sourceKey,
      contentHash,
    })
  }

  return {
    userKey,
    promptText,
    contentHash,
    cachedDraft: isTaskDraftResponse(data?.output_json) ? data.output_json : null,
  }
}

export async function saveAutoPromptResult(input: {
  payload: TaskDraftApiRequest
  userKey: string
  promptText: string
  contentHash: string
  draft: TaskDraftResponse
  rawText?: string
}) {
  if (!supabase) return

  const { error } = await supabase
    .from('auto_prompt_results')
    .upsert({
      user_key: input.userKey,
      source_key: input.payload.sourceKey,
      content_hash: input.contentHash,
      prompt_text: input.promptText,
      output_json: input.draft,
      output_text: input.rawText ?? null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_key,source_key,content_hash',
    })

  if (error) {
    logAutoPromptStoreIssue('save_failed', error, {
      userKey: input.userKey,
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
