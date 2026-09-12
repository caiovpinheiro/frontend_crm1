"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { subscribeSSEEvents } from "@/hooks/use-sse";

/**
 * Presença "quem está vendo" (estilo Kommo). Enquanto a entidade (ex.: um
 * deal) estiver aberta, envia heartbeats ao backend e escuta o evento SSE
 * `entity_viewers` para saber quem MAIS está na mesma página.
 *
 * - Join imediato + heartbeat a cada 25s (TTL do backend é 30s, com reaper
 *   varrendo a cada 10s — 25s deixa margem sem expirar viewer ativo).
 * - Saída explícita no unmount / fechamento da aba (sendBeacon) → o backend
 *   remove na hora; sem isso, o viewer cairia por TTL em até 30s.
 * - Retorna a lista JÁ SEM você mesmo (só os outros usuários).
 */
export type EntityViewer = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

export function useEntityViewers(
  entityType: string,
  entityId: string | null | undefined,
): EntityViewer[] {
  const { data: session } = useSession();
  const selfId = session?.user?.id ?? null;
  const [viewers, setViewers] = useState<EntityViewer[]>([]);

  useEffect(() => {
    if (!entityId) {
      setViewers([]);
      return;
    }
    let cancelled = false;
    const joinBody = JSON.stringify({ entityType, entityId });

    async function beat() {
      try {
        const res = await fetch("/api/presence/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: joinBody,
        });
        if (cancelled || !res.ok) return;
        const json = (await res.json()) as { viewers?: EntityViewer[] };
        if (!cancelled && Array.isArray(json.viewers)) setViewers(json.viewers);
      } catch {
        /* ignore */
      }
    }

    function leaveBeacon() {
      try {
        const blob = new Blob(
          [JSON.stringify({ entityType, entityId, action: "leave" })],
          { type: "application/json" },
        );
        navigator.sendBeacon("/api/presence/heartbeat", blob);
      } catch {
        /* ignore */
      }
    }

    void beat(); // join
    let interval: ReturnType<typeof setInterval> | null = null;
    if (!document.hidden) {
      interval = setInterval(beat, 25_000);
    }

    function startBeatTimer() {
      if (interval != null) return;
      interval = setInterval(beat, 25_000);
    }

    function clearBeatTimer() {
      if (interval == null) return;
      clearInterval(interval);
      interval = null;
    }

    function onVisibilityChange() {
      if (document.hidden) {
        clearBeatTimer();
        return;
      }
      void beat();
      startBeatTimer();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    const unsubscribeSSE = subscribeSSEEvents("/api/sse/messages", {
      entity_viewers: (raw: unknown) => {
        try {
          const data = raw as {
            entityType?: string;
            entityId?: string;
            viewers?: EntityViewer[];
          };
          if (
            data.entityType === entityType &&
            data.entityId === entityId &&
            Array.isArray(data.viewers)
          ) {
            setViewers(data.viewers);
          }
        } catch {
          /* ignore */
        }
      },
    });

    // beforeunload + pagehide cobrem fechar aba / navegação externa / bfcache.
    window.addEventListener("beforeunload", leaveBeacon);
    window.addEventListener("pagehide", leaveBeacon);

    return () => {
      cancelled = true;
      clearBeatTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsubscribeSSE();
      window.removeEventListener("beforeunload", leaveBeacon);
      window.removeEventListener("pagehide", leaveBeacon);
      leaveBeacon(); // saída ao navegar para outra rota do app
    };
  }, [entityType, entityId]);

  // Presença é "quem MAIS está vendo" — remove você mesmo.
  return viewers.filter((v) => v.userId !== selfId);
}
