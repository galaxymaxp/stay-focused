'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { classifyModuleResourceTextQuality } from '@/lib/extracted-text-quality'
import { generateSchedule } from '@/lib/scheduler/algorithm'
import { isSchedulableResourceType } from '@/lib/scheduler/source-filter'
import { findLaterSlot } from '@/lib/scheduler/move-later'
import { scoreSchedulerItem } from '@/lib/scheduler/priority'
import { timeInputToTodayIso } from '@/lib/scheduler/time'
import type { SchedulerItem } from '@/lib/scheduler/types'

async function getSchedulerContext() {
  const client = await createAuthenticatedSupabaseServerClient()
  if (!client) throw new Error('Supabase is not configured.')
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user?.id) throw new Error('You need to sign in before scheduling.')
  return { client, userId: user.id }
}

export async function generateUserSchedule(freeTimeStart: string, freeTimeEnd: string) {
  const { client, userId } = await getSchedulerContext()

  const [taskItemsResult, tasksResult, deadlinesResult, modulesResult, resourcesResult, draftsResult] = await Promise.all([
    client.from('task_items').select('id,course_id,module_id,title,deadline,task_type,estimated_minutes,created_at').eq('user_id', userId).neq('status', 'completed'),
    client.from('tasks').select('id,module_id,title,deadline,estimated_minutes,created_at').eq('user_id', userId).neq('status', 'completed'),
    client.from('deadlines').select('id,module_id,label,date,estimated_minutes,created_at').eq('user_id', userId),
    client.from('modules').select('id,course_id,title,released_at,estimated_minutes,created_at').eq('user_id', userId),
    client.from('module_resources').select('id,course_id,module_id,title,resource_type,extracted_text,extracted_text_preview,extracted_char_count,extraction_status,visual_extraction_status,visual_extracted_text,estimated_minutes,created_at').eq('user_id', userId),
    client.from('drafts').select('id,course_id,source_type,source_module_id,source_resource_id,source_title,draft_type,title,status,token_count,created_at,updated_at').eq('user_id', userId).eq('status', 'ready'),
  ])

  if (taskItemsResult.error || tasksResult.error || deadlinesResult.error || modulesResult.error || resourcesResult.error) {
    console.warn('[scheduler] source data fetch failed; skipping schedule generation', {
      taskItemsError: taskItemsResult.error?.message,
      tasksError: tasksResult.error?.message,
      deadlinesError: deadlinesResult.error?.message,
      modulesError: modulesResult.error?.message,
      resourcesError: resourcesResult.error?.message,
    })
    return { generated: 0 }
  }

  if (draftsResult.error) {
    console.warn('[scheduler] drafts unavailable; continuing without draft sources', {
      draftsError: draftsResult.error?.message,
    })
  }

  // Only include actual source materials (PDFs, PPTs, DOCXs, Canvas pages/files).
  // Quiz-type resources are Canvas assessments — not source materials — and are excluded.
  // Resources with associated study packs (deep_learn_notes) are still scheduled; the study
  // pack chip is shown as metadata under the block, not as a reason to exclude the source.
  const readyResources = (resourcesResult.data ?? []).filter((row) => {
    if (!isSchedulableResourceType(row.resource_type)) return false
    const quality = classifyModuleResourceTextQuality({
      title: row.title,
      extractedText: row.extracted_text,
      extractedTextPreview: row.extracted_text_preview,
      visualExtractionStatus: row.visual_extraction_status,
      visualExtractedText: row.visual_extracted_text,
    })
    return quality.usable || quality.quality === 'too_short'
  })

  const draftsData = !draftsResult.error ? (draftsResult.data ?? []) : []

  console.log('[scheduler:sources] raw counts', {
    task_items: taskItemsResult.data?.length ?? 0,
    tasks: tasksResult.data?.length ?? 0,
    deadlines: deadlinesResult.data?.length ?? 0,
    modules: modulesResult.data?.length ?? 0,
    module_resources_raw: resourcesResult.data?.length ?? 0,
    module_resources_ready: readyResources.length,
    drafts: draftsData.length,
  })

  const sourceItems: SchedulerItem[] = [
    ...(taskItemsResult.data ?? []).map((row) => ({
      id: row.id,
      userId,
      sourceTable: 'task_items' as const,
      courseId: row.course_id,
      title: row.title ?? 'Task',
      subtitle: getTaskSubtitle(row.task_type),
      dueAt: row.deadline,
      taskType: row.task_type,
      estimatedMinutes: row.estimated_minutes,
      createdAt: row.created_at,
    })),
    ...(tasksResult.data ?? []).map((row) => ({
      id: row.id,
      userId,
      sourceTable: 'tasks' as const,
      courseId: null,
      title: row.title ?? 'Task',
      subtitle: 'Assignment',
      dueAt: row.deadline,
      taskType: inferTaskType(row.title),
      estimatedMinutes: row.estimated_minutes,
      createdAt: row.created_at,
    })),
    ...(deadlinesResult.data ?? []).map((row) => ({
      id: row.id,
      userId,
      sourceTable: 'deadlines' as const,
      courseId: null,
      title: row.label ?? 'Deadline',
      subtitle: 'Assignment',
      dueAt: row.date,
      taskType: inferTaskType(row.label),
      estimatedMinutes: row.estimated_minutes,
      createdAt: row.created_at,
    })),
    ...(modulesResult.data ?? []).map((row) => ({
      id: row.id,
      userId,
      sourceTable: 'modules' as const,
      courseId: row.course_id,
      title: row.title ?? 'Module',
      subtitle: 'Module review',
      dueAt: null,
      taskType: 'review',
      estimatedMinutes: row.estimated_minutes,
      releasedAt: row.released_at,
      createdAt: row.created_at,
    })),
    ...readyResources.map((row) => ({
      id: row.id,
      userId,
      sourceTable: 'module_resources' as const,
      courseId: row.course_id,
      title: row.title ?? 'Resource',
      subtitle: getResourceSubtitle(row.resource_type),
      dueAt: null,
      resourceType: row.resource_type,
      extractedCharCount: row.extracted_char_count,
      extractionStatus: row.extraction_status,
      estimatedMinutes: row.estimated_minutes,
      taskType: 'reading' as const,
      createdAt: row.created_at,
    })),
    // learning_items are AI-generated module content (key ideas, "Check your understanding"
    // review prompts) — not actual source materials. They are never scheduled as standalone
    // blocks; deep_learn_notes and drafts handle the study-pack and output layers.
    // deep_learn_notes are study pack outputs attached to modules — displayed under their
    // parent module block in the UI, not scheduled as standalone blocks.
    ...draftsData.map((row) => ({
      id: row.id,
      userId,
      sourceTable: 'drafts' as const,
      courseId: row.course_id,
      title: row.title?.trim() || row.source_title?.trim() || 'Saved draft',
      subtitle: row.source_type === 'task' ? 'Draft' : 'Study draft',
      dueAt: null,
      taskType: row.source_type === 'task' ? 'project' : 'prep',
      tokenCount: row.token_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  ]

  const countsBySource: Record<string, number> = {}
  for (const item of sourceItems) {
    countsBySource[item.sourceTable] = (countsBySource[item.sourceTable] ?? 0) + 1
  }
  console.log('[scheduler:candidates] by source type', countsBySource, 'total:', sourceItems.length)

  const scored = sourceItems.map(scoreSchedulerItem)
  const generatedBlocks = generateSchedule(scored, { start: timeInputToTodayIso(freeTimeStart), end: timeInputToTodayIso(freeTimeEnd) })

  const countsByGeneratedSource: Record<string, number> = {}
  for (const block of generatedBlocks) {
    countsByGeneratedSource[block.sourceTable] = (countsByGeneratedSource[block.sourceTable] ?? 0) + 1
  }
  console.log('[scheduler:generated] blocks by source', countsByGeneratedSource, 'total:', generatedBlocks.length)

  const { error: cleanupError } = await client
    .from('scheduled_blocks')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'scheduled')

  if (cleanupError) throw new Error('Failed to clear existing scheduled blocks.')

  if (generatedBlocks.length > 0) {
    const { error: insertError } = await client.from('scheduled_blocks').insert(
      generatedBlocks.map((block) => ({
        user_id: block.userId,
        source_table: block.sourceTable,
        source_type: block.sourceType,
        source_id: block.sourceId,
        course_id: block.courseId,
        title: block.title,
        subtitle: block.subtitle,
        block_type: block.blockType,
        start_at: block.startAt,
        end_at: block.endAt,
        estimated_minutes: block.estimatedMinutes,
        estimate_confidence: confidenceToNumeric(block.estimateConfidence),
        estimate_reason: block.estimateReason,
        schedule_priority_score: block.schedulePriorityScore,
        status: block.status,
      })),
    )

    if (insertError) {
      console.error('[scheduler] insert failed', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      })
      throw new Error('Failed to persist generated schedule blocks.')
    }
  }

  revalidatePath('/')
  return { generated: generatedBlocks.length }
}

export async function updateBlockStatus(blockId: string, status: 'scheduled' | 'opened' | 'completed' | 'skipped') {
  const { client, userId } = await getSchedulerContext()
  const { error } = await client
    .from('scheduled_blocks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', blockId)
    .eq('user_id', userId)

  if (error) throw new Error('Failed to update scheduled block status.')
  revalidatePath('/')
}

function getTaskSubtitle(taskType: string | null | undefined) {
  if (taskType === 'quiz') return 'Quiz practice'
  if (taskType === 'reading' || taskType === 'prep') return 'Reading'
  if (taskType === 'project') return 'Drafting'
  return 'Assignment'
}

function getResourceSubtitle(resourceType: string | null | undefined) {
  const value = resourceType?.toLowerCase() ?? ''
  if (value.includes('quiz')) return 'Quiz practice'
  if (value.includes('file') || value.includes('pdf') || value.includes('page')) return 'Learning material'
  return 'Learning material'
}

function inferTaskType(title: string | null | undefined) {
  const value = title ?? ''
  if (/\bquiz|exam|test\b/i.test(value)) return 'quiz'
  if (/draft|essay|paper|report|write|writing/i.test(value)) return 'project'
  if (/read|chapter|article/i.test(value)) return 'reading'
  return 'assignment'
}

function confidenceToNumeric(confidence: 'low' | 'medium' | 'high') {
  if (confidence === 'high') return 0.7
  if (confidence === 'medium') return 0.55
  return 0.35
}

export async function rescheduleBlock(blockId: string, start: string, end: string) {
  const { client, userId } = await getSchedulerContext()
  const { error } = await client
    .from('scheduled_blocks')
    .update({ start_at: start, end_at: end, updated_at: new Date().toISOString() })
    .eq('id', blockId)
    .eq('user_id', userId)

  if (error) throw new Error('Failed to reschedule block.')
  revalidatePath('/')
}

export async function moveScheduledBlockLater(
  blockId: string,
): Promise<{ moved: boolean; message: string }> {
  const { client, userId } = await getSchedulerContext()

  // Fetch the target block
  const { data: block, error: fetchError } = await client
    .from('scheduled_blocks')
    .select('id,start_at,end_at,status')
    .eq('id', blockId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !block) {
    return { moved: false, message: 'Block not found.' }
  }

  if (
    block.status === 'completed' ||
    block.status === 'skipped' ||
    block.status === 'missed'
  ) {
    return { moved: false, message: 'This block is already finished.' }
  }

  // Fetch all other active blocks on the same calendar day
  const blockDate = new Date(block.start_at)
  const dayStart = new Date(blockDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(blockDate)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const { data: dayBlocks } = await client
    .from('scheduled_blocks')
    .select('id,start_at,end_at,status')
    .eq('user_id', userId)
    .neq('id', blockId)
    .gte('start_at', dayStart.toISOString())
    .lt('start_at', dayEnd.toISOString())

  const otherBlocks = (dayBlocks ?? []).map((b) => ({
    id: b.id,
    startAt: b.start_at,
    endAt: b.end_at,
    status: b.status,
  }))

  const result = findLaterSlot(
    { id: block.id, startAt: block.start_at, endAt: block.end_at, status: block.status },
    otherBlocks,
  )

  if (!result.moved) {
    return { moved: false, message: result.reason }
  }

  const { error: updateError } = await client
    .from('scheduled_blocks')
    .update({
      start_at: result.newStartAt,
      end_at: result.newEndAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', blockId)
    .eq('user_id', userId)

  if (updateError) {
    return { moved: false, message: 'Failed to move block.' }
  }

  revalidatePath('/')
  return { moved: true, message: 'Moved later.' }
}
