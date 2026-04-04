// This script performs true runtime verification through the browser UI using Playwright.
// Keep this separate from verify-canvas-flow.ts, which calls server actions directly for lower-level checks.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { chromium, type Page } from 'playwright'

const ARTIFACTS_DIR = path.join(process.cwd(), 'scripts', 'runtime-artifacts')
const TIMEOUTS = {
  pageLoad: 20_000,
  courseList: 15_000,
  submitEnable: 10_000,
  submitCompletion: 90_000,
  postSyncRender: 20_000,
  inlineError: 15_000,
}

type CaseContext = {
  name: string
  logs: string[]
  consoleErrors: string[]
  failedRequests: string[]
  httpFailures: string[]
  lastSuccessfulStep: string | null
}

function ensureArtifactsDir() {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
}

function sanitizeName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
}

function logStep(ctx: CaseContext, message: string) {
  const line = `[${new Date().toISOString()}] [${ctx.name}] ${message}`
  ctx.logs.push(line)
  console.log(line)
}

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

async function reservePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = http.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to reserve port'))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out during ${label} after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

async function waitForHttp(url: string, timeoutMs = 60_000) {
  const start = Date.now()
  let lastError: unknown

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status < 500) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ${url}. Last error: ${String(lastError)}`)
}

async function startNextServer(envOverrides: Record<string, string>) {
  const port = await reservePort()
  const child = spawn(
    'cmd.exe',
    ['/c', 'npm', 'run', 'start', '--', '--port', String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  )

  let logs = ''
  child.stdout?.on('data', (chunk) => {
    logs += chunk.toString()
  })
  child.stderr?.on('data', (chunk) => {
    logs += chunk.toString()
  })

  await waitForHttp(`http://127.0.0.1:${port}/canvas`)

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    child,
    getLogs() {
      return logs
    },
    async stop() {
      await stopProcess(child)
    },
  }
}

async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null) return

  child.kill()

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
      resolve()
    }, 5_000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
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

function instrumentPage(page: Page, ctx: CaseContext) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      ctx.consoleErrors.push(text)
      logStep(ctx, `browser console error: ${text}`)
    }
  })

  page.on('requestfailed', (request) => {
    const message = `${request.method()} ${request.url()} -> ${request.failure()?.errorText ?? 'unknown'}`
    ctx.failedRequests.push(message)
    logStep(ctx, `request failed: ${message}`)
  })

  page.on('response', (response) => {
    if (response.status() >= 400) {
      const message = `${response.status()} ${response.request().method()} ${response.url()}`
      ctx.httpFailures.push(message)
      logStep(ctx, `http failure: ${message}`)
    }
  })
}

async function captureFailureArtifacts(page: Page, ctx: CaseContext) {
  ensureArtifactsDir()
  const prefix = path.join(ARTIFACTS_DIR, `${sanitizeName(ctx.name)}-${Date.now()}`)
  const screenshotPath = `${prefix}.png`
  const htmlPath = `${prefix}.html`

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
  const html = await page.content().catch(() => '<!-- failed to capture html -->')
  fs.writeFileSync(htmlPath, html, 'utf8')

  return { screenshotPath, htmlPath }
}

async function runStep<T>(
  page: Page,
  ctx: CaseContext,
  label: string,
  timeoutMs: number,
  fn: () => Promise<T>
) {
  logStep(ctx, `START ${label}`)
  const result = await withTimeout(fn(), timeoutMs, label)
  ctx.lastSuccessfulStep = label
  logStep(ctx, `END ${label}`)
  return result
}

async function getSyncFormState(page: Page) {
  const form = page.locator('form')
  const searchInput = form.locator('input[type="text"]').first()
  const submitButton = form.getByRole('button', { name: 'Sync course' })

  return {
    searchValue: await searchInput.inputValue(),
    courseId: await form.locator('input[name="courseId"]').getAttribute('value'),
    courseName: await form.locator('input[name="courseName"]').getAttribute('value'),
    courseCode: await form.locator('input[name="courseCode"]').getAttribute('value'),
    optionCount: await form.locator('ul li').count(),
    submitDisabled: await submitButton.isDisabled(),
    helperText: await form.locator('p').first().textContent().catch(() => null),
    errorText: await form.locator('text=Sync failed.').textContent().catch(() => null),
  }
}

async function selectFirstAvailableCourse(page: Page, ctx: CaseContext) {
  const form = page.locator('form')
  const searchInput = form.locator('input[type="text"]').first()
  const submitButton = form.getByRole('button', { name: 'Sync course' })

  await runStep(page, ctx, 'focus course input', TIMEOUTS.pageLoad, async () => {
    await searchInput.click()
  })

  const optionLocator = form.locator('ul li')
  const selectedCourse = await runStep(page, ctx, 'wait for course options', TIMEOUTS.courseList, async () => {
    await optionLocator.first().waitFor({ state: 'visible' })
    return (await optionLocator.first().textContent())?.trim() ?? ''
  })

  await runStep(page, ctx, 'select course option', TIMEOUTS.pageLoad, async () => {
    await optionLocator.first().click()
  })

  await runStep(page, ctx, 'wait for submit enable', TIMEOUTS.submitEnable, async () => {
    const start = Date.now()
    while (Date.now() - start < TIMEOUTS.submitEnable) {
      const courseId = await form.locator('input[name="courseId"]').getAttribute('value')
      const buttonDisabled = await submitButton.isDisabled()
      if (courseId && !buttonDisabled) return
      await page.waitForTimeout(200)
    }

    const state = await getSyncFormState(page)
    logStep(ctx, `precondition failure state: ${JSON.stringify(state)}`)
    throw new Error(
      `Sync button remained disabled after selection. search="${state.searchValue}", courseId="${state.courseId}", courseName="${state.courseName}", courseCode="${state.courseCode}", optionCount=${state.optionCount}`
    )
  })

  return { submitButton, selectedCourse }
}

async function executeBrowserCase(
  name: string,
  baseUrl: string,
  runner: (page: Page, ctx: CaseContext) => Promise<Record<string, unknown>>
) {
  const ctx: CaseContext = {
    name,
    logs: [],
    consoleErrors: [],
    failedRequests: [],
    httpFailures: [],
    lastSuccessfulStep: null,
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  instrumentPage(page, ctx)

  try {
    const result = await runner(page, ctx)
    return {
      ok: true,
      ...result,
      lastSuccessfulStep: ctx.lastSuccessfulStep,
      consoleErrors: ctx.consoleErrors,
      failedRequests: ctx.failedRequests,
      httpFailures: ctx.httpFailures,
    }
  } catch (error) {
    const artifacts = await captureFailureArtifacts(page, ctx)
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      lastSuccessfulStep: ctx.lastSuccessfulStep,
      consoleErrors: ctx.consoleErrors,
      failedRequests: ctx.failedRequests,
      httpFailures: ctx.httpFailures,
      artifacts,
    }
  } finally {
    await browser.close()
  }
}

async function runSuccessfulSyncCase(baseUrl: string) {
  return await executeBrowserCase('successful-sync', baseUrl, async (page, ctx) => {
    await runStep(page, ctx, 'load canvas page', TIMEOUTS.pageLoad, async () => {
      await page.goto(`${baseUrl}/canvas`, { waitUntil: 'networkidle' })
    })

    const { submitButton, selectedCourse } = await selectFirstAvailableCourse(page, ctx)

    const buttonEnabledBeforeClick = await submitButton.isEnabled()
    await runStep(page, ctx, 'submit sync form', TIMEOUTS.pageLoad, async () => {
      await submitButton.click()
    })

    const pendingVisible = await page.getByRole('button', { name: 'Syncing from Canvas...' }).isVisible()
    const pendingDisabled = await page.getByRole('button', { name: 'Syncing from Canvas...' }).isDisabled()

    await runStep(page, ctx, 'wait for sync completion redirect', TIMEOUTS.submitCompletion, async () => {
      await page.waitForURL(/\/modules\/.+/)
    })

    const redirectedToModulePage = /\/modules\/.+/.test(page.url())

    const moduleSnapshot = await runStep(page, ctx, 'post-sync module render', TIMEOUTS.postSyncRender, async () => {
      await page.waitForLoadState('networkidle')
      const moduleTitle = ((await page.locator('h1').textContent()) ?? '').trim()
      const pageText = await page.locator('main').textContent()
      const firstTaskText = (
        (await page.locator('section').filter({ hasText: 'Tasks' }).locator('li').first().textContent()) ?? ''
      ).trim()
      return {
        moduleTitle,
        taskSectionVisible: (pageText ?? '').includes('Tasks'),
        firstTaskText,
      }
    })

    await runStep(page, ctx, 'navigate to dashboard after sync', TIMEOUTS.pageLoad, async () => {
      await page.getByRole('link', { name: 'Stay Focused' }).click()
      await page.waitForURL(`${baseUrl}/`)
      await page.waitForLoadState('networkidle')
    })

    const dashboardText = await page.locator('main').textContent()
    const dashboardContainsTask =
      moduleSnapshot.firstTaskText.length > 0 && (dashboardText ?? '').includes(moduleSnapshot.firstTaskText)

    await runStep(page, ctx, 'revisit canvas after sync', TIMEOUTS.pageLoad, async () => {
      await page.goto(`${baseUrl}/canvas`, { waitUntil: 'networkidle' })
    })

    const canvasText = await page.locator('main').textContent()

    return {
      selectedCourse,
      buttonEnabledBeforeClick,
      pendingVisible,
      pendingDisabled,
      redirectedToModulePage,
      moduleTitle: moduleSnapshot.moduleTitle,
      taskSectionVisible: moduleSnapshot.taskSectionVisible,
      dashboardContainsTask,
      alreadySyncedShown: moduleSnapshot.moduleTitle.length > 0 && (canvasText ?? '').includes(moduleSnapshot.moduleTitle),
    }
  })
}

async function runRepeatSyncCase(baseUrl: string) {
  return await executeBrowserCase('repeat-sync', baseUrl, async (page, ctx) => {
    await runStep(page, ctx, 'load canvas page', TIMEOUTS.pageLoad, async () => {
      await page.goto(`${baseUrl}/canvas`, { waitUntil: 'networkidle' })
    })

    const initialCanvasText = await page.locator('main').textContent()
    const { submitButton } = await selectFirstAvailableCourse(page, ctx)

    await runStep(page, ctx, 'submit repeat sync', TIMEOUTS.pageLoad, async () => {
      await submitButton.click()
    })

    await runStep(page, ctx, 'wait for repeat sync redirect', TIMEOUTS.submitCompletion, async () => {
      await page.waitForURL(/\/modules\/.+/)
    })

    const repeatedModuleTitle = ((await page.locator('h1').textContent()) ?? '').trim()

    await runStep(page, ctx, 'revisit canvas after repeat sync', TIMEOUTS.pageLoad, async () => {
      await page.goto(`${baseUrl}/canvas`, { waitUntil: 'networkidle' })
    })

    const canvasTextAfter = await page.locator('main').textContent()
    const occurrencesOfRepeatedModule =
      repeatedModuleTitle.length > 0 ? (canvasTextAfter?.split(repeatedModuleTitle).length ?? 1) - 1 : 0

    return {
      alreadySyncedVisibleBefore: (initialCanvasText ?? '').includes('Already synced'),
      repeatedModuleTitle,
      occurrencesOfRepeatedModule,
      returnedToExistingConceptually: occurrencesOfRepeatedModule === 1,
      noRefreshWarningShown: !(canvasTextAfter ?? '').includes('already synced'),
    }
  })
}

async function runInvalidKeyCase(baseUrl: string) {
  return await executeBrowserCase('invalid-api-key', baseUrl, async (page, ctx) => {
    await runStep(page, ctx, 'load canvas page', TIMEOUTS.pageLoad, async () => {
      await page.goto(`${baseUrl}/canvas`, { waitUntil: 'networkidle' })
    })

    const text = await page.locator('main').textContent()
    return {
      showsConnectionFailure: (text ?? '').includes('Canvas connection failed'),
      shows401: (text ?? '').includes('Canvas API error 401'),
    }
  })
}

async function runNoCoursesCase(baseUrl: string) {
  return await executeBrowserCase('no-active-courses', baseUrl, async (page, ctx) => {
    await runStep(page, ctx, 'load canvas page', TIMEOUTS.pageLoad, async () => {
      await page.goto(`${baseUrl}/canvas`, { waitUntil: 'networkidle' })
    })

    const text = await page.locator('main').textContent()
    return {
      showsNoCoursesMessage: (text ?? '').includes('No active courses found.'),
      hidesSyncButton: await page.getByRole('button', { name: 'Sync course' }).count() === 0,
    }
  })
}

async function runNoContentCase(baseUrl: string) {
  return await executeBrowserCase('no-course-content', baseUrl, async (page, ctx) => {
    await runStep(page, ctx, 'load canvas page', TIMEOUTS.pageLoad, async () => {
      await page.goto(`${baseUrl}/canvas`, { waitUntil: 'networkidle' })
    })

    const { submitButton } = await selectFirstAvailableCourse(page, ctx)

    await runStep(page, ctx, 'submit empty-content sync', TIMEOUTS.pageLoad, async () => {
      await submitButton.click()
    })

    const pendingVisible = await page.getByRole('button', { name: 'Syncing from Canvas...' }).isVisible()

    await runStep(page, ctx, 'wait for inline empty-content error', TIMEOUTS.inlineError, async () => {
      await page.getByText('Canvas returned no assignments, announcements, or modules for this course.').waitFor({ state: 'visible' })
    })

    return {
      stayedOnCanvasPage: page.url().endsWith('/canvas'),
      pendingVisible,
      showsEmptyContentError: true,
      buttonReEnabled: await page.getByRole('button', { name: 'Sync course' }).isEnabled(),
    }
  })
}

async function main() {
  loadEnvFile()
  ensureArtifactsDir()

  const results: Record<string, unknown> = {}

  const realServer = await startNextServer({})
  try {
    results.successfulSync = await runSuccessfulSyncCase(realServer.baseUrl)
    results.repeatSync = await runRepeatSyncCase(realServer.baseUrl)
  } finally {
    await realServer.stop()
  }

  const invalidKeyServer = await startNextServer({
    CANVAS_API_TOKEN: 'invalid-token-for-ui-runtime-check',
  })
  try {
    results.invalidApiKey = await runInvalidKeyCase(invalidKeyServer.baseUrl)
  } finally {
    await invalidKeyServer.stop()
  }

  const noCoursesMock = await startMockCanvasServer({
    'GET /api/v1/courses': [],
  })
  const noCoursesServer = await startNextServer({
    CANVAS_API_URL: noCoursesMock.url,
    CANVAS_API_TOKEN: 'mock-token',
  })
  try {
    results.noActiveCourses = await runNoCoursesCase(noCoursesServer.baseUrl)
  } finally {
    await noCoursesServer.stop()
    await noCoursesMock.close()
  }

  const noContentMock = await startMockCanvasServer({
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
  const noContentServer = await startNextServer({
    CANVAS_API_URL: noContentMock.url,
    CANVAS_API_TOKEN: 'mock-token',
  })
  try {
    results.noCourseContent = await runNoContentCase(noContentServer.baseUrl)
  } finally {
    await noContentServer.stop()
    await noContentMock.close()
  }

  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
