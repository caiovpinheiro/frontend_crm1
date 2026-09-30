/**
 * Patch otimista do tique (sent → delivered → read) no cache de mensagens
 * a partir do evento SSE `message_status`.
 *
 * Cópia da lógica de `hooks/use-realtime.ts` (inbox-v2) para o chat legado
 * (`components/inbox/chat-window.tsx`), que até então refazia
 * `GET /messages` inteiro a cada tique entregue/lido. Refetch só em
 * `failed`, que precisa do `sendError` completo.
 */

export type MessageStatusEvent = {
  conversationId?: string;
  /** Id da bolha (= externalId/wamid no Meta). */
  messageId?: string;
  /** UUID interno — fallback p/ payloads antigos. */
  internalId?: string;
  status?: string;
};

const SSE_STATUS_TO_MESSAGE_STATUS: Record<string, string> = {
  pending: "PENDING",
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

type PatchableMessage = { id: string | number };
type PatchableCache = { messages?: PatchableMessage[] } | undefined;

/**
 * Devolve o cache com a bolha atualizada, ou o mesmo objeto quando não há
 * o que patchar (sem messages, status desconhecido, bolha não encontrada).
 * Genérico solto de propósito: o chat legado e o inbox-v2 tipam a resposta
 * de `GET /messages` de forma diferente; só `id`/`status`/`sendStatus` importam.
 */
export function patchMessageStatus<T extends PatchableCache>(
  old: T,
  evt: MessageStatusEvent,
): T {
  if (!old?.messages || !evt.messageId || !evt.status) return old;
  const statusLc = evt.status.toLowerCase();
  const mapped = SSE_STATUS_TO_MESSAGE_STATUS[statusLc];
  if (!mapped) return old;
  const bubbleId = evt.messageId;
  const internalId = evt.internalId;
  let touched = false;
  const messages = old.messages.map((m) => {
    if (m.id === bubbleId || (internalId != null && m.id === internalId)) {
      touched = true;
      return { ...m, status: mapped, sendStatus: statusLc };
    }
    return m;
  });
  if (!touched) return old;
  return { ...old, messages } as T;
}

/** Só `failed` justifica refazer GET /messages (precisa do sendError). */
export function shouldRefetchMessagesOnStatus(status: string | undefined): boolean {
  return (status ?? "").toLowerCase() === "failed";
}
