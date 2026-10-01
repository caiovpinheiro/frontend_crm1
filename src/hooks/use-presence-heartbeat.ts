"use client";

import { apiUrl } from "@/lib/api";
import {
  createPresencePingGate,
  PRESENCE_PING_MIN_GAP_MS,
  type PresencePingGate,
} from "@/lib/presence-ping-gate";
import { useEffect, useRef } from "react";

/**
 * Envia um ping para `/api/agents/me/ping` a cada `intervalMs` (default 90s).
 *
 * O timer roda tanto com a aba visível quanto em segundo plano — o
 * navegador pode throttlar `setInterval` em abas ocultas (~1 ping/min), o
 * que ainda cabe na tolerância do sweeper (`SYSTEM_PRESENCE_STALE_MS =
 * 150s`). Quando a aba volta ao foco/visibilidade, dispara um ping para
 * reidratar a presença sem esperar o próximo tick — mas só se o último
 * saiu há mais de `PRESENCE_PING_MIN_GAP_MS` (45 s): alternar entre abas
 * a cada poucos segundos não vira rajada de pings (SS-3).
 *
 * Falhas são silenciadas — presença é best-effort.
 */
export function usePresenceHeartbeat(options?: {
  intervalMs?: number;
  enabled?: boolean;
}) {
  const { intervalMs = 90_000, enabled = true } = options ?? {};
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Sobrevive a re-execuções do effect: trocar `intervalMs` não zera o gap.
  const gateRef = useRef<PresencePingGate | null>(null);
  gateRef.current ??= createPresencePingGate(PRESENCE_PING_MIN_GAP_MS);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const gate = gateRef.current!;

    async function ping() {
      if (!gate.begin(Date.now())) return;
      try {
        await fetch(apiUrl("/api/agents/me/ping"), {
          method: "POST",
          credentials: "include",
          keepalive: true,
        });
      } catch {
        // silenciado de propósito
      } finally {
        gate.end();
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void ping();
      }
    }

    function onFocus() {
      void ping();
    }

    void ping();
    timerRef.current = setInterval(() => void ping(), intervalMs);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [intervalMs, enabled]);
}
