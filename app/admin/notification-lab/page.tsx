import { notFound } from 'next/navigation'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { isAdminEmail } from '@/lib/admin'
import { NotificationLab } from '@/components/admin/NotificationLab'

export default async function NotificationLabPage() {
  const user = await getAuthenticatedUserServer()

  if (!user?.email || !isAdminEmail(user.email)) {
    notFound()
  }

  return (
    <main className="page-shell page-shell-narrow page-stack">
      <NotificationLab />
    </main>
  )
}
