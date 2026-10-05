import type { QueryClient } from "@tanstack/react-query";

import type { MessagesResponse } from "../api";
import { messagesKey } from "./use-messages";

/**
 * Hidratação da conversa aberta depois de um `new_message` (F1, 05/10).
 *
 * O evento não traz o id da bolha nem a mídia: a bolha entra na hora como
 * stub (`sse:`) e um GET da 1ª página troca o stub pela mensagem real.
 * Antes, cada evento refazia o GET na hora — rajada de N mensagens = N
 * GETs, e o eco da própria mensagem enviada pelo agente somava mais um ao
 * GET da mutação. Aqui:
 *
 *  - os eventos da mesma conversa dentro de `THREAD_HYDRATE_DELAY_MS`
 *    viram UM GET (vários assinantes na página também coalescem: o estado
 *    é por QueryClient);
 *  - na hora de buscar, se nenhum dos stubs pedidos continua no cache (o
 *    envio do agente já gravou a bolha real, ou outro GET já hidratou),
 *    não busca;
 *  - um GET em voo é reaproveitado (`cancelRefetch: false`) em vez de
 *    abortado e refeito.
 */
export const THREAD_HYDRATE_DELAY_MS = 1_000;

type Pending = {
  timer: ReturnType<typeof setTimeout>;
  /** Busca mesmo sem stub (evento sem texto, timeline, status sem motivo). */
  force: boolean;
  /** Stubs que este GET deve trocar pela mensagem real. */
  stubIds: Set<string>;
};

const pendingByClient = new WeakMap<QueryClient, Map<string, Pending>>();

function pendingFor(qc: QueryClient): Map<string, Pending> {
  let map = pendingByClient.get(qc);
  if (!map) {
    map = new Map();
    pendingByClient.set(qc, map);
  }
  return map;
}

function threadHasAnyStub(data: MessagesResponse | undefined, ids: Set<string>): boolean {
  if (!data?.messages || ids.size === 0) return false;
  return data.messages.some((m) => ids.has(String(m.id)));
}

export function scheduleThreadHydrate(
  qc: QueryClient,
  conversationId: string,
  opts: { stubId?: string | null; force?: boolean } = {},
): void {
  const map = pendingFor(qc);
  const existing = map.get(conversationId);
  if (existing) {
    if (opts.force) existing.force = true;
    if (opts.stubId) existing.stubIds.add(opts.stubId);
    return;
  }
  const entry: Pending = {
    force: Boolean(opts.force),
    stubIds: new Set(opts.stubId ? [opts.stubId] : []),
    timer: setTimeout(() => {
      map.delete(conversationId);
      const key = messagesKey(conversationId);
      const data = qc.getQueryData<MessagesResponse>(key);
      if (!entry.force && !threadHasAnyStub(data, entry.stubIds)) return;
      void qc.invalidateQueries(
        { queryKey: key, refetchType: "active" },
        { cancelRefetch: false },
      );
    }, THREAD_HYDRATE_DELAY_MS),
  };
  map.set(conversationId, entry);
}
