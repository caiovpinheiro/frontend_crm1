"use client";

import { useEffect } from "react";

import { acquirePresenceTicker } from "@/hooks/presence-ticker";

/**
 * Presença de uso ("CRM aberto"): liga o tique de `presence-ticker.ts`
 * enquanto o shell autenticado estiver montado.
 *
 * O ping (`POST /api/agents/me/ping`) sai só da aba líder do navegador, a
 * cada 90 s e nunca a menos de 45 s do anterior — com várias abas abertas
 * é UM ping por janela, não um por aba. O activity agregado vai no mesmo
 * tique (`useSystemActivity`).
 *
 * Falhas são silenciadas — presença é best-effort.
 */
export function usePresenceHeartbeat(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    return acquirePresenceTicker();
  }, [enabled]);
}
