'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fetchCurrentUserCanvasCourses } from '@/actions/canvas'
import { queueCanvasSyncAction } from '@/actions/queue-canvas'
import { RefreshCourseResourcesButton } from '@/components/RefreshCourseResourcesButton'
import { CanvasSyncStatusCard } from '@/components/CanvasSyncStatusCard'
import { UnsyncButton } from '@/components/UnsyncButton'
import type { CanvasSyncPhase } from '@/components/useCanvasSyncStatus'
import type { CanvasCourse } from '@/lib/canvas'
import { deriveCanvasCourseStatus } from '@/lib/canvas-course-status'
import { buildCanvasCourseSyncKey } from '@/lib/canvas-sync'
import { dispatchInAppToast } from '@/lib/notifications'
import type { QueuedJob } from '@/lib/queue'
import type { SyncActivitySummary } from '@/lib/sync-activity'

interface SyncedCanvasModule {
  id: string
  courseId: string
  title: string
  summary: string | null
  courseTitle: string | null
  contentCount: number
  createdAt: string
}

type CourseSyncState = 'pending' | 'syncing' | 'synced' | 'failed'

interface CourseSyncProgress {
  state: CourseSyncState
  message: string | null
}

export function SyncCoursesPageClient({
  initialConnectionUrl,
  syncActivity,
  syncedCourseKeys,
  syncedModules,
  syncedCourseCount,
}: {
  initialConnectionUrl: string
  syncActivity: SyncActivitySummary
  syncedCourseKeys: string[]
  syncedModules: SyncedCanvasModule[]
  syncedCourseCount: number
}) {
  const router = useRouter()
  const [courses, setCourses] = useState<CanvasCourse[]>([])
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([])
  const [includeEndedCourses, setIncludeEndedCourses] = useState(false)
  const [search, setSearch] = useState('')
  const [courseLoadError, setCourseLoadError] = useState<string | null>(null)
  const [courseSyncProgress, setCourseSyncProgress] = useState<Record<number, CourseSyncProgress>>({})
  const [activeCanvasJob, setActiveCanvasJob] = useState<QueuedJob | null>(null)
  const [queueFeedback, setQueueFeedback] = useState<string | null>(null)
  const [isLoadingCourses, startLoadingCourses] = useTransition()
  const [isQueueingSync, startQueueingSync] = useTransition()
  const hasAutoLoadedRef = useRef(false)

  const syncPhase = getCanvasJobPhase(activeCanvasJob)
  const syncProgressValue = getCanvasJobProgressValue(activeCanvasJob)
  const syncDetail = getCanvasJobDetail(activeCanvasJob)
  const syncTitle = getCanvasJobTitle(activeCanvasJob)
  const syncCourseCount = getCanvasJobCourseCount(activeCanvasJob)
  const syncSavingSubStepIndex = getCanvasSavingSubStepIndex(activeCanvasJob)
  const syncedCourseKeySet = useMemo(() => new Set(syncedCourseKeys), [syncedCourseKeys])
  const isCanvasJobActive = activeCanvasJob?.status === 'pending' || activeCanvasJob?.status === 'running'
  const isSyncActionPending = isQueueingSync || isCanvasJobActive
  const selectedCount = selectedCourseIds.length

  const isCourseAlreadySynced = useCallback((course: CanvasCourse) => {
    const key = buildCanvasCourseSyncKey(initialConnectionUrl, course.id)
    return key ? syncedCourseKeySet.has(key) : false
  }, [initialConnectionUrl, syncedCourseKeySet])

  const filteredCourses = useMemo(() => {
    const query = search.toLowerCase().trim()
    const availableCourses = courses.filter((course) => !isCourseAlreadySynced(course))

    if (!query) return availableCourses

    return availableCourses.filter((course) =>
      course.name.toLowerCase().includes(query) ||
      course.course_code?.toLowerCase().includes(query)
    )
  }, [courses, isCourseAlreadySynced, search])
  const groupedCourses = useMemo(() => groupCoursesForPicker(filteredCourses), [filteredCourses])

  const statusSummary = getStatusSummary({
    isLoadingCourses,
    isCanvasJobActive,
    courseLoadError,
    syncActivity,
    hasSyncedCourses: syncedCourseCount > 0,
  })

  const loadCourses = useCallback((nextIncludeEnded = includeEndedCourses) => {
    setCourseLoadError(null)
    setQueueFeedback(null)

    startLoadingCourses(async () => {
      const result = await fetchCurrentUserCanvasCourses({ includeEnded: nextIncludeEnded })
      if ('error' in result) {
        setCourses([])
        setSelectedCourseIds([])
        setCourseLoadError(result.error)
        return
      }

      if (!haveSameCourseIds(courses, result.courses)) {
        setSelectedCourseIds((currentSelectedIds) => pruneUnavailableSelectedCourseIds(currentSelectedIds, result.courses, initialConnectionUrl, syncedCourseKeySet))
      }
      setCourses(result.courses)
      setSearch('')
      setIncludeEndedCourses(nextIncludeEnded)
    })
  }, [courses, includeEndedCourses, initialConnectionUrl, startLoadingCourses, syncedCourseKeySet])

  const refreshCanvasQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/jobs', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as { jobs?: QueuedJob[] }
      const canvasJobs = (data.jobs ?? []).filter((job) => job.type === 'canvas_sync')
      const activeJob = canvasJobs.find((job) => job.status === 'pending' || job.status === 'running')
      const latestCanvasJob = activeJob ?? canvasJobs[0] ?? null
      setActiveCanvasJob(latestCanvasJob)
      if (latestCanvasJob?.status === 'completed') {
        router.refresh()
      }
    } catch {
      // Queue polling should not block course selection.
    }
  }, [router])

  useEffect(() => {
    if (hasAutoLoadedRef.current) return
    hasAutoLoadedRef.current = true
    const timeoutId = window.setTimeout(() => loadCourses(false), 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadCourses])

  useEffect(() => {
    const initialRefreshId = window.setTimeout(() => {
      void refreshCanvasQueue()
    }, 0)
    const id = window.setInterval(refreshCanvasQueue, 6000)
    return () => {
      window.clearTimeout(initialRefreshId)
      window.clearInterval(id)
    }
  }, [refreshCanvasQueue])

  useEffect(() => {
    function handleQueueRefresh() {
      void refreshCanvasQueue()
    }

    window.addEventListener('stay-focused:queue-refresh', handleQueueRefresh)
    return () => window.removeEventListener('stay-focused:queue-refresh', handleQueueRefresh)
  }, [refreshCanvasQueue])

  function handleToggleEndedCourses(value: boolean) {
    setIncludeEndedCourses(value)
    setSelectedCourseIds([])
    loadCourses(value)
  }

  function toggleCourseSelection(courseId: number) {
    if (isSyncActionPending) return

    setSelectedCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId]
    )
  }

  function handleCourseSubmit() {
    if (selectedCourseIds.length === 0) return

    const selectedCourses = courses
      .filter((course) =>
        selectedCourseIds.includes(course.id) &&
        !isCourseAlreadySynced(course)
      )
      .map((course) => ({
        courseId: course.id,
        courseName: course.name,
        courseCode: course.course_code,
        instructor: course.teachers?.[0]?.display_name ?? null,
      }))

    if (selectedCourses.length === 0) return

    setCourseSyncProgress(Object.fromEntries(selectedCourses.map((course) => [
      course.courseId,
      { state: 'pending' as const, message: null },
    ])))

    setQueueFeedback(null)
    startQueueingSync(async () => {
      try {
        const result = await queueCanvasSyncAction({
          courses: selectedCourses,
          mode: 'selected_courses',
        })

        if (result.error) {
          setQueueFeedback(result.error)
          setCourseSyncProgress(Object.fromEntries(selectedCourses.map((course) => [
            course.courseId,
            { state: 'failed' as const, message: normalizeSyncErrorText(result.error) },
          ])))
          dispatchInAppToast({ title: 'Could not queue course sync', description: result.error, tone: 'error' })
          return
        }

        if (result.job) setActiveCanvasJob(result.job)
        setCourseSyncProgress(Object.fromEntries(selectedCourses.map((course) => [
          course.courseId,
          {
            state: result.duplicate ? 'syncing' as const : 'pending' as const,
            message: result.duplicate ? 'Already syncing in the background' : 'Added to queue',
          },
        ])))
        setQueueFeedback(result.duplicate ? 'This course sync is already running in the background.' : 'Syncing in the background.')
        window.dispatchEvent(new CustomEvent('stay-focused:queue-refresh', { detail: { job: result.job ?? null } }))
        dispatchInAppToast({
          title: result.duplicate ? 'Course sync already queued.' : 'Course sync added to queue.',
          description: 'You can keep using Stay Focused while this runs.',
          tone: 'success',
        })
        setSelectedCourseIds([])
      } catch (error) {
        const message = normalizeSyncErrorText(error instanceof Error ? error.message : null)
        setQueueFeedback(message)
        dispatchInAppToast({ title: 'Could not queue course sync', description: message, tone: 'error' })
      }
    })
  }

  return (
    <div className="page-stack sync-courses-page">
      <header className="motion-card sync-courses-header">
        <p className="ui-kicker">Sync Courses</p>
        <h1 className="ui-page-title">Sync Courses</h1>
        <p className="ui-page-copy sync-courses-intro">
          Keep Canvas courses up to date so Stay Focused can plan your work.
        </p>
      </header>

      <section className="sync-summary-grid" aria-label="Course sync summary">
        <SummaryCard
          label="Last Canvas update"
          title={syncActivity.lastCanvasUpdate?.title ?? 'No update yet'}
          detail={syncActivity.lastCanvasUpdate?.detail ?? 'Refresh courses, then sync or refresh a course to pull new Canvas changes in.'}
          tone={syncActivity.lastCanvasUpdate?.tone ?? 'neutral'}
          action={(
            <button type="button" onClick={() => loadCourses()} disabled={isLoadingCourses} className="ui-button ui-button-primary ui-button-sm">
              {isLoadingCourses ? 'Refreshing courses...' : 'Refresh Courses'}
            </button>
          )}
        />
        <SummaryCard
          label="Last full manual sync"
          title={syncActivity.lastFullManualSync?.title ?? 'No full manual sync yet'}
          detail={syncActivity.lastFullManualSync?.detail ?? 'Use Sync selected to import a course into Stay Focused.'}
          tone={syncActivity.lastFullManualSync?.tone ?? 'neutral'}
        />
        <SummaryCard
          label="Last background sync"
          title={syncActivity.lastBackgroundSync?.title ?? 'No background sync yet'}
          detail={syncActivity.lastBackgroundSync?.detail ?? 'Background syncs check your already-synced courses for new Canvas changes.'}
          tone={syncActivity.lastBackgroundSync?.tone ?? 'neutral'}
        />
        <SummaryCard
          label="Last resource refresh"
          title={syncActivity.lastResourceRefresh?.title ?? 'No resource refresh yet'}
          detail={syncActivity.lastResourceRefresh?.detail ?? 'Resource refreshes update module file/page links without a heavy course re-import.'}
          tone={syncActivity.lastResourceRefresh?.tone ?? 'neutral'}
        />
        <SummaryCard
          label="Status"
          title={statusSummary.title}
          detail={statusSummary.detail}
          tone={statusSummary.tone}
        />
        <SummaryCard
          label="Synced courses"
          title={`${syncedCourseCount} ${syncedCourseCount === 1 ? 'course' : 'courses'}`}
          detail={`${syncedModules.length} synced ${syncedModules.length === 1 ? 'module' : 'modules'} available for study.`}
          action={(
            <a href="#synced-modules" className="ui-button ui-button-secondary ui-button-sm">Manage courses</a>
          )}
        />
      </section>

      <section className="sync-split-layout">
        <section className="sync-panel sync-course-picker" aria-labelledby="sync-course-picker-title">
          <div className="sync-panel-header">
            <div>
              <p className="ui-kicker">Available Courses</p>
              <h2 id="sync-course-picker-title" className="sync-panel-title">Choose courses to sync</h2>
            </div>
          </div>

          <div className="sync-picker-tools">
            <label className="sync-search-field">
              <span>Search courses</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your courses"
                disabled={isSyncActionPending}
                className="ui-input"
              />
            </label>
            <div className="sync-picker-actions">
              <EndedCoursesToggle
                checked={includeEndedCourses}
                disabled={isLoadingCourses || isSyncActionPending}
                onChange={handleToggleEndedCourses}
              />
              <button
                type="button"
                onClick={handleCourseSubmit}
                disabled={selectedCourseIds.length === 0 || isSyncActionPending || courses.length === 0}
                className="ui-button ui-button-primary ui-button-sm"
              >
                {getSyncButtonLabel({
                  isSyncing: isSyncActionPending,
                  phase: syncPhase,
                  selectedCourseCount: selectedCourseIds.length,
                })}
              </button>
              <button type="button" onClick={() => loadCourses()} disabled={isLoadingCourses || isSyncActionPending} className="ui-button ui-button-secondary ui-button-sm">
                {isLoadingCourses ? 'Refreshing courses...' : 'Refresh Courses'}
              </button>
            </div>
          </div>

          {courseLoadError ? <Message>{courseLoadError}</Message> : null}

          <p className="sync-helper-text">
            {isLoadingCourses
              ? 'Refreshing courses...'
              : courses.length === 0
                ? includeEndedCourses ? 'No current or past courses were found for this account.' : 'No active courses were found for this account.'
                : filteredCourses.length === 0
                  ? search ? 'No courses matched that search.' : 'Everything available from this Canvas account is already synced.'
                  : `${selectedCount} selected. Courses already synced into Stay Focused are hidden here.`}
          </p>

          <div className="sync-course-list">
            {filteredCourses.length === 0 ? (
              <div className="ui-empty sync-empty-state">
                {isLoadingCourses ? 'Refreshing courses...' : search ? 'No courses matched that search.' : 'No courses available to sync right now.'}
              </div>
            ) : (
              groupedCourses.map((group) => (
                <div key={group.title}>
                  <div className="sync-course-group-header">{group.title}</div>
                  {group.courses.map((course, index) => {
                    const isSelected = selectedCourseIds.includes(course.id)
                    const progress = courseSyncProgress[course.id]
                    const status = deriveCanvasCourseStatus(course)
                    const isLastInGroup = index === group.courses.length - 1

                    return (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => toggleCourseSelection(course.id)}
                        aria-pressed={isSelected}
                        className="sync-course-row ui-interactive-card"
                        data-selected={isSelected ? 'true' : 'false'}
                        data-divider={!(isLastInGroup && group.isLast) ? 'true' : 'false'}
                        disabled={isSyncActionPending}
                      >
                        <span className="sync-course-row-copy">
                          <span className="sync-course-row-title">
                            {course.name}
                            {status === 'past' && <span className="sync-course-badge sync-course-badge-ended">Ended</span>}
                            {status === 'unavailable' && <span className="sync-course-badge sync-course-badge-restricted">Restricted</span>}
                          </span>
                          <span className="sync-course-row-meta">
                            {course.course_code}{course.term?.name ? ` - ${course.term.name}` : ''}
                          </span>
                        </span>
                        <span className="sync-course-selection">
                          {progress ? getCourseSyncStateLabel(progress.state) : isSelected ? 'Selected' : 'Select'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {Object.keys(courseSyncProgress).length > 0 && (
            <div className="sync-progress-list">
              {courses
                .filter((course) => courseSyncProgress[course.id])
                .map((course) => {
                  const progress = courseSyncProgress[course.id]
                  return (
                    <div key={course.id} className="sync-progress-row">
                      <div style={{ minWidth: 0 }}>
                        <p className="sync-progress-title">{course.name}</p>
                        {progress.message && <p className="sync-progress-message">{progress.message}</p>}
                      </div>
                      <span style={courseProgressBadgeStyle(progress.state)}>{getCourseSyncStateLabel(progress.state)}</span>
                    </div>
                  )
                })}
            </div>
          )}

          {(queueFeedback || isCanvasJobActive) && (
            <p className="sync-helper-text">
              {queueFeedback ?? 'You can keep using Stay Focused while this runs.'}
            </p>
          )}
        </section>

        <aside className="sync-panel sync-status-panel" aria-label="Sync status and activity">
          <CanvasSyncStatusCard
            phase={syncPhase}
            progressValue={syncProgressValue}
            title={syncTitle}
            detail={syncDetail}
            lastSync={syncActivity.lastFullManualSync
              ? {
                  label: `Last full manual sync: ${syncActivity.lastFullManualSync.title}`,
                  tone: syncActivity.lastFullManualSync.tone,
                }
              : null}
            onRetry={selectedCourseIds.length > 0 ? handleCourseSubmit : undefined}
            showWhenIdle
            selectedCourseCount={syncCourseCount}
            savingSubStepIndex={syncSavingSubStepIndex}
          />

          <div className="sync-detail-block">
            <p className="sync-detail-title">Latest update details</p>
            <p className="sync-detail-copy">{syncActivity.lastCanvasUpdate?.detail ?? 'Sync a course to start building your study workspace.'}</p>
          </div>

          <div className="sync-detail-block">
            <p className="sync-detail-title">Background sync</p>
            <p className="sync-detail-copy">{syncActivity.lastBackgroundSync?.detail ?? 'No background sync has run for this account yet.'}</p>
          </div>

          <div className="sync-detail-block">
            <p className="sync-detail-title">What sync updates</p>
            <ul className="sync-update-list">
              <li>Modules</li>
              <li>Assignments and tasks</li>
              <li>Due dates</li>
              <li>Source materials</li>
            </ul>
          </div>

          <Link href="/settings?section=canvas" className="sync-settings-link">
            Connection settings
          </Link>
        </aside>
      </section>

      <section id="synced-modules" className="sync-panel sync-managed-section" aria-labelledby="synced-modules-title">
        <div className="sync-panel-header">
          <div>
            <p className="ui-kicker">Synced modules</p>
            <h2 id="synced-modules-title" className="sync-panel-title">
              {syncedModules.length > 0 ? 'Imported course content' : 'No synced modules yet'}
            </h2>
          </div>
        </div>

        {syncedModules.length === 0 ? (
          <div className="ui-empty sync-empty-state">
            Synced modules will appear here after you import a course.
          </div>
        ) : (
          <div className="sync-managed-list">
            {syncedModules.map((module) => (
              <div key={module.id} className="sync-managed-row">
                <div className="sync-managed-main">
                  <p className="sync-managed-title">{module.title}</p>
                  <p className="sync-managed-meta">
                    {module.courseTitle ?? 'Synced course'} - {module.contentCount} {module.contentCount === 1 ? 'source' : 'sources'}
                  </p>
                  {module.summary ? <p className="sync-managed-summary">{module.summary}</p> : null}
                </div>
                <span className="sync-managed-date">{new Date(module.createdAt).toLocaleDateString()}</span>
                <div className="sync-managed-actions">
                  <RefreshCourseResourcesButton courseId={module.courseId} />
                  <Link href={`/modules/${module.id}/learn`} className="ui-button ui-button-secondary ui-button-sm">
                    Open
                  </Link>
                  <UnsyncButton moduleId={module.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  title,
  detail,
  tone = 'neutral',
  action,
}: {
  label: string
  title: string
  detail: string
  tone?: 'success' | 'neutral' | 'warning'
  action?: ReactNode
}) {
  return (
    <article className="sync-summary-card" data-tone={tone}>
      <p className="sync-summary-label">{label}</p>
      <h2 className="sync-summary-title">{title}</h2>
      <p className="sync-summary-detail">{detail}</p>
      {action ? <div className="sync-summary-action">{action}</div> : null}
    </article>
  )
}

function EndedCoursesToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="sync-ended-toggle" data-checked={checked ? 'true' : 'false'}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="sync-ended-switch" aria-hidden="true" />
      <span>Show ended courses</span>
    </label>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <div className="sync-error-message">{children}</div>
}

function getCanvasJobPhase(job: QueuedJob | null): CanvasSyncPhase {
  if (!job) return 'idle'
  if (job.status === 'completed') return 'done'
  if (job.status === 'failed') return 'error'
  if (job.status === 'pending') return 'starting'

  const step = getStringFromRecord(job.result, 'currentStep')
  if (step === 'connecting') return 'connecting'
  if (step === 'reading') return 'fetchingCourses'
  if (step === 'importing') return 'fetchingModules'
  if (step === 'organizing') return 'merging'
  if (step === 'saving' || step === 'extracting' || step === 'finalizing') return 'saving'
  return progressToCanvasPhase(job.progress)
}

function getCanvasJobProgressValue(job: QueuedJob | null) {
  if (!job) return 0
  return Math.max(0, Math.min(1, (job.progress ?? 0) / 100))
}

function getCanvasJobDetail(job: QueuedJob | null) {
  if (!job) return 'Select courses, then run sync when you are ready.'
  if (job.status === 'failed') return job.error ?? 'Course sync failed.'
  return getStringFromRecord(job.result, 'statusMessage')
    ?? (job.status === 'completed' ? 'Course sync complete' : 'You can keep using Stay Focused while this runs.')
}

function getCanvasJobTitle(job: QueuedJob | null) {
  if (!job) return 'Ready to sync'
  if (job.status === 'completed') return 'Course sync complete'
  if (job.status === 'failed') return 'Course sync failed'
  return cleanCanvasJobTitle(job)
}

function getCanvasJobCourseCount(job: QueuedJob | null) {
  const count = getNumberFromRecord(job?.payload ?? null, 'courseCount')
  return count ?? 0
}

function getCanvasSavingSubStepIndex(job: QueuedJob | null) {
  const step = getStringFromRecord(job?.result ?? null, 'currentStep')
  if (step === 'saving') return 0
  if (step === 'extracting') return 2
  if (step === 'finalizing') return 3
  return 0
}

function cleanCanvasJobTitle(job: QueuedJob) {
  const count = getCanvasJobCourseCount(job)
  if (count > 0) return `Syncing ${count === 1 ? '1 course' : `${count} courses`}`
  return job.title
}

function progressToCanvasPhase(progress: number): CanvasSyncPhase {
  if (progress < 12) return 'connecting'
  if (progress < 30) return 'fetchingCourses'
  if (progress < 55) return 'fetchingModules'
  if (progress < 70) return 'merging'
  return 'saving'
}

function getStringFromRecord(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNumberFromRecord(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getSyncButtonLabel({
  isSyncing,
  phase,
  selectedCourseCount,
}: {
  isSyncing: boolean
  phase: CanvasSyncPhase
  selectedCourseCount: number
}) {
  if (isSyncing) {
    if (phase === 'starting') return 'Starting sync...'
    if (phase === 'connecting') return 'Connecting...'
    if (phase === 'fetchingCourses') return 'Fetching course data...'
    if (phase === 'fetchingModules') return 'Fetching modules...'
    if (phase === 'merging') return 'Organizing...'
    if (phase === 'saving') return 'Saving...'
    return 'Syncing in background'
  }

  if (phase === 'error') {
    return selectedCourseCount > 1 ? `Retry ${selectedCourseCount} courses` : 'Retry sync'
  }

  return 'Sync selected'
}

function getCourseSyncStateLabel(state: CourseSyncState) {
  if (state === 'pending') return 'Pending'
  if (state === 'syncing') return 'Syncing'
  if (state === 'synced') return 'Synced'
  return 'Failed'
}

function normalizeSyncErrorText(message: string | null | undefined) {
  const value = message?.trim()
  if (!value) return 'The sync request ended unexpectedly. Retry this course; already synced courses were kept.'

  if (/failed to fetch|networkerror|load failed|unexpected end|invalid json|json/i.test(value)) {
    return 'The sync response was interrupted or could not be read. Retry this course; already synced courses were kept.'
  }

  if (/504|gateway timeout|timeout|timed out|function invocation timed out|300s|300 seconds|body exceeded/i.test(value)) {
    return 'Course sync timed out before this course finished. Retry this course; already synced courses were kept.'
  }

  return value
}

function groupCoursesForPicker(courses: CanvasCourse[]) {
  const current = courses.filter((course) => deriveCanvasCourseStatus(course) === 'active')
  const past = courses.filter((course) => deriveCanvasCourseStatus(course) !== 'active')
  const groups = [
    { title: 'Current courses', courses: current },
    { title: 'Past courses', courses: past },
  ].filter((group) => group.courses.length > 0)

  return groups.map((group, index) => ({
    ...group,
    isLast: index === groups.length - 1,
  }))
}

function haveSameCourseIds(currentCourses: CanvasCourse[], nextCourses: CanvasCourse[]) {
  if (currentCourses.length !== nextCourses.length) return false

  const currentIds = currentCourses.map((course) => course.id).sort((a, b) => a - b)
  const nextIds = nextCourses.map((course) => course.id).sort((a, b) => a - b)

  return currentIds.every((id, index) => id === nextIds[index])
}

function pruneUnavailableSelectedCourseIds(
  selectedIds: number[],
  nextCourses: CanvasCourse[],
  canvasUrl: string,
  syncedCourseKeySet: Set<string>,
) {
  if (selectedIds.length === 0) return selectedIds

  const availableIds = new Set(
    nextCourses
      .filter((course) => {
        const key = buildCanvasCourseSyncKey(canvasUrl, course.id)
        return !key || !syncedCourseKeySet.has(key)
      })
      .map((course) => course.id)
  )
  const nextSelectedIds = selectedIds.filter((id) => availableIds.has(id))

  return nextSelectedIds.length === selectedIds.length ? selectedIds : nextSelectedIds
}

function getStatusSummary({
  isLoadingCourses,
  isCanvasJobActive,
  courseLoadError,
  syncActivity,
  hasSyncedCourses,
}: {
  isLoadingCourses: boolean
  isCanvasJobActive: boolean
  courseLoadError: string | null
  syncActivity: SyncActivitySummary
  hasSyncedCourses: boolean
}) {
  if (isCanvasJobActive) {
    return { title: 'Syncing', detail: 'Course content is updating in the background.', tone: 'neutral' as const }
  }
  if (isLoadingCourses) {
    return { title: 'Refreshing', detail: 'Reading your available Canvas courses.', tone: 'neutral' as const }
  }
  if (courseLoadError) {
    return { title: 'Needs sync', detail: 'Course list could not refresh. Try again from this page.', tone: 'warning' as const }
  }
  if (syncActivity.lastBackgroundSync?.tone === 'warning') {
    return { title: 'Needs review', detail: 'The latest background sync had warnings or missed part of the refresh path.', tone: 'warning' as const }
  }
  if (syncActivity.lastCanvasUpdate?.tone === 'warning') {
    return { title: 'Needs review', detail: 'The latest Canvas update finished with warnings.', tone: 'warning' as const }
  }
  if (hasSyncedCourses) {
    return { title: 'Updated', detail: 'Synced courses are ready for planning.', tone: 'success' as const }
  }

  return { title: 'Ready', detail: 'Choose courses to bring into Stay Focused.', tone: 'neutral' as const }
}

function courseProgressBadgeStyle(state: CourseSyncState): CSSProperties {
  const color = state === 'synced'
    ? 'var(--green)'
    : state === 'failed'
      ? 'var(--red)'
      : state === 'syncing'
        ? 'var(--blue)'
        : 'var(--text-muted)'

  return {
    flexShrink: 0,
    borderRadius: '999px',
    border: `1px solid ${state === 'pending' ? 'var(--border-subtle)' : color}`,
    color,
    background: state === 'synced'
      ? 'color-mix(in srgb, var(--green-light) 42%, var(--surface-base) 58%)'
      : state === 'failed'
        ? 'color-mix(in srgb, var(--red-light) 42%, var(--surface-base) 58%)'
        : state === 'syncing'
          ? 'color-mix(in srgb, var(--blue-light) 42%, var(--surface-base) 58%)'
          : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
    padding: '0.22rem 0.5rem',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  }
}
