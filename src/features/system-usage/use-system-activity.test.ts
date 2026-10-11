/** @vitest-environment jsdom */
/**
 * `POST /api/agents/me/activity` é o sinal de ATIVIDADE REAL do backend
 * (expiração da sessão por 12 h de inatividade; ping não conta). Só sai
 * quando houve interação real — clique, tecla ou troca de rota — desde o
 * último envio; janela sem interação não manda nada (nem 0 pulsos). O
 * ping segue a cadência de 90 s.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/inbox" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
// Aba isolada (sem coordenação): esta aba é a líder de si mesma.
vi.mock("@/hooks/sse-single-leader", () => ({ isSingleLeaderEnabled: () => false }));

import { PRESENCE_TICK_MS } from "@/hooks/presence-ticker";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import { __resetSessionRevokedForTests } from "@/lib/session-revoked";

import { useSystemActivity } from "./use-system-activity";

type Call = { at: number; path: string; body: unknown };
let calls: Call[] = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://localhost");
  calls.push({
    at: Date.now(),
    path: url.pathname,
    body: init?.body ? JSON.parse(String(init.body)) : null,
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

const pings = () => calls.filter((c) => c.path === "/api/agents/me/ping");
const activity = () => calls.filter((c) => c.path === "/api/agents/me/activity");

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function mount() {
  return renderHook(() => {
    usePresenceHeartbeat();
    useSystemActivity();
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(Date.parse("2026-10-11T12:00:00.000Z"));
  calls = [];
  nav.pathname = "/inbox";
  __resetSessionRevokedForTests();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/inbox");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("activity só com interação real", () => {
  it("90 s sem interação → 0 activity (o ping segue a cadência)", async () => {
    mount();
    await advance(0);
    expect(pings()).toHaveLength(1);

    await advance(PRESENCE_TICK_MS);
    expect(pings()).toHaveLength(2);
    expect(activity()).toHaveLength(0);

    // Alternar abas/foco não é interação; 10 min parado continua sem activity.
    for (let i = 0; i < 10; i += 1) {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await advance(60_000);
    }
    expect(activity()).toHaveLength(0);
    expect(pings().length).toBeGreaterThanOrEqual(7);
  });

  it("1 clique → 1 activity (interactionCount 1) no próximo tique, junto do ping", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    mount();
    await advance(0);
    await advance(PRESENCE_TICK_MS);
    expect(activity()).toHaveLength(0);

    const before = pings().length;
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await advance(PRESENCE_TICK_MS);
    expect(activity()).toHaveLength(1);
    expect(activity()[0].body).toEqual({ interactionCount: 1 });
    const tick = pings().slice(before).find((p) => p.at === activity()[0].at);
    expect(tick).toBeDefined();

    // Janela seguinte sem interação: nada de activity.
    await advance(2 * PRESENCE_TICK_MS);
    expect(activity()).toHaveLength(1);
  });

  it("tecla em campo editável e troca de rota contam; clique fora de controle não", async () => {
    const input = document.createElement("input");
    const div = document.createElement("div");
    document.body.append(input, div);
    const view = mount();
    await advance(0);

    div.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await advance(2 * PRESENCE_TICK_MS);
    expect(activity()).toHaveLength(0);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    nav.pathname = "/pipeline";
    view.rerender();
    await advance(PRESENCE_TICK_MS);
    expect(activity()).toHaveLength(1);
    expect(activity()[0].body).toEqual({ interactionCount: 2 });
  });
});
