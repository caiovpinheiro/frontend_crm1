"use client";

import { useEffect } from "react";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { isStaleChunkError, reloadOnceForStaleChunk } from "@/lib/stale-chunk-error";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error.message, error.digest ?? "");
    if (reloadOnceForStaleChunk(error)) return;
    if (isStaleChunkError(error)) return;
    try {
      // Sempre tenta `reset()` (1º F5 some o card). Só para se o mesmo
      // erro voltar em loop no mesmo load — a janela de 8s fazia o
      // 2º F5 / hard refresh mostrar "Algo deu errado" à toa.
      const now = Date.now();
      const started = Number(sessionStorage.getItem("crm-app-error-burst") || 0);
      const count = Number(sessionStorage.getItem("crm-app-error-count") || 0);
      const burst = now - started < 2_000 ? count : 0;
      if (burst >= 2) return;
      sessionStorage.setItem("crm-app-error-burst", String(burst === 0 ? now : started));
      sessionStorage.setItem("crm-app-error-count", String(burst + 1));
    } catch {
      /* storage bloqueado — tenta o reset mesmo assim */
    }
    reset();
  }, [error, reset]);

  const stale = isStaleChunkError(error);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className={`${CARD_SURFACE_CLASS} w-full max-w-md p-8 text-center shadow-sm`}>
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <svg
            className="size-7"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="font-display text-lg font-semibold text-foreground">Algo deu errado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {stale
            ? "Uma atualização do app ficou incompleta. Recarregue para continuar."
            : "Ocorreu um erro inesperado. Tente recarregar a página."}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Código: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={() => (stale ? window.location.reload() : reset())}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {stale ? "Recarregar" : "Tentar novamente"}
        </button>
      </div>
    </div>
  );
}
