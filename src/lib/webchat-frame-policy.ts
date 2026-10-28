/**
 * `allowedOrigins` do canal Webchat para o header `frame-ancestors` da rota
 * `/webchat/{publicKey}` (montado no middleware). Lê `GET /api/public/webchat/config`
 * do backend com cache curto em memória (por processo) — o iframe é carregado
 * em toda página do site do cliente.
 *
 * Disponibilidade (o widget não pode sumir do site do cliente por um soluço
 * do backend):
 *  - cache vencido → devolve a lista conhecida JÁ e atualiza em segundo plano
 *    (stale-while-revalidate); o middleware não espera o backend;
 *  - falha (timeout, rede, 5xx, 429) → mantém a última lista conhecida
 *    (stale-if-error, até `STALE_MAX_MS`); só sem nenhuma lista conhecida cai
 *    em `[]` (só `'self'`: página hospedada e preview do CRM seguem);
 *  - só 404 (chave inexistente) grava a lista vazia.
 * Sem lista conhecida, a espera do middleware fica limitada a `TIMEOUT_MS`.
 */
import { normalizeOrigin, normalizeOriginList } from "./webchat-origin";

const TTL_MS = 60_000;
/**
 * `host` (o `?host=` do loader) fora da lista em cache → rebusca, no máximo
 * uma vez a cada 5 s por chave. Sem isso, a origem recém-adicionada no painel
 * ficava bloqueada por até 60 s (o cache tinha a lista anterior).
 */
const HOST_MISS_REFETCH_MS = 5_000;
/** Até quando a última lista boa ainda é servida com o backend falhando. */
const STALE_MAX_MS = 24 * 60 * 60_000;
/** Sem lista conhecida e backend falhando: não tenta de novo antes disso. */
const ERROR_RETRY_MS = 5_000;
const MAX_ENTRIES = 1000;
/** Espera máxima do middleware quando precisa aguardar o backend. */
const TIMEOUT_MS = 1500;
/** Atualização em segundo plano (ninguém esperando por ela). */
const BACKGROUND_TIMEOUT_MS = 5000;

type Entry = {
  origins: string[];
  /** Fresco até aqui; depois disso é "stale" (serve e atualiza por trás). */
  expiresAt: number;
  /** Última busca com sucesso (ou 404). */
  fetchedAt: number;
  /** Última tentativa que falhou (sem lista conhecida = sem novas tentativas até +5 s). */
  failedAt?: number;
  /** Sem lista conhecida: a entrada só registra a falha. */
  known: boolean;
};

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<string[] | null>>();

export function clearWebchatFramePolicyCache(): void {
  cache.clear();
  inFlight.clear();
}

type Options = {
  apiBase: string;
  /** Origem do site que embute o iframe (`?host=`); força rebusca se faltar no cache. */
  host?: string | null;
  clientIp?: string | null;
  fetchImpl?: typeof fetch;
  now?: number;
  /** Mantém viva a atualização em segundo plano (`NextFetchEvent.waitUntil`). */
  waitUntil?: (p: Promise<unknown>) => void;
};

export async function loadWebchatAllowedOrigins(
  publicKey: string,
  { apiBase, host, clientIp, fetchImpl = fetch, now = Date.now(), waitUntil }: Options,
): Promise<string[]> {
  const hit = cache.get(publicKey);
  const usable = hit?.known && now - hit.fetchedAt < STALE_MAX_MS ? hit : null;
  const fallback = usable?.origins ?? [];

  if (!apiBase) return fallback;

  const fetchOpts = { apiBase, clientIp, fetchImpl, now };
  const h = normalizeOrigin(host);
  const hostMissing = usable !== null && h !== null && !usable.origins.includes(h);
  // Backend falhou há pouco: não espera de novo (nem martela) por 5 s.
  const failedRecently = hit?.failedAt !== undefined && now - hit.failedAt < ERROR_RETRY_MS;

  if (usable && usable.expiresAt > now) {
    // Fresco: só rebusca (esperando) se o host ainda não está na lista.
    if (!hostMissing || now - usable.fetchedAt < HOST_MISS_REFETCH_MS || failedRecently) {
      return usable.origins;
    }
    return (await refresh(publicKey, fetchOpts, TIMEOUT_MS)) ?? fallback;
  }

  if (usable) {
    // Vencido: host já liberado → serve a lista e atualiza por trás.
    if (!hostMissing || failedRecently) {
      if (!failedRecently) {
        const bg = refresh(publicKey, fetchOpts, BACKGROUND_TIMEOUT_MS).catch(() => null);
        waitUntil?.(bg);
      }
      return usable.origins;
    }
    return (await refresh(publicKey, fetchOpts, TIMEOUT_MS)) ?? fallback;
  }

  // Nada conhecido: espera (curto), salvo falha recente.
  if (failedRecently) return fallback;
  return (await refresh(publicKey, fetchOpts, TIMEOUT_MS)) ?? fallback;
}

type FetchOptions = {
  apiBase: string;
  clientIp?: string | null;
  fetchImpl: typeof fetch;
  now: number;
};

/**
 * Busca a lista e atualiza o cache. `null` = falha transitória (o cache fica
 * como estava, só anota a falha). Uma busca por chave de cada vez: pedidos
 * simultâneos esperam a mesma promessa.
 */
function refresh(
  publicKey: string,
  opts: FetchOptions,
  timeoutMs: number,
): Promise<string[] | null> {
  const running = inFlight.get(publicKey);
  const p = running ?? fetchOrigins(publicKey, opts, BACKGROUND_TIMEOUT_MS);
  if (!running) {
    inFlight.set(publicKey, p);
    void p.finally(() => {
      if (inFlight.get(publicKey) === p) inFlight.delete(publicKey);
    });
  }
  if (timeoutMs >= BACKGROUND_TIMEOUT_MS) return p;
  // Quem espera desiste em `timeoutMs`; a busca segue e atualiza o cache.
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

async function fetchOrigins(
  publicKey: string,
  { apiBase, clientIp, fetchImpl, now }: FetchOptions,
  timeoutMs: number,
): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    if (res.status === 404) {
      // Chave inexistente: resposta definitiva — cacheia o "vazio".
      remember(publicKey, [], now);
      return [];
    }
    if (!res.ok) {
      noteFailure(publicKey, now);
      return null;
    }
    const data = (await res.json()) as { allowedOrigins?: unknown };
    const origins = normalizeOriginList(data.allowedOrigins);
    remember(publicKey, origins, now);
    return origins;
  } catch {
    noteFailure(publicKey, now);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function setEntry(key: string, entry: Entry) {
  cache.delete(key);
  if (cache.size >= MAX_ENTRIES) {
    // Map mantém a ordem de inserção: sai a entrada menos recente.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, entry);
}

function remember(key: string, origins: string[], now: number) {
  setEntry(key, { origins, expiresAt: now + TTL_MS, fetchedAt: now, known: true });
}

function noteFailure(key: string, now: number) {
  const prev = cache.get(key);
  if (prev?.known) {
    // Mantém a lista conhecida (stale-if-error) sem renovar o prazo.
    prev.failedAt = now;
    return;
  }
  setEntry(key, { origins: [], expiresAt: 0, fetchedAt: 0, failedAt: now, known: false });
}
