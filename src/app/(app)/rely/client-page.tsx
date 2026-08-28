"use client";

import type { ReactNode } from "react";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { TeamChatApp } from "@/features/team-chat/team-chat-app";

export default function RelyClientPage({
  navRail,
}: {
  navRail?: ReactNode;
} = {}) {
  return (
    <div className="v2-screen grid h-full min-h-0 min-w-0 grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4 overflow-hidden bg-[var(--bg-base)] p-4">
      {navRail ?? <NavRailSpacer />}
      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <TeamChatApp />
      </main>
    </div>
  );
}
