"use client";

/**
 * "Modo sem tempo real" (`superseded` no SSE — ver `use-sse.ts`).
 *
 * O servidor fechou a conexão desta aba (ou da líder do navegador) porque
 * o usuário passou de 3 conexões. Reconectar sozinha derrubaria outra;
 * então, enquanto pausada:
 *   - as queries ativas são refeitas ao focar a janela e a cada 60 s
 *     (só com a aba visível — oculta não tem quem olhe);
 *   - um aviso discreto oferece "reconectar" (que pode derrubar outra
 *     conexão do usuário — é escolha dele).
 */

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { IconPlugConnectedX, IconRefresh } from "@tabler/icons-react";
import { useEffect } from "react";

import { resumeSSE, useSSEPaused } from "@/hooks/use-sse";

export const REALTIME_PAUSED_REFETCH_MS = 60_000;
const SSE_URL = "/api/sse/messages";

/**
 * Liga o refetch de segurança enquanto `paused`. Devolve o desligamento.
 * Separado do componente para o teste (sem DOM de React).
 */
export function startPausedRefetch(
  client: Pick<QueryClient, "refetchQueries">,
  env: {
    isVisible: () => boolean;
    onFocus: (fn: () => void) => () => void;
    setInterval: (fn: () => void, ms: number) => () => void;
  },
): () => void {
  const refetch = () => {
    if (!env.isVisible()) return;
    void client.refetchQueries({ type: "active" });
  };
  const offFocus = env.onFocus(refetch);
  const offInterval = env.setInterval(refetch, REALTIME_PAUSED_REFETCH_MS);
  return () => {
    offFocus();
    offInterval();
  };
}

function browserEnv() {
  return {
    isVisible: () => document.visibilityState === "visible",
    onFocus: (fn: () => void) => {
      const onVisibility = () => {
        if (document.visibilityState === "visible") fn();
      };
      window.addEventListener("focus", fn);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        window.removeEventListener("focus", fn);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    },
    setInterval: (fn: () => void, ms: number) => {
      const id = window.setInterval(fn, ms);
      return () => window.clearInterval(id);
    },
  };
}

export function RealtimePausedNotice() {
  const paused = useSSEPaused(SSE_URL);
  const client = useQueryClient();

  useEffect(() => {
    if (!paused) return;
    return startPausedRefetch(client, browserEnv());
  }, [paused, client]);

  if (!paused) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-1.5 text-xs text-[var(--text-muted)] shadow-sm backdrop-blur max-md:bottom-20"
    >
      <IconPlugConnectedX className="size-3.5 shrink-0" aria-hidden />
      <span>Tempo real pausado nesta aba</span>
      <span aria-hidden>—</span>
      <button
        type="button"
        onClick={() => resumeSSE(SSE_URL)}
        className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
      >
        <IconRefresh className="size-3.5" aria-hidden />
        reconectar
      </button>
    </div>
  );
}
