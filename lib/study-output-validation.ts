import { getStudyOutputKindLabel, isTaskOutputStudyOutputContent } from '@/lib/study-output-content'
import type { StudyOutputContent, StudyOutputKind, StudyOutputSourceKind } from '@/lib/types'
import type { StudyOutputSaveFailure } from '@/lib/study-output-errors'

export function validateStudyOutputSaveInput(input: {
  sourceKind: StudyOutputSourceKind
  sourceNoteId: string | null
  sourceTaskId: string | null
  outputKind: StudyOutputKind
  title: string
  content: StudyOutputContent
}): StudyOutputSaveFailure | null {
  if (!input.title.trim()) {
    return {
      diagnosticCode: 'missing_title',
      diagnosticMessage: 'Study output title was empty.',
      userMessage: `Could not save this ${getStudyOutputKindLabel(input.outputKind).toLowerCase()} because its title was empty.`,
    }
  }

  if (input.sourceKind === 'task') {
    if (!input.sourceTaskId) {
      return {
        diagnosticCode: 'missing_source_task_id',
        diagnosticMessage: 'Task study output save was missing sourceTaskId.',
        userMessage: 'Could not save this task output because the task link was missing.',
      }
    }

    if (input.outputKind === 'task_output' && !isTaskOutputStudyOutputContent(input.content)) {
      return {
        diagnosticCode: 'invalid_task_output_content',
        diagnosticMessage: 'Task study output content did not match task-output-v1.',
        userMessage: 'Could not save this task output because the generated result was incomplete.',
      }
    }
  }

  if (input.sourceKind === 'deep_learn_note' && !input.sourceNoteId) {
    return {
      diagnosticCode: 'missing_source_note_id',
      diagnosticMessage: 'Deep Learn study output save was missing sourceNoteId.',
      userMessage: `Could not save this ${getStudyOutputKindLabel(input.outputKind).toLowerCase()} because its Deep Learn source was missing.`,
    }
  }

  return null
}
