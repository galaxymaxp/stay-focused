'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { refreshCourseInstructors, syncCanvasCourse, testCanvasConnection, type CanvasConnectionResult } from '@/actions/canvas'
import { queueCanvasSyncAction } from '@/actions/queue-canvas'
import { CanvasSyncStatusCard } from '@/components/CanvasSyncStatusCard'
import { UnsyncButton } from '@/components/UnsyncButton'
import { useCanvasSyncStatus, type CanvasSyncPhase, type SyncActivitySnapshot } from '@/components/useCanvasSyncStatus'
import type { CanvasCourse } from '@/lib/canvas'
import { buildCanvasCourseSyncKey } from '@/lib/canvas-sync'

const STORAGE_KEY = 'stay-focused.canvas-connection'

interface SavedCanvasConnection {
  url: string
  token: string
  testedAt: string
  courseCount?: number
}

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
  initialConnectionUrl,
  lastSync,
  syncedCourseKeys,
  hasSyncedCourses,
  initialAction,
  syncedModules,
}: {
  initialConnectionUrl: string | null
  lastSync: SyncActivitySnapshot | null
  syncedCourseKeys: string[]
  hasSyncedCourses: boolean
  initialAction: string | null
  syncedModules: SyncedCanvasModule[]
}) {
  const router = useRouter()
  const initialSavedConnection = readSavedConnection()
  const initialCanvasUrl = initialSavedConnection?.url ?? initialConnectionUrl ?? ''
  const initialToken = initialSavedConnection?.token ?? ''
  const shouldStartReconnect = initialAction === 'reconnect'
  const shouldStartSync = initialAction === 'sync'
  const shouldAutoTestSavedConnection = shouldStartSync && Boolean(initialCanvasUrl.trim() && initialToken.trim())
  const shouldOpenGuideOnLoad = shouldStartReconnect || (shouldStartSync && !shouldAutoTestSavedConnection)

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
  const [savedConnection, setSavedConnection] = useState<SavedCanvasConnection | null>(initialSavedConnection)
  const [isTesting, startTesting] = useTransition()
  const [isSyncing, startSyncing] = useTransition()
  const [isRefreshingInstructors, startRefreshingInstructors] = useTransition()
  const [queueSyncState, setQueueSyncState] = useState<'idle' | 'queuing' | 'queued' | 'error'>('idle')
  const [instructorRefreshResult, setInstructorRefreshResult] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const initialActionHandledRef = useRef(false)
  const syncStatus = useCanvasSyncStatus(lastSync)
  const {
    beginSync,
    detail: syncDetail,
    failSync,
    finishSync,
    isSyncing: isSyncStatusActive,
    lastSync: latestSync,
    phase: syncPhase,
    progressValue: syncProgressValue,
    resetSyncFeedback,
    selectedCourseCount: syncCourseCount,
    title: syncTitle,
    savingSubStepIndex: syncSavingSubStepIndex,
  } = syncStatus
  const connectionSummary = savedConnection ?? (initialConnectionUrl ? {
    url: initialConnectionUrl,
    token: '',
    testedAt: '',
  } : null)
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

  const canLoadCourses = Boolean(connectionSummary?.url && token.trim())
  const hasLoadedCourses = step === 'courses'
  const isSyncActionPending = isSyncStatusActive || isSyncing

  function persistConnection(result: CanvasConnectionResult, nextToken: string) {
    const connection = {
      url: result.normalizedUrl,
      token: nextToken,
      testedAt: new Date().toISOString(),
      courseCount: result.courses.length,
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection))
    setSavedConnection(connection)
    setCanvasUrl(result.normalizedUrl)
    setToken(nextToken)
  }

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
    resetSyncFeedback()

    startTesting(async () => {
      try {
        const result = await testCanvasConnection({
          canvasUrl: trimmedUrl,
          accessToken: trimmedToken,
        })

        if ('error' in result) {
          setConnectionError(result.error)
          return
        }

        setCourses(result.courses)
        setSearch('')
        setSelectedCourseIds([])
        setStep('courses')
        setIsSetupOpen(false)
        persistConnection(result, trimmedToken)
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : 'We could not connect to Canvas just yet.')
      }
    })
  }, [canvasUrl, token, startTesting, resetSyncFeedback])

  function handleUseSavedConnection() {
    if (!canvasUrl.trim() || !token.trim()) {
      setStep('connect')
      openSetup('credentials')
      setConnectionError('Reconnect to Canvas so the saved setup can be refreshed.')
      return
    }

    handleTestConnection()
  }

  useEffect(() => {
    if (initialActionHandledRef.current) return
    if (!shouldAutoTestSavedConnection) return

    initialActionHandledRef.current = true

    const timeoutId = window.setTimeout(() => {
      handleTestConnection()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [handleTestConnection, shouldAutoTestSavedConnection])

  function handleReconnect() {
    setStep('connect')
    setCourses([])
    setSelectedCourseIds([])
    setCourseSyncProgress({})
    setSearch('')
    setConnectionError(null)
    resetSyncFeedback()
    openSetup('guide')
  }

  function handleForgetConnection() {
    window.localStorage.removeItem(STORAGE_KEY)
    setSavedConnection(null)
    setCanvasUrl(initialConnectionUrl ?? '')
    setToken('')
    setCourses([])
    setSelectedCourseIds([])
    setCourseSyncProgress({})
    setSearch('')
    setStep('connect')
    setConnectionError(null)
    resetSyncFeedback()
    openSetup('guide')
  }

  function toggleCourseSelection(courseId: number) {
    if (isSyncActionPending) return

    setSelectedCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId]
    )
  }

  async function handleQueueSync() {
    if (selectedCourseIds.length === 0 || queueSyncState !== 'idle') return

    const selectedCourses = courses
      .filter((course) => selectedCourseIds.includes(course.id) && !isCourseAlreadySynced(course))
      .map((course) => ({
        courseId: course.id,
        courseName: course.name,
        courseCode: course.course_code,
        instructor: course.teachers?.[0]?.display_name ?? null,
      }))

    if (selectedCourses.length === 0) return

    setQueueSyncState('queuing')

    for (const course of selectedCourses) {
      const result = await queueCanvasSyncAction({
        course,
        canvasUrl,
        accessToken: token,
      })

      if (result.error) {
        setQueueSyncState('error')
        setTimeout(() => setQueueSyncState('idle'), 4000)
        return
      }
    }

    setQueueSyncState('queued')
    setTimeout(() => setQueueSyncState('idle'), 5000)
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

    const syncRun = beginSync(selectedCourses.length)
    startSyncing(async () => {
      const syncedCourses: string[] = []
      const failedCourses: string[] = []
      const syncedCourseIds = new Set<number>()

      try {
        for (const course of selectedCourses) {
          setCourseSyncProgress((current) => ({
            ...current,
            [course.courseId]: { state: 'syncing', message: 'Syncing now' },
          }))

          try {
            const result = await syncCanvasCourse({
              course,
              canvasUrl,
              accessToken: token,
            })

            if ('error' in result) {
              failedCourses.push(course.courseName)
              setCourseSyncProgress((current) => ({
                ...current,
                [course.courseId]: { state: 'failed', message: normalizeSyncErrorText(result.error) },
              }))
              continue
            }

            syncedCourses.push(result.courseName)
            syncedCourseIds.add(course.courseId)
            setCourseSyncProgress((current) => ({
              ...current,
              [course.courseId]: { state: 'synced', message: 'Synced' },
            }))
          } catch (error) {
            failedCourses.push(course.courseName)
            setCourseSyncProgress((current) => ({
              ...current,
              [course.courseId]: {
                state: 'failed',
                message: normalizeSyncErrorText(error instanceof Error ? error.message : null),
              },
            }))
          }
        }

        if (failedCourses.length > 0) {
          const message = syncedCourses.length > 0
            ? `Synced ${syncedCourses.length} course${syncedCourses.length === 1 ? '' : 's'}. ${failedCourses.length} failed and can be retried.`
            : `Sync failed for ${failedCourses.length} course${failedCourses.length === 1 ? '' : 's'}.`
          failSync(syncRun, message)
        } else {
          await finishSync(
            syncRun,
            syncedCourses.length === 1
              ? `Synced ${syncedCourses[0]}.`
              : `Synced ${syncedCourses.length} courses successfully.`,
          )
        }

        setSelectedCourseIds((current) => current.filter((id) => !syncedCourseIds.has(id)))
        router.refresh()
      } catch (error) {
        failSync(syncRun, normalizeSyncErrorText(error instanceof Error ? error.message : null))
      }
    })
  }

  function handleRefreshInstructors() {
    const url = canvasUrl || connectionSummary?.url || ''
    const tok = token || savedConnection?.token || ''
    if (!url || !tok) {
      setInstructorRefreshResult({ message: 'Reconnect to Canvas first so instructor names can be refreshed.', tone: 'error' })
      return
    }

    setInstructorRefreshResult(null)
    startRefreshingInstructors(async () => {
      try {
        const result = await refreshCourseInstructors({ canvasUrl: url, accessToken: tok })
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
              detail={`Connected to ${connectionSummary.url}${savedConnection?.courseCount ? ` with ${savedConnection.courseCount} available courses from the last check.` : '.'}`}
              tone="success"
            />
            <div className="ui-meta-list">
              {savedConnection?.testedAt && <span><strong>Last checked:</strong> {new Date(savedConnection.testedAt).toLocaleString()}</span>}
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
              No Canvas connection is saved on this device yet.
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
                  ? 'The saved connection is ready. Load your available courses when you want to sync more.'
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
                <button
                  type="button"
                  onClick={handleQueueSync}
                  disabled={selectedCourseIds.length === 0 || isSyncActionPending || courses.length === 0 || queueSyncState !== 'idle'}
                  className="ui-button ui-button-secondary ui-button-sm"
                  title="Queue sync to run in background"
                >
                  {queueSyncState === 'queuing' && 'Queuing…'}
                  {queueSyncState === 'queued' && '✓ Sync queued'}
                  {queueSyncState === 'error' && 'Queue failed'}
                  {queueSyncState === 'idle' && 'Sync in background'}
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
    return 'Syncing...'
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

function readSavedConnection(): SavedCanvasConnection | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as SavedCanvasConnection
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
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
