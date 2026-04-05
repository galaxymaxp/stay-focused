'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/lib/types'

type TaskCompletionInput = {
  status: 'pending' | 'completed'
  moduleId: string
  title: string
  taskItemId?: string | null
  legacyTaskId?: string | null
}

export async function updateTaskStatus(taskId: string, status: 'pending' | 'completed') {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from('tasks')
    .update({ status })
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
        .update({ status: input.status })
        .eq('id', input.taskItemId)
        .then(({ error }) => {
          if (error) throw new Error('Failed to update task item status.')
        })
    )
  } else {
    updates.push(
      supabase
        .from('task_items')
        .update({ status: input.status })
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
        .update({ status: input.status })
        .eq('id', input.legacyTaskId)
        .then(({ error }) => {
          if (error) throw new Error('Failed to update module task status.')
        })
    )
  } else {
    updates.push(
      supabase
        .from('tasks')
        .update({ status: input.status })
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

export async function getAllTasks(): Promise<Task[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false })

  if (error) throw new Error('Failed to fetch tasks.')
  return data ?? []
}
