"use client";

/*
 * Mensagens agendadas pendentes da conversa aberta.
 *
 * O backend publica `scheduled_message_updated` (com `conversationId`) ao
 * criar/cancelar/enviar/falhar (handler em `use-realtime.ts` invalida
 * `scheduledMessagesKey`). O poll de 60 s fica só como fallback: roda
 * quando o SSE está desconectado — com a aba visível e com conversa aberta
 * (`enabled`). Quem cria/cancela nesta aba invalida a mesma chave na hora,
 * sem esperar o evento.
 *
 * Gate de carga (15/10): com a SSE conectada o cache vale até um evento
 * da conversa ou a reconexão com gap (que marca todas como velhas) — abrir
 * a conversa de novo NÃO busca (`SCHEDULED_MESSAGES_STALE_MS_SSE` é só a
 * rede de segurança, 30 min, e o cache fica guardado o mesmo tanto). Quando
 * busca, o GET vai com `no-cache`: o navegador revalida o `ETag` e o
 * backend responde 304 sem ler a lista.
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
export const SCHEDULED_MESSAGES_STALE_MS_SSE = 30 * 60_000;
/** Cache da lista guardado depois de fechar a conversa (reabrir não busca). */
export const SCHEDULED_MESSAGES_GC_MS = 30 * 60_000;

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
    gcTime: SCHEDULED_MESSAGES_GC_MS,
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
