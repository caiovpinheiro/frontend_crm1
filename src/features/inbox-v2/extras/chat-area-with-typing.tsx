"use client";

import type { ComponentProps } from "react";

import { ChatArea } from "@/components/crm/chat-area";
import { useConversationTyping } from "@/features/inbox-v2/hooks/use-conversation-typing";

/**
 * `ChatArea` + indicador "digitando…" (SSE `typing`, inclusive
 * `source: "contact"` — visitante do Webchat). O hook fica neste wrapper
 * para que cada evento de typing re-renderize só o chat, não a página do
 * inbox inteira (lista/cards — ver teste FE-1 de re-render).
 */
export function ChatAreaWithTyping({
  typingSelfId,
  ...props
}: ComponentProps<typeof ChatArea> & { typingSelfId: string | null }) {
  const typingHint = useConversationTyping(props.conversationId ?? null, typingSelfId);
  return <ChatArea {...props} typingHint={props.typingHint ?? typingHint} />;
}
