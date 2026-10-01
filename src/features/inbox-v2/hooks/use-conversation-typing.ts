"use client";

/*
 * "digitando…" no cabeçalho do chat — evento SSE `typing` do backend
 * (contrato em `src/lib/sse-bus.ts` do backend):
 *   { conversationId, contactId, userId, userName, source, until }
 * Publicado por `POST /api/conversations/:id/typing` (outro agente da
 * conversa; o throttle de 3s é do servidor). O indicador some quando
 * `until` passa (até 5s por evento) e não aparece para o próprio
 * `userId` — quem digita já sabe.
 */

import { useEffect, useRef, useState } from "react";

import { subscribeSSEEvents } from "@/hooks/use-sse";

/** Teto por evento: `until` inválido (ou no futuro distante) cai aqui. */
export const TYPING_HINT_MAX_MS = 5_000;

export type TypingEvent = {
  conversationId?: string;
  contactId?: string | null;
  userId?: string | null;
  userName?: string | null;
  source?: "agent" | "contact";
  until?: string;
};

/** Quanto tempo mostrar a partir de `now` (0 = já expirou). */
export function typingHintTtlMs(until: string | undefined, now = Date.now()): number {
  const t = until ? Date.parse(until) : Number.NaN;
  if (Number.isNaN(t)) return TYPING_HINT_MAX_MS;
  return Math.max(0, Math.min(TYPING_HINT_MAX_MS, t - now));
}

/** "Ana está digitando…" / "digitando…" (sem nome). */
export function typingHintLabel(userName: string | null | undefined): string {
  const first = (userName ?? "").trim().split(/\s+/)[0];
  return first ? `${first} está digitando…` : "digitando…";
}

/**
 * Devolve o texto do indicador para a conversa aberta, ou `null`. `selfId`
 * é o usuário logado (os próprios eventos são ignorados).
 */
export function useConversationTyping(
  conversationId: string | null,
  selfId: string | null,
): string | null {
  // O texto guarda a conversa a que pertence: trocar de conversa esconde
  // o indicador da anterior sem precisar de um setState no efeito.
  const [hint, setHint] = useState<{ conversationId: string; label: string } | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    const clear = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };

    const unsubscribe = subscribeSSEEvents("/api/sse/messages", {
      typing: (raw: unknown) => {
        const ev = (raw ?? {}) as TypingEvent;
        if (ev.conversationId !== conversationId) return;
        if (ev.userId && ev.userId === selfId) return;
        const ttl = typingHintTtlMs(ev.until);
        clear();
        if (ttl <= 0) {
          setHint(null);
          return;
        }
        setHint({ conversationId, label: typingHintLabel(ev.userName) });
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setHint(null);
        }, ttl);
      },
    });

    return () => {
      clear();
      unsubscribe();
    };
  }, [conversationId, selfId]);

  return hint && hint.conversationId === conversationId ? hint.label : null;
}
