"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { InboxTab } from "../api";

/**
 * Refetch da lista + contagens das filas: botão "atualizar" da coluna e
 * contagens ao trocar de aba.
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
    void qc.refetchQueries({ queryKey: ["conversations", "tab-counts"] });
  }, [tab, canFetchInbox, tabHydrated, filtersHydrated, qc]);
  const refreshInboxQueue = async () => {
    if (inboxRefreshing) return;
    setInboxRefreshing(true);
    try {
      await Promise.all([
        qc.refetchQueries({ queryKey: ["inbox-conversations"] }),
        qc.refetchQueries({ queryKey: ["conversations", "tab-counts"] }),
      ]);
    } finally {
      setInboxRefreshing(false);
    }
  };

  return { inboxRefreshing, refreshInboxQueue };
}
