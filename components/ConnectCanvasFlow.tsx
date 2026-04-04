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
    <section className="page-stack" style={{ gap: '1rem' }}>
      <div className="motion-card glass-panel glass-accent" style={heroCardStyle}>
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
            <div className="glass-panel glass-soft" style={introCardStyle}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Guided setup</p>
              <p style={{ margin: '0.35rem 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                We&apos;ll open your Canvas settings in a new tab, show you how to create a token, then test the connection before you choose courses.
              </p>
            </div>

            {connectionError && <Message>{connectionError}</Message>}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openSetup('guide')} className="ui-button ui-button-primary" style={primaryButton(false)}>
                Open setup guide
              </button>
              <button type="button" onClick={handleOpenTokenPage} className="ui-button ui-button-secondary" style={secondaryButton}>
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
            <div className="glass-panel glass-soft" style={introCardStyle}>
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
                <button type="button" onClick={handleUseSavedConnection} disabled={isTesting} className="ui-button ui-button-primary" style={primaryButton(isTesting)}>
                  {isTesting ? 'Loading courses...' : hasSyncedCourses ? 'Load more courses' : 'Load available courses'}
                </button>
              ) : (
                <button type="button" onClick={() => openSetup('guide')} className="ui-button ui-button-primary" style={primaryButton(false)}>
                  Open setup guide
                </button>
              )}
              <button type="button" onClick={handleReconnect} disabled={isTesting || isSyncing} className="ui-button ui-button-secondary" style={secondaryButton}>
                Reconnect Canvas
              </button>
            </div>
          </div>
        ) : (
          <div key="sync-loaded" className="motion-subsection" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="ui-status-success" style={successPanelStyle}>
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
                className="ui-input"
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
              <div className="glass-panel glass-soft" style={softPanelStyle}>
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
                      className="glass-panel glass-hover"
                      style={{
                        '--glass-panel-bg': isSelected ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)' : 'var(--glass-surface)',
                        '--glass-panel-border': isSelected ? 'var(--accent-border)' : 'var(--glass-border)',
                        '--glass-panel-shadow': index < filteredCourses.length - 1
                          ? `inset 0 -1px 0 var(--border), ${isSelected ? 'var(--glass-shadow-strong)' : '0 0 0 transparent'}`
                          : isSelected
                            ? 'var(--glass-shadow-strong)'
                            : 'none',
                        '--glass-panel-glow': 'none',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.9rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      } as CSSProperties}
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
              <button type="button" onClick={handleReconnect} disabled={isSyncing} className="ui-button ui-button-secondary" style={secondaryButton}>
                Open setup guide
              </button>
              <button type="button" onClick={handleCourseSubmit} disabled={selectedCourseIds.length === 0 || isSyncing || courses.length === 0} className="ui-button ui-button-primary" style={primaryButton(selectedCourseIds.length === 0 || isSyncing || courses.length === 0)}>
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
          <div className={`glass-panel glass-soft ${lastSync.tone === 'success' ? 'ui-status-success' : lastSync.tone === 'warning' ? 'ui-status-warning' : ''}`} style={lastSyncCardStyle(lastSync.tone)}>
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
          <div className="ui-empty" style={emptyStateStyle}>
            Nothing has been synced yet. Finish the connection flow above, load your courses, and choose the ones you want on the dashboard.
          </div>
        ) : (
          <ul id="synced-courses" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {syncedModules.map((module) => (
              <li key={module.id} style={{ display: 'flex', alignItems: 'stretch', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link
                  href={`/modules/${module.id}`}
                  className="glass-panel glass-hover"
                  style={{
                    '--glass-panel-bg': 'var(--glass-surface)',
                    '--glass-panel-border': 'var(--glass-border)',
                    '--glass-panel-shadow': 'var(--glass-shadow)',
                    flex: '1 1 320px',
                    minWidth: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '0.8rem',
                    borderRadius: 'var(--radius-panel)',
                    padding: '0.95rem 1rem',
                    textDecoration: 'none',
                  } as CSSProperties}
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
    <div className="motion-modal-backdrop ui-overlay" style={modalBackdropStyle} onClick={onClose}>
      <div className="motion-modal-card glass-panel glass-strong ui-floating" style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
              Connect Canvas
            </p>
            <h2 style={{ margin: '0.35rem 0 0', fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {stage === 'guide' ? 'Create your Canvas token' : 'Enter your connection details'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="ui-button ui-button-secondary" style={closeButtonStyle} aria-label="Close setup guide">
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

            <div className="glass-panel glass-soft" style={guideCardStyle}>
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
              <button type="button" onClick={onOpenTokenPage} className="ui-button ui-button-primary" style={primaryButton(false)}>
                Open Canvas token page
              </button>
              <button type="button" onClick={onNext} className="ui-button ui-button-secondary" style={secondaryButton}>
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
              <button type="button" onClick={onBack} disabled={isTesting} className="ui-button ui-button-secondary" style={secondaryButton}>
                Back
              </button>
              <button
                type="button"
                onClick={onTestConnection}
                disabled={!canvasUrl.trim() || !token.trim() || isTesting}
                className="ui-button ui-button-primary"
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
        borderRadius: 'var(--radius-pill)',
        background: 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)',
        color: 'var(--text-primary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 700,
        flexShrink: 0,
        border: '1px solid color-mix(in srgb, var(--accent-border) 72%, var(--border-subtle) 28%)',
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
    <div className="glass-panel glass-soft ui-status-success" style={successPanelStyle}>
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
        <button type="button" onClick={onReconnect} disabled={disabled} className="ui-button ui-button-secondary" style={secondaryButton}>
          Reconnect
        </button>
        <button type="button" onClick={onForget} disabled={disabled} className="ui-button ui-button-ghost" style={ghostButton}>
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
    <section className={[className, 'glass-panel glass-strong'].filter(Boolean).join(' ')} style={sectionCardStyle}>
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
        className="ui-input"
        style={inputStyle}
      />
      <p style={{ margin: '0.4rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{hint}</p>
    </div>
  )
}

function Message({ children }: { children: ReactNode }) {
  return (
    <div className="glass-panel glass-soft ui-status-danger" style={{
      borderRadius: 'var(--radius-panel)',
      padding: '0.85rem 0.95rem',
      fontSize: '13px',
    }}>
      {children}
    </div>
  )
}

function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <div className="glass-panel glass-soft ui-status-success" style={{
      borderRadius: 'var(--radius-panel)',
      padding: '0.85rem 0.95rem',
      fontSize: '13px',
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
    border: isSelected ? '1px solid color-mix(in srgb, var(--accent-border) 74%, var(--border-subtle) 26%)' : '1px solid var(--border-subtle)',
    background: isSelected ? 'color-mix(in srgb, var(--surface-selected) 82%, var(--accent) 18%)' : 'color-mix(in srgb, var(--surface-soft) 84%, transparent)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
    flexShrink: 0,
    fontSize: '11px',
    fontWeight: 700,
  }
}

function lastSyncCardStyle(tone: SyncSnapshot['tone']): CSSProperties {
  const borderColor = tone === 'success'
    ? 'color-mix(in srgb, var(--green) 24%, var(--border-subtle) 76%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
      : 'var(--border)'
  const background = tone === 'success'
    ? 'color-mix(in srgb, var(--green-light) 24%, var(--surface-soft) 76%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 24%, var(--surface-soft) 76%)'
      : 'var(--surface-soft)'
  const color = tone === 'success' ? 'var(--green)' : tone === 'warning' ? 'var(--amber)' : 'var(--text-secondary)'

  return {
    border: `1px solid ${borderColor}`,
    background,
    color,
      borderRadius: 'var(--radius-panel)',
    padding: '1rem',
  }
}

const heroCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-page)',
  padding: '1.45rem',
  boxShadow: 'var(--shadow-medium), var(--highlight-sheen)',
}

const sectionCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-page)',
  padding: '1.15rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  boxShadow: 'var(--shadow-medium), var(--highlight-sheen)',
}

const introCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '1rem',
  boxShadow: 'var(--glass-shadow)',
}

const successPanelStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
  boxShadow: 'var(--shadow-low), var(--highlight-sheen)',
}

const softPanelStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '0.85rem 1rem',
  fontSize: '13px',
  color: 'var(--text-secondary)',
  boxShadow: 'var(--glass-shadow)',
}

const courseListStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-panel)',
  overflow: 'hidden',
  background: 'color-mix(in srgb, var(--glass-surface-strong) 94%, transparent)',
  maxHeight: '280px',
  overflowY: 'auto',
  boxShadow: 'var(--glass-shadow)',
}

const emptyStateStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '1rem',
  color: 'var(--text-secondary)',
  fontSize: '14px',
  lineHeight: 1.6,
}

const guideCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.9rem',
  boxShadow: 'var(--glass-shadow)',
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
  maxWidth: '640px',
  maxHeight: 'calc(100vh - 2rem)',
  overflowY: 'auto',
  borderRadius: 'var(--radius-overlay)',
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
}

const closeButtonStyle: CSSProperties = {
  borderRadius: 'var(--radius-control)',
  padding: '0.55rem 0.8rem',
  fontSize: '12px',
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
  borderRadius: 'var(--radius-control)',
  padding: '0.8rem 0.9rem',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
} as const

function primaryButton(disabled: boolean) {
  return {
    width: 'fit-content',
    minWidth: '170px',
    borderRadius: 'var(--radius-control)',
    padding: '0.8rem 1rem',
    fontSize: '14px',
    fontWeight: 700,
  } as const
}

const secondaryButton = {
  borderRadius: 'var(--radius-control)',
  padding: '0.75rem 0.95rem',
  fontSize: '13px',
  fontWeight: 600,
} as const

const ghostButton = {
  borderRadius: 'var(--radius-tight)',
  padding: '0.75rem 0.2rem',
  fontSize: '13px',
} as const
