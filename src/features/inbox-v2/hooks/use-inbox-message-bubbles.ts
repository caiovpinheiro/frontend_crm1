"use client";

import { useMemo } from "react";

import { toMessageBubble } from "../adapters";
import type { MessagesResponse } from "../api";

/** Bolhas do chat ativo + previews do banner de mensagens fixadas. */
export function useInboxMessageBubbles(
  messagesData: MessagesResponse | undefined,
  messages: MessagesResponse["messages"],
  contactName: string,
) {
  const pinnedMessageIds = useMemo(
    () => messagesData?.pinnedMessageIds ?? [],
    [messagesData?.pinnedMessageIds],
  );
  const pinnedIdSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const messageBubbles = useMemo(
    () =>
      messages.map((m) => {
        const bubble = toMessageBubble(m, contactName);
        return pinnedIdSet.has(m.id) ? { ...bubble, isPinnedMessage: true } : bubble;
      }),
    [messages, contactName, pinnedIdSet],
  );
  // Previews do banner "fixadas" (várias, estilo WhatsApp) — derivados do
  // próprio array já carregado, na ordem em que o backend os retorna.
  const pinnedMessagesPreview = useMemo(() => {
    return pinnedMessageIds
      .map((pid) => messageBubbles.find((m) => m.id === pid))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({ id: m.id, content: m.content, senderName: m.senderName ?? null }));
  }, [pinnedMessageIds, messageBubbles]);

  return { messageBubbles, pinnedMessagesPreview };
}
