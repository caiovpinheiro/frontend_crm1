import type { ConversationListRow } from "./api";
import {
  inboxQueueSectionPriority,
  inboxQueueTabFor,
} from "./inbox-queue-tab";

/**
 * Agrupamento do card na inbox: 1 por contato + plataforma.
 * Contas distintas do mesmo canal (várias WABAs) colapsam no mesmo card.
 * Espelha a chave de agrupamento do backend.
 */

function activityTs(r: ConversationListRow) {
  return new Date(r.lastMessageAt ?? r.lastInboundAt ?? r.updatedAt ?? 0).getTime();
}

function channelKey(c: ConversationListRow["channel"]) {
  return typeof c === "string" ? c : JSON.stringify(c ?? "");
}

export function inboxCardGroupKey(r: ConversationListRow): string {
  return r.contact?.id
    ? `c:${r.contact.id}::${channelKey(r.channel)}`
    : `id:${r.id}`;
}

/** Mesmo card visual? Mesmo contato + plataforma, ignorando a conta. */
export function sameInboxCardGroup(
  a: ConversationListRow,
  b: ConversationListRow,
): boolean {
  if (a.id === b.id) return true;
  if (a.number != null && b.number != null && a.number === b.number) return true;
  if (!a.contact?.id || !b.contact?.id) return false;
  if (a.contact.id !== b.contact.id) return false;
  return channelKey(a.channel) === channelKey(b.channel);
}

export function isClosedInboxRow(row: ConversationListRow): boolean {
  return row.status === "RESOLVED" || Boolean(row.closedAt);
}

export function preferInboxCardRow(
  a: ConversationListRow,
  b: ConversationListRow,
): ConversationListRow {
  const aClosed = isClosedInboxRow(a);
  const bClosed = isClosedInboxRow(b);
  let winner: ConversationListRow;
  if (aClosed !== bClosed) {
    winner = aClosed ? b : a;
  } else {
    const aPri = inboxQueueSectionPriority(a.queueTab ?? inboxQueueTabFor(a));
    const bPri = inboxQueueSectionPriority(b.queueTab ?? inboxQueueTabFor(b));
    winner =
      bPri < aPri ? b : aPri < bPri ? a : activityTs(b) >= activityTs(a) ? b : a;
  }
  const loser = winner.id === a.id ? b : a;
  return {
    ...winner,
    channelId: winner.channelId ?? loser.channelId ?? null,
    queueTab: winner.queueTab ?? loser.queueTab,
  };
}

/**
 * Colapsa lista flat (páginas + SSE): id repetido e mesmo
 * contato+plataforma viram um único card.
 */
export function collapseInboxCardRows(
  flat: ConversationListRow[],
): ConversationListRow[] {
  const byGroup = new Map<string, ConversationListRow>();
  for (const row of flat) {
    if (!row?.id) continue;
    const key = inboxCardGroupKey(row);
    const prev = byGroup.get(key);
    byGroup.set(key, prev ? preferInboxCardRow(prev, row) : row);
  }
  return [...byGroup.values()];
}

/**
 * Responsável do card depois do merge. `patch.assignedTo` ausente só herda o
 * objeto anterior quando o responsável NÃO mudou: com outro `assignedToId`,
 * herdar pintava o card com o nome de quem não atende mais (e o diálogo
 * "Transferir conversa" marcava o antigo como "(atual)").
 */
function mergedAssignedTo(
  prev: ConversationListRow,
  patch: ConversationListRow,
): ConversationListRow["assignedTo"] {
  if (patch.assignedToId === null) return null;
  if (patch.assignedTo) return patch.assignedTo;
  if (
    patch.assignedToId !== undefined &&
    patch.assignedToId !== prev.assignedTo?.id
  ) {
    return null;
  }
  return prev.assignedTo;
}

/** Prévia sem nada para mostrar (sem texto, tipo nem mídia). */
function isBlankPreview(
  p: { content?: string | null; messageType?: string | null; mediaUrl?: string | null } | null | undefined,
): boolean {
  if (!p) return true;
  return !p.content?.trim() && !p.messageType && !p.mediaUrl;
}

/**
 * Campos da última mensagem e contador que um patch sem eles não pode zerar.
 * Evento de transferência/atribuição e snapshot do barramento trazem
 * `null`/vazio nesses campos quando o publicador não os conhece — e o spread
 * simples apagava a prévia e a hora do item da lista até a próxima mensagem.
 * Um valor presente (inclusive `unreadCount: 0`) continua valendo.
 */
function keepLastMessageFields(
  prev: ConversationListRow,
  patch: ConversationListRow,
): Partial<ConversationListRow> {
  const keep: Partial<ConversationListRow> = {};
  if (patch.lastMessagePreview == null || isBlankPreview(patch.lastMessagePreview)) {
    if (prev.lastMessagePreview != null) keep.lastMessagePreview = prev.lastMessagePreview;
  }
  if (patch.lastMessage == null || !patch.lastMessage.preview?.trim()) {
    if (prev.lastMessage != null) keep.lastMessage = prev.lastMessage;
  }
  if (patch.lastInboundPreview == null || isBlankPreview(patch.lastInboundPreview)) {
    if (prev.lastInboundPreview != null) keep.lastInboundPreview = prev.lastInboundPreview;
  }
  if (patch.lastMessageAt == null && prev.lastMessageAt != null) {
    keep.lastMessageAt = prev.lastMessageAt;
  }
  if (patch.lastMessageDirection == null && prev.lastMessageDirection != null) {
    keep.lastMessageDirection = prev.lastMessageDirection;
  }
  if (patch.lastInboundAt == null && prev.lastInboundAt != null) {
    keep.lastInboundAt = prev.lastInboundAt;
  }
  if (patch.unreadCount == null && prev.unreadCount != null) {
    keep.unreadCount = prev.unreadCount;
  }
  return keep;
}

/**
 * Merge de patch SSE/outbound: não apaga channelId com `undefined` nem a
 * prévia/hora/não lidas com `null`/vazio (ver `keepLastMessageFields`).
 */
export function mergeInboxCardRow(
  prev: ConversationListRow,
  patch: ConversationListRow,
): ConversationListRow {
  return {
    ...prev,
    ...patch,
    ...keepLastMessageFields(prev, patch),
    channelId: patch.channelId ?? prev.channelId ?? null,
    contact: patch.contact ?? prev.contact,
    assignedTo: mergedAssignedTo(prev, patch),
  };
}
