"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import {
  ENTITY_VIEWERS_HEARTBEAT_MS,
  registerEntityView,
  type EntityViewer,
} from "@/hooks/presence-sync";
import { isSingleLeaderEnabled } from "@/hooks/sse-single-leader";
import { subscribeSSEEvents } from "@/hooks/use-sse";

/**
 * Presença "quem está vendo" (estilo Kommo). Enquanto a entidade (ex.: um
 * deal) estiver aberta, registra-a em `presence-sync.ts` — só a aba LÍDER
 * do navegador manda o heartbeat (25s) ao backend, agregando as entidades
 * de todas as abas — e escuta o evento SSE `entity_viewers` para saber
 * quem MAIS está na mesma página.
 *
 * - TTL do backend: 90s (`src/lib/entity-presence.ts`), folga para a
 *   troca de líder e para a líder em segundo plano.
 * - Aba oculta por mais de 30s deixa de contar como viewer; ao voltar
 *   entra de novo na hora. Fechar a aba / navegar sai na hora (beacon).
 * - Retorna a lista JÁ SEM você mesmo (só os outros usuários).
 *
 * Com a chave `NEXT_PUBLIC_SSE_SINGLE_LEADER=0` (ou o override em
 * `localStorage`, ver `sse-single-leader.ts`) vale o caminho anterior:
 * heartbeat por aba (`legacyPerTabPresence`).
 */
export { ENTITY_VIEWERS_HEARTBEAT_MS, type EntityViewer };

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
    if (!isSingleLeaderEnabled()) {
      return legacyPerTabPresence(entityType, entityId, setViewers);
    }
    const unregister = registerEntityView(entityType, entityId, setViewers);

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

    return () => {
      unregister();
      unsubscribeSSE();
    };
  }, [entityType, entityId]);

  // Presença é "quem MAIS está vendo" — remove você mesmo.
  return viewers.filter((v) => v.userId !== selfId);
}

/**
 * Caminho anterior à líder entre abas, mantido literal para a chave de
 * desligar: cada aba manda o próprio heartbeat.
 *
 * - Join imediato + heartbeat a cada `ENTITY_VIEWERS_HEARTBEAT_MS`.
 * - Aba oculta pausa o heartbeat (`visibilitychange`) e retoma ao voltar.
 * - Saída explícita no unmount / fechamento da aba (sendBeacon) → o backend
 *   remove na hora; sem isso, o viewer cairia por TTL.
 */
function legacyPerTabPresence(
  entityType: string,
  entityId: string,
  setViewers: (viewers: EntityViewer[]) => void,
): () => void {
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
    interval = setInterval(beat, ENTITY_VIEWERS_HEARTBEAT_MS);
  }

  function startBeatTimer() {
    if (interval != null) return;
    interval = setInterval(beat, ENTITY_VIEWERS_HEARTBEAT_MS);
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
}
