import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";

/**
 * Soft-nav para /automations: mesmo loader das outras páginas
 * (marca 32px no centro do pane), sem overlay global.
 */
export default function AutomationsLoading() {
  return (
    <div className="v2-screen v2-screen-fill v2-page-scroll grid grid-cols-[var(--nav-rail-w,76px)_1fr] overflow-y-auto bg-background">
      <NavRailSpacer />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppLoading variant="inline" className="min-h-0 flex-1" />
      </main>
    </div>
  );
}
