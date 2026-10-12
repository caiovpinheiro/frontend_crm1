/**
 * Um ping por navegador: com 5 abas abertas sai no máximo 1 ping por
 * ciclo (90 s), sempre de uma aba só; se a líder fecha ou trava, outra
 * assume e pinga em até 1 ciclo; um 429 (teto por usuário) recebido pela
 * líder vale para a que assume. Abas simuladas com `__tests__/fake-tabs.ts`
 * (Web Locks e o modo sem Web Locks).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import { PRESENCE_TICK_MS, PresenceTicker, type PresenceCallResult } from "./presence-ticker";
import type { TabCoordinator } from "./tab-coordinator";

type Ping = { at: number; tab: string };
type Aba = { id: string; tab: FakeTab; tabs: TabCoordinator; ticker: PresenceTicker };

const T0 = Date.parse("2026-10-11T12:00:00.000Z");
const IDS = ["a", "b", "c", "d", "e"];

function abrirAbas(
  hub: FakeTabHub,
  pings: Ping[],
  opts: { locks: boolean; reply?: () => PresenceCallResult },
): Aba[] {
  return IDS.map((id) => {
    const tab = hub.tab(id, { locks: opts.locks });
    const tabs = tab.coordinator();
    const ticker = new PresenceTicker(
      tab.presenceTickerEnv(tabs, {
        ping: async () => {
          pings.push({ at: Date.now(), tab: id });
          return opts.reply?.() ?? { status: 200 };
        },
        activity: async () => ({ status: 200 }),
      }),
    );
    return { id, tab, tabs, ticker };
  });
}

function lider(abas: Aba[]): Aba {
  const leaders = abas.filter((x) => !x.tab.closed && x.tabs.role === "leader");
  expect(leaders).toHaveLength(1);
  return leaders[0];
}

function gaps(pings: Ping[]): number[] {
  return pings.slice(1).map((p, i) => p.at - pings[i].at);
}

describe.each([
  { modo: "Web Locks", locks: true },
  { modo: "sem Web Locks (BroadcastChannel)", locks: false },
])("um ping por navegador — $modo", ({ locks }) => {
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

  it("5 abas por 30 min: no máximo 1 ping por ciclo de 90 s, de uma aba só", async () => {
    const abas = abrirAbas(hub, pings, { locks });
    await vi.advanceTimersByTimeAsync(2_000);
    const a = lider(abas);
    // Algumas em segundo plano, como no uso real.
    abas[1].tab.setHidden(true);
    abas[3].tab.setHidden(true);

    await vi.advanceTimersByTimeAsync(30 * 60_000);
    process.stdout.write(
      `[um-ping] ${locks ? "locks" : "fallback"}: 5 abas, 30 min → ${pings.length} pings\n`,
    );
    expect(new Set(pings.map((p) => p.tab))).toEqual(new Set([a.id]));
    expect(pings.length).toBeLessThanOrEqual(Math.floor((30 * 60_000 + 2_000) / PRESENCE_TICK_MS) + 1);
    for (const g of gaps(pings)) expect(g).toBeGreaterThanOrEqual(PRESENCE_TICK_MS);
  });

  it.each([
    { como: "fecha", offset: 10_000 },
    { como: "fecha", offset: 85_000 },
    { como: "trava", offset: 10_000 },
    { como: "trava", offset: 85_000 },
  ])("líder $como $offset ms depois do ping: outra assume e pinga em até 1 ciclo", async ({
    como,
    offset,
  }) => {
    const abas = abrirAbas(hub, pings, { locks });
    await vi.advanceTimersByTimeAsync(2_000);
    const antiga = lider(abas);
    const ultimo = pings[pings.length - 1];
    expect(ultimo.tab).toBe(antiga.id);

    await vi.advanceTimersByTimeAsync(ultimo.at + offset - Date.now());
    if (como === "fecha") {
      antiga.tab.close();
    } else {
      // Processo da aba morreu: sem `pagehide`, e o JS dela não roda mais.
      antiga.tab.crash();
      antiga.ticker.destroy();
    }

    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);
    const nova = lider(abas);
    expect(nova.id).not.toBe(antiga.id);
    const depois = pings.filter((p) => p.at > ultimo.at);
    expect(depois.length).toBeGreaterThanOrEqual(1);
    // Em até 1 ciclo do último ping do navegador, e nunca antes do ciclo.
    expect(depois[0].tab).toBe(nova.id);
    expect(depois[0].at - ultimo.at).toBeLessThanOrEqual(PRESENCE_TICK_MS + 2_000);
    expect(depois[0].at - ultimo.at).toBeGreaterThanOrEqual(PRESENCE_TICK_MS);

    // Daí em diante, 1 por ciclo, só da nova.
    await vi.advanceTimersByTimeAsync(10 * PRESENCE_TICK_MS);
    const seguintes = pings.filter((p) => p.at >= depois[0].at);
    expect(new Set(seguintes.map((p) => p.tab))).toEqual(new Set([nova.id]));
    for (const g of gaps(seguintes)) expect(g).toBeGreaterThanOrEqual(PRESENCE_TICK_MS);
  });

  it("429 (teto por usuário) na líder vale para a que assume: nada antes do prazo", async () => {
    let reply: PresenceCallResult = { status: 200 };
    const abas = abrirAbas(hub, pings, { locks, reply: () => reply });
    await vi.advanceTimersByTimeAsync(2_000);
    const antiga = lider(abas);

    reply = { status: 429, retryAfterMs: 300_000 };
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);
    const at429 = pings[pings.length - 1].at;
    reply = { status: 200 };

    await vi.advanceTimersByTimeAsync(5_000);
    antiga.tab.close();
    await vi.advanceTimersByTimeAsync(at429 + 300_000 - 100 - Date.now());
    expect(pings.filter((p) => p.at > at429)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2_000);
    const depois = pings.filter((p) => p.at > at429);
    expect(depois).toHaveLength(1);
    expect(depois[0].tab).not.toBe(antiga.id);
    expect(depois[0].at - at429).toBeGreaterThanOrEqual(300_000);
  });
});
