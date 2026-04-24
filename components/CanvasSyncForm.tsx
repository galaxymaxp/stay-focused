'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { syncCourse } from '@/actions/canvas'
import type { CanvasCourse } from '@/lib/canvas'
import { notifyCompletion } from '@/lib/notifications'

const SYNC_STAGES = [
  { label: 'Connecting to Canvas', progressValue: 0.08 },
  { label: 'Reading selected courses', progressValue: 0.18 },
  { label: 'Importing module content', progressValue: 0.35 },
  { label: 'Organizing data', progressValue: 0.50 },
  { label: 'Saving courses to database', progressValue: 0.70 },
  { label: 'Saving modules to database', progressValue: 0.80 },
  { label: 'Extracting tasks with AI', progressValue: 0.90 },
  { label: 'Finalizing sync', progressValue: 0.98 },
] as const

export function CanvasSyncForm({ courses }: { courses: CanvasCourse[] }) {
  const [selected, setSelected] = useState<CanvasCourse | null>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [progressValue, setProgressValue] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const syncedCourseName = useRef<string | null>(null)

  useEffect(() => {
    if (!isPending) return

    const stageTimes = [1200, 3500, 7000, 12000, 18000, 24000, 32000]
    const timers = SYNC_STAGES.slice(1).map((stage, index) =>
      window.setTimeout(() => {
        setStageIndex(index + 1)
        setProgressValue(stage.progressValue)
      }, stageTimes[index] ?? 5000 + index * 8000),
    )

    const intervalId = window.setInterval(() => {
      setProgressValue((current) => (current >= 0.97 ? current : Math.min(current + 0.006, 0.97)))
    }, 800)

    return () => {
      window.clearInterval(intervalId)
      for (const timerId of timers) window.clearTimeout(timerId)
    }
  }, [isPending])

  const filtered = courses.filter((course) =>
    course.name.toLowerCase().includes(search.toLowerCase()) ||
    course.course_code?.toLowerCase().includes(search.toLowerCase())
  )

  function handleSelect(course: CanvasCourse) {
    setSelected(course)
    setSearch(course.name)
    setOpen(false)
  }

  function handleSubmit(formData: FormData) {
    if (!selected) return

    setError(null)
    setStageIndex(0)
    setProgressValue(SYNC_STAGES[0].progressValue)
    syncedCourseName.current = selected.name
    startTransition(async () => {
      try {
        const result = await syncCourse(formData)
        if (result?.error) {
          setError(result.error)
          notifyCompletion('Sync failed', result.error, { showBrowser: true, playSound: true, soundType: 'error', tag: 'canvas-sync' })
        } else {
          notifyCompletion(
            'Sync complete',
            syncedCourseName.current ? `${syncedCourseName.current} synced successfully.` : 'Course synced successfully.',
            { showBrowser: true, playSound: true, soundType: 'success', tag: 'canvas-sync' },
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed.'
        setError(message)
        notifyCompletion('Sync failed', message, { showBrowser: true, playSound: true, soundType: 'error', tag: 'canvas-sync' })
      } finally {
        setStageIndex(0)
        setProgressValue(0)
      }
    })
  }

  return (
    <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ position: 'relative' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
          Select course
        </label>

        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setSelected(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Type to search courses..."
          disabled={isPending}
          className="ui-input"
          style={{
            width: '100%',
            borderRadius: 'var(--radius-control)',
            padding: '10px 14px',
            fontSize: '14px',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />

        {!selected && !error && (
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Choose a course from the list to enable sync.
          </p>
        )}

        {open && filtered.length > 0 && (
          <ul className="ui-card ui-card-elevated ui-floating" style={{
            position: 'absolute',
            zIndex: 10,
            marginTop: '4px',
            width: '100%',
            borderRadius: 'var(--radius-overlay)',
            maxHeight: '240px',
            overflowY: 'auto',
            listStyle: 'none',
            padding: 0,
            margin: '4px 0 0',
          }}>
            {filtered.map((course, index) => (
              <li
                key={course.id}
                onMouseDown={() => handleSelect(course)}
                className="ui-control"
                style={{
                  padding: '10px 14px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  borderBottom: index < filtered.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  color: 'var(--text-primary)',
                  background: 'transparent',
                }}
              >
                <span style={{ fontWeight: 500 }}>{course.name}</span>
                {course.course_code && (
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {course.course_code}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <>
            <input type="hidden" name="courseId" value={selected.id} />
            <input type="hidden" name="courseName" value={selected.name} />
            <input type="hidden" name="courseCode" value={selected.course_code} />
            <input type="hidden" name="instructor" value={selected.teachers?.[0]?.display_name ?? ''} />
          </>
        )}
      </div>

      {error && (
        <div className="ui-card ui-card-soft ui-status-danger" style={{
          background: 'var(--red-light)',
          border: '1px solid #F5C5BC',
          borderRadius: 'var(--radius-control)',
          padding: '10px 14px',
          fontSize: '13px',
          color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!selected || isPending}
        className="ui-button ui-button-primary"
        style={{
          width: '100%',
          borderRadius: 'var(--radius-control)',
          padding: '10px',
          fontSize: '14px',
          fontWeight: 600,
        }}
      >
        {isPending ? 'Syncing from Canvas...' : 'Sync course'}
      </button>

      {isPending && (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.78rem 0.82rem', display: 'grid', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
            <p className="ui-kicker" style={{ margin: 0 }}>Syncing from Canvas</p>
            <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
              {Math.round(progressValue * 100)}%
            </span>
          </div>

          <div style={{ position: 'relative', height: '0.42rem', borderRadius: '999px', overflow: 'hidden', background: 'color-mix(in srgb, var(--surface-soft) 90%, transparent)', border: '1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent)' }}>
            <div style={{
              width: `${Math.max(8, Math.min(100, progressValue * 100))}%`,
              height: '100%',
              borderRadius: 'inherit',
              background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 72%, var(--blue) 28%), color-mix(in srgb, var(--blue) 68%, var(--accent) 32%))',
              transition: 'width 600ms ease',
            }} />
          </div>

          <div style={{ display: 'grid', gap: '0.22rem' }}>
            {SYNC_STAGES.map((stage, index) => {
              const status = index < stageIndex ? 'done' : index === stageIndex ? 'active' : 'pending'
              return (
                <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{
                    flexShrink: 0,
                    width: '13px',
                    height: '13px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '8px',
                    background: status === 'done'
                      ? 'color-mix(in srgb, var(--green-light) 70%, var(--surface-base) 30%)'
                      : status === 'active'
                        ? 'color-mix(in srgb, var(--accent-light) 70%, var(--surface-base) 30%)'
                        : 'color-mix(in srgb, var(--surface-soft) 80%, transparent)',
                    border: `1px solid ${status === 'done'
                      ? 'color-mix(in srgb, var(--green) 22%, var(--border-subtle) 78%)'
                      : status === 'active'
                        ? 'color-mix(in srgb, var(--accent-border) 22%, var(--border-subtle) 78%)'
                        : 'color-mix(in srgb, var(--border-subtle) 80%, transparent)'}`,
                    color: status === 'done' ? 'var(--green)' : status === 'active' ? 'var(--accent-foreground)' : 'var(--text-muted)',
                  }}>
                    {status === 'done' ? '✓' : status === 'active' ? '●' : ''}
                  </span>
                  <span style={{
                    fontSize: '11.5px',
                    fontWeight: status === 'active' ? 600 : status === 'done' ? 500 : 400,
                    color: status === 'active' ? 'var(--text-primary)' : status === 'done' ? 'var(--text-secondary)' : 'var(--text-muted)',
                  }}>
                    {stage.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </form>
  )
}
