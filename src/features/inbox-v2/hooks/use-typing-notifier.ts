"use client";

/*
 * Liga o Composer ao indicador "digitando…" com throttle (ver
 * `api/typing.ts`). Um notificador por conversa: trocar de conversa cria
 * outro (relógio zerado), então o primeiro caractere na conversa nova
 * dispara na hora. Sem refs — nada é lido durante o render.
 */

import { useCallback, useMemo } from "react";

import {
  createTypingNotifier,
  sendTypingIndicator,
} from "@/features/inbox-v2/api/typing";

/**
 * Devolve `notify(text)`. Sem conversa (ou `enabled=false`, ex.: nota
 * interna) não dispara nada.
 */
export function useTypingNotifier(
  conversationId: string | null,
  enabled = true,
): (text: string) => void {
  const notifier = useMemo(
    () =>
      createTypingNotifier({
        send: () => {
          if (conversationId) sendTypingIndicator(conversationId);
        },
      }),
    [conversationId],
  );

  return useCallback(
    (text: string) => {
      if (!enabled || !conversationId) return;
      notifier.notify(text);
    },
    [enabled, conversationId, notifier],
  );
}
