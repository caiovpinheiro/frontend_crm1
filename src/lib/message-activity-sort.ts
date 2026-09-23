/**
 * Ordenação da Caixa de Entrada pela última mensagem.
 *
 * `lastMessageAt` (fallback `lastInboundAt`) — nunca `updatedAt` nem a
 * criação do lead. Outbound recente muda o relógio do card e a posição;
 * só leitura não move o card.
 */

export type MessageActivityOrder = "asc" | "desc";

export function messageActivityTimestamp(
  lastMessageAt: string | Date | null | undefined,
  lastInboundAt?: string | Date | null | undefined,
): number {
  const raw = lastMessageAt ?? lastInboundAt ?? null;
  if (raw == null || raw === "") return 0;
  const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
}

/** `asc` = mais antigas primeiro. `desc` = mais recentes primeiro. */
export function compareMessageActivity(
  aTs: number,
  bTs: number,
  order: MessageActivityOrder,
): number {
  const sign = order === "asc" ? 1 : -1;
  return sign * (aTs - bTs);
}
