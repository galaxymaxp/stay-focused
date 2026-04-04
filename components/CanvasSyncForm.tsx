'use client'

import { useRef, useState, useTransition } from 'react'
import { syncCourse } from '@/actions/canvas'
import type { CanvasCourse } from '@/lib/canvas'

export function CanvasSyncForm({ courses }: { courses: CanvasCourse[] }) {
  const [selected, setSelected] = useState<CanvasCourse | null>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    startTransition(async () => {
      try {
        const result = await syncCourse(formData)
        if (result?.error) {
          setError(result.error)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sync failed.')
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
            borderRadius: '8px',
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
            borderRadius: '10px',
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
          </>
        )}
      </div>

      {error && (
        <div className="ui-card ui-card-soft ui-status-danger" style={{
          background: 'var(--red-light)',
          border: '1px solid #F5C5BC',
          borderRadius: '8px',
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
          borderRadius: '8px',
          padding: '10px',
          fontSize: '14px',
          fontWeight: 600,
        }}
      >
        {isPending ? 'Syncing from Canvas...' : 'Sync course'}
      </button>

      {isPending && (
        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Fetching assignments, announcements, and modules - this takes a few seconds
        </p>
      )}
    </form>
  )
}
