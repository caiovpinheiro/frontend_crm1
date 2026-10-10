"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { InboxTab } from "../api";
import { refreshInboxLists } from "./inbox-list-refresh";

/**
 * Refetch da lista + contagens das filas: botão "atualizar" da coluna e
 * contagens ao trocar de aba. Só as queries montadas; a lista só pela 1ª
 * página (`refreshInboxLists`) — antes refazia todas as listas em cache,
 * todas as páginas.
 */
export function useInboxQueueRefresh(params: {
  tab: InboxTab[];
  canFetchInbox: boolean;
  tabHydrated: boolean;
  filtersHydrated: boolean;
}) {
  const { tab, canFetchInbox, tabHydrated, filtersHydrated } = params;
  const qc = useQueryClient();

  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const prevTabKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canFetchInbox || !tabHydrated || !filtersHydrated) return;
    const key = tab.join(",");
    if (prevTabKeyRef.current === null) {
      prevTabKeyRef.current = key;
      return;
    }
    if (prevTabKeyRef.current === key) return;
    prevTabKeyRef.current = key;
    void qc.refetchQueries({ queryKey: ["conversations", "tab-counts"], type: "active" });
  }, [tab, canFetchInbox, tabHydrated, filtersHydrated, qc]);
  const refreshInboxQueue = async () => {
    if (inboxRefreshing) return;
    setInboxRefreshing(true);
    try {
      await Promise.all([
        refreshInboxLists(qc),
        qc.refetchQueries({ queryKey: ["conversations", "tab-counts"], type: "active" }),
      ]);
    } finally {
      setInboxRefreshing(false);
    }
  };

  return { inboxRefreshing, refreshInboxQueue };
}
