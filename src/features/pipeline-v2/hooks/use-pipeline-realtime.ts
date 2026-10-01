"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useSSE } from "@/hooks/use-sse";
import { isEventMessageType } from "@/components/crm/chat-timeline";
import type { BoardStageDto } from "@/features/pipeline-v2/api";
import { foldActivityOntoDeal } from "@/features/pipeline-v2/board-live-activity";
import {
  readBoardScope,
  type BoardScope,
  type RealtimeEventName,
  type RealtimePayload,
} from "@/lib/realtime-contract";

/** Só o que o handler trata — `conversation_updated` etc. não chegam aqui. */
const PIPELINE_SSE_EVENTS: readonly RealtimeEventName[] = [
  "new_message",
  "message_status",
];

/** Não entra no preview/ordem do card (igual ao SQL do board). */
const NON_CHAT_MESSAGE_TYPES = new Set([
  "note",
  "ai_draft",
  "whatsapp_call",
  "whatsapp_call_recording",
]);

function skipsBoardPreview(messageType: string | null | undefined): boolean {
  if (!messageType) return false;
  if (isEventMessageType(messageType)) return true;
  const mt = messageType.toLowerCase();
  return NON_CHAT_MESSAGE_TYPES.has(mt) || mt.startsWith("event");
}

/** Cobre `pipeline-board`, `pipeline-board-search` e `pipeline-board-filtered`. */
function isBoardQueryKey(key: readonly unknown[]): boolean {
  const root = key[0];
  return typeof root === "string" && root.startsWith("pipeline-board");
}

/**
 * Board paginado do GET (`["pipeline-board", ...]`).
 * O POST filtrado/busca não entra: é pesado e a lista já está restrita.
 * Invalidar esses caches a cada mensagem de quem não está no filtro
 * deixava o Flow em refresh contínuo.
 */
function isPagedBoardQueryKey(key: readonly unknown[]): boolean {
  return key[0] === "pipeline-board";
}

/** `["pipeline-board*", pipelineId, status, ...]` — as três variantes. */
function boardPipelineId(key: readonly unknown[]): string | null {
  const id = key[1];
  return typeof id === "string" && id ? id : null;
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

function normalizeStatus(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toLowerCase();
  return s in STATUS_RANK ? s : null;
}

/**
 * Atualiza `lastMessage.sendStatus` nos boards em cache quando o ack da
 * Meta/Baileys chega. Sem isto o card fica preso em ✓ (sent): invalidar
 * o board refetcharia o cache-aside de 45s ainda com o status antigo.
 */
function patchBoardLastMessageStatus(
  qc: QueryClient,
  ids: { messageId?: string; internalId?: string },
  status: string,
  sendError?: string | null,
) {
  const nextStatus = normalizeStatus(status);
  if (!nextStatus) return;
  if (!ids.messageId && !ids.internalId) return;

  const boards = qc.getQueriesData<BoardStageDto[]>({
    predicate: (q) => isBoardQueryKey(q.queryKey),
  });

  for (const [queryKey, data] of boards) {
    if (!Array.isArray(data)) continue;
    let touched = false;
    const next = data.map((stage) => {
      let stageTouched = false;
      const deals = stage.deals.map((deal) => {
        const lm = deal.lastMessage;
        if (!lm || String(lm.direction).toLowerCase() !== "out") return deal;
        const hit =
          (ids.internalId != null && lm.id === ids.internalId) ||
          (ids.messageId != null &&
            (lm.id === ids.messageId || lm.externalId === ids.messageId));
        if (!hit) return deal;

        const current = normalizeStatus(lm.sendStatus) ?? "pending";
        // failed sempre sobrescreve; demais só avançam (sent→delivered→read).
        if (
          nextStatus !== "failed" &&
          current !== "failed" &&
          (STATUS_RANK[nextStatus] ?? 0) <= (STATUS_RANK[current] ?? 0)
        ) {
          return deal;
        }

        stageTouched = true;
        touched = true;
        return {
          ...deal,
          lastMessage: {
            ...lm,
            sendStatus: nextStatus,
            sendError:
              nextStatus === "failed"
                ? (sendError ?? lm.sendError ?? null)
                : null,
          },
        };
      });
      return stageTouched ? { ...stage, deals } : stage;
    });
    if (touched) qc.setQueryData(queryKey, next);
  }
}

/**
 * Conversa aberta (chat do negócio, Flow): zera as não lidas dos cards do
 * contato em todos os boards em cache. O POST /read já zera no servidor,
 * mas o board vem de cache-aside e o card ficava com o contador.
 */
export function clearBoardUnreadForContact(qc: QueryClient, contactId: string) {
  const boards = qc.getQueriesData<BoardStageDto[]>({
    predicate: (q) => isBoardQueryKey(q.queryKey),
  });
  for (const [queryKey, data] of boards) {
    if (!Array.isArray(data)) continue;
    let touched = false;
    const next = data.map((stage) => {
      let stageTouched = false;
      const deals = stage.deals.map((deal) => {
        if (deal.contact?.id !== contactId || !deal.unreadCount) return deal;
        stageTouched = true;
        touched = true;
        return { ...deal, unreadCount: 0 };
      });
      return stageTouched ? { ...stage, deals } : stage;
    });
    if (touched) qc.setQueryData(queryKey, next);
  }
}

/**
 * Patch in-place do `lastMessage`/preview do card no board (P0-2): um
 * `new_message` atualiza o card do contato afetado em vez de invalidar
 * o board inteiro (887KB) a cada evento da org. Casa o deal pelo
 * `contact.id` (o payload SSE não traz dealId).
 *
 * Retorna true quando o contato está em algum board cacheado. Quem não
 * está na página não é inserido aqui — o caller dispara um refetch
 * debounced para a janela "mais recentes" passar a incluí-lo.
 */
export function patchBoardLastMessage(
  qc: QueryClient,
  data: BoardMessagePatch,
): boolean {
  return patchBoardMessage(qc, data, null).found;
}

type BoardMessagePatch = {
  contactId?: string | null;
  direction?: string;
  content?: string | null;
  timestamp?: string;
  cardOmitted?: string;
};

/**
 * Núcleo do patch. Com `scope` (evento trouxe `dealIds`), o card também
 * casa pelo id do negócio. Devolve em quais funis algum card casou —
 * `usePipelineRealtime` usa isso para refazer só o board do funil em que
 * o card está fora da página carregada.
 */
function patchBoardMessage(
  qc: QueryClient,
  data: BoardMessagePatch,
  scope: BoardScope | null,
): { found: boolean; matchedPipelineIds: Set<string> } {
  const matchedPipelineIds = new Set<string>();
  const contactId = data.contactId || undefined;
  const dealIds = scope?.dealIds?.length ? new Set(scope.dealIds) : null;
  if (!contactId && !dealIds) return { found: false, matchedPipelineIds };
  const direction =
    data.direction === "in" || data.direction === "out" ? data.direction : null;
  const ts =
    typeof data.timestamp === "string" && data.timestamp
      ? data.timestamp
      : new Date().toISOString();
  // Evento redigido (sem texto): não apaga a prévia do card.
  const content =
    typeof data.content === "string"
      ? data.content
      : data.cardOmitted
        ? null
        : "";

  const boards = qc.getQueriesData<BoardStageDto[]>({
    predicate: (q) => isBoardQueryKey(q.queryKey),
  });

  let found = false;
  for (const [queryKey, data_] of boards) {
    if (!Array.isArray(data_)) continue;
    let touched = false;
    const next = data_.map((stage) => {
      let stageTouched = false;
      const deals = stage.deals.map((deal) => {
        const folded = foldActivityOntoDeal(deal, {
          contactId,
          dealIds,
          direction,
          content,
          timestamp: ts,
        });
        if (!folded.matched) return deal;
        found = true;
        const pipelineId = boardPipelineId(queryKey);
        if (pipelineId) matchedPipelineIds.add(pipelineId);
        if (!folded.changed) return deal;
        stageTouched = true;
        touched = true;
        return folded.deal;
      });
      return stageTouched ? { ...stage, deals } : stage;
    });
    if (touched) qc.setQueryData(queryKey, next);
  }
  return { found, matchedPipelineIds };
}

/**
 * O que um `new_message` pede ao board, além do patch in-place:
 * - `null`: nada a refazer;
 * - `"all"`: refazer todo board paginado em cache (evento sem escopo —
 *   backend antigo — e card fora da página, ou sem `contactId`);
 * - lista de funis: refazer só o board paginado desses funis.
 */
export type BoardRefreshRequest = null | "all" | string[];

/**
 * Aplica um `new_message` nos boards em cache e diz o que precisa ser
 * refeito. Puro em relação ao React: só lê/escreve no `QueryClient`.
 *
 * Com escopo (`pipelineIds`/`dealIds` no evento): mexe só nos cards do
 * contato/negócios do evento; funil fora de `pipelineIds` não é tocado
 * nem refeito; funil do escopo cujo card não está na página carregada é
 * refeito sozinho. Sem escopo: comportamento anterior.
 */
export function applyBoardNewMessage(
  qc: QueryClient,
  payload: RealtimePayload<"new_message">,
): BoardRefreshRequest {
  if (skipsBoardPreview(payload.messageType)) return null;

  const scope = readBoardScope(payload);
  if (scope) {
    const { matchedPipelineIds } = patchBoardMessage(qc, payload, scope);
    const missing = scope.pipelineIds.filter((id) => !matchedPipelineIds.has(id));
    return missing.length > 0 ? missing : null;
  }

  // Payload sem contactId (legado): fallback à invalidação debounced do
  // board — não dá pra localizar o card.
  if (!payload.contactId) return "all";
  // Card fora da página carregada: um refetch debounced traz o lead para
  // a janela (mais recentes primeiro). Quem já está na fila só recebe o
  // patch — sem o GET do board inteiro.
  return patchBoardMessage(qc, payload, null).found ? null : "all";
}

/** Atraso do refetch do board depois de um `new_message` fora da página. */
export const BOARD_REFRESH_DEBOUNCE_MS = 800;

/**
 * Invalidação debounced do board paginado. Junta os pedidos da janela:
 * vários funis viram uma invalidação por funil; um pedido `"all"` vence.
 * Não inclui o POST filtrado/busca: quem não está no filtro não pode
 * refazer essa query (no Flow a tela ficava em refresh o tempo todo).
 */
export function createBoardRefreshScheduler(
  qc: QueryClient,
  delayMs = BOARD_REFRESH_DEBOUNCE_MS,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: "all" | Set<string> | null = null;

  function flush() {
    timer = null;
    const request = pending;
    pending = null;
    if (!request) return;
    qc.invalidateQueries({
      predicate: (q) => {
        if (!isPagedBoardQueryKey(q.queryKey)) return false;
        if (request === "all") return true;
        const pipelineId = boardPipelineId(q.queryKey);
        return pipelineId != null && request.has(pipelineId);
      },
    });
  }

  return {
    schedule(request: BoardRefreshRequest) {
      if (!request) return;
      if (request === "all") {
        pending = "all";
      } else if (pending !== "all") {
        const set = pending ?? new Set<string>();
        for (const id of request) set.add(id);
        pending = set;
      }
      if (!timer) timer = setTimeout(flush, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

/**
 * Mantém os cards do Kanban/Flow em dia sem esperar o polling de 30s.
 *
 * O board carrega `lastMessage`, que define o rodapé "aguardando resposta"
 * e os ticks enviado/entregue/lido no `DealCard`.
 *
 * - `new_message` → patch in-place do card (a fila do Flow reordena).
 *   Com `pipelineIds`/`dealIds` no evento: só os cards e o funil
 *   afetados; funil que não está no evento não é tocado. Sem esses
 *   campos (backend antigo): contato fora da página dispara um refetch
 *   debounced do board paginado. Ver `applyBoardNewMessage`.
 * - `conversation_updated` → ignora (ticket assign/status/consent não
 *   muda estágio do deal; poll 60s + mutations locais cobrem o board).
 * - `message_status` → patch otimista do `sendStatus` (ticks), sem
 *   recompute do board.
 */
export function usePipelineRealtime(enabled = true) {
  const qc = useQueryClient();
  const refreshRef = useRef<ReturnType<typeof createBoardRefreshScheduler> | null>(
    null,
  );

  useEffect(() => {
    const scheduler = createBoardRefreshScheduler(qc);
    refreshRef.current = scheduler;
    return () => {
      scheduler.cancel();
      refreshRef.current = null;
    };
  }, [qc]);

  const handler = useCallback(
    (event: string, data: unknown) => {
      if (event === "message_status") {
        const payload = (data ?? {}) as RealtimePayload<"message_status">;
        if (payload.status) {
          patchBoardLastMessageStatus(
            qc,
            {
              messageId: payload.messageId,
              internalId: payload.internalId,
            },
            payload.status,
            payload.error ?? null,
          );
        }
        return;
      }

      if (event === "new_message") {
        const payload = (data ?? {}) as RealtimePayload<"new_message">;
        refreshRef.current?.schedule(applyBoardNewMessage(qc, payload));
        return;
      }

      // conversation_updated: não refetcha o board (~900KB). Ticket
      // assign/resolve/consent não move deal de coluna.
    },
    [qc],
  );

  useSSE("/api/sse/messages", handler, enabled, PIPELINE_SSE_EVENTS);
}

/** Invalidação imediata do board — usar após ações locais (ex.: envio). */
export function invalidatePipelineBoards(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ predicate: (q) => isBoardQueryKey(q.queryKey) });
}

/**
 * Adia o refetch do kanban para depois do paint. No deal detail o
 * invalidate síncrono re-renderiza o board inteiro e atrasa stop/envio
 * de áudio (o inbox não monta o board, então não sente isso).
 */
export function schedulePipelineBoardInvalidation(
  qc: ReturnType<typeof useQueryClient>,
) {
  const run = () => invalidatePipelineBoards(qc);
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(run, { timeout: 1200 });
    return;
  }
  globalThis.setTimeout(run, 0);
}
