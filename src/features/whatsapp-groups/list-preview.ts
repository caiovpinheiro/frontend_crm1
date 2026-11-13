import type { WhatsAppGroupListItem, WhatsAppGroupsListResponse } from "./types";

/**
 * Segunda linha da lista, como no WhatsApp: "Kleber Raia: Ah tá ótimo…".
 * Sem mensagem no CRM ainda, a lista mostra o número de participantes.
 */
export function groupListPreview(
  g: Pick<WhatsAppGroupListItem, "lastMessagePreview" | "lastMessageAuthor" | "lastMessageFromMe">,
): { author: string | null; text: string } | null {
  const text = g.lastMessagePreview?.trim();
  if (!text) return null;
  const author = g.lastMessageFromMe ? "Você" : g.lastMessageAuthor?.trim() || null;
  return { author, text };
}

/** Rótulo da bolinha de não lidas (nada quando zero). */
export function unreadBadgeLabel(count: number): string | null {
  if (!count || count < 1) return null;
  return count > 99 ? "99+" : String(count);
}

/** Cache da lista com o grupo zerado (o "visto" vale para todos do número). */
export function clearGroupUnread(
  cache: WhatsAppGroupsListResponse | undefined,
  groupId: string,
): WhatsAppGroupsListResponse | undefined {
  if (!cache) return cache;
  if (!cache.groups.some((g) => g.id === groupId && g.unreadCount > 0)) return cache;
  return {
    ...cache,
    groups: cache.groups.map((g) => (g.id === groupId ? { ...g, unreadCount: 0 } : g)),
  };
}
