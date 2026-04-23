import { redirect } from 'next/navigation'

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function DraftsPageRedirect({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams
  const params = new URLSearchParams()
  const course = resolvedSearchParams?.course
  const module = resolvedSearchParams?.module
  if (course) params.set('course', Array.isArray(course) ? course[0] : course)
  if (module) params.set('module', Array.isArray(module) ? module[0] : module)
  const query = params.toString()
  redirect(query ? `/library?${query}` : '/library')
}
