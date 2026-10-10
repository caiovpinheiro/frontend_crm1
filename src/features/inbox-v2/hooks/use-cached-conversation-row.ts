"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { ConversationListRow } from "../api";

/**
 * Linha da conversa no cache individual (`["inbox-conversation", id]`) — a cópia
 * que TODO patch de evento/mutação mantém em dia (lista, SSE, transferência),
 * inclusive depois que a conversa sai da lista. Só lê e assina o cache: nunca
 * busca (quem busca é `useConversationById`).
 */
export function useCachedConversationRow(
  conversationId: string | null | undefined,
): ConversationListRow | null {
  const qc = useQueryClient();
  const subscribe = useCallback(
    (onStoreChange: () => void) => qc.getQueryCache().subscribe(onStoreChange),
    [qc],
  );
  const getSnapshot = useCallback(
    () =>
      conversationId
        ? (qc.getQueryData<ConversationListRow>(["inbox-conversation", conversationId]) ?? null)
        : null,
    [qc, conversationId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
