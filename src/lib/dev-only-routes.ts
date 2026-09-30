/**
 * Rotas de desenvolvimento (SEC-25).
 *
 * Páginas de preview/mocks internos (`/test-bulk-bar`, `/dev/*`) não têm
 * dados reais, mas expõem UI interna e não deveriam existir em produção.
 *
 *  - Fora de produção: os caminhos em `DEV_ONLY_PUBLIC_PATHS` são públicos
 *    (sem sessão), como sempre foram, para facilitar o trabalho de UI.
 *  - Em produção: TODA rota de dev responde 404 no middleware, antes de
 *    qualquer outra decisão (inclusive o bypass de preview).
 *
 * Helper puro, sem imports do Next, para ser testável em vitest (node).
 */

/** Rotas de dev liberadas sem sessão FORA de produção. */
export const DEV_ONLY_PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/test-bulk-bar",
  "/dev/campaigns-cards-preview",
]);

/** `true` para `/test-bulk-bar`, `/dev` e qualquer coisa sob `/dev/`. */
export function isDevOnlyPath(pathname: string): boolean {
  if (pathname === "/test-bulk-bar") return true;
  // Prefixo com barra: `/developers` (rota real do app) NÃO é rota de dev.
  return pathname === "/dev" || pathname.startsWith("/dev/");
}

/**
 * - "block":  rota de dev em produção → 404.
 * - "public": rota de dev pública fora de produção → segue sem sessão.
 * - "none":   não é caso especial; o middleware segue o fluxo normal.
 */
export function devOnlyRouteDecision(
  pathname: string,
  isProduction: boolean,
): "block" | "public" | "none" {
  if (!isDevOnlyPath(pathname)) return "none";
  if (isProduction) return "block";
  return DEV_ONLY_PUBLIC_PATHS.has(pathname) ? "public" : "none";
}
