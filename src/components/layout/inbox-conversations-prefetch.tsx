"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { readInboxViewForPrefetch } from "@/features/inbox-v2/hooks/use-inbox-filters-url-sync";
import {
  inboxListServerFilters,
  prefetchInboxWarmCache,
} from "@/features/inbox-v2/hooks/use-conversations";

/**
 * Aquece a lista do Inbox enquanto o operador está em outra rota
 * (dashboard, pipeline…). No /inbox a query reaproveita o cache.
 */
export function InboxConversationsPrefetch() {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") return;

    const run = () => {
      if (started.current) return;
      if (document.visibilityState !== "visible") return;
      started.current = true;
      const view = readInboxViewForPrefetch();
      void prefetchInboxWarmCache(
        queryClient,
        view.tab,
        inboxListServerFilters(view.filters),
      );
    };

    run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, [status, queryClient]);

  return null;
}
