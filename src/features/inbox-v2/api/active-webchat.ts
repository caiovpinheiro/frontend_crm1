/*
 * Ticket webchat em que o contato da conversa aberta está agora.
 * Contrato: `GET /api/conversations/:id/active-webchat` (backend,
 * docs/decisoes/webchat-widget.md §9.13).
 */

import { apiUrl } from "@/lib/api";

export interface ActiveWebchatConversation {
  id: string;
  number: number;
  reason: "online" | "recent_message";
}

/** Sem resposta válida não há aviso: nunca atrapalha o envio. */
export async function getActiveWebchat(
  conversationId: string,
): Promise<{ active: ActiveWebchatConversation | null }> {
  const res = await fetch(
    apiUrl(`/api/conversations/${encodeURIComponent(conversationId)}/active-webchat`),
  );
  if (!res.ok) return { active: null };
  return res.json() as Promise<{ active: ActiveWebchatConversation | null }>;
}
