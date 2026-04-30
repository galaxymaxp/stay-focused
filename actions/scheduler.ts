'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { generateSchedule } from '@/lib/scheduler/algorithm'
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

  const [taskItemsResult, modulesResult, resourcesResult] = await Promise.all([
    client.from('task_items').select('id,title,deadline,task_type,estimated_minutes,created_at').eq('user_id', userId).neq('status', 'completed'),
    client.from('modules').select('id,title,released_at,created_at').eq('user_id', userId),
    client.from('module_resources').select('id,title,extracted_char_count,extraction_status,created_at').eq('user_id', userId),
  ])

  if (taskItemsResult.error || modulesResult.error || resourcesResult.error) {
    console.warn('[scheduler] source data fetch failed; skipping schedule generation', {
      taskItemsError: taskItemsResult.error?.message,
      modulesError: modulesResult.error?.message,
      resourcesError: resourcesResult.error?.message,
    })
    return { generated: 0 }
  }

  const sourceItems: SchedulerItem[] = [
    ...(taskItemsResult.data ?? []).map((row) => ({
      id: row.id,
      userId,
      sourceTable: 'task_items' as const,
      title: row.title ?? 'Task',
      dueAt: row.deadline,
      taskType: row.task_type,
      estimatedMinutes: row.estimated_minutes,
      createdAt: row.created_at,
    })),
    ...(modulesResult.data ?? []).map((row) => ({
      id: row.id,
      userId,
      sourceTable: 'modules' as const,
      title: row.title ?? 'Module',
      dueAt: null,
      releasedAt: row.released_at,
      createdAt: row.created_at,
    })),
    ...(resourcesResult.data ?? []).map((row) => ({
      id: row.id,
      userId,
      sourceTable: 'module_resources' as const,
      title: row.title ?? 'Resource',
      dueAt: null,
      extractedCharCount: row.extracted_char_count,
      extractionStatus: row.extraction_status,
      createdAt: row.created_at,
    })),
  ]

  const scored = sourceItems.map(scoreSchedulerItem)
  const generatedBlocks = generateSchedule(scored, { start: timeInputToTodayIso(freeTimeStart), end: timeInputToTodayIso(freeTimeEnd) })

  const nowIso = new Date().toISOString()
  const { error: cleanupError } = await client
    .from('scheduled_blocks')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gte('start_at', nowIso)

  if (cleanupError) throw new Error('Failed to clear existing future scheduled blocks.')

  if (generatedBlocks.length > 0) {
    const { error: insertError } = await client.from('scheduled_blocks').insert(
      generatedBlocks.map((block) => ({
        user_id: block.userId,
        source_table: block.sourceTable,
        source_id: block.sourceId,
        title: block.title,
        start_at: block.startAt,
        end_at: block.endAt,
        estimated_minutes: block.estimatedMinutes,
        schedule_priority_score: block.schedulePriorityScore,
        status: block.status,
      })),
    )

    if (insertError) throw new Error('Failed to persist generated schedule blocks.')
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
