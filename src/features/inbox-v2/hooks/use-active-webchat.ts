"use client";

/*
 * O contato da conversa aberta está no chat do site? Roda só para a conversa
 * aberta e fora do webchat, nunca na lista. O poll cobre o visitante que chega
 * com a conversa já aberta e para com a aba escondida.
 */

import { useQuery } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";
import { getActiveWebchat } from "@/features/inbox-v2/api";

export const ACTIVE_WEBCHAT_POLL_MS = 30_000;

export function useActiveWebchat(conversationId: string | null, enabled = true) {
  const visible = useDocumentVisible();
  const on = enabled && !!conversationId;
  const { data } = useQuery({
    queryKey: ["active-webchat", conversationId],
    queryFn: () => getActiveWebchat(conversationId as string),
    enabled: on,
    staleTime: 15_000,
    refetchInterval: on && visible ? ACTIVE_WEBCHAT_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
  return on ? (data?.active ?? null) : null;
}
