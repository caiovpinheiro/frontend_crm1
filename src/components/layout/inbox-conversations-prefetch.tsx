"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { readInboxViewForPrefetch } from "@/features/inbox-v2/hooks/use-inbox-filters-url-sync";
import {
  inboxListServerFilters,
  prefetchInboxWarmCache,
} from "@/features/inbox-v2/hooks/use-conversations";

/**
 * Aquece a lista do Inbox depois do idle, para não competir com o
 * first paint da rota atual (dashboard, pipeline…). No /inbox a própria
 * página busca — prefetch aqui seria duplicata.
 */
export function InboxConversationsPrefetch() {
  const { status } = useSession();
  const pathname = usePathname() ?? "";
  const queryClient = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (pathname.startsWith("/inbox")) return;

    let idleId = 0;
    let timeoutId = 0;
    let cancelled = false;

    const run = () => {
      if (cancelled || started.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      started.current = true;
      const view = readInboxViewForPrefetch();
      void prefetchInboxWarmCache(
        queryClient,
        view.tab,
        inboxListServerFilters(view.filters),
      );
    };

    const schedule = () => {
      if (started.current || cancelled) return;
      // Early-return evita narrowing de `window` para `never` no else
      // (`typeof window !== "undefined" && "x" in window` quebra o tsc).
      if (typeof window === "undefined") return;
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(run, { timeout: 2_500 });
      } else {
        timeoutId = window.setTimeout(run, 1_500);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };

    if (typeof document === "undefined" || document.visibilityState === "visible") {
      schedule();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (idleId && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [status, queryClient, pathname]);

  return null;
}
