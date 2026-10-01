"use client";

/**
 * PreviewMocksInstaller — só renderiza em preview mode.
 *
 * Faz monkey patch em `window.fetch` na primeira render do client e
 * intercepta qualquer chamada a `/api/*`, devolvendo respostas do
 * catálogo em `lib/preview-mocks.ts`. Chamadas a outros hosts (CDN,
 * `_next/...`, etc.) passam direto pro fetch original.
 *
 * Idempotente: se já estiver instalado (segundo render no StrictMode),
 * não re-aplica.
 */

import { logger } from "@/lib/logger";
import { useEffect } from "react";

import { isPreviewMode } from "@/lib/preview-mode";
import { findMockResponse } from "@/lib/preview-mocks";

declare global {
  interface Window {
    __previewFetchInstalled?: boolean;
  }
}

export function PreviewMocksInstaller() {
  useEffect(() => {
    if (!isPreviewMode()) return;
    if (typeof window === "undefined") return;
    if (window.__previewFetchInstalled) return;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async function previewFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      try {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const url = new URL(rawUrl, window.location.origin);
        // Só intercepta requests no mesmo host (não vamos mexer em CDN,
        // assets do Next, fontes do Google, etc).
        if (url.origin === window.location.origin) {
          const mock = findMockResponse(url, init);
          if (mock) {
            // Latência fake leve só pra UI não piscar
            await new Promise((r) => setTimeout(r, 80));
            return mock;
          }
        }
      } catch {
        /* fallthrough — usa fetch real */
      }
      return originalFetch(input as RequestInfo, init);
    };

    window.__previewFetchInstalled = true;
    logger.debug(
      "preview",
      "fetch mocks instalados — /api/* não vai bater no backend",
    );
  }, []);

  return null;
}
