"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";
import { useSSEConnected } from "@/hooks/use-sse";

import { refreshInboxLists } from "./inbox-list-refresh";

/** Intervalo do poll de segurança da lista e dos contadores. */
export const INBOX_SAFETY_POLL_MS = 90_000;

/**
 * Poll de segurança da lista do Inbox e dos contadores das filas (N-MA-1).
 *
 * A lista e os contadores não têm timer: o SSE os mantém em dia. Com o SSE
 * fora (queda, despejo, 429, stream parado detectado pelo vigia em
 * `use-sse.ts`) eles congelavam até a reconexão. Aqui, só com a aba
 * VISÍVEL e o SSE desconectado, a cada 90s: 1ª página da lista
 * (`refreshInboxLists`) e contadores ativos. Conectado ou em segundo
 * plano, não faz nada.
 */
export function useInboxSafetyPoll(enabled: boolean) {
  const qc = useQueryClient();
  const connected = useSSEConnected();
  const visible = useDocumentVisible();

  useEffect(() => {
    if (!enabled || connected || !visible) return;
    const timer = setInterval(() => {
      void refreshInboxLists(qc);
      void qc.invalidateQueries({
        queryKey: ["conversations", "tab-counts"],
        refetchType: "active",
      });
    }, INBOX_SAFETY_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, connected, visible, qc]);
}
