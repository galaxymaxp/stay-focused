type SearchParamValue = string | string[] | undefined | null

interface ModuleLearnHrefOptions {
  resourceId?: string | null
  taskId?: string | null
  supportId?: string | null
  panel?: 'study-notes' | 'action-status' | 'source-support' | 'terms'
}

interface ModuleDoHrefOptions {
  /** Use for links built from the tasks table (module workspace). Matches by ID on the Do page. */
  taskId?: string | null
  /**
   * Use for links built from task_items (global workspace — Calendar, Today, global Do page).
   * task_items and tasks are separate tables with independent UUIDs, so taskId cannot be used
   * for cross-table navigation. taskTitle triggers title-based matching on the Do page instead.
   */
  taskTitle?: string | null
  resourceId?: string | null
}

interface ModuleInspectHrefOptions {
  resourceId?: string | null
}


interface CourseLearnHrefOptions {
  moduleId?: string | null
  resourceId?: string | null
  taskId?: string | null
  focus?: boolean
}

export function getSearchParamValue(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export function buildModuleLearnHref(moduleId: string, options: ModuleLearnHrefOptions = {}) {
  const params = new URLSearchParams()

  if (options.resourceId) params.set('resource', options.resourceId)
  if (options.taskId) params.set('task', options.taskId)
  if (options.supportId) params.set('support', options.supportId)
  if (options.panel) params.set('panel', options.panel)

  const hash = options.resourceId
    ? getResourceElementId(options.resourceId)
    : options.taskId
      ? getTaskElementId(options.taskId)
      : options.supportId
        ? getSupportElementId(options.supportId)
        : options.panel === 'source-support'
          ? 'source-support'
          : options.panel === 'terms'
            ? 'terms'
            : options.panel === 'study-notes'
              ? 'study-notes'
              : null

  return appendHref(`/modules/${moduleId}/learn`, params, hash)
}

export function buildModuleDoHref(moduleId: string, options: ModuleDoHrefOptions = {}) {
  const params = new URLSearchParams()

  if (options.taskId) params.set('task', options.taskId)
  if (options.taskTitle) params.set('taskTitle', options.taskTitle)
  if (options.resourceId) params.set('resource', options.resourceId)
  // Any task-targeted Do link auto-opens the draft output panel on arrival.
  // Resource-only links do not, since they target a content item rather than a specific task.
  if (options.taskId || options.taskTitle) params.set('donow', '1')

  // Hash anchors use task.id from the tasks table. taskTitle-based links skip the hash
  // because the Do page derives the canonical Task.id only after title matching server-side.
  return appendHref(
    `/modules/${moduleId}/do`,
    params,
    options.taskId ? getTaskElementId(options.taskId) : null,
  )
}

export function buildModuleInspectHref(moduleId: string, options: ModuleInspectHrefOptions = {}) {
  const params = new URLSearchParams()

  if (options.resourceId) params.set('resource', options.resourceId)

  return appendHref(
    `/modules/${moduleId}/inspect`,
    params,
    options.resourceId ? getResourceElementId(options.resourceId) : null,
  )
}

export function buildCourseLearnHref(courseId: string, options: CourseLearnHrefOptions = {}) {
  const params = new URLSearchParams()

  if (options.moduleId) params.set('module', options.moduleId)
  if (options.resourceId) params.set('resource', options.resourceId)
  if (options.taskId) params.set('task', options.taskId)
  if (options.focus) params.set('focus', '1')

  const hash = options.resourceId
    ? getResourceElementId(options.resourceId)
    : options.moduleId
      ? getModuleElementId(options.moduleId)
      : null

  return appendHref(`/courses/${courseId}/learn`, params, hash)
}

export function getModuleElementId(moduleId: string) {
  return `module-${encodeURIComponent(moduleId)}`
}

export function getResourceElementId(resourceId: string) {
  return `resource-${encodeURIComponent(resourceId)}`
}

export function getSupportElementId(supportId: string) {
  return `support-${encodeURIComponent(supportId)}`
}

export function getTaskElementId(taskId: string) {
  return `task-${encodeURIComponent(taskId)}`
}

function appendHref(pathname: string, params: URLSearchParams, hash: string | null) {
  const query = params.toString()
  return `${pathname}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`
}
