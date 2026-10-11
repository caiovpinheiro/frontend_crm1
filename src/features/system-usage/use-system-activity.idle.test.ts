/** @vitest-environment jsdom */
/**
 * Logout por ociosidade com o ambiente real do navegador (fetch,
 * localStorage, `lib/session-idle.ts` e o logout único de
 * `lib/session-revoked.ts`): o ping leva `lastInteractionAt`; o limite vem
 * do 200 (`sessionIdleMs`); rolagem e foco contam; voltar ao foco depois
 * do limite desloga (a checagem vem antes de registrar a volta).
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  signOutToLogin: vi.fn(async () => undefined),
  pathname: "/inbox",
}));
vi.mock("@/lib/sign-out-to-login", () => ({
  signOutToLogin: h.signOutToLogin,
  apexLoginUrl: () => "http://localhost/login",
}));
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));
// Aba isolada (sem coordenação): esta aba é a líder de si mesma.
vi.mock("@/hooks/sse-single-leader", () => ({ isSingleLeaderEnabled: () => false }));

import { PRESENCE_TICK_MS } from "@/hooks/presence-ticker";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import {
  AUTO_RELOAD_STORAGE_KEY,
  LAST_INTERACTION_STORAGE_KEY,
  __resetSessionIdleForTests,
  markAutoReload,
  sessionIdleClock,
} from "@/lib/session-idle";
import { reloadOnceForStaleChunk } from "@/lib/stale-chunk-error";
import { __resetSessionRevokedForTests, isSessionEnded } from "@/lib/session-revoked";

import { useSystemActivity } from "./use-system-activity";

type Call = { at: number; path: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let pingReply: { status: number; body: unknown } = {
  status: 200,
  body: { ok: true, sessionIdleMs: 180_000 },
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://localhost");
  calls.push({
    at: Date.now(),
    path: url.pathname,
    body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
  });
  const reply = url.pathname === "/api/agents/me/ping" ? pingReply : { status: 200, body: {} };
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
});

const pings = () => calls.filter((c) => c.path === "/api/agents/me/ping");
const activity = () => calls.filter((c) => c.path === "/api/agents/me/activity");

const T0 = Date.parse("2026-10-11T12:00:00.000Z");

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function flush() {
  for (let i = 0; i < 5; i += 1) await advance(0);
}

function mount() {
  return renderHook(() => {
    usePresenceHeartbeat();
    useSystemActivity();
  });
}

function focusBack() {
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(T0);
  calls = [];
  pingReply = { status: 200, body: { ok: true, sessionIdleMs: 180_000 } };
  h.pathname = "/inbox";
  h.signOutToLogin.mockClear();
  __resetSessionRevokedForTests();
  __resetSessionIdleForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/inbox");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  __resetSessionRevokedForTests();
  __resetSessionIdleForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ociosidade no navegador", () => {
  it("o ping leva lastInteractionAt (abertura da página conta)", async () => {
    mount();
    await flush();
    expect(pings()).toHaveLength(1);
    expect(pings()[0].body).toEqual({ lastInteractionAt: T0 });
    expect(window.localStorage.getItem(LAST_INTERACTION_STORAGE_KEY)).toBe(String(T0));
  });

  it("3 min sem interação com sessionIdleMs=180000 → logout 1 vez e o ping para", async () => {
    mount();
    await flush();
    await advance(4 * PRESENCE_TICK_MS);
    await flush();
    expect(h.signOutToLogin).toHaveBeenCalledTimes(1);
    expect(isSessionEnded()).toBe(true);
    const n = pings().length;
    expect(n).toBeLessThanOrEqual(3); // 0, 90 e 180 s; o de 270 s não sai

    await advance(10 * PRESENCE_TICK_MS);
    focusBack();
    await flush();
    expect(pings()).toHaveLength(n);
    expect(h.signOutToLogin).toHaveBeenCalledTimes(1);
  });

  it("rolagem (wheel/touchmove, 1 a cada 5 s) e foco contam como interação e no activity", async () => {
    mount();
    await flush();
    await advance(60_000);
    for (let i = 0; i < 10; i += 1) {
      document.dispatchEvent(new Event("wheel", { bubbles: true }));
      document.dispatchEvent(new Event("touchmove", { bubbles: true }));
      await advance(100);
    }
    const scrolledAt = T0 + 60_000;
    expect(sessionIdleClock()?.lastInteractionAt()).toBe(scrolledAt);

    await advance(30_000);
    focusBack(); // focus + visibilitychange juntos = 1
    const focusedAt = Date.now();
    expect(sessionIdleClock()?.lastInteractionAt()).toBe(focusedAt);

    await advance(PRESENCE_TICK_MS);
    const sent = activity().reduce((sum, c) => sum + Number(c.body?.interactionCount ?? 0), 0);
    expect(sent).toBe(2); // 1 rolagem (throttle) + 1 volta ao foco
    expect(h.signOutToLogin).not.toHaveBeenCalled();
    expect(pings()[pings().length - 1].body).toEqual({ lastInteractionAt: focusedAt });
  });

  it("voltar ao foco depois do limite (ex.: notebook dormindo) → logout, e a volta não conta", async () => {
    mount();
    await flush();
    // Relógio salta 10 min sem nenhum timer rodar (máquina suspensa).
    vi.setSystemTime(T0 + 10 * 60_000);
    focusBack();
    await flush();
    expect(h.signOutToLogin).toHaveBeenCalledTimes(1);
    expect(sessionIdleClock()?.lastInteractionAt()).toBe(T0);
    expect(activity()).toHaveLength(0);
  });

  it("interação em outra aba (evento storage) mantém esta viva e vai no ping", async () => {
    mount();
    await flush();
    for (let t = 0; t < 6; t += 1) {
      await advance(60_000);
      const other = String(Date.now());
      window.localStorage.setItem(LAST_INTERACTION_STORAGE_KEY, other);
      window.dispatchEvent(
        new StorageEvent("storage", { key: LAST_INTERACTION_STORAGE_KEY, newValue: other }),
      );
    }
    await flush();
    expect(h.signOutToLogin).not.toHaveBeenCalled();
    expect(pings()[pings().length - 1].body?.lastInteractionAt).toBeGreaterThan(T0);
  });

  it("401 com reason idle cai no fluxo comum de 401: logout 1 vez", async () => {
    pingReply = { status: 401, body: { code: "SESSION_REVOKED", reason: "idle" } };
    mount();
    await flush();
    expect(h.signOutToLogin).toHaveBeenCalledTimes(1);
    await advance(5 * PRESENCE_TICK_MS);
    expect(pings()).toHaveLength(1);
  });

  it("página de autenticação: não desloga por ociosidade", async () => {
    window.history.replaceState(null, "", "/login");
    mount();
    await flush();
    vi.setSystemTime(T0 + 10 * 60_000);
    focusBack();
    await advance(4 * PRESENCE_TICK_MS);
    await flush();
    expect(h.signOutToLogin).not.toHaveBeenCalled();
  });
});

describe("recarga automática não é interação", () => {
  const HORA = 60 * 60_000;

  it("recarga automática com a última interação há 13 h → logout, sem ping e sem activity", async () => {
    window.localStorage.setItem(LAST_INTERACTION_STORAGE_KEY, String(T0 - 13 * HORA));
    markAutoReload(); // a página anterior marcou antes do location.reload()
    mount();
    await flush();
    await advance(PRESENCE_TICK_MS);
    await flush();
    expect(h.signOutToLogin).toHaveBeenCalledTimes(1);
    expect(sessionIdleClock()?.lastInteractionAt()).toBe(T0 - 13 * HORA);
    expect(activity()).toHaveLength(0);
    expect(pings()).toHaveLength(0);
    expect(window.sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY)).toBeNull(); // consumida
  });

  it("recarga automática com interação recente → não conta (lastInteractionAt inalterado), sem activity", async () => {
    const recente = T0 - 10 * 60_000;
    window.localStorage.setItem(LAST_INTERACTION_STORAGE_KEY, String(recente));
    pingReply = { status: 200, body: { ok: true, sessionIdleMs: 12 * HORA } };
    markAutoReload();
    mount();
    await flush();
    expect(h.signOutToLogin).not.toHaveBeenCalled();
    expect(sessionIdleClock()?.lastInteractionAt()).toBe(recente);
    expect(window.localStorage.getItem(LAST_INTERACTION_STORAGE_KEY)).toBe(String(recente));
    expect(pings()[0].body).toEqual({ lastInteractionAt: recente });
    await advance(PRESENCE_TICK_MS);
    expect(activity()).toHaveLength(0);
  });

  it("abertura manual (sem a marca) conta — mesmo com storage de 13 h atrás (login no apex)", async () => {
    window.localStorage.setItem(LAST_INTERACTION_STORAGE_KEY, String(T0 - 13 * HORA));
    mount();
    await flush();
    expect(h.signOutToLogin).not.toHaveBeenCalled();
    expect(sessionIdleClock()?.lastInteractionAt()).toBe(T0);
    expect(pings()[0].body).toEqual({ lastInteractionAt: T0 });
    // Abrir a página só renova a última interação: não vira activity.
    await advance(PRESENCE_TICK_MS);
    expect(activity()).toHaveLength(0);
  });

  it("marca velha (o reload marcado não aconteceu) não vale: abertura conta", async () => {
    window.sessionStorage.setItem(AUTO_RELOAD_STORAGE_KEY, String(T0 - 5 * 60_000));
    mount();
    await flush();
    expect(sessionIdleClock()?.lastInteractionAt()).toBe(T0);
  });

  it("os caminhos automáticos marcam: `online` (reload do Serwist) e chunk velho", async () => {
    mount();
    await flush();
    expect(window.sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY)).toBeNull();
    window.dispatchEvent(new Event("online"));
    expect(window.sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY)).toBe(String(T0));

    window.sessionStorage.clear();
    // jsdom não navega (só avisa "not implemented"); importa a marca.
    reloadOnceForStaleChunk({ name: "ChunkLoadError", message: "Loading chunk 12 failed" });
    expect(window.sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY)).toBe(String(T0));
  });
});
