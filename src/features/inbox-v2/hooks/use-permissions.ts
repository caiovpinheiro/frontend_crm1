"use client";

import { useQuery } from "@tanstack/react-query";

import {
  getAgentCapacity,
  getAgentStatus,
  getPermissions,
  getSelfAssignCapability,
  type AgentCapacity,
  type AgentOnlineStatus,
  type SelfAssignResponse,
  type TeamUser,
} from "../api";

import { useTeamUsersQuery } from "@/features/shared/queries/team-users";

/** Permissões + scopeGrants do usuário logado. */
export function usePermissionsPanel(enabled = true) {
  return useQuery<{ scopeGrants?: unknown }>({
    queryKey: ["settings-permissions-panel"],
    queryFn: getPermissions,
    enabled,
    staleTime: 60_000,
  });
}

/** Status online/offline do agente. */
export function useMyAgentStatus(userId: string | null | undefined) {
  return useQuery<{ status: AgentOnlineStatus }>({
    queryKey: ["my-agent-status", userId ?? "__none__"],
    queryFn: () => getAgentStatus(userId as string),
    enabled: !!userId,
    refetchInterval: 60_000,
  });
}

/** N/M conversas atribuídas + tone (healthy/busy/overloaded). */
export function useAgentCapacity(enabled = true) {
  return useQuery<AgentCapacity>({
    queryKey: ["agent-capacity"],
    queryFn: getAgentCapacity,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Habilita botão "Pegar conversa" (self-assign). */
export function useSelfAssignCapability() {
  return useQuery<SelfAssignResponse>({
    queryKey: ["self-assign-capability"],
    queryFn: getSelfAssignCapability,
    staleTime: 60_000,
  });
}

/** Lista de membros da equipe (TransferControl / assignee). */
export function useTeamUsers(
  enabled = true,
  opts?: { includeAi?: boolean },
) {
  return useTeamUsersQuery<TeamUser>(enabled, opts);
}
