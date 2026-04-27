'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import type { Task, TaskPlanningAnnotation } from '@/lib/types'

type TaskCompletionInput = {
  status: 'pending' | 'completed'
  moduleId: string
  title: string
  taskItemId?: string | null
  legacyTaskId?: string | null
}

type TaskPlanningInput = {
  annotation: TaskPlanningAnnotation
  moduleId: string
  title: string
  taskItemId?: string | null
  legacyTaskId?: string | null
}

type TaskActionTable = 'tasks' | 'task_items'

function logTaskActionError(table: TaskActionTable, action: string, error: unknown) {
  const details = error && typeof error === 'object'
    ? {
        code: 'code' in error ? String((error as { code?: unknown }).code ?? '') || null : null,
        message: 'message' in error ? String((error as { message?: unknown }).message ?? '') || null : null,
      }
    : {
        code: null,
        message: error instanceof Error ? error.message : String(error),
      }

  console.error('[Task action failed]', {
    table,
    action,
    code: details.code,
    message: details.message,
  })
}

async function getTaskActionContext() {
  const client = await createAuthenticatedSupabaseServerClient()
  if (!client) throw new Error('Supabase is not configured.')

  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error) {
    logTaskActionError('tasks', 'authenticate_user', error)
    throw new Error('Failed to verify the signed-in user.')
  }

  if (!user?.id) {
    throw new Error('You need to sign in before updating tasks.')
  }

  return { client, user }
}

function throwLoggedTaskError(table: TaskActionTable, action: string, error: unknown, message: string): never {
  logTaskActionError(table, action, error)
  throw new Error(message)
}

export async function updateTaskStatus(taskId: string, status: 'pending' | 'completed') {
  const { client, user } = await getTaskActionContext()

  const { error } = await client
    .from('tasks')
    .update({
      status,
      completion_origin: status === 'completed' ? 'manual' : null,
      planning_annotation: status === 'completed' ? null : undefined,
    })
    .eq('id', taskId)
    .eq('user_id', user.id)

  if (error) throwLoggedTaskError('tasks', 'update_task_status', error, 'Failed to update task status.')

  revalidatePath('/')
}

export async function updateTaskCompletion(input: TaskCompletionInput) {
  const { client, user } = await getTaskActionContext()

  const updates: PromiseLike<unknown>[] = []

  if (input.taskItemId) {
    updates.push(
      client
        .from('task_items')
        .update({
          status: input.status,
          completion_origin: input.status === 'completed' ? 'manual' : null,
          planning_annotation: input.status === 'completed' ? null : undefined,
        })
        .eq('id', input.taskItemId)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) throwLoggedTaskError('task_items', 'update_task_item_status', error, 'Failed to update task item status.')
        })
    )
  } else {
    updates.push(
      client
        .from('task_items')
        .update({
          status: input.status,
          completion_origin: input.status === 'completed' ? 'manual' : null,
          planning_annotation: input.status === 'completed' ? null : undefined,
        })
        .eq('module_id', input.moduleId)
        .eq('title', input.title)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) throwLoggedTaskError('task_items', 'sync_task_item_status', error, 'Failed to sync task item status.')
        })
    )
  }

  if (input.legacyTaskId) {
    updates.push(
      client
        .from('tasks')
        .update({
          status: input.status,
          completion_origin: input.status === 'completed' ? 'manual' : null,
          planning_annotation: input.status === 'completed' ? null : undefined,
        })
        .eq('id', input.legacyTaskId)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) throwLoggedTaskError('tasks', 'update_legacy_task_status', error, 'Failed to update module task status.')
        })
    )
  } else {
    updates.push(
      client
        .from('tasks')
        .update({
          status: input.status,
          completion_origin: input.status === 'completed' ? 'manual' : null,
          planning_annotation: input.status === 'completed' ? null : undefined,
        })
        .eq('module_id', input.moduleId)
        .eq('title', input.title)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) throwLoggedTaskError('tasks', 'sync_legacy_task_status', error, 'Failed to sync module task status.')
        })
    )
  }

  await Promise.all(updates)

  revalidatePath('/')
  revalidatePath('/courses')
  revalidatePath('/learn')
  revalidatePath('/do')
  revalidatePath('/calendar')
  revalidatePath(`/modules/${input.moduleId}`)
  revalidatePath(`/modules/${input.moduleId}/learn`)
  revalidatePath(`/modules/${input.moduleId}/do`)
}

export async function updateTaskPlanningAnnotation(input: TaskPlanningInput) {
  const { client, user } = await getTaskActionContext()

  const value = input.annotation === 'none' ? null : input.annotation

  if (input.annotation === 'best_next_step') {
    const [taskItemsReset, tasksReset] = await Promise.all([
      client
        .from('task_items')
        .update({ planning_annotation: null })
        .eq('planning_annotation', 'best_next_step')
        .eq('user_id', user.id),
      client
        .from('tasks')
        .update({ planning_annotation: null })
        .eq('planning_annotation', 'best_next_step')
        .eq('user_id', user.id),
    ])

    if (taskItemsReset.error) throwLoggedTaskError('task_items', 'reset_best_next_step', taskItemsReset.error, 'Failed to reset the existing best next step.')
    if (tasksReset.error) throwLoggedTaskError('tasks', 'reset_best_next_step', tasksReset.error, 'Failed to reset the existing best next step.')
  }

  const updates: PromiseLike<unknown>[] = []

  if (input.taskItemId) {
    updates.push(
      client
        .from('task_items')
        .update({ planning_annotation: value })
        .eq('id', input.taskItemId)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) throwLoggedTaskError('task_items', 'update_task_item_planning_state', error, 'Failed to update task item planning state.')
        })
    )
  } else {
    updates.push(
      client
        .from('task_items')
        .update({ planning_annotation: value })
        .eq('module_id', input.moduleId)
        .eq('title', input.title)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) throwLoggedTaskError('task_items', 'sync_task_item_planning_state', error, 'Failed to sync task item planning state.')
        })
    )
  }

  if (input.legacyTaskId) {
    updates.push(
      client
        .from('tasks')
        .update({ planning_annotation: value })
        .eq('id', input.legacyTaskId)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) throwLoggedTaskError('tasks', 'update_legacy_task_planning_state', error, 'Failed to update task planning state.')
        })
    )
  } else {
    updates.push(
      client
        .from('tasks')
        .update({ planning_annotation: value })
        .eq('module_id', input.moduleId)
        .eq('title', input.title)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) throwLoggedTaskError('tasks', 'sync_legacy_task_planning_state', error, 'Failed to sync task planning state.')
        })
    )
  }

  await Promise.all(updates)

  revalidatePath('/')
  revalidatePath('/courses')
  revalidatePath('/learn')
  revalidatePath('/do')
  revalidatePath('/calendar')
  revalidatePath(`/modules/${input.moduleId}`)
  revalidatePath(`/modules/${input.moduleId}/learn`)
  revalidatePath(`/modules/${input.moduleId}/do`)
}

export async function getAllTasks(): Promise<Task[]> {
  const { client, user } = await getTaskActionContext()

  const { data, error } = await client
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .order('deadline', { ascending: true, nullsFirst: false })

  if (error) throwLoggedTaskError('tasks', 'get_all_tasks', error, 'Failed to fetch tasks.')
  return data ?? []
}
