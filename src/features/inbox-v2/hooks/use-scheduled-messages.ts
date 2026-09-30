"use client";

/*
 * Mensagens agendadas pendentes da conversa aberta.
 *
 * Não existe evento SSE para agendamentos (ver `use-realtime.ts`), então o
 * banner faz poll de 60 s — só com a aba visível e só enquanto há conversa
 * aberta (`enabled`). Quem cria/cancela um agendamento invalida a mesma
 * chave (`scheduledMessagesKey`), o que cobre o caso comum sem esperar o
 * poll.
 */

import { useQuery } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";
import {
  listScheduledMessages,
  type ScheduledMessage,
} from "@/features/inbox-v2/api";

export const SCHEDULED_MESSAGES_POLL_MS = 60_000;

/** Mesma chave que o ChatWindow legado usa — os caches convergem. */
export function scheduledMessagesKey(conversationId: string | null) {
  return ["scheduled-messages", conversationId] as const;
}

export function scheduledMessagesQueryOptions(
  conversationId: string | null,
  visible: boolean,
) {
  const enabled = !!conversationId;
  return {
    queryKey: scheduledMessagesKey(conversationId),
    queryFn: (): Promise<{ items: ScheduledMessage[] }> =>
      listScheduledMessages(conversationId as string),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled && visible ? SCHEDULED_MESSAGES_POLL_MS : false,
    refetchIntervalInBackground: false,
  } as const;
}

export function useScheduledMessages(conversationId: string | null) {
  const visible = useDocumentVisible();
  return useQuery(scheduledMessagesQueryOptions(conversationId, visible));
}
