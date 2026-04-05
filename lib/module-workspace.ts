import { supabase } from '@/lib/supabase'
import type { Deadline, Module, Task } from '@/lib/types'

export interface ModuleWorkspaceData {
  module: Module
  tasks: Task[]
  deadlines: Deadline[]
}

export interface LearnSection {
  id: string
  title: string
  body: string
}

export async function getModuleWorkspace(id: string): Promise<ModuleWorkspaceData | null> {
  if (!supabase) return null

  const { data: module } = await supabase.from('modules').select('*').eq('id', id).single()
  if (!module) return null

  const { data: tasks } = await supabase.from('tasks').select('*').eq('module_id', id).order('created_at')
  const { data: deadlines } = await supabase.from('deadlines').select('*').eq('module_id', id).order('date')

  return {
    module,
    tasks: (tasks ?? []) as Task[],
    deadlines: (deadlines ?? []) as Deadline[],
  }
}

export function extractCourseName(rawContent?: string | null) {
  if (!rawContent) return 'Synced course'

  const firstLine = rawContent.split('\n').find((line) => line.startsWith('Course:'))
  if (!firstLine) return 'Synced course'

  return firstLine
    .replace(/^Course:\s*/, '')
    .replace(/\s+\([^)]+\)\s*$/, '')
    .trim() || 'Synced course'
}

export function buildLearnSections(module: Module) {
  const cleanLines = sanitizeRawContent(module.raw_content)
  const readingBlocks = groupReadingBlocks(cleanLines)
  const conceptLines = cleanLines.filter((line) => line.length <= 88).slice(0, 5)
  const pointLines = cleanLines.filter((line) => line.length > 40).slice(0, 4)
  const simplifiedExplanation = module.summary
    ? simplifySummary(module.summary)
    : readingBlocks[0] ?? 'This module collects the main ideas and tasks from your Canvas material in a simpler, calmer format.'

  const sections: LearnSection[] = []

  if (module.summary) {
    sections.push({
      id: 'summary',
      title: 'Quick Summary',
      body: module.summary,
    })
  }

  if (conceptLines.length > 0) {
    sections.push({
      id: 'concepts',
      title: 'Key Concepts',
      body: conceptLines.join('\n'),
    })
  }

  if (pointLines.length > 0) {
    sections.push({
      id: 'points',
      title: 'Important Points',
      body: pointLines.join('\n\n'),
    })
  }

  sections.push({
    id: 'explanation',
    title: 'Simplified Explanation',
    body: simplifiedExplanation,
  })

  readingBlocks.slice(0, 4).forEach((block, index) => {
    sections.push({
      id: `reading-${index + 1}`,
      title: `Reading Block ${index + 1}`,
      body: block,
    })
  })

  return sections
}

function sanitizeRawContent(rawContent: string) {
  return rawContent
    .split('\n')
    .map((line) => line.replace(/^Course:\s*.+$/, '').trim())
    .filter(Boolean)
}

function groupReadingBlocks(lines: string[]) {
  const blocks: string[] = []
  let current: string[] = []

  for (const line of lines) {
    current.push(line)

    const joined = current.join(' ')
    if (joined.length >= 240 || /[.!?]$/.test(line)) {
      blocks.push(joined)
      current = []
    }
  }

  if (current.length > 0) {
    blocks.push(current.join(' '))
  }

  return blocks.filter(Boolean)
}

function simplifySummary(summary: string) {
  const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length <= 1) return summary

  return [
    sentences[0],
    sentences[1] ?? '',
  ].filter(Boolean).join(' ')
}
