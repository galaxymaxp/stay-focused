'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

export async function deleteModule(moduleId: string) {
  const { error } = await supabase
    .from('modules')
    .delete()
    .eq('id', moduleId)

  if (error) throw new Error('Failed to delete module.')

  revalidatePath('/canvas')
  revalidatePath('/')
}
