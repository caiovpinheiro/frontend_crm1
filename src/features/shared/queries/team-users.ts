"use client";

/*
 * Fonte ÚNICA de verdade para `GET /api/users` no client.
 *
 * Antes desta camada cada tela tinha seu próprio fetcher + query key
 * (`users-list`, `piloting-users`, `automation-users-human`,
 * `editor-users`, `["users","assign-picker"]` com 2 elementos…), o que
 * fazia a MESMA requisição sair 3-5x por navegação. Aqui a key canônica
 * é `["users","assign-picker", "human"|"with-ai"]` — a mesma que o
 * inbox-v2 e o pipeline-v2 já usavam — e o fetcher normaliza o shape
 * (a rota pode responder array puro ou `{items|users|data:[...]}`).
 *
 * Consumidores com tipos locais mais ricos (ex.: `assignedRoles`,
 * `agentStatus`) passam o próprio tipo via generic: o payload é o mesmo,
 * só a projeção em TS muda.
 */

import { useQuery } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";

export interface CanonicalTeamUser {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  /** HUMAN | AI — presente quando includeAi=1. */
  type?: string | null;
  avatarUrl?: string | null;
  /** Presença de USO do CRM (aba aberta) — separada da Distribuição. */
  systemOnline?: boolean;
  lastSeenAt?: string | null;
}

/** Prefixo para invalidação (`["users"]` cobre human + with-ai). */
export const TEAM_USERS_QUERY_PREFIX = ["users"] as const;

export function teamUsersKey(includeAi = false) {
  return ["users", "assign-picker", includeAi ? "with-ai" : "human"] as const;
}

function normalizeUserList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    for (const key of ["items", "users", "data"] as const) {
      if (Array.isArray(rec[key])) return rec[key] as T[];
    }
  }
  return [];
}

/** GET /api/users — shape normalizado (array). */
export async function fetchTeamUsers<T = CanonicalTeamUser>(opts?: {
  includeAi?: boolean;
}): Promise<T[]> {
  const q = opts?.includeAi ? "?includeAi=1" : "";
  const res = await fetch(apiUrl(`/api/users${q}`));
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { message?: unknown } | null)?.message;
    throw new Error(
      typeof message === "string" ? message : "Erro ao carregar equipe",
    );
  }
  return normalizeUserList<T>(data);
}

/** Query canônica de usuários da org. */
export function useTeamUsersQuery<T = CanonicalTeamUser>(
  enabled = true,
  opts?: { includeAi?: boolean; staleTime?: number },
) {
  const includeAi = opts?.includeAi === true;
  return useQuery<T[]>({
    queryKey: teamUsersKey(includeAi),
    queryFn: () => fetchTeamUsers<T>({ includeAi }),
    enabled,
    staleTime: opts?.staleTime ?? 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
