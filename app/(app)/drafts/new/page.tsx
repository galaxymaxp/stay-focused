import { redirect } from 'next/navigation'

export default async function NewDraftPage() {
  redirect('/drafts')
}
