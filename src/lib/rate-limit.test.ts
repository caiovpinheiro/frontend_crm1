/**
 * 429/503 com prazo: sem retry imediato (a query espera o prazo + jitter
 * e tenta uma vez), sem recarregar a página e sem deslogar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  noteRateLimited,
  parseRetryAfterHeader,
  queryRetry,
  queryRetryDelay,
  RATE_LIMIT_DEFAULT_RETRY_MS,
  rateLimitCooldownRemainingMs,
  rateLimitRetryDelayMs,
  readRetryAfter,
  resetRateLimitForTests,
  retryAfterFrom,
} from "./rate-limit";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("retryAfterFrom / readRetryAfter", () => {
  it("429 com `retryAfterMs` e `class` no corpo", () => {
    expect(retryAfterFrom(429, { retryAfterMs: 2_500, class: "accessory" }, "9")).toEqual({
      retryAfterMs: 2_500,
      limitClass: "accessory",
    });
  });

  it("sem corpo: `Retry-After` em segundos ou data HTTP", () => {
    expect(retryAfterFrom(503, {}, "4")).toEqual({ retryAfterMs: 4_000 });
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(parseRetryAfterHeader("Tue, 13 Oct 2026 12:00:03 GMT", now)).toBe(3_000);
  });

  it("429 sem prazo legível usa o padrão; 503 sem prazo é 5xx comum", () => {
    expect(retryAfterFrom(429, null, null)).toEqual({ retryAfterMs: RATE_LIMIT_DEFAULT_RETRY_MS });
    expect(retryAfterFrom(503, { message: "x" }, null)).toBeNull();
    expect(retryAfterFrom(500, { retryAfterMs: 2_000 }, null)).toBeNull();
  });

  it("lê de um clone (o corpo continua disponível para quem chamou)", async () => {
    const res = jsonResponse(429, { retryAfterMs: 2_000, class: "heavy" });
    expect(await readRetryAfter(res)).toEqual({ retryAfterMs: 2_000, limitClass: "heavy" });
    expect(await res.json()).toEqual({ retryAfterMs: 2_000, class: "heavy" });
  });
});

describe("retry das queries", () => {
  beforeEach(() => resetRateLimitForTests());
  afterEach(() => vi.useRealTimers());

  it("erro com prazo: espera o prazo com jitter (nunca antes) e tenta uma vez", () => {
    const err = { status: 429, retryAfterMs: 3_000 };
    const delay = rateLimitRetryDelayMs(err, Date.now(), () => 0.5);
    expect(delay).toBeGreaterThanOrEqual(3_000);
    expect(delay).toBe(3_450);
    expect(queryRetry(0, err)).toBe(true);
    expect(queryRetry(1, err)).toBe(false);
  });

  it("erro genérico depois de um 429 anotado pelo fetch também espera o prazo", () => {
    const now = 1_000_000;
    noteRateLimited(4_000, now);
    expect(rateLimitCooldownRemainingMs(now + 1_000)).toBe(3_000);
    expect(rateLimitRetryDelayMs(new Error("Falha"), now + 1_000, () => 0)).toBe(3_000);
  });

  it("sem limite: backoff de sempre", () => {
    expect(queryRetryDelay(0, new Error("x"))).toBe(1_000);
    expect(queryRetryDelay(1, new Error("x"))).toBe(2_000);
  });
});
