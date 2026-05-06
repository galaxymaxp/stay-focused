import { redirect } from 'next/navigation'

// /canvas is a legacy route — Canvas course sync is now at /sync.
export default function CanvasPage() {
  redirect('/sync')
}
