"use client";

import type { ReactNode } from "react";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { TeamChatApp } from "@/features/team-chat/team-chat-app";

export default function BwipoChatClientPage({
  navRail,
}: {
  navRail?: ReactNode;
} = {}) {
  return (
    <div className="v2-screen grid h-full min-h-0 min-w-0 grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-[var(--bg-base)]">
      {navRail ?? <NavRailSpacer />}
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TeamChatApp />
      </main>
    </div>
  );
}
