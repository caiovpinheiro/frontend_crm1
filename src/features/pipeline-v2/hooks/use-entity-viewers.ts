"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import {
  ENTITY_VIEWERS_HEARTBEAT_MS,
  registerEntityView,
  type EntityViewer,
} from "@/hooks/presence-sync";
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
