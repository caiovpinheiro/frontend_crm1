"use client";

import { useEffect } from "react";

import { isStaleChunkError, reloadOnceForStaleChunk } from "@/lib/stale-chunk-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reloadOnceForStaleChunk(error);
  }, [error]);

  const stale = isStaleChunkError(error);

  return (
    <html lang="pt-BR">
      <body className="flex min-h-dvh items-center justify-center bg-[var(--color-bg-subtle)] p-6">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-danger)]/30 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--color-danger-subtle)]">
            <svg className="size-7 text-[var(--color-danger-text)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Algo deu errado</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {stale
              ? "Uma atualização do app ficou incompleta. Recarregue para continuar."
              : "Ocorreu um erro inesperado. Tente recarregar a página."}
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-xs text-[var(--color-ink-muted)]">
              Código: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => (stale ? window.location.reload() : reset())}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--glass-bg-modal)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--glass-bg-base)]"
          >
            {stale ? "Recarregar" : "Tentar novamente"}
          </button>
        </div>
      </body>
    </html>
  );
}
