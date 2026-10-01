/**
 * Interceptador de `fetch` do preview mode.
 *
 * Este módulo (e, por ele, o catálogo `preview-mocks.ts`) só pode ser
 * carregado por `import()` dinâmico dentro de um `if` com a chave de build
 * `NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED` — ver `PreviewMocksInstaller`. Um import
 * estático daqui recoloca os mocks no bundle público de produção
 * (`scripts/check-bundle-sem-mocks.mjs` e o teste `preview-bundle.test.ts`
 * vigiam isso).
 */
import { findMockResponse } from "@/lib/preview-mocks";

/**
 * Responde `/api/*` do próprio host com o catálogo de mocks; chamadas a outros
 * hosts (CDN, fontes) e rotas sem mock passam para o `fetch` original.
 */
export async function previewFetch(
  originalFetch: typeof window.fetch,
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
}
