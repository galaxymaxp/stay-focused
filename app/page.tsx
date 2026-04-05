import { TodayDashboard } from '@/components/TodayDashboard'
import { getClarityWorkspace } from '@/lib/clarity-workspace'

export default async function Dashboard() {
  const workspace = await getClarityWorkspace()

  return (
    <main className="page-shell">
      <TodayDashboard
        nextBestMove={workspace.today.nextBestMove}
        needsAction={workspace.today.needsAction}
        needsUnderstanding={workspace.today.needsUnderstanding}
        comingUp={workspace.today.comingUp}
        undatedTaskCount={workspace.today.undatedTaskCount}
      />
    </main>
  )
}
