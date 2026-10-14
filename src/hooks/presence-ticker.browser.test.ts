/** @vitest-environment jsdom */
/**
 * Tique de presença com o ambiente real do navegador (fetch, logout de
 * `lib/session-revoked.ts`): 401 no ping para o laço e desloga UMA vez;
 * em página de autenticação não desloga; o ping leva `x-tab-id`.
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ signOutToLogin: vi.fn(async () => undefined) }));
vi.mock("@/lib/sign-out-to-login", () => ({
  signOutToLogin: h.signOutToLogin,
  apexLoginUrl: () => "http://localhost/login",
}));
// Aba isolada (sem coordenação): esta aba é a líder de si mesma.
vi.mock("@/hooks/sse-single-leader", () => ({ isSingleLeaderEnabled: () => false }));

import { __resetPresenceBeatHubForTests, PresenceBeatHub } from "@/hooks/presence-beat-hub";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import {
  PRESENCE_TAB_ID_HEADER,
  PRESENCE_TICK_MS,
  postPresencePing,
  readPresenceResponse,
} from "@/hooks/presence-ticker";
import {
  __resetSessionRevokedForTests,
  isSessionEnded,
  SESSION_REVOKED_STORAGE_KEY,
  watchSessionEndInOtherTabs,
} from "@/lib/session-revoked";

type Call = { path: string; headers: Record<string, string> };
let calls: Call[] = [];
let pingStatus = 200;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://localhost");
  calls.push({ path: url.pathname, headers: { ...(init?.headers as Record<string, string>) } });
  const status = url.pathname === "/api/agents/me/ping" ? pingStatus : 200;
  return new Response(JSON.stringify(status === 401 ? { reason: "no_session" } : { ok: true }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
});

const pings = () => calls.filter((c) => c.path === "/api/agents/me/ping");

async function flush() {
  // import() dinâmico do sign-out + microtasks.
  for (let i = 0; i < 5; i += 1) await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  // Backend sem `POST /api/presence/beat`: aqui vale o caminho do ping.
  __resetPresenceBeatHubForTests(new PresenceBeatHub({ readUnsupportedAt: () => Date.now() }));
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(Date.parse("2026-10-11T12:00:00.000Z"));
  calls = [];
  pingStatus = 200;
  h.signOutToLogin.mockClear();
  __resetSessionRevokedForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/inbox");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  __resetSessionRevokedForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ping de presença com sessão revogada", () => {
  it("401 sem code: o laço para e o logout dispara 1 vez; o ping leva x-tab-id", async () => {
    renderHook(() => usePresenceHeartbeat());
    await flush();
    expect(pings()).toHaveLength(1);
    const tabId = pings()[0].headers[PRESENCE_TAB_ID_HEADER];
    expect(tabId).toEqual(expect.any(String));
    expect(tabId.length).toBeGreaterThan(0);

    pingStatus = 401;
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);
    await flush();
    expect(pings()).toHaveLength(2);
    expect(pings()[1].headers[PRESENCE_TAB_ID_HEADER]).toBe(tabId); // estável
    expect(h.signOutToLogin).toHaveBeenCalledTimes(1);
    expect(Number(window.localStorage.getItem(SESSION_REVOKED_STORAGE_KEY))).toBeGreaterThan(0);
    expect(isSessionEnded()).toBe(true);

    for (let i = 0; i < 10; i += 1) {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(pings()).toHaveLength(2);
    expect(h.signOutToLogin).toHaveBeenCalledTimes(1);
  });

  it("página /login: 401 não dispara logout (e o laço não insiste)", async () => {
    window.history.replaceState(null, "", "/login");
    pingStatus = 401;
    renderHook(() => usePresenceHeartbeat());
    await flush();
    await vi.advanceTimersByTimeAsync(10 * PRESENCE_TICK_MS);
    await flush();
    expect(pings()).toHaveLength(1);
    expect(h.signOutToLogin).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SESSION_REVOKED_STORAGE_KEY)).toBeNull();
  });

  it("outra aba já deslogou: esta não chama o signOut, para de pingar e vai ao login", async () => {
    const navigate = vi.fn();
    watchSessionEndInOtherTabs(navigate);
    renderHook(() => usePresenceHeartbeat());
    await flush();
    expect(pings()).toHaveLength(1);

    const now = String(Date.now());
    window.localStorage.setItem(SESSION_REVOKED_STORAGE_KEY, now);
    window.dispatchEvent(
      new StorageEvent("storage", { key: SESSION_REVOKED_STORAGE_KEY, newValue: now }),
    );
    await vi.advanceTimersByTimeAsync(10 * PRESENCE_TICK_MS);
    await flush();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(pings()).toHaveLength(1);
    expect(h.signOutToLogin).not.toHaveBeenCalled();
  });
});

describe("respostas do ping", () => {
  it("postPresencePing manda o x-tab-id e lê o 429 (corpo ou Retry-After)", async () => {
    vi.useRealTimers();
    const fake = vi.fn(
      async () =>
        new Response(JSON.stringify({ retryAfterMs: 12_000 }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "30" },
        }),
    ) as unknown as typeof fetch;
    expect(await postPresencePing("aba-1", fake)).toEqual({ status: 429, retryAfterMs: 12_000 });
    const init = (fake as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)[PRESENCE_TAB_ID_HEADER]).toBe("aba-1");
    expect(init.method).toBe("POST");

    expect(
      await readPresenceResponse(
        new Response("muitas", { status: 429, headers: { "Retry-After": "30" } }),
      ),
    ).toEqual({ status: 429, retryAfterMs: 30_000 });
    expect(await readPresenceResponse(new Response("{}", { status: 401 }))).toEqual({
      status: 401,
    });
  });
});
