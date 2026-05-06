import { redirect } from 'next/navigation'
import { toSearchParamsString } from '@/lib/stay-focused-links'

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function LegacyModuleDoPage({ params, searchParams }: Props) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const legacyQuery = toSearchParamsString(resolvedSearchParams)
  redirect(`/modules/${id}/tasks${legacyQuery.toString() ? `?${legacyQuery.toString()}` : ''}`)
}
