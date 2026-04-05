'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/lib/types'

export async function updateTaskStatus(taskId: string, status: 'pending' | 'completed') {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId)

  if (error) throw new Error('Failed to update task status.')

  revalidatePath('/')
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
