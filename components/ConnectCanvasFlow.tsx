'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fetchCurrentUserCanvasCourses, refreshCourseInstructors, testCanvasConnection } from '@/actions/canvas'
import { queueCanvasSyncAction } from '@/actions/queue-canvas'
import { forgetCanvasSettings, updateCanvasSettings } from '@/actions/user-settings'
import { CanvasSyncStatusCard } from '@/components/CanvasSyncStatusCard'
import { UnsyncButton } from '@/components/UnsyncButton'
import { useAuthSummary } from '@/components/useAuthSummary'
import type { CanvasSyncPhase, SyncActivitySnapshot } from '@/components/useCanvasSyncStatus'
import type { CanvasCourse } from '@/lib/canvas'
import { buildCanvasCourseSyncKey } from '@/lib/canvas-sync'
import { dispatchInAppToast } from '@/lib/notifications'
import type { QueuedJob } from '@/lib/queue'

interface SyncedCanvasModule {
  id: string
  title: string
  summary: string | null
  createdAt: string
}

type FlowStep = 'connect' | 'courses'
type SetupStage = 'guide' | 'credentials'
type CourseSyncState = 'pending' | 'syncing' | 'synced' | 'failed'

interface CourseSyncProgress {
  state: CourseSyncState
  message: string | null
}

export function ConnectCanvasFlow({
  currentUserId,
  initialConnectionUrl,
  initialAccessToken,
  lastSync,
  syncedCourseKeys,
  hasSyncedCourses,
  initialAction,
  syncedModules,
}: {
  currentUserId: string
  initialConnectionUrl: string | null
  initialAccessToken: string | null
  lastSync: SyncActivitySnapshot | null
  syncedCourseKeys: string[]
  hasSyncedCourses: boolean
  initialAction: string | null
  syncedModules: SyncedCanvasModule[]
}) {
  const router = useRouter()
  const authSummary = useAuthSummary()
  const initialCanvasUrl = initialConnectionUrl ?? ''
  const initialToken = initialAccessToken ?? ''
  const shouldStartReconnect = initialAction === 'reconnect'
  const shouldStartSync = initialAction === 'sync'
  const shouldAutoLoadCourses = shouldStartSync && Boolean(initialConnectionUrl && initialAccessToken)
  const shouldOpenGuideOnLoad = shouldStartReconnect || (shouldStartSync && !shouldAutoLoadCourses)

  const [step, setStep] = useState<FlowStep>('connect')
  const [setupStage, setSetupStage] = useState<SetupStage>(shouldStartReconnect ? 'credentials' : 'guide')
  const [isSetupOpen, setIsSetupOpen] = useState(shouldOpenGuideOnLoad)
  const [canvasUrl, setCanvasUrl] = useState(initialCanvasUrl)
  const [token, setToken] = useState(initialToken)
  const [courses, setCourses] = useState<CanvasCourse[]>([])
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [courseSyncProgress, setCourseSyncProgress] = useState<Record<number, CourseSyncProgress>>({})
  const [currentConnectionUrl, setCurrentConnectionUrl] = useState<string | null>(initialConnectionUrl)
  const [activeCanvasJob, setActiveCanvasJob] = useState<QueuedJob | null>(null)
  const [queueFeedback, setQueueFeedback] = useState<string | null>(null)
  const [isTesting, startTesting] = useTransition()
  const [isQueueingSync, startQueueingSync] = useTransition()
  const [isRefreshingInstructors, startRefreshingInstructors] = useTransition()
  const [instructorRefreshResult, setInstructorRefreshResult] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const initialActionHandledRef = useRef(false)
  const observedAuthUserRef = useRef<string | null>(null)
  const latestSync = buildLatestSyncFromJob(activeCanvasJob, lastSync)
  const syncPhase = getCanvasJobPhase(activeCanvasJob)
  const syncProgressValue = getCanvasJobProgressValue(activeCanvasJob)
  const syncDetail = getCanvasJobDetail(activeCanvasJob)
  const syncTitle = getCanvasJobTitle(activeCanvasJob)
  const syncCourseCount = getCanvasJobCourseCount(activeCanvasJob)
  const syncSavingSubStepIndex = getCanvasSavingSubStepIndex(activeCanvasJob)
  const connectionSummary = currentConnectionUrl ? { url: currentConnectionUrl } : null
  const activeCanvasUrl = (canvasUrl || connectionSummary?.url) ?? ''
  const syncedCourseKeySet = useMemo(() => new Set(syncedCourseKeys), [syncedCourseKeys])
  const isCourseAlreadySynced = useCallback((course: CanvasCourse) => {
    const key = buildCanvasCourseSyncKey(activeCanvasUrl, course.id)
    return key ? syncedCourseKeySet.has(key) : false
  }, [activeCanvasUrl, syncedCourseKeySet])

  const filteredCourses = useMemo(() => {
    const availableCourses = courses.filter((course) => !isCourseAlreadySynced(course))

    return availableCourses.filter((course) =>
      course.name.toLowerCase().includes(search.toLowerCase()) ||
      course.course_code?.toLowerCase().includes(search.toLowerCase())
    )
  }, [courses, isCourseAlreadySynced, search])

  const canLoadCourses = Boolean(connectionSummary?.url)
  const hasLoadedCourses = step === 'courses'
  const isCanvasJobActive = activeCanvasJob?.status === 'pending' || activeCanvasJob?.status === 'running'
  const isSyncActionPending = isQueueingSync || isCanvasJobActive

  const clearCanvasUiState = useCallback(() => {
    setCurrentConnectionUrl(null)
    setCanvasUrl('')
    setToken('')
    setCourses([])
    setSelectedCourseIds([])
    setCourseSyncProgress({})
    setSearch('')
    setStep('connect')
    setConnectionError(null)
    setQueueFeedback(null)
    setInstructorRefreshResult(null)
  }, [])

  useEffect(() => {
    const authUserId = authSummary.user?.id ?? null
    if (!authUserId && !observedAuthUserRef.current) return
    if (authUserId === currentUserId) {
      observedAuthUserRef.current = authUserId
      return
    }

    const timeoutId = window.setTimeout(() => {
      clearCanvasUiState()
      router.refresh()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [authSummary.user?.id, clearCanvasUiState, currentUserId, router])

  function openSetup(stage: SetupStage) {
    setSetupStage(stage)
    setIsSetupOpen(true)
  }

  function closeSetup() {
    if (isTesting) return
    setIsSetupOpen(false)
  }

  function handleOpenTokenPage() {
    const tokenPageUrl = getCanvasTokenPageUrl(canvasUrl)

    if (!tokenPageUrl) {
      setConnectionError('Add your school Canvas URL first so the correct Canvas settings page can open.')
      setIsSetupOpen(true)
      setSetupStage('guide')
      return
    }

    setConnectionError(null)
    window.open(tokenPageUrl, '_blank', 'noopener,noreferrer')
  }

  const handleTestConnection = useCallback(() => {
    const trimmedUrl = canvasUrl.trim()
    const trimmedToken = token.trim()

    setConnectionError(null)
    setQueueFeedback(null)

    startTesting(async () => {
      try {
        const result = await testCanvasConnection({
          canvasUrl: trimmedUrl,
          accessToken: trimmedToken,
        })

        if ('error' in result) {
          setConnectionError(result.error)
          setCourses([])
          setSelectedCourseIds([])
          return
        }

        const saveResult = await updateCanvasSettings({
          canvasApiUrl: result.normalizedUrl,
          canvasAccessToken: trimmedToken,
        })

        if (!saveResult.ok) {
          setConnectionError(saveResult.error)
          setCourses([])
          setSelectedCourseIds([])
          return
        }

        setCourses(result.courses)
        setSearch('')
        setSelectedCourseIds([])
        setStep('courses')
        setIsSetupOpen(false)
        setCurrentConnectionUrl(result.normalizedUrl)
        setCanvasUrl(result.normalizedUrl)
        setToken(trimmedToken)
        router.refresh()
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : 'We could not connect to Canvas just yet.')
        setCourses([])
        setSelectedCourseIds([])
      }
    })
  }, [canvasUrl, router, startTesting, token])

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
      // Queue polling should not block the Canvas page.
    }
  }, [router])

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

  function handleUseSavedConnection() {
    if (!connectionSummary?.url) {
      setStep('connect')
      openSetup('credentials')
      setConnectionError('Canvas is not connected for this account.')
      return
    }

    setConnectionError(null)
    setQueueFeedback(null)

    startTesting(async () => {
      const result = await fetchCurrentUserCanvasCourses()
      if ('error' in result) {
        clearCanvasUiState()
        setConnectionError(result.error)
        return
      }

      setCourses(result.courses)
      setSearch('')
      setSelectedCourseIds([])
      setStep('courses')
    })
  }

  useEffect(() => {
    if (initialActionHandledRef.current) return
    if (!shouldAutoLoadCourses) return

    initialActionHandledRef.current = true

    const timeoutId = window.setTimeout(() => {
      startTesting(async () => {
        const result = await fetchCurrentUserCanvasCourses()
        if ('error' in result) {
          clearCanvasUiState()
          setConnectionError(result.error)
          return
        }

        setCourses(result.courses)
        setSearch('')
        setSelectedCourseIds([])
        setStep('courses')
      })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [clearCanvasUiState, shouldAutoLoadCourses, startTesting])

  function handleReconnect() {
    setStep('connect')
    setCourses([])
    setSelectedCourseIds([])
    setCourseSyncProgress({})
    setSearch('')
    setConnectionError(null)
    setQueueFeedback(null)
    openSetup('guide')
  }

  function handleForgetConnection() {
    clearCanvasUiState()
    startTesting(async () => {
      const result = await forgetCanvasSettings()
      if (!result.ok) {
        setConnectionError(result.error)
      }
      router.refresh()
      openSetup('guide')
    })
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
          dispatchInAppToast({ title: 'Could not queue Canvas sync', description: result.error, tone: 'error' })
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
        setQueueFeedback(result.duplicate ? 'This Canvas sync is already running in the background.' : 'Syncing in background.')
        window.dispatchEvent(new CustomEvent('stay-focused:queue-refresh', { detail: { job: result.job ?? null } }))
        dispatchInAppToast({
          title: result.duplicate ? 'Canvas sync already queued.' : 'Canvas sync added to queue.',
          description: 'You can keep using Stay Focused while this runs.',
          tone: 'success',
        })
        setSelectedCourseIds([])
      } catch (error) {
        const message = normalizeSyncErrorText(error instanceof Error ? error.message : null)
        setQueueFeedback(message)
        dispatchInAppToast({ title: 'Could not queue Canvas sync', description: message, tone: 'error' })
      }
    })
  }

  function handleRefreshInstructors() {
    if (!connectionSummary?.url) {
      setInstructorRefreshResult({ message: 'Reconnect to Canvas first so instructor names can be refreshed.', tone: 'error' })
      return
    }

    setInstructorRefreshResult(null)
    startRefreshingInstructors(async () => {
      try {
        const result = await refreshCourseInstructors()
        if ('error' in result) {
          setInstructorRefreshResult({ message: result.error, tone: 'error' })
          return
        }
        setInstructorRefreshResult({
          message: result.updatedCount > 0
            ? `Updated instructor names for ${result.updatedCount} course${result.updatedCount === 1 ? '' : 's'}.`
            : 'No instructor names were updated. Canvas may not have teacher data available for your courses.',
          tone: result.updatedCount > 0 ? 'success' : 'error',
        })
        router.refresh()
      } catch (error) {
        setInstructorRefreshResult({ message: error instanceof Error ? error.message : 'Could not refresh instructor names.', tone: 'error' })
      }
    })
  }

  return (
    <main className="page-stack" style={{ gap: '1rem' }}>
      <header className="motion-card" style={{ display: 'grid', gap: '0.5rem' }}>
        <p className="ui-kicker">Canvas</p>
        <h1 className="ui-page-title" style={{ fontSize: '2rem' }}>Sync Canvas</h1>
        <p className="ui-page-copy" style={{ maxWidth: '48rem', marginTop: 0 }}>
          Connect Canvas, load the courses that are available to you, and sync the ones you want in the app.
        </p>
      </header>

      <PlainSection
        eyebrow="Connection"
        title={connectionSummary ? 'Canvas connected' : 'Connect your Canvas account'}
        description={connectionSummary
          ? `Connected to ${connectionSummary.url}.`
          : 'Add your Canvas details, test the connection, and then load your courses.'}
      >
        {connectionSummary ? (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <StatusRow
              title="Saved connection"
              detail={`Connected to ${connectionSummary.url}.`}
              tone="success"
            />
            <div className="ui-meta-list">
              {latestSync && <span><strong>Latest sync:</strong> {latestSync.label}</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleReconnect} disabled={isTesting || isSyncActionPending} className="ui-button ui-button-secondary ui-button-sm">
                Reconnect
              </button>
              <button type="button" onClick={handleForgetConnection} disabled={isTesting || isSyncActionPending} className="ui-button ui-button-ghost ui-button-sm">
                Forget saved connection
              </button>
              <button type="button" onClick={handleRefreshInstructors} disabled={isRefreshingInstructors || isTesting || isSyncActionPending} className="ui-button ui-button-ghost ui-button-sm">
                {isRefreshingInstructors ? 'Refreshing...' : 'Refresh instructor names'}
              </button>
            </div>
            {instructorRefreshResult && (
              <div style={{
                borderRadius: '12px',
                border: `1px solid ${instructorRefreshResult.tone === 'success' ? 'color-mix(in srgb, var(--green) 22%, var(--border-subtle) 78%)' : 'color-mix(in srgb, var(--red) 22%, var(--border-subtle) 78%)'}`,
                background: instructorRefreshResult.tone === 'success' ? 'color-mix(in srgb, var(--green-light) 18%, var(--surface-elevated) 82%)' : 'color-mix(in srgb, var(--red-light) 20%, var(--surface-elevated) 80%)',
                padding: '0.85rem 0.95rem',
                fontSize: '13px',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
              }}>
                {instructorRefreshResult.message}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <p style={bodyCopyStyle}>
              Canvas is not connected for this account.
            </p>
            {connectionError && <Message>{connectionError}</Message>}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openSetup('guide')} className="ui-button ui-button-primary ui-button-sm">
                Open setup
              </button>
              <button type="button" onClick={handleOpenTokenPage} className="ui-button ui-button-ghost ui-button-sm">
                Open Canvas token page
              </button>
            </div>
          </div>
        )}
      </PlainSection>

      <PlainSection
        eyebrow="Sync"
        title="Course sync"
        description="Load the list of available Canvas courses, select what you want to import, and run sync."
      >
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {!hasLoadedCourses ? (
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <p style={bodyCopyStyle}>
                {canLoadCourses
                  ? 'The account connection is ready. Load your available courses when you want to sync more.'
                  : 'Connect Canvas first. After the connection check succeeds, this section becomes your course picker.'}
              </p>
              {connectionError && connectionSummary && <Message>{connectionError}</Message>}
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {canLoadCourses ? (
                  <button type="button" onClick={handleUseSavedConnection} disabled={isTesting} className="ui-button ui-button-primary ui-button-sm">
                    {isTesting ? 'Loading courses...' : hasSyncedCourses ? 'Load more courses' : 'Load courses'}
                  </button>
                ) : (
                  <button type="button" onClick={() => openSetup('guide')} className="ui-button ui-button-primary ui-button-sm">
                    Open setup
                  </button>
                )}
                <button type="button" onClick={handleReconnect} disabled={isTesting || isSyncActionPending} className="ui-button ui-button-ghost ui-button-sm">
                  Reconnect
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <StatusRow
                title="Courses loaded"
                detail="Choose one or more courses below. Courses already synced into the app are excluded from this list."
                tone="success"
              />

              <div style={{ display: 'grid', gap: '0.4rem' }}>
                <label style={labelStyle}>Search courses</label>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search your courses"
                  disabled={isSyncActionPending}
                  className="ui-input"
                  style={inputStyle}
                />
                <p style={helperTextStyle}>
                  {courses.length === 0
                    ? 'No active courses were found for this account.'
                    : filteredCourses.length === 0
                      ? 'Everything available from this Canvas account is already synced.'
                      : 'Select one or more courses to sync.'}
                </p>
              </div>

              <div style={listShellStyle}>
                {filteredCourses.length === 0 ? (
                  <div style={{ padding: '0.9rem 1rem', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {courses.some((course) => !isCourseAlreadySynced(course))
                      ? 'No courses matched that search.'
                      : 'All available courses from this Canvas account are already synced.'}
                  </div>
                ) : (
                  filteredCourses.map((course, index) => {
                    const isSelected = selectedCourseIds.includes(course.id)
                    const progress = courseSyncProgress[course.id]

                    return (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => toggleCourseSelection(course.id)}
                        aria-pressed={isSelected}
                        className="ui-interactive-card"
                        data-open={isSelected ? 'true' : 'false'}
                        disabled={isSyncActionPending}
                        style={courseRowStyle(index < filteredCourses.length - 1, isSelected)}
                      >
                        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.45, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                            {course.name}
                          </div>
                          <div style={{ marginTop: '0.22rem', fontSize: '12px', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                            {course.course_code}
                          </div>
                        </div>
                        <span style={selectionStateStyle(isSelected)}>
                          {progress ? getCourseSyncStateLabel(progress.state) : isSelected ? 'Selected' : 'Select'}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>

              {Object.keys(courseSyncProgress).length > 0 && (
                <div style={courseProgressListStyle}>
                  {courses
                    .filter((course) => courseSyncProgress[course.id])
                    .map((course) => {
                      const progress = courseSyncProgress[course.id]
                      return (
                        <div key={course.id} style={courseProgressRowStyle}>
                          <div style={{ minWidth: 0 }}>
                            <p style={courseProgressTitleStyle}>{course.name}</p>
                            {progress.message && <p style={courseProgressMessageStyle}>{progress.message}</p>}
                          </div>
                          <span style={courseProgressBadgeStyle(progress.state)}>{getCourseSyncStateLabel(progress.state)}</span>
                        </div>
                      )
                    })}
                </div>
              )}

              {selectedCourseIds.length > 0 && (
                <p style={helperTextStyle}>
                  {selectedCourseIds.length} course{selectedCourseIds.length === 1 ? '' : 's'} selected.
                </p>
              )}

              {(queueFeedback || isCanvasJobActive) && (
                <p style={helperTextStyle}>
                  {queueFeedback ?? 'You can keep using Stay Focused while this runs.'}
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
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
                <button type="button" onClick={handleReconnect} disabled={isSyncActionPending} className="ui-button ui-button-ghost ui-button-sm">
                  Open setup
                </button>
              </div>
            </div>
          )}

          <CanvasSyncStatusCard
            phase={syncPhase}
            progressValue={syncProgressValue}
            title={syncTitle}
            detail={syncDetail}
            lastSync={latestSync}
            onRetry={selectedCourseIds.length > 0 ? handleCourseSubmit : undefined}
            showWhenIdle={Boolean(latestSync || hasLoadedCourses)}
            selectedCourseCount={syncCourseCount}
            savingSubStepIndex={syncSavingSubStepIndex}
          />
        </div>
      </PlainSection>

      {latestSync && (
        <PlainSection
          eyebrow="Recent activity"
          title="Last sync"
          description="The latest sync result from this workspace."
        >
          <StatusRow title="Latest run" detail={latestSync.label} tone={latestSync.tone} />
        </PlainSection>
      )}

      <PlainSection
        eyebrow="Synced modules"
        title={syncedModules.length > 0 ? 'Imported content' : 'No synced modules yet'}
        description={syncedModules.length > 0
          ? 'Modules already brought into Stay Focused. Open one to study it, or remove it if you no longer want it here.'
          : 'Synced modules will appear here after you import a course.'}
      >
        {syncedModules.length === 0 ? (
          <div className="ui-empty" style={{ borderRadius: '12px', padding: '0.95rem 1rem', fontSize: '13px', lineHeight: 1.6 }}>
            Nothing has been synced yet.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.65rem' }}>
            {syncedModules.map((module) => (
              <li key={module.id} style={{ display: 'flex', gap: '0.65rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
                <Link href={`/modules/${module.id}/learn`} className="ui-interactive-card" style={moduleRowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, lineHeight: 1.45, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                      {module.title}
                    </p>
                    {module.summary && (
                      <p style={{ margin: '0.28rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                        {module.summary}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {new Date(module.createdAt).toLocaleDateString()}
                  </span>
                </Link>
                <UnsyncButton moduleId={module.id} />
              </li>
            ))}
          </ul>
        )}
      </PlainSection>

      {isSetupOpen && (
        <SetupModal
          stage={setupStage}
          canvasUrl={canvasUrl}
          token={token}
          connectionError={connectionError}
          isTesting={isTesting}
          onClose={closeSetup}
          onCanvasUrlChange={setCanvasUrl}
          onTokenChange={setToken}
          onNext={() => setSetupStage('credentials')}
          onBack={() => setSetupStage('guide')}
          onOpenTokenPage={handleOpenTokenPage}
          onTestConnection={handleTestConnection}
        />
      )}
    </main>
  )
}

function PlainSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section style={sectionStyle}>
      <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)' }}>
        <p className="ui-kicker">{eyebrow}</p>
        <h2 style={{ margin: '0.38rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>{title}</h2>
        <p style={{ margin: '0.36rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          {description}
        </p>
      </div>
      <div style={{ padding: '1rem 1.1rem' }}>
        {children}
      </div>
    </section>
  )
}

function SetupModal({
  stage,
  canvasUrl,
  token,
  connectionError,
  isTesting,
  onClose,
  onCanvasUrlChange,
  onTokenChange,
  onNext,
  onBack,
  onOpenTokenPage,
  onTestConnection,
}: {
  stage: SetupStage
  canvasUrl: string
  token: string
  connectionError: string | null
  isTesting: boolean
  onClose: () => void
  onCanvasUrlChange: (value: string) => void
  onTokenChange: (value: string) => void
  onNext: () => void
  onBack: () => void
  onOpenTokenPage: () => void
  onTestConnection: () => void
}) {
  return (
    <div className="ui-overlay" style={modalBackdropStyle} onClick={onClose}>
      <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <p className="ui-kicker">Connect Canvas</p>
            <h2 style={{ margin: '0.38rem 0 0', fontSize: '1.1rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
              {stage === 'guide' ? 'Create an access token' : 'Enter your connection details'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="ui-button ui-button-ghost ui-button-sm" aria-label="Close setup">
            Close
          </button>
        </div>

        {stage === 'guide' ? (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <p style={bodyCopyStyle}>
              Open your Canvas settings, create a token, then return here to test the connection.
            </p>

            <Field
              label="Canvas URL"
              hint="Used to open the correct Canvas settings page."
              value={canvasUrl}
              onChange={onCanvasUrlChange}
              placeholder="https://your-school.instructure.com"
              disabled={false}
              type="url"
            />

            <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.45rem', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>
              <li>Open your Canvas settings page.</li>
              <li>Create a new personal access token.</li>
              <li>Copy the token before leaving Canvas.</li>
              <li>Return here and paste it in.</li>
            </ol>

            {connectionError && <Message>{connectionError}</Message>}

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={onOpenTokenPage} className="ui-button ui-button-primary ui-button-sm">
                Open token page
              </button>
              <button type="button" onClick={onNext} className="ui-button ui-button-ghost ui-button-sm">
                I already have a token
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <p style={bodyCopyStyle}>
              Paste your Canvas URL and token. The connection is tested before the course list is loaded.
            </p>

            <Field
              label="Canvas URL"
              hint="Example: https://school.instructure.com"
              value={canvasUrl}
              onChange={onCanvasUrlChange}
              placeholder="https://your-school.instructure.com"
              disabled={isTesting}
              type="url"
            />
            <Field
              label="Access token"
              hint="Paste the token exactly as Canvas provided it."
              value={token}
              onChange={onTokenChange}
              placeholder="Paste your Canvas access token"
              disabled={isTesting}
              type="password"
            />

            {connectionError && <Message>{connectionError}</Message>}

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={onBack} disabled={isTesting} className="ui-button ui-button-ghost ui-button-sm">
                Back
              </button>
              <button
                type="button"
                onClick={onTestConnection}
                disabled={!canvasUrl.trim() || !token.trim() || isTesting}
                className="ui-button ui-button-primary ui-button-sm"
              >
                {isTesting ? 'Checking...' : 'Test connection'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusRow({
  title,
  detail,
  tone,
}: {
  title: string
  detail: string
  tone: SyncActivitySnapshot['tone'] | 'success'
}) {
  const borderColor = tone === 'success'
    ? 'color-mix(in srgb, var(--green) 22%, var(--border-subtle) 78%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber) 22%, var(--border-subtle) 78%)'
      : 'color-mix(in srgb, var(--border-subtle) 88%, transparent)'
  const background = tone === 'success'
    ? 'color-mix(in srgb, var(--green-light) 18%, var(--surface-elevated) 82%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 18%, var(--surface-elevated) 82%)'
      : 'var(--surface-elevated)'

  return (
    <div style={{
      borderRadius: '12px',
      border: `1px solid ${borderColor}`,
      background,
      padding: '0.85rem 0.95rem',
    }}>
      <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</p>
      <p style={{ margin: '0.28rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{detail}</p>
    </div>
  )
}

function buildLatestSyncFromJob(job: QueuedJob | null, fallback: SyncActivitySnapshot | null): SyncActivitySnapshot | null {
  if (job?.status === 'completed') {
    const completedAt = job.completedAt ? new Date(job.completedAt).toLocaleString() : null
    return {
      label: completedAt ? `Canvas sync complete on ${completedAt}` : 'Canvas sync complete',
      tone: 'success',
    }
  }

  if (job?.status === 'failed') {
    const completedAt = job.completedAt ? new Date(job.completedAt).toLocaleString() : null
    return {
      label: completedAt ? `Canvas sync failed on ${completedAt}` : 'Canvas sync failed',
      tone: 'warning',
    }
  }

  return fallback
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
  if (job.status === 'failed') return job.error ?? 'Canvas sync failed.'
  return getStringFromRecord(job.result, 'statusMessage')
    ?? (job.status === 'completed' ? 'Canvas sync complete' : 'You can keep using Stay Focused while this runs.')
}

function getCanvasJobTitle(job: QueuedJob | null) {
  if (!job) return 'Ready to sync'
  if (job.status === 'completed') return 'Canvas sync complete'
  if (job.status === 'failed') return 'Canvas sync failed'
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
    if (phase === 'merging') return 'Merging data...'
    if (phase === 'saving') return 'Saving...'
    return 'Syncing in background'
  }

  if (phase === 'error') {
    return selectedCourseCount > 1 ? `Retry ${selectedCourseCount} courses` : 'Retry sync'
  }

  return selectedCourseCount > 1 ? `Sync ${selectedCourseCount} courses` : 'Sync selected course'
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
    return 'Canvas sync timed out before this course finished. Retry this course; already synced courses were kept.'
  }

  if (/An error occurred in the Server Components render|digest property is included/i.test(value)) {
    return 'The server returned an unexpected sync response. Retry this course; already synced courses were kept.'
  }

  return value
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
  type,
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled: boolean
  type: 'url' | 'password'
}) {
  return (
    <div style={{ display: 'grid', gap: '0.35rem' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="ui-input"
        style={inputStyle}
      />
      <p style={helperTextStyle}>{hint}</p>
    </div>
  )
}

function Message({ children }: { children: ReactNode }) {
  return (
    <div style={{
      borderRadius: '12px',
      border: '1px solid color-mix(in srgb, var(--red) 22%, var(--border-subtle) 78%)',
      background: 'color-mix(in srgb, var(--red-light) 20%, var(--surface-elevated) 80%)',
      padding: '0.85rem 0.95rem',
      fontSize: '13px',
      lineHeight: 1.6,
      color: 'var(--text-secondary)',
    }}>
      {children}
    </div>
  )
}

function getCanvasTokenPageUrl(canvasUrl: string) {
  const trimmed = canvasUrl.trim()
  if (!trimmed) return null

  try {
    const normalizedInput = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    const url = new URL(normalizedInput)
    return `${url.origin}/profile/settings`
  } catch {
    return null
  }
}

function courseRowStyle(showDivider: boolean, selected: boolean): CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.8rem',
    padding: '0.85rem 1rem',
    textAlign: 'left',
    cursor: 'pointer',
    background: selected
      ? 'color-mix(in srgb, var(--surface-selected) 62%, var(--surface-elevated) 38%)'
      : 'transparent',
    border: 'none',
    borderBottom: showDivider ? '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)' : 'none',
    borderRadius: 0,
  }
}

function selectionStateStyle(selected: boolean): CSSProperties {
  return {
    flexShrink: 0,
    fontSize: '12px',
    fontWeight: 600,
    color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
  }
}

const sectionStyle: CSSProperties = {
  borderRadius: '16px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'color-mix(in srgb, var(--surface-elevated) 98%, transparent)',
  boxShadow: 'var(--highlight-sheen)',
  overflow: 'hidden',
}

const listShellStyle: CSSProperties = {
  borderRadius: '12px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'var(--surface-elevated)',
  overflow: 'hidden',
  maxHeight: '300px',
  overflowY: 'auto',
}

const moduleRowStyle: CSSProperties = {
  flex: '1 1 320px',
  minWidth: 0,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '0.8rem',
  textDecoration: 'none',
  borderRadius: '12px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'var(--surface-elevated)',
  padding: '0.85rem 0.95rem',
}

const courseProgressListStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem',
}

const courseProgressRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '0.75rem',
  borderRadius: '10px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'var(--surface-elevated)',
  padding: '0.72rem 0.82rem',
}

const courseProgressTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '13px',
  fontWeight: 600,
  lineHeight: 1.45,
  color: 'var(--text-primary)',
  overflowWrap: 'anywhere',
}

const courseProgressMessageStyle: CSSProperties = {
  margin: '0.2rem 0 0',
  fontSize: '12px',
  lineHeight: 1.5,
  color: 'var(--text-secondary)',
  overflowWrap: 'anywhere',
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

const modalBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  zIndex: 50,
}

const modalCardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '620px',
  maxHeight: 'calc(100vh - 2rem)',
  overflowY: 'auto',
  borderRadius: '16px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 92%, transparent)',
  background: 'color-mix(in srgb, var(--surface-elevated) 99%, transparent)',
  boxShadow: 'var(--shadow-medium)',
  padding: '1rem 1.1rem',
  display: 'grid',
  gap: '1rem',
}

const labelStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-primary)',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.75rem 0.85rem',
  fontSize: '14px',
  fontFamily: 'inherit',
}

const helperTextStyle: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  lineHeight: 1.55,
  color: 'var(--text-muted)',
}

const bodyCopyStyle: CSSProperties = {
  margin: 0,
  fontSize: '13px',
  lineHeight: 1.65,
  color: 'var(--text-secondary)',
}
