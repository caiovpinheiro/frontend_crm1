"use client";

/**
 * PreviewMocksInstaller — só age em preview mode.
 *
 * Faz monkey patch em `window.fetch` na primeira render do client e
 * intercepta qualquer chamada a `/api/*`, devolvendo respostas do
 * catálogo em `lib/preview-mocks.ts`. Chamadas a outros hosts (CDN,
 * `_next/...`, etc.) passam direto pro fetch original.
 *
 * ## Mocks fora do bundle de produção
 *
 * O catálogo de mocks NÃO é importado estaticamente: ele entra por `import()`
 * dentro de um `if` cuja condição é a chave de build
 * `NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED` (calculada em `next.config.ts`: `"true"`
 * fora de produção, ou em build de produção com a dupla chave do preview).
 * A comparação é LITERAL de propósito: o bundler avalia
 * `process.env.NEXT_PUBLIC_*` em build time e descarta o ramo morto — com o
 * preview desligado o chunk de mocks nem é gerado, quanto mais baixado.
 * Não extraia a condição para uma variável/função: isso quebra a eliminação.
 *
 * Idempotente: se já estiver instalado (segundo render no StrictMode),
 * não re-aplica.
 */

import { logger } from "@/lib/logger";
import { useEffect } from "react";

import { isPreviewMode } from "@/lib/preview-mode";

declare global {
  interface Window {
    __previewFetchInstalled?: boolean;
  }
}

export function PreviewMocksInstaller() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED === "true") {
      if (!isPreviewMode()) return;
      if (typeof window === "undefined") return;
      if (window.__previewFetchInstalled) return;

      const originalFetch = window.fetch.bind(window);
      // O chunk carrega em paralelo; o patch entra JÁ (síncrono) e cada
      // request espera o chunk — assim nada escapa para o backend real
      // enquanto os mocks ainda estão baixando.
      const ready = import("@/lib/preview-fetch");

      window.fetch = async function previewFetch(
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> {
        let mod: typeof import("@/lib/preview-fetch");
        try {
          mod = await ready;
        } catch {
          return originalFetch(input as RequestInfo, init);
        }
        return mod.previewFetch(originalFetch, input, init);
      };

      window.__previewFetchInstalled = true;
      logger.debug(
        "preview",
        "fetch mocks instalados — /api/* não vai bater no backend",
      );
    }
  }, []);

  return null;
}
