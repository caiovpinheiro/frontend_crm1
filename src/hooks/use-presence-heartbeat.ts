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
 * Envia um ping para `/api/agents/me/ping` a cada `intervalMs` (default 180s)
 * enquanto a aba estiver visível.
 *
 * Com `document.hidden`, o timer pausa — presença de uso só conta CRM
 * em primeiro plano. Quando a aba volta ao foco/visibilidade, dispara
 * um ping imediato para reidratar a presença sem esperar o próximo tick.
 *
 * Tolerância do sweeper: `SYSTEM_PRESENCE_STALE_MS = 300s`.
 *
 * Falhas são silenciadas — presença é best-effort.
 */
export function usePresenceHeartbeat(options?: {
  intervalMs?: number;
  enabled?: boolean;
}) {
  const { intervalMs = 180_000, enabled = true } = options ?? {};
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const lastPingAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    async function ping() {
      if (typeof document !== "undefined" && document.hidden) return;
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

    function clearTimer() {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    function startTimer() {
      clearTimer();
      timerRef.current = setInterval(() => void ping(), intervalMs);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void ping();
        startTimer();
      } else {
        clearTimer();
      }
    }

    function onFocus() {
      if (!document.hidden) void ping();
    }

    if (!document.hidden) {
      void ping();
      startTimer();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      clearTimer();
    };
  }, [intervalMs, enabled]);
}
