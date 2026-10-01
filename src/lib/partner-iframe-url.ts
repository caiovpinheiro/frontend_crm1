/**
 * Iframes de widget parceiro usam sandbox com allow-scripts + allow-same-origin.
 * Isso só vaza para o origin autenticado do CRM se o `src` for o próprio CRM
 * (ou outro host do cookie Domain=.bwipo.com). Parceiros devem ser https
 * externos; URLs same-origin / tenant / API não entram no iframe.
 */

export function isSafePartnerIframeSrc(
  raw: string,
  opts: {
    pageOrigin: string;
    apiOrigin?: string;
    tenantBaseDomain: string;
  },
): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password || !url.hostname) return false;
  if (url.origin === opts.pageOrigin) return false;
  if (opts.apiOrigin && url.origin === opts.apiOrigin) return false;

  const base = opts.tenantBaseDomain.trim().toLowerCase();
  const host = url.hostname.toLowerCase();
  if (base && base !== "localhost" && (host === base || host.endsWith(`.${base}`))) {
    return false;
  }
  return true;
}
