"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useSSE } from "@/hooks/use-sse";
import { isEventMessageType } from "@/components/crm/chat-timeline";
import type { BoardStageDto } from "@/features/pipeline-v2/api";

/** Cobre `pipeline-board`, `pipeline-board-search` e `pipeline-board-filtered`. */
function isBoardQueryKey(key: readonly unknown[]): boolean {
  const root = key[0];
  return typeof root === "string" && root.startsWith("pipeline-board");
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
 * Patch in-place do `lastMessage`/preview do card no board (P0-2): um
 * `new_message` atualiza o card do contato afetado em vez de invalidar
 * o board inteiro (887KB) a cada evento da org. Casa o deal pelo
 * `contact.id` (o payload SSE não traz dealId).
 *
 * Retorna true quando algum card foi patcheado. Quando o contato não
 * está no board cacheado, NÃO invalidamos: deal novo/auto-criado entra
 * no próximo poll de 60s do `useBoard` — preço aceitável pra matar o
 * loop de refetch (ver perf-network-report.md).
 */
function patchBoardLastMessage(
  qc: QueryClient,
  data: {
    contactId?: string;
    direction?: string;
    content?: string;
    timestamp?: string;
  },
): boolean {
  if (!data.contactId) return false;
  const direction =
    data.direction === "in" || data.direction === "out" ? data.direction : null;
  const ts =
    typeof data.timestamp === "string" && data.timestamp
      ? data.timestamp
      : new Date().toISOString();
  const content = typeof data.content === "string" ? data.content : "";

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
        if (deal.contact?.id !== data.contactId) return deal;
        stageTouched = true;
        touched = true;
        found = true;
        const lm = deal.lastMessage;
        return {
          ...deal,
          lastMessage: {
            ...(lm ?? {}),
            content,
            createdAt: ts,
            direction: direction ?? lm?.direction ?? "",
            // Outbound recém-enviada: ack chega via message_status (patch
            // acima). Inbound não tem ticks.
            sendStatus: direction === "out" ? "sent" : null,
            sendError: null,
          },
          // Rodapé "aguardando resposta": inbound empilha (cap 5, como o
          // backend); outbound do agente/bot limpa a fila de espera.
          awaitingMessages:
            direction === "in"
              ? [...(deal.awaitingMessages ?? []), { content, createdAt: ts }].slice(-5)
              : direction === "out"
                ? []
                : deal.awaitingMessages,
          unreadCount:
            direction === "in" ? (deal.unreadCount ?? 0) + 1 : deal.unreadCount,
        };
      });
      return stageTouched ? { ...stage, deals } : stage;
    });
    if (touched) qc.setQueryData(queryKey, next);
  }
  return found;
}

/**
 * Mantém os cards do Kanban/Flow em dia sem esperar o polling de 30s.
 *
 * O board carrega `lastMessage`, que define o rodapé "aguardando resposta"
 * e os ticks enviado/entregue/lido no `DealCard`.
 *
 * - `new_message` → patch in-place do card do contato (sem refetch).
 * - `conversation_updated` → ignora (ticket assign/status/consent não
 *   muda estágio do deal; poll 60s + mutations locais cobrem o board).
 * - `message_status` → patch otimista do `sendStatus` (ticks), sem
 *   recompute do board.
 */
export function usePipelineRealtime(enabled = true) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    },
    [],
  );

  // Invalidação debounced do board — só payload legado sem contactId
  // em new_message (não dá pra achar o card). conversation_updated
  // não entra: atribuir/encerrar ticket não muda a coluna do Kanban.
  const scheduleBoardRefresh = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      qc.invalidateQueries({ predicate: (q) => isBoardQueryKey(q.queryKey) });
    }, 800);
  }, [qc]);

  const handler = useCallback(
    (event: string, data: unknown) => {
      if (event === "message_status") {
        const payload = (data ?? {}) as {
          messageId?: string;
          internalId?: string;
          status?: string;
          error?: string;
        };
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
        const payload = (data ?? {}) as {
          contactId?: string;
          direction?: string;
          content?: string;
          timestamp?: string;
          messageType?: string;
        };
        if (isEventMessageType(payload.messageType)) return;
        // Payload sem contactId (legado): fallback à invalidação
        // debounced do board — não dá pra localizar o card.
        if (!payload.contactId) {
          scheduleBoardRefresh();
          return;
        }
        patchBoardLastMessage(qc, payload);
        return;
      }

      // conversation_updated: não refetcha o board (~900KB). Ticket
      // assign/resolve/consent não move deal de coluna.
    },
    [qc, scheduleBoardRefresh],
  );

  useSSE("/api/sse/messages", handler, enabled);
}

/** Invalidação imediata do board — usar após ações locais (ex.: envio). */
export function invalidatePipelineBoards(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ predicate: (q) => isBoardQueryKey(q.queryKey) });
}
