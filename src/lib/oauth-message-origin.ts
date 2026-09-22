/**
 * Origens aceitas no postMessage do popup OAuth (Instagram Login).
 * A correlação com o fluxo iniciado pelo usuário é `event.source === popup`.
 */
export function isAllowedOAuthPopupOrigin(
  eventOrigin: string,
  opts: { pageOrigin: string; apiBaseUrl?: string },
): boolean {
  if (eventOrigin === opts.pageOrigin) return true;
  const base = (opts.apiBaseUrl ?? "").trim();
  if (!base) return false;
  try {
    return new URL(base).origin === eventOrigin;
  } catch {
    return false;
  }
}
