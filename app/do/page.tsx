import { redirect } from 'next/navigation'
import { toSearchParamsString } from '@/lib/stay-focused-links'

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function DoNowPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams
  const legacyQuery = toSearchParamsString(resolvedSearchParams)

  redirect(`/tasks${legacyQuery.toString() ? `?${legacyQuery.toString()}` : ''}`)
}
