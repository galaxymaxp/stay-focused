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
    import('../app/(app)/page'),
    import('../app/modules/[id]/page'),
    import('../app/canvas/page'),
  ])

  if (!supabase) {
    throw new Error('Supabase is not configured for verification.')
  }

  return {
    fetchCourses,
    syncCourse,
    supabase,
    Dashboard: dashboardModule.default,
    ModulePage: modulePageModule.default,
    CanvasPage: canvasPageModule.default,
  }
}

function getConfiguredCanvasUrl() {
  const rawUrl = process.env.CANVAS_API_URL ?? process.env.CANVAS_API_BASE_URL
  if (!rawUrl) {
    throw new Error('CANVAS_API_URL or CANVAS_API_BASE_URL is required for verification.')
  }

  const normalizedInput = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(rawUrl.trim())
    ? rawUrl.trim()
    : `https://${rawUrl.trim()}`
  const url = new URL(normalizedInput)
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

async function getSyncedCourseRows(supabase: Awaited<ReturnType<typeof importProject>>['supabase'], canvasCourseId: number) {
  const { data, error } = await supabase
    .from('courses')
    .select('id, created_at')
    .eq('canvas_instance_url', getConfiguredCanvasUrl())
    .eq('canvas_course_id', canvasCourseId)
    .order('created_at', { ascending: false })

  if (error) throw new Error('Failed to read synced course rows from Supabase.')
  return data ?? []
}

async function getModulesForSyncedCourse(
  supabase: Awaited<ReturnType<typeof importProject>>['supabase'],
  canvasCourseId: number,
) {
  const courseRows = await getSyncedCourseRows(supabase, canvasCourseId)
  const courseIds = courseRows.map((row) => row.id)

  if (courseIds.length === 0) {
    return {
      courseRows,
      modules: [] as Array<{ id: string; title: string; summary: string | null; created_at: string }>,
    }
  }

  const { data, error } = await supabase
    .from('modules')
    .select('id, title, summary, created_at')
    .in('course_id', courseIds)
    .order('created_at', { ascending: false })

  if (error) throw new Error('Failed to read synced modules from Supabase after sync.')

  return {
    courseRows,
    modules: data ?? [],
  }
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

    const { modules, courseRows } = await getModulesForSyncedCourse(supabase, course.id)

    if (courseRows.length === 0 || modules.length === 0) {
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

  const getModules = async () => {
    const { courseRows, modules } = await getModulesForSyncedCourse(supabase, course.id)

    return {
      courseRows,
      modules: modules.map((module) => ({
        id: module.id,
        created_at: module.created_at,
      })),
    }
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
  const latestModuleId = after.modules[0]?.id ?? null

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
    courseRowsBefore: before.courseRows.length,
    courseRowsAfter: after.courseRows.length,
    modulesBefore: before.modules.length,
    modulesAfter: after.modules.length,
    latestModuleId,
    duplicatePrevented: after.courseRows.length === 1 && after.modules.length === Math.max(before.modules.length, 1),
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
  const canvasCourseId = 999

  const { count: beforeCount, error: beforeError } = await supabase
    .from('courses')
    .select('*', { count: 'exact', head: true })
    .eq('canvas_instance_url', getConfiguredCanvasUrl())
    .eq('canvas_course_id', canvasCourseId)

  if (beforeError) throw new Error('Failed to count mock empty-course rows before test.')

  const beforeModules = await getModulesForSyncedCourse(supabase, canvasCourseId)

  const formData = new FormData()
  formData.set('courseId', String(canvasCourseId))
  formData.set('courseName', courseName)
  formData.set('courseCode', 'MOCK-EMPTY')

  let message = ''
  try {
    await syncCourse(formData)
    message = 'syncCourse unexpectedly succeeded for the mock empty-content course.'
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }

  const { count: afterCount, error: afterError } = await supabase
    .from('courses')
    .select('*', { count: 'exact', head: true })
    .eq('canvas_instance_url', getConfiguredCanvasUrl())
    .eq('canvas_course_id', canvasCourseId)

  if (afterError) throw new Error('Failed to count mock empty-course rows after test.')

  const afterModules = await getModulesForSyncedCourse(supabase, canvasCourseId)

  return {
    status: 'ok',
    tested: true,
    message,
    coursesBefore: beforeCount ?? 0,
    coursesAfter: afterCount ?? 0,
    modulesBefore: beforeModules.modules.length,
    modulesAfter: afterModules.modules.length,
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
