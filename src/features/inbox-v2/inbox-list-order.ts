/**
 * Ordem e cards da lista de conversas do Inbox (host `app/(app)/inbox`).
 *
 * Puro: a página da Inbox e os testes da lista usam as mesmas funções.
 */
import type { Conversation } from "@/components/crm/conversation-card";
import {
  compareMessageActivity,
  messageActivityTimestamp,
} from "@/lib/message-activity-sort";

import { toConversationCard } from "./adapters";
import type { ConversationListRow, InboxTab } from "./api";
import { inboxCardGroupKey } from "./inbox-card-group";
import { inboxQueueSectionFor } from "./inbox-queue-tab";

export type InboxListSortOptions = {
  /** `filters.sortBy` da URL. Padrão: última atividade. */
  by?: string;
  order?: "asc" | "desc";
  /**
   * Página de origem de cada card (`useConversations().listTiers`): a
   * página N entra depois das anteriores — anexar não reordena o que já
   * está na tela.
   */
  tiers?: ReadonlyMap<string, number>;
};

/**
 * Ordena pela última mensagem (`lastMessageAt`, fallback `lastInboundAt`)
 * — nunca `updatedAt` nem a criação do lead. `unreadCount` desempata pela
 * atividade.
 */
export function sortInboxListRows(
  rows: readonly ConversationListRow[],
  opts: InboxListSortOptions = {},
): ConversationListRow[] {
  const by = opts.by ?? "lastInboundAt";
  const order = (opts.order ?? "desc") === "asc" ? "asc" : "desc";
  const ts = (r: ConversationListRow) =>
    messageActivityTimestamp(r.lastMessageAt, r.lastInboundAt);
  const tier = (r: ConversationListRow) => opts.tiers?.get(r.id) ?? 0;
  return [...rows].sort((a, b) => {
    const byTier = tier(a) - tier(b);
    if (byTier !== 0) return byTier;
    if (by === "unreadCount") {
      const d = (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      return d !== 0 ? d : compareMessageActivity(ts(a), ts(b), "desc");
    }
    return compareMessageActivity(ts(a), ts(b), order);
  });
}

/**
 * Linhas → cards da coluna, com a seção (fila) de cada um e a chave da
 * linha pelo grupo contato+canal: ticket mais novo do mesmo contato
 * (página posterior, reabertura) troca o conteúdo do card sem remontá-lo.
 */
export function toInboxListCards(
  rows: readonly ConversationListRow[],
  opts: { tab: readonly InboxTab[]; activeId?: string | null },
): Conversation[] {
  const seen = new Set<string>();
  return rows.filter(Boolean).map((r) => {
    const group = inboxCardGroupKey(r);
    const rowKey = seen.has(group) ? `id:${r.id}` : group;
    seen.add(rowKey);
    return {
      ...toConversationCard(r, { active: r.id === opts.activeId }),
      queueTab:
        r.queueTab && opts.tab.includes(r.queueTab)
          ? r.queueTab
          : inboxQueueSectionFor(r, opts.tab),
      rowKey,
    };
  });
}
