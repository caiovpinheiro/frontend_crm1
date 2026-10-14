/**
 * Limites por classe do backend (contrato de 10/2026).
 *
 *  - 429 `{ retryAfterMs (2000–5000), class }` + `Retry-After` (s);
 *  - 503 `{ ..., retryAfterMs? }` + `Retry-After` em sobrecarga (só
 *    classes acessórias/pesadas).
 *
 * Antes, o limitador bloqueava o usuário inteiro por 60 s e as queries
 * re-tentavam em 2 s (dentro do bloqueio) e viravam erro na tela. Agora:
 *
 *  - o `fetch` do app (`lib/api.ts`) anota o prazo de qualquer 429/503 da
 *    API que traga `retryAfterMs`/`Retry-After` (`noteRateLimited`) ANTES
 *    de devolver a resposta — assim até o queryFn que lança um `Error`
 *    genérico (sem status) é atendido;
 *  - o `retryDelay` padrão das queries (`app/providers.tsx`) espera esse
 *    prazo, com jitter, e tenta UMA vez (`rateLimitRetryDelayMs`);
 *  - mutação que receba 429/503 mostra um toast (sem recarregar nem
 *    deslogar; o formulário fica como estava).
 *
 * `Retry-After` só é legível cross-origin se o backend o expuser em
 * `Access-Control-Expose-Headers`; o `retryAfterMs` do corpo é a fonte
 * principal.
 */

/** Status que podem trazer prazo de espera. */
export function isRateLimitStatus(status: number): boolean {
  return status === 429 || status === 503;
}

/** 429 sem prazo legível: o meio da faixa do backend. */
export const RATE_LIMIT_DEFAULT_RETRY_MS = 3_000;
/** Teto defensivo: nada de esperar minutos por um header estranho. */
export const RATE_LIMIT_MAX_RETRY_MS = 30_000;
const JITTER = 0.3;

export type RetryAfterInfo = {
  retryAfterMs: number;
  /** Classe do limite (`class` do corpo), quando veio. */
  limitClass?: string;
};

function clampMs(ms: number): number {
  return Math.min(RATE_LIMIT_MAX_RETRY_MS, Math.max(0, Math.round(ms)));
}

/** `Retry-After` em segundos ou data HTTP → ms (ou `null`). */
export function parseRetryAfterHeader(
  value: string | null | undefined,
  now = Date.now(),
): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return seconds > 0 ? clampMs(seconds * 1_000) : null;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  const ms = at - now;
  return ms > 0 ? clampMs(ms) : null;
}

/**
 * Prazo de um 429/503: `retryAfterMs` do corpo JSON, senão `Retry-After`.
 * 429 sem nenhum dos dois → `RATE_LIMIT_DEFAULT_RETRY_MS`; 503 sem prazo
 * → `null` (5xx de gateway comum, segue o retry normal).
 */
export function retryAfterFrom(
  status: number,
  body: unknown,
  retryAfterHeader: string | null | undefined,
  now = Date.now(),
): RetryAfterInfo | null {
  if (!isRateLimitStatus(status)) return null;
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const limitClass = typeof b.class === "string" ? b.class : undefined;
  let ms: number | null = null;
  if (typeof b.retryAfterMs === "number" && Number.isFinite(b.retryAfterMs) && b.retryAfterMs > 0) {
    ms = clampMs(b.retryAfterMs);
  }
  if (ms === null) ms = parseRetryAfterHeader(retryAfterHeader, now);
  if (ms === null) {
    if (status !== 429) return null;
    ms = RATE_LIMIT_DEFAULT_RETRY_MS;
  }
  return limitClass ? { retryAfterMs: ms, limitClass } : { retryAfterMs: ms };
}

/** Lê o prazo de uma resposta sem consumir o corpo de quem chamou. */
export async function readRetryAfter(res: Response): Promise<RetryAfterInfo | null> {
  if (!isRateLimitStatus(res.status)) return null;
  let body: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await res.clone().json();
    } catch {
      body = null;
    }
  }
  return retryAfterFrom(res.status, body, res.headers.get("Retry-After"));
}

// ──────────────────────────────────────────────
// Prazo global (por página)
// ──────────────────────────────────────────────

let cooldownUntil = 0;

/** Registra o prazo de um 429/503 recebido por qualquer chamada da página. */
export function noteRateLimited(retryAfterMs: number, now = Date.now()): void {
  cooldownUntil = Math.max(cooldownUntil, now + clampMs(retryAfterMs));
}

/** Quanto falta do prazo mais recente (0 = livre). */
export function rateLimitCooldownRemainingMs(now = Date.now()): number {
  return Math.max(0, cooldownUntil - now);
}

/** Para testes. */
export function resetRateLimitForTests(): void {
  cooldownUntil = 0;
}

export function withRetryJitter(ms: number, random: () => number = Math.random): number {
  return Math.round(ms * (1 + random() * JITTER));
}

/** O erro traz um prazo de espera do backend (`ApiError` de 429/503)? */
export function errorRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { status?: unknown; retryAfterMs?: unknown };
  if (typeof e.retryAfterMs === "number" && e.retryAfterMs > 0) return e.retryAfterMs;
  return null;
}

/** Erro de limite (429, ou 503 com prazo)? */
export function isRateLimitError(error: unknown): boolean {
  if (errorRetryAfterMs(error) !== null) return true;
  return !!error && typeof error === "object" && (error as { status?: unknown }).status === 429;
}

/**
 * `retryDelay` das queries: se o backend pediu espera (no erro ou no
 * prazo global anotado pelo `fetch`), espera o prazo com jitter; senão
 * `null` (o chamador usa o backoff de sempre).
 */
export function rateLimitRetryDelayMs(
  error: unknown,
  now = Date.now(),
  random: () => number = Math.random,
): number | null {
  const fromError = errorRetryAfterMs(error);
  const remaining = rateLimitCooldownRemainingMs(now);
  const wait = Math.max(fromError ?? 0, remaining);
  if (wait <= 0) return isRateLimitError(error) ? withRetryJitter(RATE_LIMIT_DEFAULT_RETRY_MS, random) : null;
  return withRetryJitter(wait, random);
}

/** Backoff padrão das queries (o de antes desta mudança). */
export function defaultQueryRetryDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

/** `retryDelay` padrão do `QueryClient`. */
export function queryRetryDelay(attempt: number, error: unknown): number {
  return rateLimitRetryDelayMs(error) ?? defaultQueryRetryDelayMs(attempt);
}

/**
 * `retry` padrão do `QueryClient`: uma nova tentativa, como antes. Num
 * limite também é UMA — depois do prazo (`queryRetryDelay`), nunca em
 * rajada.
 */
export function queryRetry(failureCount: number, _error: unknown): boolean {
  return failureCount < 1;
}

/** Mensagem do toast de mutação limitada. */
export function rateLimitMutationMessage(error: unknown): string {
  const ms = errorRetryAfterMs(error) ?? rateLimitCooldownRemainingMs();
  const seconds = Math.max(1, Math.ceil(ms / 1_000));
  return `Muitas ações em sequência. Aguarde ${seconds} s e tente de novo.`;
}
