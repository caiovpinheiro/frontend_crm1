/**
 * Base URL do backend separado.
 *
 * NOTA: este helper é exposto APENAS para os poucos casos que precisam
 * de URL absoluta (ex.: abrir um WebSocket, montar um link externo). Para
 * fetches normais em client components, use `apiUrl()` e deixe o rewrite
 * do Next (`next.config.ts > rewrites()`) cuidar do proxy — assim a
 * chamada fica same-origin com o domínio do frontend e o cookie de
 * sessão (SameSite=Lax) viaja junto, sem precisar de CORS no backend.
 */
export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
}

/**
 * Retorna o path relativo (ex.: `/api/deals`) para uso em `fetch` de
 * client components. O rewrite do `next.config.ts` mapeia `/api/*` pro
 * backend separado em runtime, mantendo a chamada same-origin com o
 * frontend — necessário para que o browser anexe o cookie `authjs.session-token`
 * (SameSite=Lax não viaja em fetches cross-site).
 *
 * Para chamadas SSR / Route Handler / Server Action, use `apiServerFetch`
 * de `@/lib/api-server` (URL absoluta + cookies forward).
 */
export function apiUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

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
    return await fetch(apiUrl(path), { ...init, signal });
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
