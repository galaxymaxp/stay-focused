import { buildModuleLearnHref, buildModuleDoHref } from '@/lib/stay-focused-links'
import { classifyModuleResourceTextQuality } from '@/lib/extracted-text-quality'
import { isSchedulableResourceType } from '@/lib/scheduler/source-filter'

// ── Types ────────────────────────────────────────────────────────────────────

export interface HomeSyllabusTaskInput {
  id: string
  title: string
  taskType?: string | null
  courseName?: string | null
  moduleId?: string | null
  moduleTitle?: string | null
  deadline?: string | null
  canvasUrl?: string | null
  estimatedMinutes?: number | null
  status?: string | null
  actionScore?: number | null
}

export interface SyllabusFocusRow {
  id: string
  title: string
  typeLabel: string
  courseName: string
  moduleId: string
  moduleTitle: string
  dueAt: string | null
  urgencyLabel: string
  canvasUrl: string | null
  href: string
  estimatedMinutes: number
  scheduledBlockId?: string | null
  /** Which table this row came from — 'task_items' for canonical rows, absent for scheduled-block fallbacks */
  sourceTable?: string
}

export interface LearnFocusRow {
  id: string
  title: string
  fileTypeLabel: string
  readiness: 'ready' | 'limited'
  courseName: string | null
  moduleId: string | null
  estimatedMinutes: number
  originalHref: string | null
  href: string | null
  studyPackRefs: Array<{ id: string; title: string; quizReady: boolean }>
  scheduledBlockId?: string | null
  /** Which table this row came from — 'module_resources' for canonical rows, absent for scheduled-block fallbacks */
  sourceTable?: string
}

/**
 * Minimal shape of a module_resources row as returned from a Supabase query.
 * Matches the snake_case column names from the DB.
 */
export interface ModuleResourceRow {
  id: string
  course_id: string | null
  module_id: string | null
  title: string
  resource_type: string | null
  extracted_text: string | null
  extracted_text_preview: string | null
  visual_extraction_status: string | null
  visual_extracted_text: string | null
  html_url: string | null
  source_url: string | null
  estimated_minutes: number | null
  extraction_status: string | null
  extracted_char_count: number | null
}

const DEFAULT_TASK_MINUTES = 20
const DEFAULT_LEARN_MINUTES = 30

// ── Builders ─────────────────────────────────────────────────────────────────

/**
 * Build canonical Syllabus focus rows from task_items.
 * These match the Canvas Syllabus / Course Summary view: assignments, quizzes,
 * discussions, and any graded or due items.
 */
export function buildSyllabusFocusRows(taskItems: HomeSyllabusTaskInput[]): SyllabusFocusRow[] {
  return taskItems
    .filter((item) => item.status !== 'completed')
    .sort(compareSyllabusRows)
    .map((item) => ({
      id: item.id,
      title: item.title,
      typeLabel: getTaskTypeLabel(item.taskType),
      courseName: item.courseName ?? '',
      moduleId: item.moduleId ?? '',
      moduleTitle: item.moduleTitle ?? '',
      dueAt: item.deadline ?? null,
      urgencyLabel: deriveUrgencyLabel(item),
      canvasUrl: item.canvasUrl ?? null,
      // Open Canvas directly when canvas_url is available; fall back to Do page
      href: item.canvasUrl ?? buildModuleDoHref(item.moduleId ?? '', { taskTitle: item.title }),
      estimatedMinutes: item.estimatedMinutes ?? DEFAULT_TASK_MINUTES,
      sourceTable: 'task_items',
    }))
}

/**
 * Build canonical Learn focus rows from module_resources.
 * Only includes "Ready for Deep Learn" resources: PDFs, PPT/PPTX, DOC/DOCX,
 * Canvas pages, and other readable files — matching the /modules/:id/learn page.
 * Quiz-type Canvas resources are excluded.
 */
export function buildLearnFocusRows(
  resources: ModuleResourceRow[],
  studyPacksByResourceId: Record<string, Array<{ id: string; title: string; quizReady: boolean }>>,
  courseNameById: Record<string, string>,
): LearnFocusRow[] {
  return resources
    .filter(isReadyForLearn)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((resource) => {
      const moduleLearnHref = resource.module_id
        ? buildModuleLearnHref(resource.module_id, { resourceId: resource.id })
        : null
      const originalHref = resource.source_url ?? resource.html_url ?? null
      return {
        id: resource.id,
        title: resource.title,
        fileTypeLabel: getFileTypeLabel(resource.resource_type),
        readiness: classifyLearnReadiness(resource),
        courseName: resource.course_id ? (courseNameById[resource.course_id] ?? null) : null,
        moduleId: resource.module_id ?? null,
        estimatedMinutes: resource.estimated_minutes ?? DEFAULT_LEARN_MINUTES,
        originalHref,
        href: moduleLearnHref ?? originalHref,
        studyPackRefs: studyPacksByResourceId[resource.id] ?? [],
        sourceTable: 'module_resources',
      }
    })
}

/**
 * Fit an ordered list of rows into a free-time window by assigning sequential
 * start/end times. Stops when the window is full. This is a pure view transform —
 * no DB writes occur. Existing rows without estimatedMinutes use defaultMinutes.
 *
 * Durations are clamped to [10, 60] minutes. If the remaining window is at least
 * 10 minutes but shorter than the row duration, the row is shortened to fill the
 * remaining time rather than being dropped.
 */
export function fitFocusRowsToWindow<T extends { estimatedMinutes?: number }>(
  rows: T[],
  windowStartIso: string,
  windowEndIso: string,
  defaultMinutes = 25,
): Array<T & { startAt: string; endAt: string }> {
  const windowEndMs = new Date(windowEndIso).getTime()
  let cursorMs = new Date(windowStartIso).getTime()
  const result: Array<T & { startAt: string; endAt: string }> = []

  for (const row of rows) {
    const remainingMinutes = (windowEndMs - cursorMs) / 60_000
    if (remainingMinutes < 10) break
    const requestedMinutes = normalizeFocusDurationMinutes(row.estimatedMinutes, defaultMinutes)
    const minutes = Math.min(requestedMinutes, remainingMinutes)
    const endMs = cursorMs + minutes * 60_000
    result.push({
      ...row,
      startAt: new Date(cursorMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
    })
    cursorMs = endMs
  }

  return result
}

function normalizeFocusDurationMinutes(value: number | null | undefined, defaultMinutes: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) return defaultMinutes
  return Math.min(Math.max(Math.round(value), 10), 60)
}

// ── Internal helpers ─────────────────────────────────────────────────────────

type VisualStatus = 'not_started' | 'available' | 'queued' | 'running' | 'completed' | 'failed' | 'skipped'

function toVisualStatus(value: string | null | undefined): VisualStatus | undefined {
  if (!value) return undefined
  const allowed: VisualStatus[] = ['not_started', 'available', 'queued', 'running', 'completed', 'failed', 'skipped']
  return (allowed as string[]).includes(value) ? (value as VisualStatus) : undefined
}

function isReadyForLearn(resource: ModuleResourceRow): boolean {
  if (!isSchedulableResourceType(resource.resource_type)) return false
  // Canvas pages are always in the Learn lane even without extracted text
  const type = (resource.resource_type ?? '').toLowerCase()
  if (type === 'page' || type === 'canvas_page') return true
  // Honour extraction_status + extracted_char_count (same as /modules/:id/learn):
  // if the pipeline has completed extraction and logged enough chars, it's ready
  // even if extracted_text itself is null in the select (e.g. large text not returned).
  const status = resource.extraction_status ?? ''
  const charCount = resource.extracted_char_count ?? 0
  if ((status === 'completed' || status === 'extracted') && charCount >= 120) return true
  const quality = classifyModuleResourceTextQuality({
    extractedText: resource.extracted_text,
    extractedTextPreview: resource.extracted_text_preview,
    visualExtractionStatus: toVisualStatus(resource.visual_extraction_status),
    visualExtractedText: resource.visual_extracted_text,
    title: resource.title,
  })
  return quality.usable || quality.quality === 'too_short'
}

function classifyLearnReadiness(resource: ModuleResourceRow): 'ready' | 'limited' {
  const type = (resource.resource_type ?? '').toLowerCase()
  if (type === 'page' || type === 'canvas_page') return 'ready'
  const status = resource.extraction_status ?? ''
  const charCount = resource.extracted_char_count ?? 0
  if ((status === 'completed' || status === 'extracted') && charCount >= 120) return 'ready'
  const quality = classifyModuleResourceTextQuality({
    extractedText: resource.extracted_text,
    extractedTextPreview: resource.extracted_text_preview,
    visualExtractionStatus: toVisualStatus(resource.visual_extraction_status),
    visualExtractedText: resource.visual_extracted_text,
    title: resource.title,
  })
  return quality.usable ? 'ready' : 'limited'
}

function getFileTypeLabel(resourceType: string | null | undefined): string {
  const type = (resourceType ?? '').toLowerCase()
  if (type === 'page' || type === 'canvas_page') return 'Canvas page'
  if (type.includes('pdf')) return 'PDF'
  if (type.includes('pptx')) return 'Slides'
  if (type.includes('ppt')) return 'Slides'
  if (type.includes('docx')) return 'Document'
  if (type.includes('doc')) return 'Document'
  return 'File'
}

function getTaskTypeLabel(taskType: string | null | undefined): string {
  if (taskType === 'quiz') return 'Quiz'
  if (taskType === 'discussion') return 'Discussion'
  if (taskType === 'project') return 'Project'
  if (taskType === 'reading') return 'Reading'
  if (taskType === 'prep') return 'Prep'
  return 'Assignment'
}

function deriveUrgencyLabel(task: HomeSyllabusTaskInput): string {
  if (task.status === 'completed') return 'Completed'
  if (!task.deadline) return 'No due date'
  const due = new Date(task.deadline)
  if (Number.isNaN(due.getTime())) return 'No due date'
  const daysUntil = Math.ceil((due.getTime() - Date.now()) / (24 * 3600_000))
  if (daysUntil < 0) return 'Overdue'
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  if (daysUntil <= 3) return 'Due soon'
  return 'Upcoming'
}

function compareSyllabusRows(a: HomeSyllabusTaskInput, b: HomeSyllabusTaskInput): number {
  const aDue = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY
  const bDue = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY
  if (aDue !== bDue) return aDue - bDue
  return (b.actionScore ?? 0) - (a.actionScore ?? 0)
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

/**
 * Minimal shape of a scheduled_blocks row used for merging.
 * Matches the camelCase fields mapped in page server components.
 */
export interface ScheduledBlockInput {
  id: string
  sourceTable: string
  sourceId: string | null
  courseId: string | null
  title: string
  startAt: string
  endAt: string
  status: string
  subtitle?: string | null
}

/**
 * Merge scheduled_blocks into canonical focus row lists.
 *
 * For each scheduled block:
 * - If a canonical row exists (matching sourceId), attach scheduledBlockId to it.
 * - If no canonical row exists and the source is syllabus-eligible (task_items,
 *   tasks, deadlines), add a fallback SyllabusFocusRow built from block data.
 * - If no canonical row exists and the source is learn-eligible (modules,
 *   module_resources), add a fallback LearnFocusRow.
 * - learning_items, deep_learn_notes, and drafts are always skipped.
 *
 * Completed and skipped blocks do not get fallback rows (they only appear in
 * the Completed section via the scheduledBlocks prop in TodayDashboard).
 */
export function mergeScheduledBlocksIntoFocusRows(
  syllabusFocusRows: SyllabusFocusRow[],
  learnFocusRows: LearnFocusRow[],
  scheduledBlocks: ScheduledBlockInput[],
  courseNameById: Record<string, string>,
): {
  mergedSyllabus: SyllabusFocusRow[]
  mergedLearn: LearnFocusRow[]
} {
  // Copy canonical rows into maps (keyed by canonical source id) so we can mutate copies
  const syllabusMap = new Map<string, SyllabusFocusRow>()
  for (const row of syllabusFocusRows) syllabusMap.set(row.id, { ...row })

  const learnMap = new Map<string, LearnFocusRow>()
  for (const row of learnFocusRows) learnMap.set(row.id, { ...row })

  const fallbackSyllabus: SyllabusFocusRow[] = []
  const fallbackLearn: LearnFocusRow[] = []

  for (const block of scheduledBlocks) {
    const { sourceTable, sourceId, id: blockId, status } = block

    if (
      sourceTable === 'learning_items' ||
      sourceTable === 'deep_learn_notes' ||
      sourceTable === 'drafts'
    ) continue

    const isSyllabus =
      sourceTable === 'task_items' || sourceTable === 'tasks' || sourceTable === 'deadlines'
    const isLearn = sourceTable === 'module_resources' || sourceTable === 'modules'

    if (isSyllabus) {
      if (sourceId && syllabusMap.has(sourceId)) {
        const existing = syllabusMap.get(sourceId)!
        syllabusMap.set(sourceId, { ...existing, scheduledBlockId: blockId })
      } else if (status !== 'completed' && status !== 'skipped') {
        const courseName = block.courseId ? (courseNameById[block.courseId] ?? '') : ''
        fallbackSyllabus.push({
          id: blockId,
          title: block.title,
          typeLabel: deriveTypeLabelFromSubtitle(block.subtitle),
          courseName,
          moduleId: '',
          moduleTitle: '',
          dueAt: null,
          urgencyLabel: 'Scheduled',
          canvasUrl: null,
          href: '/tasks',
          estimatedMinutes: DEFAULT_TASK_MINUTES,
          scheduledBlockId: blockId,
        })
      }
    } else if (isLearn) {
      if (sourceId && learnMap.has(sourceId)) {
        const existing = learnMap.get(sourceId)!
        learnMap.set(sourceId, { ...existing, scheduledBlockId: blockId })
      } else if (status !== 'completed' && status !== 'skipped') {
        const courseName = block.courseId ? (courseNameById[block.courseId] ?? null) : null
        const href =
          sourceTable === 'modules' && sourceId
            ? buildModuleLearnHref(sourceId)
            : null
        fallbackLearn.push({
          id: blockId,
          title: block.title,
          fileTypeLabel: sourceTable === 'modules' ? 'Module' : 'File',
          readiness: 'ready',
          courseName,
          moduleId: sourceTable === 'modules' ? (sourceId ?? null) : null,
          estimatedMinutes: DEFAULT_LEARN_MINUTES,
          originalHref: null,
          href,
          studyPackRefs: [],
          scheduledBlockId: blockId,
        })
      }
    }
  }

  return {
    mergedSyllabus: [...syllabusMap.values(), ...fallbackSyllabus],
    mergedLearn: [...learnMap.values(), ...fallbackLearn],
  }
}

function deriveTypeLabelFromSubtitle(subtitle: string | null | undefined): string {
  if (!subtitle) return 'Assignment'
  const s = subtitle.toLowerCase()
  if (s.includes('quiz')) return 'Quiz'
  if (s.includes('draft') || s.includes('drafting')) return 'Draft'
  if (s.includes('read')) return 'Reading'
  return 'Assignment'
}
