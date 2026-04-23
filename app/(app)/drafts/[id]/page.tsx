import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DraftDetailRedirect({ params }: Props) {
  const { id } = await params
  redirect(`/library/${id}`)
}
