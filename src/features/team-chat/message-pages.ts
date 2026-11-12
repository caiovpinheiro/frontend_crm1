import type { TeamChatMessage } from "./types";

/** Tamanho da página do backend (`GET /api/team-chat/rooms/:id/messages`, padrão 80). */
export const TEAM_CHAT_PAGE_SIZE = 80;

function byCreatedAt(a: TeamChatMessage, b: TeamChatMessage) {
  if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id);
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Junta a página mais recente (poll/refetch) com o que já está no cache.
 *
 * - Mais nova que a página: mantém (chegou por SSE depois do GET).
 * - Mais antiga que a página: mantém — veio de "carregar anteriores". Antes
 *   era descartada e a conversa ficava presa às últimas 80 mensagens.
 * - Dentro da janela da página e ausente nela: foi apagada, sai.
 */
export function mergeMessageLists(
  cached: TeamChatMessage[] | undefined,
  fetched: TeamChatMessage[],
): TeamChatMessage[] {
  if (!cached?.length) return fetched;
  const byId = new Map(fetched.map((m) => [m.id, m]));
  const oldest = fetched[0]?.createdAt;
  const newest = fetched[fetched.length - 1]?.createdAt;
  for (const msg of cached) {
    if (byId.has(msg.id)) continue;
    const isNewer = newest !== undefined && msg.createdAt >= newest;
    const isOlder = oldest !== undefined && msg.createdAt < oldest;
    if (isNewer || isOlder) byId.set(msg.id, msg);
  }
  return [...byId.values()].sort(byCreatedAt);
}

/** Acrescenta uma página de mensagens antigas no começo, sem duplicar. */
export function prependOlderMessages(
  cached: TeamChatMessage[] | undefined,
  older: TeamChatMessage[],
): TeamChatMessage[] {
  const byId = new Map((cached ?? []).map((m) => [m.id, m]));
  for (const msg of older) if (!byId.has(msg.id)) byId.set(msg.id, msg);
  return [...byId.values()].sort(byCreatedAt);
}

/** Página cheia = provavelmente há mais; página menor = chegou ao início. */
export function pageHasMore(received: number, pageSize = TEAM_CHAT_PAGE_SIZE) {
  return received >= pageSize;
}
