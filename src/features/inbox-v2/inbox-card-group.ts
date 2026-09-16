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

/** Merge de patch SSE/outbound: não apaga channelId com `undefined`. */
export function mergeInboxCardRow(
  prev: ConversationListRow,
  patch: ConversationListRow,
): ConversationListRow {
  return {
    ...prev,
    ...patch,
    channelId: patch.channelId ?? prev.channelId ?? null,
    contact: patch.contact ?? prev.contact,
    assignedTo:
      patch.assignedToId === null
        ? null
        : (patch.assignedTo ?? prev.assignedTo),
  };
}
