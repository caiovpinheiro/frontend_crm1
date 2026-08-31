import { getTenantBaseDomain } from "@/lib/tenant-url";

/**
 * Base URL do backend separado (auth API — api.bwipo.com — nunca api-public).
 *
 * No browser, `apiUrl()` prefixa este host quando a página e a API
 * compartilham o tenant (cookie Domain=`.bwipo.com`, SameSite=Lax).
 * Login / NextAuth continua no origin do frontend (`/api/auth/*`).
 */
export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
}

/**
 * Rotas que DEVEM ficar no origin do frontend:
 *  - NextAuth + CSRF host-only (`__Host-` / rewrite /api/auth)
 *  - handlers locais do Next (preview, transcribe, revision, WA call)
 *  - multipart fora do matcher CORS do backend (`/api/uploads`)
 */
const SAME_ORIGIN_API_PREFIXES = [
  "/api/auth",
  "/api/preview-login",
  "/api/wa-call-permission",
  "/api/wa-whatsapp-call",
  "/api/transcribe",
  "/api/app-revision",
  "/api/mobile-release",
  "/api/uploads",
  "/api/academic-records/upload",
] as const;

function normalizeApiPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function isSameOriginFrontendApi(path: string): boolean {
  const p = normalizeApiPath(path);
  return SAME_ORIGIN_API_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}?`),
  );
}

function hostOnTenantBase(hostname: string, tenantBase: string): boolean {
  const host = hostname.toLowerCase();
  const base = tenantBase.toLowerCase();
  return host === base || host.endsWith(`.${base}`);
}

function directBrowserApiEnabled(): boolean {
  const flag = (process.env.NEXT_PUBLIC_DIRECT_BROWSER_API ?? "").trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off";
}

/**
 * Browser em `{slug}.bwipo.com` → `api.bwipo.com` é same-site (não
 * cross-site). Cookie Domain=`.bwipo.com` + Lax viaja. EasyPanel /
 * localhost / hosts distintos → false (mantém rewrite same-origin).
 */
export function shouldDirectBrowserApi(pageHostname?: string): boolean {
  if (!directBrowserApiEnabled()) return false;
  const base = getApiBaseUrl();
  if (!base) return false;
  let apiHost: string;
  try {
    apiHost = new URL(base).hostname.toLowerCase();
  } catch {
    return false;
  }
  const tenantBase = getTenantBaseDomain();
  if (!hostOnTenantBase(apiHost, tenantBase)) return false;

  const pageHost = (
    pageHostname ??
    (typeof window !== "undefined" ? window.location.hostname : "")
  )
    .toLowerCase()
    .split(":")[0];
  if (!pageHost) return false;
  if (!hostOnTenantBase(pageHost, tenantBase)) return false;
  return apiHost !== pageHost;
}

function isDirectApiAbsoluteUrl(url: string): boolean {
  const base = getApiBaseUrl();
  if (!base) return false;
  return url === base || url.startsWith(`${base}/`);
}

/**
 * Client: URL absoluta do auth API quando o cookie pode viajar (prod
 * tenant). SSR / dev / auth local: path relativo → rewrite do Next.
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const p = normalizeApiPath(path);
  ensureDirectApiFetchCredentials();
  if (typeof window === "undefined") return p;
  if (isSameOriginFrontendApi(p)) return p;
  if (!shouldDirectBrowserApi()) return p;
  const base = getApiBaseUrl();
  return base ? `${base}${p}` : p;
}

function requestHref(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Reescreve `/api/*` same-origin (e URL já absoluta da API) para o auth host. */
function rewriteToDirectApi(url: string): string | null {
  const base = getApiBaseUrl();
  if (!base || typeof window === "undefined") return null;
  if (!shouldDirectBrowserApi()) {
    return isDirectApiAbsoluteUrl(url) ? url : null;
  }
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === base || parsed.href.startsWith(`${base}/`)) {
      return parsed.href;
    }
    if (parsed.origin !== window.location.origin) return null;
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!path.startsWith("/api/")) return null;
    if (isSameOriginFrontendApi(path)) return null;
    return `${base}${path}`;
  } catch {
    return null;
  }
}

function ensureDirectApiFetchCredentials(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __crmDirectApiFetch?: boolean };
  if (w.__crmDirectApiFetch) return;
  w.__crmDirectApiFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const dest = rewriteToDirectApi(requestHref(input));
    if (!dest) return original(input, init);
    if (input instanceof Request) {
      return original(new Request(dest, input), {
        ...init,
        credentials: "include",
        mode: "cors",
      });
    }
    return original(dest, { ...init, credentials: "include", mode: "cors" });
  };
}

ensureDirectApiFetchCredentials();

/**
 * Erro tipado de chamada à API. Preserva `status` e `code` para que a UI
 * decida o tratamento (ex.: 401 → relogar; 502/503/504 → tentar de novo).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Teto do `fetch` same-origin. O rewrite `/api/*` → backend não tem
 * timeout: se o Node (ou o proxy) trava, o request fica `(pending)`
 * para sempre e a query nunca vira `isError`.
 */
export const DEFAULT_API_TIMEOUT_MS = 12_000;

function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      e instanceof DOMException &&
      e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const timeout =
    timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const signal =
    init.signal && timeout
      ? AbortSignal.any([init.signal, timeout])
      : (init.signal ?? timeout);
  try {
    return await fetch(apiUrl(path), {
      credentials: "include",
      ...init,
      signal,
    });
  } catch (e) {
    if (timeoutMs > 0 && isAbortError(e) && !init.signal?.aborted) {
      throw new ApiError(
        "Servidor não respondeu a tempo.",
        504,
        "FETCH_TIMEOUT",
      );
    }
    throw e;
  }
}

/**
 * Interpreta a resposta de um `fetch` para a API e devolve o JSON tipado.
 *
 * Por que existe: o `/api/*` passa pelo proxy do EasyPanel/Traefik e pelo
 * rewrite do Next. Quando o backend está indisponível ou o request estoura
 * o timeout do proxy, a resposta vem como **HTML** (página 502/503/504), não
 * JSON. Sem este tratamento, `res.json()` falha e a UI mostra um erro
 * genérico ("Erro ao enviar template") sem dizer a causa real.
 *
 * Regras:
 *  - 401 → "Sua sessão expirou. Faça login novamente." (code AUTH_REQUIRED)
 *  - Corpo não-JSON (proxy retornou HTML) → "Servidor temporariamente indisponível…"
 *  - Corpo JSON com `message` → usa a mensagem do backend (mesmo em 502/503/504,
 *    porque o handler retornou JSON acionável — ex.: template route responde
 *    503 com "Canal sem credenciais Meta" e 502 com o erro real da Meta Cloud
 *    API. Mascarar isso deixava operadores sem pista da causa real).
 *  - Corpo JSON sem `message` em 502/503/504 → cai no genérico
 *    "Servidor temporariamente indisponível…" (defesa em profundidade).
 *  - Demais erros → usa `message` do payload, senão `fallbackMessage`.
 */
export async function parseApiResponse<T>(
  res: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data: Record<string, unknown> = isJson
    ? await res.json().catch(() => ({}))
    : {};

  if (res.ok) return data as T;

  const payloadMessage =
    typeof data.message === "string" ? data.message : null;
  const payloadCode = typeof data.code === "string" ? data.code : undefined;

  if (res.status === 401) {
    throw new ApiError(
      payloadMessage && payloadCode !== "AUTH_REQUIRED"
        ? payloadMessage
        : "Sua sessão expirou. Faça login novamente.",
      401,
      payloadCode ?? "AUTH_REQUIRED",
    );
  }

  const isGatewayStatus =
    res.status === 502 || res.status === 503 || res.status === 504;

  // Corpo não-JSON = página HTML do proxy (EasyPanel/Traefik) OU 5xx de
  // gateway sem payload legível → único caso em que a máscara genérica se
  // aplica. Se o backend respondeu JSON (mesmo em 502/503/504), o `message`
  // é acionável e deve chegar ao operador.
  if (!isJson || (isGatewayStatus && !payloadMessage)) {
    throw new ApiError(
      "Servidor temporariamente indisponível. Tente novamente em instantes.",
      res.status,
      payloadCode,
    );
  }

  throw new ApiError(payloadMessage ?? fallbackMessage, res.status, payloadCode);
}
