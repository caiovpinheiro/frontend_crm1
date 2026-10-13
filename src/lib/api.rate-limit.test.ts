/** @vitest-environment jsdom */
/**
 * `lib/api.ts` com os limites por classe: 429/503 com prazo viram
 * `ApiError` tipado (sem deslogar, sem recarregar), o `fetch` do app anota
 * o prazo antes de devolver, e uma query com 429 espera o prazo antes da
 * única nova tentativa.
 */
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revoked = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("@/lib/session-revoked", () => ({
  isSessionRevoked: (status: number, code?: string) => status === 401 && code === "SESSION_REVOKED",
  handleSessionRevoked: revoked.handle,
}));

import { ApiError, createAppFetch, parseApiResponse } from "./api";
import {
  queryRetry,
  queryRetryDelay,
  rateLimitCooldownRemainingMs,
  resetRateLimitForTests,
} from "./rate-limit";
import { notifyRateLimitedMutation } from "@/app/providers";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

beforeEach(() => {
  resetRateLimitForTests();
  revoked.handle.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("parseApiResponse", () => {
  it("429 → ApiError com `retryAfterMs`/`class`, sem deslogar", async () => {
    const err = await parseApiResponse(
      json(429, { retryAfterMs: 2_500, class: "accessory" }),
      "falhou",
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).retryAfterMs).toBe(2_500);
    expect((err as ApiError).limitClass).toBe("accessory");
    expect((err as ApiError).code).toBe("RATE_LIMITED");
    expect(revoked.handle).not.toHaveBeenCalled();
  });

  it("503 com `Retry-After` → prazo; 503 sem prazo segue o genérico de sempre", async () => {
    const a = (await parseApiResponse(json(503, { class: "heavy" }, { "Retry-After": "3" }), "x").catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(a.retryAfterMs).toBe(3_000);
    const b = (await parseApiResponse(json(503, {}), "x").catch((e: unknown) => e)) as ApiError;
    expect(b.retryAfterMs).toBeUndefined();
    expect(b.message).toMatch(/temporariamente indisponível/);
  });

  it("401 continua no caminho de sessão (não vira limite)", async () => {
    const err = (await parseApiResponse(json(401, { code: "SESSION_REVOKED" }), "x").catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err.status).toBe(401);
    expect(err.retryAfterMs).toBeUndefined();
    expect(revoked.handle).toHaveBeenCalledTimes(1);
  });
});

describe("fetch do app", () => {
  it("anota o prazo de um 429 da API antes de devolver (corpo intacto)", async () => {
    const original = vi.fn(async () => json(429, { retryAfterMs: 4_000, class: "accessory" }));
    const appFetch = createAppFetch(original as unknown as typeof fetch);
    const res = await appFetch("/api/channels");
    expect(rateLimitCooldownRemainingMs()).toBeGreaterThan(3_000);
    expect(await res.json()).toEqual({ retryAfterMs: 4_000, class: "accessory" });
  });

  it("ignora 429 de rotas locais do Next (não são da API)", async () => {
    const original = vi.fn(async () => json(429, { retryAfterMs: 4_000 }));
    await createAppFetch(original as unknown as typeof fetch)("/api/auth/session");
    expect(rateLimitCooldownRemainingMs()).toBe(0);
  });
});

describe("query com 429", () => {
  it("não re-tenta na hora: espera o prazo (+ jitter) e tenta UMA vez", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    let calls = 0;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: queryRetry, retryDelay: queryRetryDelay } },
    });
    const queryFn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new ApiError("limite", 429, "RATE_LIMITED", { retryAfterMs: 3_000 });
      }
      return "ok";
    });
    const done = client.fetchQuery({ queryKey: ["x"], queryFn });
    await vi.advanceTimersByTimeAsync(2_900);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await expect(done).resolves.toBe("ok");
  });

  it("segundo 429 seguido vira erro (sem rajada)", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: queryRetry, retryDelay: queryRetryDelay } },
    });
    const queryFn = vi.fn(async () => {
      throw new ApiError("limite", 429, "RATE_LIMITED", { retryAfterMs: 2_000 });
    });
    const done = client.fetchQuery({ queryKey: ["y"], queryFn }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(await done).toBeInstanceOf(ApiError);
  });
});

describe("mutação com 429", () => {
  it("sem `onError` próprio: toast (não recarrega nem desloga)", () => {
    const show = vi.fn();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      configurable: true,
    });
    const err = new ApiError("limite", 429, "RATE_LIMITED", { retryAfterMs: 2_000 });
    expect(notifyRateLimitedMutation(err, false, show)).toBe(true);
    expect(show).toHaveBeenCalledWith(expect.stringMatching(/Aguarde 2 s/));
    expect(reload).not.toHaveBeenCalled();
    expect(revoked.handle).not.toHaveBeenCalled();
  });

  it("com `onError` próprio, ou erro que não é limite: nada", () => {
    const show = vi.fn();
    const err = new ApiError("limite", 429, "RATE_LIMITED", { retryAfterMs: 2_000 });
    expect(notifyRateLimitedMutation(err, true, show)).toBe(false);
    expect(notifyRateLimitedMutation(new Error("x"), false, show)).toBe(false);
    expect(show).not.toHaveBeenCalled();
  });
});
