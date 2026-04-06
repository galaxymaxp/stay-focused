'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
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

export async function updateTaskStatus(taskId: string, status: 'pending' | 'completed') {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from('tasks')
    .update({
      status,
      completion_origin: status === 'completed' ? 'manual' : null,
      planning_annotation: status === 'completed' ? null : undefined,
    })
    .eq('id', taskId)

  if (error) throw new Error('Failed to update task status.')

  revalidatePath('/')
}

export async function updateTaskCompletion(input: TaskCompletionInput) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const updates: PromiseLike<unknown>[] = []

  if (input.taskItemId) {
    updates.push(
      supabase
        .from('task_items')
        .update({
          status: input.status,
          completion_origin: input.status === 'completed' ? 'manual' : null,
          planning_annotation: input.status === 'completed' ? null : undefined,
        })
        .eq('id', input.taskItemId)
        .then(({ error }) => {
          if (error) throw new Error('Failed to update task item status.')
        })
    )
  } else {
    updates.push(
      supabase
        .from('task_items')
        .update({
          status: input.status,
          completion_origin: input.status === 'completed' ? 'manual' : null,
          planning_annotation: input.status === 'completed' ? null : undefined,
        })
        .eq('module_id', input.moduleId)
        .eq('title', input.title)
        .then(({ error }) => {
          if (error) throw new Error('Failed to sync task item status.')
        })
    )
  }

  if (input.legacyTaskId) {
    updates.push(
      supabase
        .from('tasks')
        .update({
          status: input.status,
          completion_origin: input.status === 'completed' ? 'manual' : null,
          planning_annotation: input.status === 'completed' ? null : undefined,
        })
        .eq('id', input.legacyTaskId)
        .then(({ error }) => {
          if (error) throw new Error('Failed to update module task status.')
        })
    )
  } else {
    updates.push(
      supabase
        .from('tasks')
        .update({
          status: input.status,
          completion_origin: input.status === 'completed' ? 'manual' : null,
          planning_annotation: input.status === 'completed' ? null : undefined,
        })
        .eq('module_id', input.moduleId)
        .eq('title', input.title)
        .then(({ error }) => {
          if (error) throw new Error('Failed to sync module task status.')
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
  if (!supabase) throw new Error('Supabase is not configured.')

  const value = input.annotation === 'none' ? null : input.annotation

  if (input.annotation === 'best_next_step') {
    const [taskItemsReset, tasksReset] = await Promise.all([
      supabase
        .from('task_items')
        .update({ planning_annotation: null })
        .eq('planning_annotation', 'best_next_step'),
      supabase
        .from('tasks')
        .update({ planning_annotation: null })
        .eq('planning_annotation', 'best_next_step'),
    ])

    if (taskItemsReset.error || tasksReset.error) {
      throw new Error('Failed to reset the existing best next step.')
    }
  }

  const updates: PromiseLike<unknown>[] = []

  if (input.taskItemId) {
    updates.push(
      supabase
        .from('task_items')
        .update({ planning_annotation: value })
        .eq('id', input.taskItemId)
        .then(({ error }) => {
          if (error) throw new Error('Failed to update task item planning state.')
        })
    )
  } else {
    updates.push(
      supabase
        .from('task_items')
        .update({ planning_annotation: value })
        .eq('module_id', input.moduleId)
        .eq('title', input.title)
        .then(({ error }) => {
          if (error) throw new Error('Failed to sync task item planning state.')
        })
    )
  }

  if (input.legacyTaskId) {
    updates.push(
      supabase
        .from('tasks')
        .update({ planning_annotation: value })
        .eq('id', input.legacyTaskId)
        .then(({ error }) => {
          if (error) throw new Error('Failed to update task planning state.')
        })
    )
  } else {
    updates.push(
      supabase
        .from('tasks')
        .update({ planning_annotation: value })
        .eq('module_id', input.moduleId)
        .eq('title', input.title)
        .then(({ error }) => {
          if (error) throw new Error('Failed to sync task planning state.')
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
  if (!supabase) return []

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false })

  if (error) throw new Error('Failed to fetch tasks.')
  return data ?? []
}
