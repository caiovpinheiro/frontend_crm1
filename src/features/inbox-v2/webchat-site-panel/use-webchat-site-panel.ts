"use client";

/*
 * Dados do painel "No site agora" da conversa aberta: um GET (último estado
 * + eventos recentes, com checagem de acesso à conversa no backend). Os
 * eventos SSE `webchat_context` / `webchat_event` são só sinais (sem
 * valores do site): quando o sinal é do contato/canal deste painel, o GET é
 * refeito — agrupado numa janela curta para um lote de eventos não virar
 * uma rajada de requisições. Na reconexão do SSE o GET também é refeito.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { subscribeSSEEvents } from "@/hooks/use-sse";
import { realtimeHandlers } from "@/lib/realtime-contract";

import { getWebchatSitePanel, isWebchatPanelSignal, type WebchatSitePanelData } from "./model";

export const webchatSitePanelKey = (conversationId: string) =>
  ["inbox", "webchat-site-panel", conversationId] as const;

/** Janela de agrupamento dos sinais antes de refazer o GET. */
export const WEBCHAT_PANEL_REFETCH_DEBOUNCE_MS = 400;

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
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      void qc.invalidateQueries({ queryKey: key });
    };
    const onSignal = (ev: { contactId?: unknown; channelId?: unknown }) => {
      if (!isWebchatPanelSignal(qc.getQueryData<WebchatSitePanelData>(key), ev)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refetch();
      }, WEBCHAT_PANEL_REFETCH_DEBOUNCE_MS);
    };
    const unsubscribe = subscribeSSEEvents(
      "/api/sse/messages",
      realtimeHandlers({
        webchat_context: onSignal,
        webchat_event: onSignal,
      }),
      refetch,
    );
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [conversationId, qc]);

  return query;
}
