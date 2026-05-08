import { notFound } from 'next/navigation'
import { getAuthenticatedUserWithIdentities } from '@/lib/auth-server'
import { isAdminUser } from '@/lib/admin'
import { NotificationLab } from '@/components/admin/NotificationLab'

export default async function NotificationLabPage() {
  const user = await getAuthenticatedUserWithIdentities()

  if (!isAdminUser(user)) {
    notFound()
  }

  return (
    <main className="page-shell page-shell-narrow page-stack">
      <NotificationLab />
    </main>
  )
}
