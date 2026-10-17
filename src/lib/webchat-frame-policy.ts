/**
 * `allowedOrigins` do canal Webchat para o header `frame-ancestors` da rota
 * `/webchat/{publicKey}` (montado no middleware). Lê `GET /api/public/webchat/config`
 * do backend com cache curto em memória (por processo) — o iframe é carregado
 * em toda página do site do cliente.
 *
 * Falha/timeout/chave desconhecida → `[]` (só `'self'`: página hospedada e
 * preview do CRM continuam funcionando; embed de terceiros fica bloqueado).
 */
import { normalizeOrigin, normalizeOriginList } from "./webchat-origin";

const TTL_MS = 60_000;
/**
 * `host` (o `?host=` do loader) fora da lista em cache → rebusca, no máximo
 * uma vez a cada 5 s por chave. Sem isso, a origem recém-adicionada no painel
 * ficava bloqueada por até 60 s (o cache tinha a lista anterior).
 */
const HOST_MISS_REFETCH_MS = 5_000;
const MAX_ENTRIES = 1000;
const TIMEOUT_MS = 2500;

const cache = new Map<string, { origins: string[]; expiresAt: number; fetchedAt: number }>();

export function clearWebchatFramePolicyCache(): void {
  cache.clear();
}

type Options = {
  apiBase: string;
  /** Origem do site que embute o iframe (`?host=`); força rebusca se faltar no cache. */
  host?: string | null;
  clientIp?: string | null;
  fetchImpl?: typeof fetch;
  now?: number;
};

export async function loadWebchatAllowedOrigins(
  publicKey: string,
  { apiBase, host, clientIp, fetchImpl = fetch, now = Date.now() }: Options,
): Promise<string[]> {
  const hit = cache.get(publicKey);
  if (hit && hit.expiresAt > now) {
    const h = normalizeOrigin(host);
    const hostMissing = h !== null && !hit.origins.includes(h);
    if (!hostMissing || now - hit.fetchedAt < HOST_MISS_REFETCH_MS) return hit.origins;
  }
  if (!apiBase) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (clientIp) {
      headers["x-forwarded-for"] = clientIp;
      headers["x-real-ip"] = clientIp;
    }
    const res = await fetchImpl(
      `${apiBase}/api/public/webchat/config?key=${encodeURIComponent(publicKey)}`,
      { headers, cache: "no-store", signal: controller.signal },
    );
    if (!res.ok) {
      // 404 = chave inexistente: cacheia o "vazio" (evita martelar o BE).
      if (res.status === 404) remember(publicKey, [], now);
      return [];
    }
    const data = (await res.json()) as { allowedOrigins?: unknown };
    const origins = normalizeOriginList(data.allowedOrigins);
    remember(publicKey, origins, now);
    return origins;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function remember(key: string, origins: string[], now: number) {
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { origins, expiresAt: now + TTL_MS, fetchedAt: now });
}
