import type { ConversationListRow } from "./api";
import { inboxQueueSectionPriority } from "./inbox-queue-tab";

/**
 * Agrupamento do card na inbox: 1 por contato + plataforma + conta (WABA).
 * Espelha `inboxCardGroupKey` do backend.
 *
 * Snapshot SSE antigo omitia `channelId` → chave `::` vs `::wabaId` e o
 * mesmo contato aparecia em dois cards. Órfã (channelId vazio) colapsa
 * com a conta preenchida no mesmo contato+plataforma.
 */

function activityTs(r: ConversationListRow) {
  return new Date(r.lastMessageAt ?? r.lastInboundAt ?? r.updatedAt ?? 0).getTime();
}

function channelKey(c: ConversationListRow["channel"]) {
  return typeof c === "string" ? c : JSON.stringify(c ?? "");
}

export function inboxCardGroupKey(r: ConversationListRow): string {
  return r.contact?.id
    ? `c:${r.contact.id}::${channelKey(r.channel)}::${r.channelId ?? ""}`
    : `id:${r.id}`;
}

function softGroupKey(r: ConversationListRow): string {
  return r.contact?.id
    ? `c:${r.contact.id}::${channelKey(r.channel)}`
    : `id:${r.id}`;
}

/** Mesmo card visual? Conta igual, ou uma das duas ainda sem channelId. */
export function sameInboxCardGroup(
  a: ConversationListRow,
  b: ConversationListRow,
): boolean {
  if (a.id === b.id) return true;
  if (a.number != null && b.number != null && a.number === b.number) return true;
  if (!a.contact?.id || !b.contact?.id) return false;
  if (a.contact.id !== b.contact.id) return false;
  if (channelKey(a.channel) !== channelKey(b.channel)) return false;
  if (!a.channelId || !b.channelId) return true;
  return a.channelId === b.channelId;
}

export function preferInboxCardRow(
  a: ConversationListRow,
  b: ConversationListRow,
): ConversationListRow {
  const aPri = inboxQueueSectionPriority(a.queueTab ?? undefined);
  const bPri = inboxQueueSectionPriority(b.queueTab ?? undefined);
  let winner = bPri < aPri ? b : aPri < bPri ? a : activityTs(b) >= activityTs(a) ? b : a;
  const loser = winner.id === a.id ? b : a;
  return {
    ...winner,
    channelId: winner.channelId ?? loser.channelId ?? null,
    queueTab: winner.queueTab ?? loser.queueTab,
  };
}

/**
 * Colapsa lista flat (páginas + SSE): id repetido, mesmo grupo, e órfã
 * (sem channelId) com ticket da mesma conta/plataforma.
 */
export function collapseInboxCardRows(
  flat: ConversationListRow[],
): ConversationListRow[] {
  const byExact = new Map<string, ConversationListRow>();
  for (const row of flat) {
    if (!row?.id) continue;
    const key = inboxCardGroupKey(row);
    const prev = byExact.get(key);
    byExact.set(key, prev ? preferInboxCardRow(prev, row) : row);
  }

  const rows = [...byExact.values()];
  const bySoft = new Map<string, ConversationListRow[]>();
  for (const row of rows) {
    const soft = softGroupKey(row);
    const list = bySoft.get(soft) ?? [];
    list.push(row);
    bySoft.set(soft, list);
  }

  const out: ConversationListRow[] = [];
  for (const group of bySoft.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    const withAccount: ConversationListRow[] = [];
    const orphans: ConversationListRow[] = [];
    for (const r of group) {
      if (r.channelId) withAccount.push(r);
      else orphans.push(r);
    }
    if (withAccount.length === 0) {
      out.push(orphans.reduce((a, b) => preferInboxCardRow(a, b)));
      continue;
    }
    // Duas contas reais (channelIds distintos) → mantém ambas.
    const byAccount = new Map<string, ConversationListRow>();
    for (const r of withAccount) {
      const prev = byAccount.get(r.channelId!);
      byAccount.set(
        r.channelId!,
        prev ? preferInboxCardRow(prev, r) : r,
      );
    }
    let accounts = [...byAccount.values()];
    for (const orphan of orphans) {
      const target = accounts.reduce((a, b) => preferInboxCardRow(a, b));
      const merged = preferInboxCardRow(target, orphan);
      accounts = accounts.map((a) =>
        a.channelId === target.channelId ? merged : a,
      );
    }
    out.push(...accounts);
  }
  return out;
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
