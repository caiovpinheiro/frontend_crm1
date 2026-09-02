"use client";

import type { QueryClient } from "@tanstack/react-query";

import { hasInboxServerFilters, type ConversationListRow, type InboxFilters, type InboxTab } from "../api";
import { inboxQueueTabFor, rowBelongsToInboxTab, rowStaysOnAutomacaoTab } from "../inbox-queue-tab";

/**
 * Após um envio outbound o HAR (31/ago/26) mostrou GET lista 56KB +
 * counts=1 no onSuccess — redundante com o patch SSE de `new_message`.
 * Atualiza o card cacheado e move Entrada/Aguardando → Respondidas sem
 * refetch. Sem row no cache: no-op (o SSE insere se a aba precisar).
 */

type InboxListPage = {
  items?: ConversationListRow[];
  total?: number;
};

type InboxListCache = {
  pages?: InboxListPage[];
};

function conversationMatchesId(
  row: ConversationListRow | undefined,
  conversationId: string,
): boolean {
  if (!row) return false;
  if (row.id === conversationId) return true;
  return row.number != null && String(row.number) === conversationId;
}

function inboxTabFromQueryKey(queryKey: readonly unknown[]): InboxTab | null {
  if (queryKey[0] !== "inbox-conversations") return null;
  const tab = queryKey[1];
  return typeof tab === "string" ? (tab as InboxTab) : null;
}

function inboxFiltersFromQueryKey(
  queryKey: readonly unknown[],
): InboxFilters | undefined {
  const raw = queryKey[2];
  return raw && typeof raw === "object" ? (raw as InboxFilters) : undefined;
}

function inboxSearchFromQueryKey(queryKey: readonly unknown[]): string {
  const raw = queryKey[3];
  return typeof raw === "string" ? raw.trim() : "";
}

function bumpPageTotals(pages: InboxListPage[], delta: number): InboxListPage[] {
  if (delta === 0) return pages;
  return pages.map((page) =>
    typeof page.total === "number"
      ? { ...page, total: Math.max(0, page.total + delta) }
      : page,
  );
}

function findCachedConversationRow(
  qc: QueryClient,
  conversationId: string,
): ConversationListRow | null {
  const entries = qc.getQueriesData<InboxListCache>({
    queryKey: ["inbox-conversations"],
  });
  for (const [, cached] of entries) {
    for (const page of cached?.pages ?? []) {
      const hit = page?.items?.find((c) =>
        conversationMatchesId(c, conversationId),
      );
      if (hit) return hit;
    }
  }
  return null;
}

export function applyOutboundPreviewToInboxCaches(
  qc: QueryClient,
  conversationId: string | null | undefined,
  preview?: {
    content?: string | null;
    messageType?: string | null;
    timestamp?: string | null;
  },
): void {
  if (!conversationId) return;
  const existing = findCachedConversationRow(qc, conversationId);
  if (!existing) return;

  const ts =
    typeof preview?.timestamp === "string" && preview.timestamp
      ? preview.timestamp
      : new Date().toISOString();
  const content = typeof preview?.content === "string" ? preview.content : "";
  const next: ConversationListRow = {
    ...existing,
    lastMessageAt: ts,
    updatedAt: ts,
    lastMessageDirection: "out",
    lastMessagePreview: {
      content,
      messageType: preview?.messageType ?? "",
      mediaUrl: null,
      direction: "out",
      sendStatus: "sent",
      sendError: null,
    },
    ...(existing.lastMessage
      ? {
          lastMessage: {
            ...existing.lastMessage,
            preview: content,
            direction: "out",
          },
        }
      : {}),
  };
  const prevTab = inboxQueueTabFor(existing);
  const nextTab = inboxQueueTabFor(next);

  const entries = qc.getQueriesData<InboxListCache>({
    queryKey: ["inbox-conversations"],
  });
  for (const [queryKey, cached] of entries) {
    if (!cached?.pages) continue;
    const tab = inboxTabFromQueryKey(queryKey);
    if (!tab) continue;

    let found = false;
    const pagesAfterPatch = cached.pages.map((page) => {
      const items = page?.items;
      if (!items) return page;
      const idx = items.findIndex((c) =>
        conversationMatchesId(c, conversationId),
      );
      if (idx < 0) return page;
      found = true;
      const nextItems = items.slice();
      nextItems[idx] = { ...items[idx], ...next };
      return { ...page, items: nextItems };
    });

    const belongs =
      tab === "automacao"
        ? found && rowStaysOnAutomacaoTab(next)
        : rowBelongsToInboxTab(next, tab);

    if (found && belongs) {
      qc.setQueryData(queryKey, { ...cached, pages: pagesAfterPatch });
      continue;
    }

    if (found && !belongs) {
      const pages = pagesAfterPatch.map((page) => {
        const items = page?.items;
        if (!items?.length) return page;
        const nextItems = items.filter(
          (c) => !conversationMatchesId(c, conversationId),
        );
        if (nextItems.length === items.length) return page;
        return { ...page, items: nextItems };
      });
      qc.setQueryData(queryKey, {
        ...cached,
        pages: bumpPageTotals(pages, -1),
      });
      continue;
    }

    if (!found && belongs) {
      if (inboxSearchFromQueryKey(queryKey)) continue;
      if (hasInboxServerFilters(inboxFiltersFromQueryKey(queryKey))) continue;
      const pages = cached.pages.slice();
      const first = pages[0] ?? { items: [] };
      pages[0] = {
        ...first,
        items: [next, ...(first.items ?? [])],
      };
      qc.setQueryData(queryKey, {
        ...cached,
        pages: bumpPageTotals(pages, 1),
      });
    }
  }

  if (prevTab !== nextTab) {
    void qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
  }
}
