import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveCanvasCourseStatus,
  getCourses,
  getModules,
  type CanvasCourse,
} from '../lib/canvas'

test('Canvas active courses load by default', async () => {
  const requests: string[] = []
  const restoreFetch = mockFetch((url) => {
    requests.push(url)
    return jsonResponse([
      course(101, 'Current Biology', { enrollment_state: 'active' }),
    ])
  })

  try {
    const courses = await getCourses({ url: 'https://canvas.example', token: 'token' })

    assert.deepEqual(courses.map((item) => item.id), [101])
    assert.equal(requests.length, 1)
    assert.match(requests[0], /enrollment_state=active/)
  } finally {
    restoreFetch()
  }
})

test('Canvas ended courses are hidden by default even if Canvas returns one', async () => {
  const restoreFetch = mockFetch(() => jsonResponse([
    course(101, 'Current Biology', { enrollment_state: 'active' }),
    course(202, 'Old Statistics', { enrollment_state: 'completed' }),
  ]))

  try {
    const courses = await getCourses({ url: 'https://canvas.example', token: 'token' })

    assert.deepEqual(courses.map((item) => item.id), [101])
  } finally {
    restoreFetch()
  }
})

test('Canvas ended courses load when includeEnded is enabled', async () => {
  const requests: string[] = []
  const restoreFetch = mockFetch((url) => {
    requests.push(url)
    if (url.includes('enrollment_state=completed')) {
      return jsonResponse([
        course(202, 'Old Statistics', {
          enrollment_state: 'completed',
          term: { id: 9, name: 'Fall 2025', end_at: '2025-12-15T00:00:00Z' },
        }),
      ])
    }

    return jsonResponse([
      course(101, 'Current Biology', { enrollment_state: 'active' }),
    ])
  })

  try {
    const courses = await getCourses({ url: 'https://canvas.example', token: 'token' }, { includeEnded: true })

    assert.deepEqual(courses.map((item) => item.id), [101, 202])
    assert.equal(requests.some((url) => url.includes('enrollment_state=completed')), true)
  } finally {
    restoreFetch()
  }
})

test('Canvas course status distinguishes current, ended, and restricted courses', () => {
  const now = new Date('2026-05-03T00:00:00Z')

  assert.equal(deriveCanvasCourseStatus(course(101, 'Current Biology', { enrollment_state: 'active' }), now), 'active')
  assert.equal(deriveCanvasCourseStatus(course(202, 'Old Statistics', { enrollment_state: 'completed' }), now), 'past')
  assert.equal(deriveCanvasCourseStatus(course(303, 'Ended Term', {
    enrollment_state: 'active',
    term: { id: 9, name: 'Fall 2025', end_at: '2025-12-15T00:00:00Z' },
  }), now), 'past')
  assert.equal(deriveCanvasCourseStatus(course(404, 'Restricted Archive', {
    enrollment_state: 'completed',
    access_restricted_by_date: true,
  }), now), 'unavailable')
})

test('restricted ended course module fetch reports a student-friendly Canvas access message', async () => {
  const restoreFetch = mockFetch(() => new Response('{}', { status: 403 }))

  try {
    await assert.rejects(
      () => getModules(202, { url: 'https://canvas.example', token: 'token' }),
      /no longer available to your account/,
    )
  } finally {
    restoreFetch()
  }
})

function course(id: number, name: string, overrides: Partial<CanvasCourse> = {}): CanvasCourse {
  return {
    id,
    name,
    course_code: name.toUpperCase().replace(/\s+/g, '-'),
    enrollment_state: 'active',
    ...overrides,
  }
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function mockFetch(handler: (url: string) => Response) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    return handler(String(input))
  }) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
  }
}
