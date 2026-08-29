"use client";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { RestrictedScreen } from "@/components/crm/restricted-screen";
import { useRequireManager } from "@/hooks/use-user-role";
import OldInboxAnalyticsPage from "@/features/legacy-v1/analytics-inbox";

export default function InboxAnalyticsClientPage() {
  const { ready, isManagerUp } = useRequireManager();
  if (!ready) {
    return (
      <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] overflow-hidden bg-background">
        <NavRailSpacer />
        <AppLoading variant="inline" className="min-h-0 flex-1" />
      </div>
    );
  }
  if (!isManagerUp) return <RestrictedScreen />;

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      <NavRailSpacer />
      <main className="flex min-w-0 flex-col gap-3.5 overflow-auto pr-2">
        <OldInboxAnalyticsPage />
      </main>
    </div>
  );
}

