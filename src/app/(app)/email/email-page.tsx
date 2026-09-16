"use client";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { InboxRefatorado } from "@/features/email-v2";

export function EmailPage() {
  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 overflow-hidden p-3 md:gap-4 md:p-4">
      <NavRailSpacer />
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <InboxRefatorado />
      </main>
    </div>
  );
}
