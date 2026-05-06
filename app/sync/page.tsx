import { redirect } from 'next/navigation'

// /sync is a legacy route — Canvas settings and sync are now at /settings?section=canvas.
export default function SyncCoursesPage() {
  redirect('/settings?section=canvas')
}
