import { NavRailSpacer } from "@/components/crm/nav-rail-spacer"
import { TasksView } from "@/components/crm/tasks-view"

export default function TarefasPage() {
  return (
    <div className="v2-screen v2-page-scroll grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-y-auto p-4">
      <NavRailSpacer />
      <main className="flex min-w-0 flex-col gap-4">
        <TasksView />
      </main>
    </div>
  )
}
