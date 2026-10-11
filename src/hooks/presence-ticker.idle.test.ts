/**
 * Logout por ociosidade no tique de presença: o ping leva a última
 * interação do NAVEGADOR (`lastInteractionAt`, de qualquer aba), o 200
 * informa `sessionIdleMs`, e a líder confere o limite a cada tique, antes
 * do ping. Ping, refetch e timers não contam como interação. Abas
 * simuladas com `__tests__/fake-tabs.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionIdleClock } from "@/lib/session-idle";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import { PRESENCE_TICK_MS, PresenceTicker, type PresenceCallResult } from "./presence-ticker";
import type { TabCoordinator } from "./tab-coordinator";

type Ping = { at: number; tab: string; lastInteractionAt: number | null };

type Aba = {
  tab: FakeTab;
  tabs: TabCoordinator;
  ticker: PresenceTicker;
  clock: SessionIdleClock;
  /** Interação humana nesta aba (o que o rastreador faz). */
  interact: () => void;
};

const T0 = Date.parse("2026-10-11T12:00:00.000Z");

function abrirAba(
  hub: FakeTabHub,
  pings: Ping[],
  id: string,
  opts: { pingResult?: () => PresenceCallResult; onExpired: () => boolean },
): Aba {
  const tab = hub.tab(id);
  const tabs = tab.coordinator();
  const clock = new SessionIdleClock(hub.storageFor(id));
  const ticker = new PresenceTicker(
    tab.presenceTickerEnv(tabs, {
      ping: async (lastInteractionAt) => {
        pings.push({ at: Date.now(), tab: id, lastInteractionAt });
        return opts.pingResult?.() ?? { status: 200 };
      },
      activity: async () => ({ status: 200 }),
      idle: {
        lastInteractionAt: () => clock.lastInteractionAt(),
        isExpired: () => clock.isIdleExpired(),
        setLimitMs: (ms) => clock.setIdleLimitMs(ms),
        onExpired: opts.onExpired,
      },
    }),
  );
  return {
    tab,
    tabs,
    ticker,
    clock,
    interact: () => {
      clock.mark();
      ticker.record();
    },
  };
}

describe("tique de presença: ociosidade", () => {
  let hub: FakeTabHub;
  let pings: Ping[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    hub = new FakeTabHub();
    pings = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("o ping leva lastInteractionAt — a interação de uma SEGUIDORA chega no ping da líder", async () => {
    const onExpired = vi.fn(() => true);
    const a = abrirAba(hub, pings, "a", { onExpired });
    const b = abrirAba(hub, pings, "b", { onExpired });
    a.interact(); // abertura da página
    await vi.advanceTimersByTimeAsync(50);
    expect(a.tabs.role).toBe("leader");
    expect(pings[0].lastInteractionAt).toBe(T0);

    await vi.advanceTimersByTimeAsync(30_000);
    b.interact();
    const clickAt = Date.now();
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);
    const last = pings[pings.length - 1];
    expect(last.tab).toBe("a");
    expect(last.lastInteractionAt).toBe(clickAt);
  });

  it("sessionIdleMs=180000 e 3 min sem interação → logout 1 vez, sem mais pings", async () => {
    const onExpired = vi.fn(() => true);
    const resp = () => ({ status: 200, sessionIdleMs: 180_000 });
    const a = abrirAba(hub, pings, "a", { onExpired, pingResult: resp });
    const b = abrirAba(hub, pings, "b", { onExpired, pingResult: resp });
    a.interact();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(b.clock.idleLimitMs()).toBe(180_000); // compartilhado com a seguidora
    a.interact(); // última interação: t = 10 s

    // Tique de 180 s: 170 s parado, segue.
    await vi.advanceTimersByTimeAsync(190_000);
    expect(onExpired).not.toHaveBeenCalled();
    const before = pings.length;
    expect(before).toBe(3); // 0, 90 e 180 s
    // Tique de 270 s: 260 s parado (> 3 min) → logout, sem ping.
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(pings.length).toBe(before);
    expect(a.ticker.stopped).toBe(true);

    await vi.advanceTimersByTimeAsync(10 * PRESENCE_TICK_MS);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(pings.length).toBe(before);
  });

  it("ping, refetch e timers não contam: 10 min de pings não renovam a última interação", async () => {
    const onExpired = vi.fn(() => true);
    const a = abrirAba(hub, pings, "a", { onExpired });
    a.interact();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(pings.length).toBeGreaterThanOrEqual(6);
    expect(a.clock.lastInteractionAt()).toBe(T0);
    expect(new Set(pings.map((p) => p.lastInteractionAt))).toEqual(new Set([T0]));
  });

  it("uso em qualquer aba mantém a sessão: nada de logout com interação a cada 2 min", async () => {
    const onExpired = vi.fn(() => true);
    const resp = () => ({ status: 200, sessionIdleMs: 180_000 });
    const a = abrirAba(hub, pings, "a", { onExpired, pingResult: resp });
    const b = abrirAba(hub, pings, "b", { onExpired, pingResult: resp });
    a.interact();
    await vi.advanceTimersByTimeAsync(50);
    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(120_000);
      b.interact(); // só a seguidora é usada
    }
    expect(onExpired).not.toHaveBeenCalled();
    expect(a.ticker.stopped).toBe(false);
  });

  it("sem sessionIdleMs no 200 (backend antigo): limite de 12 h", async () => {
    const onExpired = vi.fn(() => true);
    const a = abrirAba(hub, pings, "a", { onExpired });
    a.interact();
    await vi.advanceTimersByTimeAsync(11 * 60 * 60_000);
    expect(onExpired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60 * 60_000 + 2 * PRESENCE_TICK_MS);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
