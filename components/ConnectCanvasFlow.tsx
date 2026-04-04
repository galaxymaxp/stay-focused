'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { syncCourses, testCanvasConnection, type CanvasConnectionResult } from '@/actions/canvas'
import { UnsyncButton } from '@/components/UnsyncButton'
import type { CanvasCourse } from '@/lib/canvas'

const STORAGE_KEY = 'stay-focused.canvas-connection'

interface SavedCanvasConnection {
  url: string
  token: string
  testedAt: string
  courseCount?: number
}

interface SyncSnapshot {
  label: string
  tone: 'success' | 'neutral' | 'warning'
}

interface SyncedCanvasModule {
  id: string
  title: string
  summary: string | null
  createdAt: string
}

type FlowStep = 'connect' | 'courses'
type SetupStage = 'guide' | 'credentials'

export function ConnectCanvasFlow({
  initialConnectionUrl,
  lastSync,
  syncedCourseKeys,
  hasSyncedCourses,
  initialAction,
  syncedModules,
}: {
  initialConnectionUrl: string | null
  lastSync: SyncSnapshot | null
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
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null)
  const [savedConnection, setSavedConnection] = useState<SavedCanvasConnection | null>(initialSavedConnection)
  const [isTesting, startTesting] = useTransition()
  const [isSyncing, startSyncing] = useTransition()
  const initialActionHandledRef = useRef(false)

  const filteredCourses = useMemo(() => {
    const availableCourses = courses.filter((course) => !syncedCourseKeys.includes(getCourseKey(course.name, course.course_code)))

    return availableCourses.filter((course) =>
      course.name.toLowerCase().includes(search.toLowerCase()) ||
      course.course_code?.toLowerCase().includes(search.toLowerCase())
    )
  }, [courses, search, syncedCourseKeys])

  const connectionSummary = savedConnection ?? (initialConnectionUrl ? {
    url: initialConnectionUrl,
    token: '',
    testedAt: '',
  } : null)
  const canLoadCourses = Boolean(connectionSummary?.url && token.trim())
  const hasLoadedCourses = step === 'courses'

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
      setConnectionError('Add your school Canvas URL first so we can open the right settings page.')
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
    setSyncError(null)

    startTesting(async () => {
      try {
        const result = await testCanvasConnection({
          canvasUrl: trimmedUrl,
          accessToken: trimmedToken,
        })

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
  }, [canvasUrl, token, startTesting])

  function handleUseSavedConnection() {
    if (!canvasUrl.trim() || !token.trim()) {
      setStep('connect')
      openSetup('credentials')
      setConnectionError('Reconnect to Canvas so we can refresh your saved setup.')
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
    setSearch('')
    setConnectionError(null)
    setSyncError(null)
    setSyncSuccess(null)
    openSetup('guide')
  }

  function handleForgetConnection() {
    window.localStorage.removeItem(STORAGE_KEY)
    setSavedConnection(null)
    setCanvasUrl(initialConnectionUrl ?? '')
    setToken('')
    setCourses([])
    setSelectedCourseIds([])
    setSearch('')
    setStep('connect')
    setConnectionError(null)
    setSyncError(null)
    setSyncSuccess(null)
    openSetup('guide')
  }

  function toggleCourseSelection(courseId: number) {
    setSelectedCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId]
    )
  }

  function handleCourseSubmit() {
    if (selectedCourseIds.length === 0) return

    setSyncError(null)
    setSyncSuccess(null)
    startSyncing(async () => {
      try {
        const selectedCourses = courses
          .filter((course) =>
            selectedCourseIds.includes(course.id) &&
            !syncedCourseKeys.includes(getCourseKey(course.name, course.course_code))
          )
          .map((course) => ({
            courseId: course.id,
            courseName: course.name,
            courseCode: course.course_code,
          }))

        const result = await syncCourses({
          courses: selectedCourses,
          canvasUrl,
          accessToken: token,
        })

        if ('error' in result) {
          setSyncError(result.error)
          return
        }

        setSyncSuccess(
          result.syncedCount === 1
            ? `Synced ${result.syncedCourses[0]}.`
            : `Synced ${result.syncedCount} courses successfully.`
        )
        setSelectedCourseIds([])
        router.refresh()
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'We could not sync those courses.')
      }
    })
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="motion-card" style={heroCardStyle}>
        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-foreground)' }}>
          Canvas
        </p>
        <h1 style={{ margin: '0.4rem 0 0', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>One clean place to manage your Canvas sync</h1>
        <p style={{ margin: '0.65rem 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '56ch' }}>
          Connect once, load your available courses, and keep track of what you already brought into the dashboard. The page is meant to guide you downward instead of splitting the experience into separate top-level actions.
        </p>
      </div>
      <SectionCard
        className="motion-card motion-delay-1"
        eyebrow="Connection"
        title={connectionSummary ? 'Canvas is connected' : 'Connect your Canvas account'}
        description={connectionSummary
          ? `Connected to ${connectionSummary.url}. Refresh the connection, update your token, or keep scrolling to sync more courses.`
          : 'Start here if you have not connected Canvas yet. We will guide you to the token page, help you paste the details, and test the connection before loading courses.'}
      >
        {connectionSummary ? (
          <ConnectedStateCard
            url={connectionSummary.url}
            testedAt={savedConnection?.testedAt ?? null}
            courseCount={savedConnection?.courseCount ?? null}
            onReconnect={handleReconnect}
            onForget={handleForgetConnection}
            disabled={isTesting || isSyncing}
          />
        ) : (
          <div key="connect-idle" className="motion-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={introCardStyle}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Guided setup</p>
              <p style={{ margin: '0.35rem 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                We&apos;ll open your Canvas settings in a new tab, show you how to create a token, then test the connection before you choose courses.
              </p>
            </div>

            {connectionError && <Message>{connectionError}</Message>}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openSetup('guide')} style={primaryButton(false)}>
                Open setup guide
              </button>
              <button type="button" onClick={handleOpenTokenPage} style={secondaryButton}>
                Open Canvas token page
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        className="motion-card motion-delay-2"
        eyebrow="Sync courses"
        title="Choose what to bring in next"
        description="Load your current Canvas course list here, then select one or more courses to sync. The page keeps everything in a single vertical flow so you can naturally move from connection to syncing to review."
      >
        {!hasLoadedCourses ? (
          <div key="sync-locked" className="motion-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={introCardStyle}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {canLoadCourses ? 'Ready to load your courses' : 'Connection needed before course selection'}
              </p>
              <p style={{ margin: '0.35rem 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {canLoadCourses
                  ? 'Use your saved Canvas details to load the latest list of available courses, then pick the ones you want on the dashboard.'
                  : 'Open the setup guide first. As soon as your Canvas details are confirmed, this section becomes your course picker.'}
              </p>
            </div>

            {connectionError && connectionSummary && <Message>{connectionError}</Message>}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {canLoadCourses ? (
                <button type="button" onClick={handleUseSavedConnection} disabled={isTesting} style={primaryButton(isTesting)}>
                  {isTesting ? 'Loading courses...' : hasSyncedCourses ? 'Load more courses' : 'Load available courses'}
                </button>
              ) : (
                <button type="button" onClick={() => openSetup('guide')} style={primaryButton(false)}>
                  Open setup guide
                </button>
              )}
              <button type="button" onClick={handleReconnect} disabled={isTesting || isSyncing} style={secondaryButton}>
                Reconnect Canvas
              </button>
            </div>
          </div>
        ) : (
          <div key="sync-loaded" className="motion-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={successPanelStyle}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--green)' }}>Course list ready</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Pick the courses you want on your dashboard. Already-synced courses stay out of this list automatically.
              </p>
            </div>

            <div>
              <label style={labelStyle}>Course search</label>
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                }}
                placeholder="Search your courses"
                disabled={isSyncing}
                style={inputStyle}
              />
              <p style={{ margin: '0.4rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                {courses.length === 0
                  ? 'No active courses were found for this account.'
                  : filteredCourses.length === 0
                    ? 'Everything available from this Canvas account is already synced.'
                    : 'Start typing, then choose one or more courses to sync.'}
              </p>
            </div>

            {selectedCourseIds.length > 0 && (
              <div style={softPanelStyle}>
                {selectedCourseIds.length} course{selectedCourseIds.length === 1 ? '' : 's'} selected and ready to sync.
              </div>
            )}

            <div style={courseListStyle}>
              {filteredCourses.length === 0 ? (
                <div style={{ padding: '0.95rem 1rem', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {courses.some((course) => !syncedCourseKeys.includes(getCourseKey(course.name, course.course_code)))
                    ? 'No courses matched that search.'
                    : 'All available courses from this Canvas account are already synced.'}
                </div>
              ) : (
                filteredCourses.map((course, index) => {
                  const isSelected = selectedCourseIds.includes(course.id)

                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => toggleCourseSelection(course.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderBottom: index < filteredCourses.length - 1 ? '1px solid var(--border)' : 'none',
                        background: isSelected ? 'var(--accent-light)' : 'var(--bg-card)',
                        padding: '0.9rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', minWidth: 0, flex: '1 1 220px' }}>
                        <span style={selectionBadgeStyle(isSelected)}>
                          {isSelected ? 'Yes' : ''}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{course.name}</div>
                          <div style={{ marginTop: '0.2rem', fontSize: '12px', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{course.course_code}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', color: isSelected ? 'var(--accent-foreground)' : 'var(--text-muted)', fontWeight: isSelected ? 600 : 500, flexShrink: 0 }}>
                        {isSelected ? 'Selected' : 'Select'}
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            {syncError && <Message>{syncError}</Message>}
            {syncSuccess && <SuccessMessage>{syncSuccess}</SuccessMessage>}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleReconnect} disabled={isSyncing} style={secondaryButton}>
                Open setup guide
              </button>
              <button type="button" onClick={handleCourseSubmit} disabled={selectedCourseIds.length === 0 || isSyncing || courses.length === 0} style={primaryButton(selectedCourseIds.length === 0 || isSyncing || courses.length === 0)}>
                {isSyncing ? 'Syncing courses...' : selectedCourseIds.length > 1 ? `Sync ${selectedCourseIds.length} courses` : 'Sync selected course'}
              </button>
            </div>

            {isSyncing && (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                Pulling in assignments, announcements, and module content for your selected courses. This takes a few seconds.
              </p>
            )}
          </div>
        )}
      </SectionCard>

      {lastSync && (
        <SectionCard
          className="motion-card motion-delay-3"
          eyebrow="Last sync"
          title="Recent sync status"
          description="A quick summary of the latest sync run so you can tell at a glance whether everything finished normally."
        >
          <div style={lastSyncCardStyle(lastSync.tone)}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{lastSync.label}</p>
          </div>
        </SectionCard>
      )}

      <SectionCard
        className="motion-card motion-delay-4"
        eyebrow="Synced courses"
        title={syncedModules.length > 0 ? 'Courses already on your dashboard' : 'No courses synced yet'}
        description={syncedModules.length > 0
          ? 'These course modules are already synced into Stay Focused. Open any one to review the extracted work, or unsync it here if you want to remove it.'
          : 'Once you sync a course, it will show up here so you can jump back in or remove it later.'}
      >
        {syncedModules.length === 0 ? (
          <div style={emptyStateStyle}>
            Nothing has been synced yet. Finish the connection flow above, load your courses, and choose the ones you want on the dashboard.
          </div>
        ) : (
          <ul id="synced-courses" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {syncedModules.map((module) => (
              <li key={module.id} style={{ display: 'flex', alignItems: 'stretch', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link
                  href={`/modules/${module.id}`}
                  style={{
                    flex: '1 1 320px',
                    minWidth: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '0.8rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    padding: '0.95rem 1rem',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                      {module.title}
                    </p>
                    {module.summary && (
                      <p style={{ margin: '0.3rem 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                        {module.summary}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap', paddingTop: '1px' }}>
                    {new Date(module.createdAt).toLocaleDateString()}
                  </span>
                </Link>
                <UnsyncButton moduleId={module.id} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

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
    </section>
  )
}

function getCourseKey(courseName: string, courseCode: string) {
  return `${courseName}::${courseCode}`.toLowerCase()
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
    <div className="motion-modal-backdrop" style={modalBackdropStyle} onClick={onClose}>
      <div className="motion-modal-card" style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
              Connect Canvas
            </p>
            <h2 style={{ margin: '0.35rem 0 0', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {stage === 'guide' ? 'Create your Canvas token' : 'Enter your connection details'}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Close setup guide">
            Close
          </button>
        </div>

        {stage === 'guide' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              We&apos;ll help you open Canvas in a new tab and generate a personal access token. Nothing is synced until you come back and test the connection here.
            </p>

            <Field
              label="Your Canvas URL"
              hint="This helps us open the correct Canvas settings page for your school."
              value={canvasUrl}
              onChange={onCanvasUrlChange}
              placeholder="https://your-school.instructure.com"
              disabled={false}
              type="url"
            />

            <div style={guideCardStyle}>
              <GuideStep number="1" title="Open your Canvas settings">
                Use the button below to open your Canvas settings page in a new tab.
              </GuideStep>
              <GuideStep number="2" title="Create a new access token">
                In Canvas, look for Approved Integrations or Access Tokens, then choose the option to create a new token.
              </GuideStep>
              <GuideStep number="3" title="Copy the token right away">
                Canvas usually shows the token only once, so copy it before leaving the page.
              </GuideStep>
              <GuideStep number="4" title="Return here and paste it in">
                Once you&apos;re back, we&apos;ll test the connection before showing your courses.
              </GuideStep>
            </div>

            {connectionError && <Message>{connectionError}</Message>}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={onOpenTokenPage} style={primaryButton(false)}>
                Open Canvas token page
              </button>
              <button type="button" onClick={onNext} style={secondaryButton}>
                I already have my token
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              If Canvas opens somewhere slightly different, go to Account, then Settings or Approved Integrations.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Paste your Canvas URL and the token you just created. We&apos;ll test everything before you pick a course.
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
              hint="Paste the token exactly as Canvas gave it to you."
              value={token}
              onChange={onTokenChange}
              placeholder="Paste your Canvas access token"
              disabled={isTesting}
              type="password"
            />

            {connectionError && <Message>{connectionError}</Message>}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={onBack} disabled={isTesting} style={secondaryButton}>
                Back
              </button>
              <button
                type="button"
                onClick={onTestConnection}
                disabled={!canvasUrl.trim() || !token.trim() || isTesting}
                style={primaryButton(!canvasUrl.trim() || !token.trim() || isTesting)}
              >
                {isTesting ? 'Checking Canvas...' : 'Test connection'}
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              We&apos;ll load your available courses only after the connection check succeeds.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function GuideStep({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <span style={{
        width: '1.6rem',
        height: '1.6rem',
        borderRadius: '999px',
        background: 'var(--accent-light)',
        color: 'var(--accent-foreground)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 700,
        flexShrink: 0,
        border: '1px solid var(--accent-border)',
      }}>
        {number}
      </span>
      <div>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{children}</p>
      </div>
    </div>
  )
}

function ConnectedStateCard({
  url,
  testedAt,
  courseCount,
  onReconnect,
  onForget,
  disabled,
}: {
  url: string
  testedAt: string | null
  courseCount: number | null
  onReconnect: () => void
  onForget: () => void
  disabled: boolean
}) {
  return (
    <div style={successPanelStyle}>
      <div>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--green)' }}>Connection saved</p>
        <p style={{ margin: '0.35rem 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          Connected to {url}
          {courseCount !== null ? ` with ${courseCount} available course${courseCount === 1 ? '' : 's'}.` : '.'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {testedAt && <span>Last checked {new Date(testedAt).toLocaleString()}</span>}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={onReconnect} disabled={disabled} style={secondaryButton}>
          Reconnect
        </button>
        <button type="button" onClick={onForget} disabled={disabled} style={ghostButton}>
          Forget saved connection
        </button>
      </div>
    </div>
  )
}

function SectionCard({
  className,
  eyebrow,
  title,
  description,
  children,
}: {
  className?: string
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className={className} style={sectionCardStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {eyebrow}
        </p>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {description}
        </p>
      </div>
      {children}
    </section>
  )
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
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
      />
      <p style={{ margin: '0.4rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{hint}</p>
    </div>
  )
}

function Message({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: 'var(--red-light)',
      border: '1px solid #F5C5BC',
      borderRadius: '12px',
      padding: '0.85rem 0.95rem',
      fontSize: '13px',
      color: 'var(--red)',
    }}>
      {children}
    </div>
  )
}

function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: 'var(--green-light)',
      border: '1px solid #CBE3D4',
      borderRadius: '12px',
      padding: '0.85rem 0.95rem',
      fontSize: '13px',
      color: 'var(--green)',
    }}>
      {children}
    </div>
  )
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

function selectionBadgeStyle(isSelected: boolean): CSSProperties {
  return {
    width: '2rem',
    height: '1.35rem',
    marginTop: '1px',
    borderRadius: '999px',
    border: isSelected ? '1px solid var(--accent-border)' : '1px solid var(--border-hover)',
    background: isSelected ? 'var(--accent-light)' : 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-foreground)',
    flexShrink: 0,
    fontSize: '11px',
    fontWeight: 700,
  }
}

function lastSyncCardStyle(tone: SyncSnapshot['tone']): CSSProperties {
  const borderColor = tone === 'success' ? '#CBE3D4' : tone === 'warning' ? '#F0DCBF' : 'var(--border)'
  const background = tone === 'success' ? 'var(--green-light)' : tone === 'warning' ? 'var(--amber-light)' : 'var(--bg)'
  const color = tone === 'success' ? 'var(--green)' : tone === 'warning' ? 'var(--amber)' : 'var(--text-secondary)'

  return {
    border: `1px solid ${borderColor}`,
    background,
    color,
    borderRadius: '14px',
    padding: '1rem',
  }
}

const heroCardStyle: CSSProperties = {
  border: '1px solid var(--accent-border)',
  background: 'linear-gradient(180deg, var(--accent-light) 0%, var(--bg-card) 100%)',
  borderRadius: '20px',
  padding: '1.35rem',
  boxShadow: '0 18px 36px var(--accent-shadow)',
}

const sectionCardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '18px',
  background: 'var(--bg-card)',
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
}

const introCardStyle: CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '14px',
  padding: '1rem',
}

const successPanelStyle: CSSProperties = {
  background: 'var(--green-light)',
  border: '1px solid #CBE3D4',
  borderRadius: '14px',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
}

const softPanelStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '12px',
  background: 'var(--bg)',
  padding: '0.85rem 1rem',
  fontSize: '13px',
  color: 'var(--text-secondary)',
}

const courseListStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '12px',
  overflow: 'hidden',
  background: 'var(--bg-card)',
  maxHeight: '280px',
  overflowY: 'auto',
}

const emptyStateStyle: CSSProperties = {
  borderRadius: '14px',
  border: '1px dashed var(--border-hover)',
  padding: '1rem',
  background: 'var(--bg)',
  color: 'var(--text-secondary)',
  fontSize: '14px',
  lineHeight: 1.6,
}

const guideCardStyle: CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '14px',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.9rem',
}

const modalBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(26, 25, 21, 0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  zIndex: 50,
}

const modalCardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '640px',
  maxHeight: 'calc(100vh - 2rem)',
  overflowY: 'auto',
  background: 'var(--bg-card)',
  borderRadius: '20px',
  border: '1px solid var(--border)',
  boxShadow: '0 24px 60px rgba(0, 0, 0, 0.12)',
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
}

const closeButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-secondary)',
  borderRadius: '10px',
  padding: '0.55rem 0.8rem',
  fontSize: '12px',
  cursor: 'pointer',
}

const labelStyle = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: '0.4rem',
} as const

const inputStyle = {
  width: '100%',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  padding: '0.8rem 0.9rem',
  fontSize: '14px',
  color: 'var(--text-primary)',
  background: 'var(--bg-card)',
  outline: 'none',
  fontFamily: 'inherit',
} as const

function primaryButton(disabled: boolean) {
  return {
    width: 'fit-content',
    minWidth: '170px',
    background: disabled ? 'var(--border)' : 'var(--accent)',
    color: disabled ? 'var(--text-muted)' : 'var(--accent-foreground)',
    border: disabled ? '1px solid var(--border)' : '1px solid var(--accent-border)',
    borderRadius: '10px',
    padding: '0.8rem 1rem',
    fontSize: '14px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: disabled ? 'none' : '0 10px 22px var(--accent-shadow)',
  } as const
}

const secondaryButton = {
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  borderRadius: '10px',
  padding: '0.75rem 0.95rem',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
} as const

const ghostButton = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  borderRadius: '10px',
  padding: '0.75rem 0.2rem',
  fontSize: '13px',
  cursor: 'pointer',
} as const
