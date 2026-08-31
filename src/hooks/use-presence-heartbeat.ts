"use client";

import { apiUrl } from "@/lib/api";
import { useEffect, useRef } from "react";

/**
 * Intervalo mínimo entre pings — evita fila no pool HTTP do navegador
 * (6 conexões/host). Também blindado contra duplicidade caso o hook
 * seja montado por engano em mais de um lugar (o app shell é único).
 */
const MIN_PING_GAP_MS = 8_000;

/**
 * Envia um ping para `/api/agents/me/ping` a cada `intervalMs` (default 90s).
 *
 * Diferente da versão anterior, o timer roda tanto com a aba visível
 * quanto em segundo plano — o navegador pode throttlar `setInterval`
 * em abas ocultas (~1 ping/min), o que ainda cabe na tolerância do
 * sweeper (`SYSTEM_PRESENCE_STALE_MS = 150s`). Quando a aba volta ao
 * foco/visibilidade, dispara um ping imediato para reidratar a
 * presença sem esperar o próximo tick.
 *
 * Falhas são silenciadas — presença é best-effort.
 */
export function usePresenceHeartbeat(options?: {
  intervalMs?: number;
  enabled?: boolean;
}) {
  const { intervalMs = 90_000, enabled = true } = options ?? {};
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const lastPingAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    async function ping() {
      const now = Date.now();
      if (inFlightRef.current) return;
      if (now - lastPingAtRef.current < MIN_PING_GAP_MS) return;

      inFlightRef.current = true;
      lastPingAtRef.current = now;
      try {
        await fetch(apiUrl("/api/agents/me/ping"), {
          method: "POST",
          credentials: "include",
          keepalive: true,
        });
      } catch {
        // silenciado de propósito
      } finally {
        inFlightRef.current = false;
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
