'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { syncCourses, testCanvasConnection, type CanvasConnectionResult } from '@/actions/canvas'
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

type FlowStep = 'connect' | 'courses'
type SetupStage = 'guide' | 'credentials'

export function ConnectCanvasFlow({
  initialConnectionUrl,
  lastSync,
  syncedCourseKeys,
  hasSyncedCourses,
}: {
  initialConnectionUrl: string | null
  lastSync: SyncSnapshot | null
  syncedCourseKeys: string[]
  hasSyncedCourses: boolean
}) {
  const router = useRouter()
  const initialSavedConnection = readSavedConnection()
  const [step, setStep] = useState<FlowStep>('connect')
  const [setupStage, setSetupStage] = useState<SetupStage>('guide')
  const [isSetupOpen, setIsSetupOpen] = useState(false)
  const [canvasUrl, setCanvasUrl] = useState(initialSavedConnection?.url ?? initialConnectionUrl ?? '')
  const [token, setToken] = useState(initialSavedConnection?.token ?? '')
  const [courses, setCourses] = useState<CanvasCourse[]>([])
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null)
  const [savedConnection, setSavedConnection] = useState<SavedCanvasConnection | null>(initialSavedConnection)
  const [isTesting, startTesting] = useTransition()
  const [isSyncing, startSyncing] = useTransition()

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
  const shouldShowUseAction = Boolean(savedConnection?.token || courses.length > 0 || hasSyncedCourses)
  const useActionLabel = hasSyncedCourses ? 'Sync another course' : 'Choose courses to sync'

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

  function handleTestConnection() {
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
  }

  function handleUseSavedConnection() {
    if (!canvasUrl.trim() || !token.trim()) {
      setStep('connect')
      openSetup('credentials')
      setConnectionError('Reconnect to Canvas so we can refresh your saved setup.')
      return
    }

    handleTestConnection()
  }

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
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>Connect Canvas</h1>
            <p style={{ margin: '0.45rem 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              A guided setup helps you open Canvas, create a token, and bring your course work into one place.
            </p>
          </div>
          <StepPill step={step} />
        </div>

        {connectionSummary && (
          <ConnectedStateCard
            url={connectionSummary.url}
            testedAt={savedConnection?.testedAt ?? null}
            courseCount={savedConnection?.courseCount ?? null}
            lastSync={lastSync}
            onReconnect={handleReconnect}
            onUseConnection={handleUseSavedConnection}
            onForget={handleForgetConnection}
            showUseAction={shouldShowUseAction}
            useActionLabel={useActionLabel}
            disabled={isTesting || isSyncing}
          />
        )}

        {step === 'connect' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={introCardStyle}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Guided setup</p>
              <p style={{ margin: '0.35rem 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                We&apos;ll open your Canvas settings in a new tab, show you how to create a token, then test the connection before you choose a course.
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

            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              If you already have a token, you can skip straight to the details step inside the guide.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: 'var(--green-light)',
              border: '1px solid #CBE3D4',
              borderRadius: '14px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--green)' }}>Step 2: Choose a course to sync</p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Your connection is ready. Pick a course and we&apos;ll pull in assignments, announcements, and modules.
              </p>
            </div>

            <div>
              <label style={labelStyle}>Course</label>
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
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: '12px',
                background: 'var(--bg)',
                padding: '0.85rem 1rem',
                fontSize: '13px',
                color: 'var(--text-secondary)',
              }}>
                {selectedCourseIds.length} course{selectedCourseIds.length === 1 ? '' : 's'} selected and ready to sync.
              </div>
            )}

            <div style={{
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
              background: 'var(--bg-card)',
              maxHeight: '280px',
              overflowY: 'auto',
            }}>
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
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <span style={{
                          width: '18px',
                          height: '18px',
                          marginTop: '1px',
                          borderRadius: '5px',
                          border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-hover)',
                          background: isSelected ? 'var(--accent-light)' : 'transparent',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--accent)',
                          flexShrink: 0,
                          fontSize: '12px',
                          fontWeight: 700,
                        }}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{course.name}</div>
                          <div style={{ marginTop: '0.2rem', fontSize: '12px', color: 'var(--text-muted)' }}>{course.course_code}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', color: isSelected ? 'var(--accent)' : 'var(--text-muted)', fontWeight: isSelected ? 600 : 500 }}>
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
      </div>

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
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
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
        color: 'var(--accent)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 600,
        flexShrink: 0,
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
  lastSync,
  onReconnect,
  onUseConnection,
  onForget,
  showUseAction,
  useActionLabel,
  disabled,
}: {
  url: string
  testedAt: string | null
  courseCount: number | null
  lastSync: SyncSnapshot | null
  onReconnect: () => void
  onUseConnection: () => void
  onForget: () => void
  showUseAction: boolean
  useActionLabel: string
  disabled: boolean
}) {
  return (
    <div style={{
      border: '1px solid #CBE3D4',
      background: 'var(--green-light)',
      borderRadius: '14px',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.8rem',
    }}>
      <div>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--green)' }}>Canvas connected</p>
        <p style={{ margin: '0.35rem 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Connected to {url}
          {courseCount !== null ? ` with ${courseCount} available course${courseCount === 1 ? '' : 's'}.` : '.'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {testedAt && <span>Last checked {new Date(testedAt).toLocaleString()}</span>}
        {lastSync && (
          <span style={{ color: lastSync.tone === 'success' ? 'var(--green)' : lastSync.tone === 'warning' ? 'var(--amber)' : 'var(--text-secondary)' }}>
            {lastSync.label}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        {showUseAction && (
          <button type="button" onClick={onUseConnection} disabled={disabled} style={secondaryButton}>
            {useActionLabel}
          </button>
        )}
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

function StepPill({ step }: { step: FlowStep }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.45rem',
      padding: '0.45rem 0.7rem',
      borderRadius: '999px',
      border: '1px solid var(--border)',
      background: 'var(--bg)',
      fontSize: '12px',
      color: 'var(--text-secondary)',
      fontWeight: 500,
    }}>
      <span style={{
        width: '1.3rem',
        height: '1.3rem',
        borderRadius: '999px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: step === 'connect' ? 'var(--accent)' : 'var(--green)',
        color: '#fff',
        fontSize: '11px',
      }}>
        {step === 'connect' ? '1' : '2'}
      </span>
      {step === 'connect' ? 'Setup' : 'Course selection'}
    </div>
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
      borderRadius: '10px',
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
      borderRadius: '10px',
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

const panelStyle: CSSProperties = {
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
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '0.8rem 1rem',
    fontSize: '14px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  } as const
}

const secondaryButton = {
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  borderRadius: '10px',
  padding: '0.75rem 0.95rem',
  fontSize: '13px',
  fontWeight: 500,
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
