import type { ModuleResourceWorkflowOverride, StudyFileProgressStatus } from '@/lib/types'

export const STUDY_FILE_PROGRESS_OPTIONS: StudyFileProgressStatus[] = ['not_started', 'skimmed', 'reviewed']

export function getStudyFileProgressLabel(status: StudyFileProgressStatus) {
  if (status === 'skimmed') return 'Skimmed'
  if (status === 'reviewed') return 'Reviewed'
  return 'Not started'
}

export function getWorkflowOverrideLabel(override: ModuleResourceWorkflowOverride) {
  return override === 'activity' ? 'Treated as activity' : 'Study material'
}

export function getWorkflowOverrideActionLabel(override: ModuleResourceWorkflowOverride) {
  return override === 'activity' ? 'Keep as study material' : 'Treat as activity instead'
}
