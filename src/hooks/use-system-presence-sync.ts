"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";
import { useSSE } from "@/hooks/use-sse";
import { TEAM_USERS_QUERY_PREFIX } from "@/features/shared/queries/team-users";

interface SystemPresenceEvent {
  userId: string;
  systemOnline: boolean;
  lastSeenAt: string | null;
}

interface AgentPresenceEvent {
  userId: string;
  status: "ONLINE" | "OFFLINE" | "AWAY";
}

/**
 * Escuta SSE de presença e patcheia in-place as caches de listagem:
 *  - `system_presence_update` → systemOnline / lastSeenAt (CRM aberto)
 *  - `presence_update` → AgentStatus (Online/Ausente/Offline da Distribuição)
 *
 * Sem isso, mudar status na NavRail (ou em outra aba) deixa a lista da
 * Distribuição desatualizada até um F5.
 *
 * Montado UMA vez por sessão (ex.: no shell autenticado).
 */
export function useSystemPresenceSync(enabled = true) {
  const qc = useQueryClient();

  useSSE(
    apiUrl("/api/sse/messages"),
    (event, data) => {
      if (event === "system_presence_update") {
        const evt = data as Partial<SystemPresenceEvent> | undefined;
        if (!evt || typeof evt.userId !== "string") return;
        patchUsersCaches(qc, {
          kind: "system",
          userId: evt.userId,
          systemOnline: Boolean(evt.systemOnline),
          lastSeenAt: evt.lastSeenAt ?? null,
        });
        return;
      }
      if (event === "presence_update") {
        const evt = data as Partial<AgentPresenceEvent> | undefined;
        if (!evt || typeof evt.userId !== "string") return;
        if (
          evt.status !== "ONLINE" &&
          evt.status !== "OFFLINE" &&
          evt.status !== "AWAY"
        ) {
          return;
        }
        patchUsersCaches(qc, {
          kind: "agent",
          userId: evt.userId,
          status: evt.status,
        });
        // NavRail / popup do próprio usuário.
        qc.setQueriesData(
          { queryKey: ["my-agent-status", evt.userId] },
          (prev: unknown) => {
            if (!prev || typeof prev !== "object") return { status: evt.status };
            return { ...(prev as object), status: evt.status };
          },
        );
        invalidateIfObserved(qc, ["distribution-responsibles"]);
        invalidateIfObserved(qc, ["distribution-pending"]);
      }
    },
    enabled,
  );

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      invalidateIfObserved(qc, TEAM_USERS_QUERY_PREFIX);
      invalidateIfObserved(qc, ["distribution-responsibles"]);
      // O SSE acima já patcheia essas caches in-place; este interval é só
      // safety-net para queda silenciosa da stream.
    }, 300_000);
    return () => clearInterval(t);
  }, [enabled, qc]);
}

function invalidateIfObserved(
  qc: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
) {
  const observed = qc.getQueryCache().findAll({ queryKey, type: "active" });
  if (observed.length === 0) return;
  void qc.invalidateQueries({ queryKey, refetchType: "active" });
}

type PatchEvent =
  | {
      kind: "system";
      userId: string;
      systemOnline: boolean;
      lastSeenAt: string | null;
    }
  | {
      kind: "agent";
      userId: string;
      status: "ONLINE" | "OFFLINE" | "AWAY";
    };

function patchUsersCaches(
  qc: ReturnType<typeof useQueryClient>,
  evt: PatchEvent,
) {
  const keys: readonly (readonly unknown[])[] = [
    ["users", "assign-picker"],
    TEAM_USERS_QUERY_PREFIX,
    ["distribution-responsibles"],
  ];
  for (const key of keys) {
    qc.setQueriesData({ queryKey: key }, (prev: unknown) => {
      if (!prev) return prev;
      return mergePresence(prev, evt);
    });
  }
}

type MaybeUser = { id?: string; userId?: string } & Record<string, unknown>;

function mergePresence(prev: unknown, evt: PatchEvent): unknown {
  if (Array.isArray(prev)) {
    let touched = false;
    const next = prev.map((item) => {
      const u = item as MaybeUser;
      const uid = u.id ?? u.userId;
      if (uid !== evt.userId) return item;
      touched = true;
      if (evt.kind === "system") {
        return {
          ...(item as object),
          systemOnline: evt.systemOnline,
          lastSeenAt: evt.lastSeenAt,
        };
      }
      return {
        ...(item as object),
        status: evt.status,
      };
    });
    return touched ? next : prev;
  }
  // Shape { responsibles: [...] } (Distribuição).
  if (
    typeof prev === "object" &&
    prev !== null &&
    "responsibles" in prev &&
    Array.isArray((prev as { responsibles: unknown[] }).responsibles)
  ) {
    const arr = (prev as { responsibles: unknown[] }).responsibles;
    const next = mergePresence(arr, evt);
    return next === arr ? prev : { ...prev, responsibles: next };
  }
  return prev;
}
