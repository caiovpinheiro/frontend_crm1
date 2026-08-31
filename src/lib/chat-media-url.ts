import { apiUrl } from "@/lib/api";

/** Domínios da Meta/WhatsApp cujas URLs expiram — passam pelo proxy do backend. */
const META_MEDIA_DOMAINS = [
  "lookaside.fbsbx.com",
  "scontent.whatsapp.net",
  "graph.facebook.com",
];

function pageOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost";
}

/**
 * URL de mídia para `<img>` / `<video>` / `<audio>` no inbox.
 *
 * Em `{slug}.bwipo.com` o `fetch` da API já vai para `api.bwipo.com`
 * (cookie Domain=`.bwipo.com`). O `src` do player NÃO passa por esse
 * rewrite — path relativo `/api/storage/...` bate no origin do tenant,
 * o Next proxy quebra Range/206 e o card de mídia mostra erro mesmo
 * depois do WhatsApp ter recebido o arquivo.
 */
export function resolveChatMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (url.startsWith("/api/")) return apiUrl(url);
  if (url.startsWith("/uploads/")) return apiUrl(`/api${url}`);

  try {
    const parsed = new URL(url, pageOrigin());
    if (parsed.pathname.startsWith("/uploads/")) {
      return apiUrl(`/api${parsed.pathname}${parsed.search}`);
    }
    if (parsed.pathname.startsWith("/api/")) {
      return apiUrl(`${parsed.pathname}${parsed.search}`);
    }
    if (META_MEDIA_DOMAINS.some((d) => parsed.hostname.endsWith(d))) {
      return apiUrl(`/api/media/proxy?url=${encodeURIComponent(url)}`);
    }
  } catch {
    /* URL relativa malformada — cai no fallback abaixo */
  }

  if (url.includes("/uploads/")) {
    return apiUrl(`/api${url.slice(url.indexOf("/uploads/"))}`);
  }
  return url;
}
