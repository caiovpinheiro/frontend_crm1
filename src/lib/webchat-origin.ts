/**
 * Helpers puros do Webchat (sem imports do Next — rodam no middleware Edge,
 * no widget e nos testes vitest).
 *
 * Segurança do embed (ver `docs/decisoes/webchat-widget.md §3.3` no backend):
 *  - `allowedOrigins` do canal é a lista de sites que podem embutir o iframe.
 *  - O middleware manda `Content-Security-Policy: frame-ancestors 'self' <origins>`
 *    só na rota `/webchat/{publicKey}` — o resto do app segue sem iframe.
 *  - O widget confere `?host=` contra `allowedOrigins`, contra
 *    `document.referrer` e via handshake `postMessage` com o loader.
 */

/** `wc_` + base62/base64url — mesmo formato que o backend gera (24 chars). */
const PUBLIC_KEY_RE = /^wc_[A-Za-z0-9_-]{6,64}$/;

export function isWebchatPublicKey(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_KEY_RE.test(value);
}

/**
 * `/webchat/{publicKey}` (a página do widget). `null` para qualquer outro
 * caminho — inclusive `/webchat/embed.js` e subcaminhos.
 */
export function webchatPageKeyFromPath(pathname: string): string | null {
  const m = /^\/webchat\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  const key = decodeURIComponentSafe(m[1] ?? "");
  return isWebchatPublicKey(key) ? key : null;
}

function decodeURIComponentSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return "";
  }
}

/**
 * Normaliza uma origem http(s) (`https://www.site.com.br` — sem path, sem
 * barra final, host minúsculo, porta default removida). Qualquer outra coisa
 * (curinga, `data:`, `javascript:`, string com espaço/`;`) → `null`.
 */
export function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 255) return null;
  if (/[\s;,'"*]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url.origin;
}

/** Lista limpa e sem duplicatas de origens válidas. */
export function normalizeOriginList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const o = normalizeOrigin(v);
    if (o && !out.includes(o)) out.push(o);
  }
  return out;
}

export function isOriginAllowed(host: unknown, allowedOrigins: unknown): boolean {
  const h = normalizeOrigin(host);
  if (!h) return false;
  return normalizeOriginList(allowedOrigins).includes(h);
}

/**
 * `document.referrer` do iframe precisa bater com o `host` declarado. Sem
 * referrer (site com `Referrer-Policy: no-referrer`) não dá para comparar —
 * aí vale só o handshake `postMessage` (que também é obrigatório).
 */
export function referrerMatchesHost(referrer: string, host: string): boolean {
  if (!referrer) return true;
  const ref = normalizeOrigin(referrer);
  const h = normalizeOrigin(host);
  return Boolean(ref && h && ref === h);
}

/** Valor do header CSP da rota do iframe. */
export function webchatFrameAncestors(allowedOrigins: unknown): string {
  const list = normalizeOriginList(allowedOrigins);
  return ["frame-ancestors 'self'", ...list].join(" ");
}
