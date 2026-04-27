type StudyResourceLike = {
  type: string
  kind?: 'study_file' | 'practice_link' | 'assignment' | 'quiz' | 'discussion' | 'reference' | 'announcement'
  extension?: string | null
  contentType?: string | null
}

export function isCanvasPageResourceType(type: string | null | undefined) {
  const normalized = type?.toLowerCase() ?? ''
  return normalized.includes('page') || normalized.includes('wiki')
}

export function getStudySourceTypeLabel(resource: StudyResourceLike) {
  if (isCanvasPageResourceType(resource.type)) return 'Canvas Page'

  const extension = resource.extension?.toLowerCase() ?? null
  const contentType = resource.contentType?.toLowerCase() ?? null

  if (extension === 'pdf') return 'PDF'
  if (extension === 'docx') return 'DOCX'
  if (extension === 'doc') return 'DOC'
  if (extension === 'pptx') return 'PPTX'
  if (extension === 'ppt') return 'PPT'
  if (extension === 'txt') return 'TXT'
  if (extension === 'md') return 'Markdown'
  if (extension === 'csv') return 'CSV'
  if (extension === 'html' || extension === 'htm') return 'HTML'
  if (contentType?.includes('pdf')) return 'PDF'
  if (contentType?.includes('wordprocessingml.document')) return 'DOCX'
  if (contentType?.includes('msword')) return 'DOC'
  if (contentType?.includes('presentation')) return 'Slide deck'
  if (contentType?.includes('text/html')) return 'HTML'

  return 'Study material'
}

export function getLearnResourceKindLabel(resource: Required<Pick<StudyResourceLike, 'kind' | 'type'>>) {
  if (resource.kind === 'study_file') {
    return isCanvasPageResourceType(resource.type) ? 'Study page' : 'Study file'
  }
  if (resource.kind === 'practice_link') return 'Practice link'
  if (resource.kind === 'assignment') return 'Assignment'
  if (resource.kind === 'quiz') return 'Quiz'
  if (resource.kind === 'discussion') return 'Discussion'
  if (resource.kind === 'reference') return 'Reference'
  return 'Announcement'
}

export function getCanvasSourceLabel(resource: Pick<StudyResourceLike, 'type'>) {
  return isCanvasPageResourceType(resource.type) ? 'Canvas page' : 'Canvas file'
}

export function getStudySourceNoun(resource: Pick<StudyResourceLike, 'type'>) {
  return isCanvasPageResourceType(resource.type) ? 'page' : 'file'
}
