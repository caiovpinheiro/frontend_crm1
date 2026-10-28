"use client";

/*
 * Dados do painel "No site agora" da conversa aberta: um GET (último estado
 * + eventos recentes) e, ao vivo, os eventos SSE `webchat_context` /
 * `webchat_event` aplicados no cache — nada é reprocessado. Na reconexão do
 * SSE o GET é refeito (pode ter perdido eventos no meio).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { subscribeSSEEvents } from "@/hooks/use-sse";
import { realtimeHandlers } from "@/lib/realtime-contract";

import {
  applyWebchatContextEvent,
  applyWebchatSiteEvent,
  getWebchatSitePanel,
  type WebchatSitePanelData,
} from "./model";

export const webchatSitePanelKey = (conversationId: string) =>
  ["inbox", "webchat-site-panel", conversationId] as const;

export function useWebchatSitePanel(conversationId: string | null) {
  const qc = useQueryClient();
  const query = useQuery<WebchatSitePanelData>({
    queryKey: webchatSitePanelKey(conversationId ?? ""),
    queryFn: () => getWebchatSitePanel(conversationId as string),
    enabled: !!conversationId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!conversationId) return;
    const key = webchatSitePanelKey(conversationId);
    const update = (fn: (prev: WebchatSitePanelData) => WebchatSitePanelData) =>
      qc.setQueryData<WebchatSitePanelData>(key, (prev) => (prev ? fn(prev) : prev));
    return subscribeSSEEvents(
      "/api/sse/messages",
      realtimeHandlers({
        webchat_context: (ev) => update((prev) => applyWebchatContextEvent(prev, ev)),
        webchat_event: (ev) => update((prev) => applyWebchatSiteEvent(prev, ev)),
      }),
      () => {
        void qc.invalidateQueries({ queryKey: key });
      },
    );
  }, [conversationId, qc]);

  return query;
}
