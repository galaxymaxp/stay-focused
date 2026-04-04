// This script verifies the server-side sync path directly by invoking actions.
// It is useful for persistence checks, but it is not a substitute for true browser/runtime verification.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { renderToStaticMarkup } from 'react-dom/server'

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local')
  const contents = fs.readFileSync(envPath, 'utf8')

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function extractRedirectPath(error: unknown) {
  if (!error || typeof error !== 'object') return null

  const digest = 'digest' in error && typeof error.digest === 'string'
    ? error.digest
    : null

  if (!digest || !digest.includes('NEXT_REDIRECT')) return null

  const match = digest.match(/(\/modules\/[^;]+)/)
  return match?.[1] ?? null
}

function isExpectedPostSyncError(error: unknown) {
  return error instanceof Error && error.message.includes('static generation store missing')
}

async function startMockCanvasServer(routes: Record<string, unknown>) {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
    const key = `${req.method} ${requestUrl.pathname}`
    const payload = routes[key]

    if (payload === undefined) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `No mock route for ${key}` }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start mock Canvas server')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

async function importProject() {
  const [{ fetchCourses, syncCourse }, { supabase }, dashboardModule, modulePageModule, canvasPageModule] = await Promise.all([
    import('../actions/canvas'),
    import('../lib/supabase'),
    import('../app/page'),
    import('../app/modules/[id]/page'),
    import('../app/canvas/page'),
  ])

  return {
    fetchCourses,
    syncCourse,
    supabase,
    Dashboard: dashboardModule.default,
    ModulePage: modulePageModule.default,
    CanvasPage: canvasPageModule.default,
  }
}

function buildCoursePrefix(courseName: string, courseCode: string) {
  return `Course: ${courseName} (${courseCode})`
}

async function runValidSyncCase() {
  const { fetchCourses, syncCourse, supabase, Dashboard, ModulePage } = await importProject()

  const courses = await fetchCourses()
  if (courses.length === 0) {
    return {
      status: 'no_courses_available',
      tested: false,
      message: 'The configured Canvas account returned no active courses, so the real sync path could not be exercised.',
    }
  }

  let chosenCourse = null as null | (typeof courses)[number]
  let moduleId = ''
  let moduleTitle = ''
  let taskTitles: string[] = []
  let deadlinesCount = 0
  let firstRedirectPath: string | null = null

  for (const course of courses.slice(0, 3)) {
    const formData = new FormData()
    formData.set('courseId', String(course.id))
    formData.set('courseName', course.name)
    formData.set('courseCode', course.course_code)

    try {
      await syncCourse(formData)
      throw new Error('syncCourse completed without redirecting')
    } catch (error) {
      const redirectPath = extractRedirectPath(error)
      if (!redirectPath && !isExpectedPostSyncError(error)) throw error
      firstRedirectPath = redirectPath
    }

    const coursePrefix = buildCoursePrefix(course.name, course.course_code)
    const { data: modules, error: modulesError } = await supabase
      .from('modules')
      .select('id, title, summary, created_at')
      .ilike('raw_content', `${coursePrefix}%`)
      .order('created_at', { ascending: false })
      .limit(1)

    if (modulesError || !modules || modules.length === 0) {
      throw new Error('Synced module was not found in Supabase after sync.')
    }

    const latestModule = modules[0]
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('title')
      .eq('module_id', latestModule.id)

    if (tasksError) throw new Error('Failed to read synced tasks from Supabase.')

    const { data: deadlines, error: deadlinesError } = await supabase
      .from('deadlines')
      .select('id')
      .eq('module_id', latestModule.id)

    if (deadlinesError) throw new Error('Failed to read synced deadlines from Supabase.')

    if ((tasks?.length ?? 0) > 0) {
      chosenCourse = course
      moduleId = latestModule.id
      moduleTitle = latestModule.title
      taskTitles = (tasks ?? []).map((task) => task.title)
      deadlinesCount = deadlines?.length ?? 0
      break
    }
  }

  if (!chosenCourse) {
    return {
      status: 'synced_but_no_tasks',
      tested: true,
      message: 'Canvas sync succeeded, but none of the first three courses produced extracted tasks, so dashboard task rendering could not be fully verified.',
      redirectPath: firstRedirectPath,
    }
  }

  const dashboardMarkup = renderToStaticMarkup(await Dashboard())
  const moduleMarkup = renderToStaticMarkup(await ModulePage({ params: Promise.resolve({ id: moduleId }) }))

  const dashboardContainsModuleTask = taskTitles.some((title) => dashboardMarkup.includes(title))
  const modulePageContainsTask = taskTitles.some((title) => moduleMarkup.includes(title))

  return {
    status: 'ok',
    tested: true,
    courseName: chosenCourse.name,
    courseCode: chosenCourse.course_code,
    moduleId,
    moduleTitle,
    redirectPath: firstRedirectPath,
    tasksCount: taskTitles.length,
    deadlinesCount,
    dashboardContainsModuleTask,
    modulePageContainsTask,
  }
}

async function runRepeatSyncCase() {
  const { fetchCourses, syncCourse, supabase } = await importProject()
  const courses = await fetchCourses()
  if (courses.length === 0) {
    return {
      status: 'no_courses_available',
      tested: false,
      message: 'No active courses were available for duplicate-prevention testing.',
    }
  }

  const course = courses[0]
  const formData = new FormData()
  formData.set('courseId', String(course.id))
  formData.set('courseName', course.name)
  formData.set('courseCode', course.course_code)

  const coursePrefix = buildCoursePrefix(course.name, course.course_code)
  const getModules = async () => {
    const { data, error } = await supabase
      .from('modules')
      .select('id, created_at')
      .ilike('raw_content', `${coursePrefix}%`)
      .order('created_at', { ascending: false })

    if (error) throw new Error('Failed to read existing synced modules.')
    return data ?? []
  }

  const before = await getModules()

  for (let index = 0; index < 2; index += 1) {
    try {
      await syncCourse(formData)
      throw new Error('syncCourse completed without redirecting')
    } catch (error) {
      const redirectPath = extractRedirectPath(error)
      if (!redirectPath && !isExpectedPostSyncError(error)) throw error
    }
  }

  const after = await getModules()
  const latestModuleId = after[0]?.id ?? null

  let tasksCount = 0
  if (latestModuleId) {
    const { count, error } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('module_id', latestModuleId)

    if (error) throw new Error('Failed to count tasks after repeated sync.')
    tasksCount = count ?? 0
  }

  return {
    status: 'ok',
    tested: true,
    courseName: course.name,
    courseCode: course.course_code,
    modulesBefore: before.length,
    modulesAfter: after.length,
    latestModuleId,
    duplicatePrevented: after.length === Math.max(before.length, 1),
    tasksCount,
  }
}

async function runInvalidKeyCase() {
  const { fetchCourses } = await importProject()

  try {
    await fetchCourses()
    return {
      status: 'unexpected_success',
      tested: true,
      message: 'fetchCourses succeeded even though CANVAS_API_TOKEN was intentionally invalid.',
    }
  } catch (error) {
    return {
      status: 'error_received',
      tested: true,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runNoCoursesCase() {
  const { CanvasPage } = await importProject()
  const markup = renderToStaticMarkup(await CanvasPage())

  return {
    status: 'ok',
    tested: true,
    canvasPageShowsEmptyState: markup.includes('No active courses found.'),
  }
}

async function runNoContentCase() {
  const { syncCourse, supabase } = await importProject()
  const courseName = 'Mock Empty Course'
  const courseCode = 'MOCK-EMPTY'
  const coursePrefix = buildCoursePrefix(courseName, courseCode)

  const { count: beforeCount, error: beforeError } = await supabase
    .from('modules')
    .select('*', { count: 'exact', head: true })
    .ilike('raw_content', `${coursePrefix}%`)

  if (beforeError) throw new Error('Failed to count mock empty-course modules before test.')

  const formData = new FormData()
  formData.set('courseId', '999')
  formData.set('courseName', courseName)
  formData.set('courseCode', courseCode)

  let message = ''
  try {
    await syncCourse(formData)
    message = 'syncCourse unexpectedly succeeded for the mock empty-content course.'
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }

  const { count: afterCount, error: afterError } = await supabase
    .from('modules')
    .select('*', { count: 'exact', head: true })
    .ilike('raw_content', `${coursePrefix}%`)

  if (afterError) throw new Error('Failed to count mock empty-course modules after test.')

  return {
    status: 'ok',
    tested: true,
    message,
    modulesBefore: beforeCount ?? 0,
    modulesAfter: afterCount ?? 0,
  }
}

async function main() {
  loadEnvFile()

  const caseName = process.env.VERIFY_CASE
  if (!caseName) throw new Error('VERIFY_CASE is required')

  let result: unknown

  if (caseName === 'valid') {
    result = await runValidSyncCase()
  } else if (caseName === 'repeat') {
    result = await runRepeatSyncCase()
  } else if (caseName === 'invalid-key') {
    result = await runInvalidKeyCase()
  } else if (caseName === 'no-courses') {
    const mockServer = await startMockCanvasServer({
      'GET /api/v1/courses': [],
    })
    process.env.CANVAS_API_URL = mockServer.url
    process.env.CANVAS_API_TOKEN = 'mock-token'
    try {
      result = await runNoCoursesCase()
    } finally {
      await mockServer.close()
    }
  } else if (caseName === 'no-content') {
    const mockServer = await startMockCanvasServer({
      'GET /api/v1/courses': [
        {
          id: 999,
          name: 'Mock Empty Course',
          course_code: 'MOCK-EMPTY',
          enrollment_state: 'active',
        },
      ],
      'GET /api/v1/courses/999/assignments': [],
      'GET /api/v1/courses/999/discussion_topics': [],
      'GET /api/v1/courses/999/modules': [],
    })
    process.env.CANVAS_API_URL = mockServer.url
    process.env.CANVAS_API_TOKEN = 'mock-token'
    try {
      result = await runNoContentCase()
    } finally {
      await mockServer.close()
    }
  } else {
    throw new Error(`Unknown VERIFY_CASE: ${caseName}`)
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
