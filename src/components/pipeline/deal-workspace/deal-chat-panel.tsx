"use client";

import type { MutableRefObject } from "react";
import { ChatWindow } from "@/components/inbox/chat-window-lazy";

type DealChatPanelProps = {
  conversationId: string;
  conversationStatus: string;
  onStatusChange: (s: string) => void;
  contactId?: string;
  inConversationSearchRef?: MutableRefObject<{ open: () => void } | null>;
};

/** Coluna do chat — lista de conversas no header do workspace via ConversationHeader. */
export function DealChatPanel({
  conversationId,
  conversationStatus,
  onStatusChange,
  contactId,
  inConversationSearchRef,
}: DealChatPanelProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <ChatWindow
        conversationId={conversationId}
        conversationStatus={conversationStatus}
        contactId={contactId}
        onResolve={(s) => onStatusChange(s)}
        onReopen={(s) => onStatusChange(s)}
        compactChrome
        inConversationSearchRef={inConversationSearchRef}
      />
    </div>
  );
}
