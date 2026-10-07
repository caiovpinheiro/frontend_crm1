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
 *
 * Ação do próprio agente (transferir/atribuir): a resposta do POST só chega
 * DEPOIS de o backend gravar a linha de evento no chat, então o GET que sai
 * agora (`immediate`) já a traz. Ele absorve o GET agendado pelo evento SSE
 * dessa linha (que chega antes da resposta) e dispensa o que chegar logo
 * depois (`THREAD_IMMEDIATE_ABSORB_MS`) — antes eram 2 GET por transferência.
 */
export const THREAD_HYDRATE_DELAY_MS = 1_000;
export const THREAD_IMMEDIATE_ABSORB_MS = 1_200;

type Pending = {
  timer: ReturnType<typeof setTimeout>;
  /** Busca mesmo sem stub (evento sem texto, timeline, status sem motivo). */
  force: boolean;
  /** Stubs que este GET deve trocar pela mensagem real. */
  stubIds: Set<string>;
};

const pendingByClient = new WeakMap<QueryClient, Map<string, Pending>>();
const immediateAtByClient = new WeakMap<QueryClient, Map<string, number>>();

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
  opts: { stubId?: string | null; force?: boolean; immediate?: boolean } = {},
): void {
  const map = pendingFor(qc);
  let immediateAt = immediateAtByClient.get(qc);
  if (!immediateAt) {
    immediateAt = new Map();
    immediateAtByClient.set(qc, immediateAt);
  }
  if (opts.immediate) {
    const pending = map.get(conversationId);
    if (pending) {
      clearTimeout(pending.timer);
      map.delete(conversationId);
    }
    immediateAt.set(conversationId, Date.now());
    void qc.invalidateQueries({
      queryKey: messagesKey(conversationId),
      refetchType: "active",
    });
    return;
  }
  // Linha de evento/timeline (sem stub para trocar) logo depois de um GET
  // imediato: esse GET começou depois de a linha ser gravada — já a trouxe.
  if (opts.force && !opts.stubId) {
    const at = immediateAt.get(conversationId);
    if (at != null && Date.now() - at < THREAD_IMMEDIATE_ABSORB_MS) return;
  }
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
