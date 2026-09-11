"use client";

import { createContext, useContext, type ReactNode } from "react";

import {
  useAgentStatus,
  type AgentStatusController,
} from "@/components/crm/agent-status";

const AgentStatusContext = createContext<AgentStatusController | null>(null);

/** Um único GET/PUT de status no shell (NavRail + bottom nav). */
export function AgentStatusProvider({ children }: { children: ReactNode }) {
  const value = useAgentStatus();
  return (
    <AgentStatusContext.Provider value={value}>
      {children}
    </AgentStatusContext.Provider>
  );
}

export function useSharedAgentStatus(): AgentStatusController {
  const ctx = useContext(AgentStatusContext);
  if (!ctx) {
    throw new Error("useSharedAgentStatus requires AgentStatusProvider");
  }
  return ctx;
}
