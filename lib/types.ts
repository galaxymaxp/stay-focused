import { buildDeepLearnNoteHref, buildModuleDoHref, buildModuleLearnHref } from '@/lib/stay-focused-links'

export type ModuleStatus = 'pending' | 'processed' | 'error'
export type TaskStatus = 'pending' | 'completed'
export type TaskCompletionOrigin = 'manual' | 'canvas'
export type TaskPlanningAnnotation = 'best_next_step' | 'needs_attention' | 'worth_reviewing' | 'none'
export type Priority = 'high' | 'medium' | 'low'
export type ModuleResourceExtractionStatus = 'pending' | 'processing' | 'extracted' | 'completed' | 'metadata_only' | 'unsupported' | 'empty' | 'failed'
export type ModuleResourceVisualExtractionStatus = 'not_started' | 'available' | 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
export type ModuleResourceCapability = 'supported' | 'partial' | 'unsupported' | 'failed'
export type ModuleResourceQuality = 'strong' | 'usable' | 'weak' | 'empty' | 'unsupported' | 'failed'
export type ModuleResourceGroundingLevel = 'strong' | 'weak' | 'none'
export type StudyFileProgressStatus = 'not_started' | 'skimmed' | 'reviewed'
export type ModuleResourceWorkflowOverride = 'study' | 'activity'
export type ModuleTermStatus = 'approved' | 'rejected'
export type ModuleTermOrigin = 'ai' | 'user'
export type DeepLearnNoteStatus = 'pending' | 'ready' | 'failed'
export type DeepLearnTermImportance = 'high' | 'medium' | 'low'
export type DeepLearnGroundingStrategy = 'stored_extract' | 'source_refetch' | 'scan_fallback' | 'context_only' | 'insufficient'
export type DeepLearnReadiness = 'text_ready' | 'partial_text' | 'scan_fallback' | 'unreadable'
export type DeepLearnBlockedReason =
  | 'no_stored_resource'
  | 'no_source_path'
  | 'unsupported_source_type'
  | 'source_retrieval_failed'
  | 'extraction_unusable_after_fetch'
  | 'auth_required'
  | 'external_link_only'
export type DeepLearnNoteLoadAvailability = 'available' | 'unavailable'
export type DeepLearnNoteLoadReason =
  | 'ok'
  | 'missing'
  | 'not_configured'
  | 'unauthenticated'
  | 'table_missing'
  | 'column_missing'
  | 'permission_denied'
  | 'query_failed'

export interface Course {
  id: string
  code: string
  name: string
  term: string
  instructor: string
  focusLabel: string
  colorToken: 'yellow' | 'orange' | 'blue' | 'green'
}

export interface Module {
  id: string
  courseId?: string
  title: string
  raw_content: string
  summary: string | null
  concepts?: string[]
  study_prompts?: string[]
  recommended_order: string[] | null
  status: ModuleStatus
  order?: number
  released_at?: string
  estimated_minutes?: number
  priority_signal?: Priority
  showInLearn?: boolean
  created_at: string
}

export interface ModuleResource {
  id: string
  moduleId: string
  courseId: string | null
  canvasModuleId: number | null
  canvasItemId: number | null
  canvasFileId: number | null
  title: string
  resourceType: string
  contentType: string | null
  extension: string | null
  sourceUrl: string | null
  htmlUrl: string | null
  extractionStatus: ModuleResourceExtractionStatus
  extractedText: string | null
  extractedTextPreview: string | null
  extractedCharCount: number
  extractionError: string | null
  visualExtractionStatus?: ModuleResourceVisualExtractionStatus
  visualExtractedText?: string | null
  visualExtractionError?: string | null
  pageCount?: number | null
  pagesProcessed?: number
  extractionProvider?: string | null
  required: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface ModuleResourceStudyState {
  moduleId: string
  resourceId: string
  studyProgressStatus: StudyFileProgressStatus
  workflowOverride: ModuleResourceWorkflowOverride
  lastOpenedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ModuleTerm {
  id: string
  moduleId: string
  resourceId: string | null
  normalizedTerm: string
  term: string
  definition: string | null
  explanation: string | null
  evidenceSnippet: string | null
  sourceLabel: string | null
  status: ModuleTermStatus
  origin: ModuleTermOrigin
  createdAt: string
  updatedAt: string
}

export interface DeepLearnNoteSection {
  heading: string
  body: string
}

export type DeepLearnAnswerKind =
  | 'date_event'
  | 'law_effect'
  | 'term_definition'
  | 'place_meaning'
  | 'province_capital'
  | 'person_role'
  | 'count'
  | 'timeline'
  | 'compare'
  | 'fact'

export interface DeepLearnDistinction extends DeepLearnReviewLinkFields {
  conceptA: string
  conceptB: string
  difference: string
  confusionNote: string | null
}

export interface DeepLearnWordingSet {
  exact: string | null
  examSafe: string
  simplified: string | null
}

export type DeepLearnReviewItemType =
  | 'answer_bank'
  | 'identification'
  | 'mcq'
  | 'timeline'
  | 'distinction'
  | 'quiz_target'

export interface DeepLearnReviewLinkFields {
  reviewText?: string
  draftExplanation?: string | null
  sourceSnippet?: string | null
  linkedDraftSectionId?: string | null
  itemType?: DeepLearnReviewItemType
  supportingContext?: string | null
  compareContext?: string | null
  simplifiedWording?: string | null
  confusionNotes?: string[]
  relatedConcepts?: string[]
}

export interface DeepLearnAnswerBankItem extends DeepLearnReviewLinkFields {
  cue: string
  kind: DeepLearnAnswerKind
  answer: DeepLearnWordingSet
  compactAnswer: DeepLearnWordingSet
  importance: DeepLearnTermImportance
  sortKey: string | null
  distractors: string[]
}

export interface DeepLearnIdentificationItem extends DeepLearnReviewLinkFields {
  prompt: string
  kind: DeepLearnAnswerKind
  answer: DeepLearnWordingSet
  importance: DeepLearnTermImportance
  distractors: string[]
}

export interface DeepLearnLikelyQuizTarget extends DeepLearnReviewLinkFields {
  target: string
  reason: string
  importance: DeepLearnTermImportance
}

export interface DeepLearnTimelineItem extends DeepLearnReviewLinkFields {
  label: string
  detail: string
  sortKey: string | null
  importance: DeepLearnTermImportance
}

export interface DeepLearnMultipleChoiceItem extends DeepLearnReviewLinkFields {
  question: string
  choices: string[]
  correctAnswer: string
  explanation: string | null
  importance: DeepLearnTermImportance
}

export interface DeepLearnSourceGrounding {
  sourceType: string | null
  extractionQuality: string | null
  groundingStrategy: DeepLearnGroundingStrategy
  usedAiFallback: boolean
  qualityReason: string | null
  warning: string | null
  charCount: number
}

export interface DeepLearnNote {
  id: string
  userId: string
  moduleId: string
  courseId: string | null
  resourceId: string
  status: DeepLearnNoteStatus
  title: string
  overview: string
  sections: DeepLearnNoteSection[]
  noteBody: string
  answerBank: DeepLearnAnswerBankItem[]
  identificationItems: DeepLearnIdentificationItem[]
  mcqDrill: DeepLearnMultipleChoiceItem[]
  timeline: DeepLearnTimelineItem[]
  distinctions: DeepLearnDistinction[]
  likelyQuizTargets: DeepLearnLikelyQuizTarget[]
  cautionNotes: string[]
  sourceGrounding: DeepLearnSourceGrounding
  quizReady: boolean
  promptVersion: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  generatedAt: string | null
}

export interface Task {
  id: string
  module_id: string
  canvasAssignmentId?: number | null
  title: string
  details: string | null
  deadline: string | null  // ISO date string, null if not found
  canvasUrl?: string | null
  priority: Priority
  status: TaskStatus
  completionOrigin?: TaskCompletionOrigin | null
  planningAnnotation?: TaskPlanningAnnotation
  created_at: string
}

export interface Deadline {
  id: string
  module_id: string
  label: string
  date: string  // ISO date string
  created_at: string
}

export interface LearningItem {
  id: string
  courseId: string
  moduleId: string
  title: string
  body: string
  type: 'summary' | 'concept' | 'connection' | 'review'
  order: number
}

export interface TaskItem {
  id: string
  courseId: string
  courseName: string
  moduleId: string
  moduleTitle: string
  title: string
  details: string | null
  status: TaskStatus
  priority: Priority
  deadline: string | null
  taskType: 'assignment' | 'quiz' | 'reading' | 'prep' | 'discussion' | 'project'
  estimatedMinutes: number
  extractedFrom: string
  canvasUrl?: string | null
  completionOrigin?: TaskCompletionOrigin | null
  planningAnnotation: TaskPlanningAnnotation
  moduleFreshnessScore: number
  actionScore: number
}

export interface TodayItem {
  id: string
  kind: 'task' | 'learning' | 'module'
  taskItemId?: string | null
  title: string
  courseId: string
  courseName: string
  moduleId: string
  moduleTitle: string
  supportingText: string | null
  dateTime: string | null
  priority: Priority | null
  tone: 'attention' | 'review' | 'upcoming'
  toneLabel: string
  planningAnnotation: TaskPlanningAnnotation
  planningAnnotationLabel: string
  recommendationScore: number
  href: string | null
  learnHref?: string | null
  actionLabel: string
  whyNow: string
  effortLabel: string | null
  completionStatus?: TaskStatus
  completionOrigin?: TaskCompletionOrigin | null
  canvasUrl?: string | null
}

export interface CalendarItem {
  id: string
  kind: 'task' | 'learning'
  taskItemId?: string | null
  moduleId?: string | null
  title: string
  courseName: string
  moduleTitle: string | null
  relatedText: string | null
  dateKey: string
  dateTime: string | null
  status: 'urgent' | 'dueSoon' | 'upcoming' | 'completed'
  completionStatus: TaskStatus
  completionOrigin?: TaskCompletionOrigin | null
  planningAnnotation: TaskPlanningAnnotation
  planningAnnotationLabel: string
  priority: Priority | null
  recommendationScore: number
  href: string | null
  canvasUrl?: string | null
}

export type DraftType = 'exam_reviewer' | 'study_notes' | 'summary' | 'flashcard_set'
export type DraftStatus = 'generating' | 'ready' | 'refining' | 'failed'
export type DraftSourceType = 'module_resource' | 'task' | 'module' | 'upload' | 'paste'
export type DraftLoadAvailability = 'available' | 'unavailable' | 'failed'

export interface DraftRefinementEntry {
  instruction: string
  refinedAt: string
}

export interface Draft {
  id: string
  userId: string
  courseId: string | null
  sourceType: DraftSourceType
  canonicalSourceId: string
  sourceModuleId: string | null
  sourceResourceId: string | null
  sourceFilePath: string | null
  sourceRawContent: string
  sourceTitle: string
  draftType: DraftType
  title: string
  bodyMarkdown: string
  status: DraftStatus
  refinementHistory: DraftRefinementEntry[]
  tokenCount: number | null
  generationModel: string | null
  createdAt: string
  updatedAt: string
}

// Partial type for list views — does not include heavy bodyMarkdown/sourceRawContent fields
export interface DraftSummary {
  id: string
  userId: string
  courseId: string | null
  sourceType: DraftSourceType
  canonicalSourceId: string
  sourceModuleId: string | null
  sourceResourceId?: string | null
  sourceTitle: string
  draftType: DraftType
  title: string
  status: DraftStatus
  tokenCount: number | null
  createdAt: string
  updatedAt: string
}

// Extended draft type used by the course-shelf view (includes module/course join data)
export interface DraftShelfItem {
  id: string
  entryKind: 'deep_learn_note' | 'draft'
  userId: string
  courseId: string | null
  canonicalSourceId: string
  title: string
  draftType: DraftType
  status: DraftStatus
  sourceType: DraftSourceType
  sourceTitle: string
  tokenCount: number | null
  updatedAt: string
  createdAt: string
  sourceModuleId: string | null
  sourceResourceId?: string | null
  moduleTitle: string | null
  quizReady: boolean
  summary: string | null
}

export interface StudyLibraryItem {
  id: string
  title: string
  kind: 'learning' | 'task'
  entryKind: 'draft' | 'deep_learn_note'
  subtitle?: string
  courseTitle?: string
  moduleTitle?: string
  taskTitle?: string
  updatedAt?: string
  href: string
}

interface CanonicalSourceReference {
  prefix: string | null
  value: string | null
}

export function buildStudyLibraryDetailHref(itemId: string) {
  return `/library/${encodeURIComponent(itemId)}`
}

export function parseCanonicalSourceId(canonicalSourceId: string | null | undefined): CanonicalSourceReference {
  const rawValue = canonicalSourceId?.trim() ?? ''
  if (!rawValue) {
    return { prefix: null, value: null }
  }

  const separatorIndex = rawValue.indexOf(':')
  if (separatorIndex <= 0) {
    return { prefix: null, value: rawValue }
  }

  const prefix = rawValue.slice(0, separatorIndex).trim().toLowerCase() || null
  const value = rawValue.slice(separatorIndex + 1).trim() || null

  return { prefix, value }
}

export function getTaskIdFromCanonicalSourceId(canonicalSourceId: string | null | undefined) {
  const reference = parseCanonicalSourceId(canonicalSourceId)
  if (reference.prefix !== 'task' || !reference.value) return null
  return reference.value
}

export function resolveStudyLibraryHref(
  item: Pick<DraftShelfItem, 'id' | 'entryKind' | 'sourceType' | 'sourceModuleId' | 'sourceResourceId' | 'canonicalSourceId'>,
) {
  const detailHref = buildStudyLibraryDetailHref(item.id)

  if (item.entryKind === 'deep_learn_note' && item.sourceModuleId && item.sourceResourceId) {
    return buildDeepLearnNoteHref(item.sourceModuleId, item.sourceResourceId)
  }

  if (item.sourceType === 'task' && item.sourceModuleId) {
    const taskId = getTaskIdFromCanonicalSourceId(item.canonicalSourceId)
    if (taskId) {
      return buildModuleDoHref(item.sourceModuleId, { taskId })
    }

    return detailHref
  }

  if (item.sourceType === 'module' && item.sourceModuleId) {
    return buildModuleLearnHref(item.sourceModuleId)
  }

  return detailHref
}

// What we ask OpenAI to return
export interface AIResponse {
  title: string
  summary: string
  concepts: string[]
  study_prompts: string[]
  tasks: {
    title: string
    details: string | null
    deadline: string | null
    priority: Priority
    task_type?: TaskItem['taskType']
    estimated_minutes?: number
  }[]
  deadlines: {
    label: string
    date: string
  }[]
  recommended_order: string[]
}
