import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function CourseLearnPage({ params, searchParams }: Props) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(resolvedSearchParams ?? {})) {
    if (Array.isArray(value)) {
      if (value[0]) query.set(key, value[0])
    } else if (value) {
      query.set(key, value)
    }
  }

  const suffix = query.toString()
  redirect(`/courses/${id}${suffix ? `?${suffix}` : ''}`)
}
