"use client";

/*
 * Mensagens agendadas pendentes da conversa aberta.
 *
 * O backend publica `scheduled_message_updated` ao criar/cancelar/enviar
 * (handler em `use-realtime.ts` invalida `scheduledMessagesKey`). O poll
 * de 60 s fica só como fallback: roda quando o SSE está desconectado —
 * com a aba visível e com conversa aberta (`enabled`). Quem cria/cancela
 * nesta aba invalida a mesma chave na hora, sem esperar o evento.
 *
 * Com a SSE conectada o cache se mantém por evento (e a reconexão com gap
 * marca todas como velhas): voltar a uma conversa / remontar o composer
 * dentro de `SCHEDULED_MESSAGES_STALE_MS_SSE` não refaz o GET (F3, 05/10;
 * antes o prazo era 15 s e cada abertura buscava).
 */

import { useQuery } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";
import { useSSEConnected } from "@/hooks/use-sse";
import {
  listScheduledMessages,
  type ScheduledMessage,
} from "@/features/inbox-v2/api";

export const SCHEDULED_MESSAGES_POLL_MS = 60_000;
export const SCHEDULED_MESSAGES_STALE_MS = 15_000;
export const SCHEDULED_MESSAGES_STALE_MS_SSE = 5 * 60_000;

/** Mesma chave que o ChatWindow legado usa — os caches convergem. */
export function scheduledMessagesKey(conversationId: string | null) {
  return ["scheduled-messages", conversationId] as const;
}

export function scheduledMessagesQueryOptions(
  conversationId: string | null,
  visible: boolean,
  sseConnected = false,
) {
  const enabled = !!conversationId;
  return {
    queryKey: scheduledMessagesKey(conversationId),
    queryFn: (): Promise<{ items: ScheduledMessage[] }> =>
      listScheduledMessages(conversationId as string),
    enabled,
    staleTime: sseConnected ? SCHEDULED_MESSAGES_STALE_MS_SSE : SCHEDULED_MESSAGES_STALE_MS,
    refetchInterval:
      enabled && visible && !sseConnected ? SCHEDULED_MESSAGES_POLL_MS : false,
    refetchIntervalInBackground: false,
  } as const;
}

export function useScheduledMessages(conversationId: string | null) {
  const visible = useDocumentVisible();
  const sseConnected = useSSEConnected("/api/sse/messages");
  return useQuery(scheduledMessagesQueryOptions(conversationId, visible, sseConnected));
}
