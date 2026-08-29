import { AutomationsListSkeleton } from "@/components/crm/automations-list-skeleton";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

/**
 * Soft-nav para /automations: pinta o chrome + skeleton na hora
 * (estilo DataCrazy RSC), sem o overlay global de `(app)/loading.tsx`.
 */
export default function AutomationsLoading() {
  return (
    <div className="v2-screen v2-screen-fill v2-page-scroll grid grid-cols-[var(--nav-rail-w,76px)_1fr] overflow-y-auto bg-background">
      <NavRailSpacer />
      <main className="flex min-w-0 flex-col">
        <div className="flex w-full flex-col gap-4 px-4 py-5">
          <div className="h-11 w-48 animate-pulse rounded-xl bg-muted" />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[88px] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <AutomationsListSkeleton />
        </div>
      </main>
    </div>
  );
}
