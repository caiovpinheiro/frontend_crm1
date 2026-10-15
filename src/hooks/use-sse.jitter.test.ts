/**
 * Gate de carga, item E — deploy sem pico de sobrecarga:
 *  - a 1ª reconexão depois da QUEDA de uma conexão aberta (servidor
 *    reiniciou, stream parado) sai num instante uniforme em [0, 20 s];
 *  - a primeira conexão da página e a troca de líder conectam na hora;
 *  - o refetch em massa (`onReconnect`) usa o mesmo espalhamento: a líder
 *    que já esperou o sorteio refaz no open; as seguidoras sorteiam o seu.
 * Relógio falso e sorteio determinístico.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub } from "./__tests__/fake-tabs";
import {
  SSE_HEARTBEAT_EVENT,
  SSE_RECONNECT_SPREAD_MS,
  SSE_STALE_AFTER_MS,
  SseTabBridge,
  sseReconnectSpreadMs,
} from "./use-sse";

const URL = "/api/sse/messages";

/** Gerador determinístico (LCG) em [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 2 ** 32;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-15T15:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sseReconnectSpreadMs", () => {
  it("uniforme em [0, 20 s]", () => {
    expect(SSE_RECONNECT_SPREAD_MS).toBe(20_000);
    expect(sseReconnectSpreadMs(() => 0)).toBe(0);
    expect(sseReconnectSpreadMs(() => 0.5)).toBe(10_000);
    expect(sseReconnectSpreadMs(() => 0.999_999)).toBe(20_000);
  });
});

describe("reconexão da líder depois de queda", () => {
  it("primeira conexão da página: na hora (sem sorteio)", () => {
    const hub = new FakeTabHub();
    const tab = hub.tab("a");
    const bridge = new SseTabBridge(tab.sseEnv(null, { random: () => 0.99 }));
    bridge.connection(URL).subscribe(["new_message"], vi.fn());
    expect(tab.eventSources).toHaveLength(1);
  });

  it("deploy: 40 navegadores caem juntos → voltam espalhados em [0, 20 s] (antes: todos entre 3,5 e 6,5 s)", async () => {
    const rand = rng(2026);
    const browsers = Array.from({ length: 40 }, (_, i) => {
      const tab = new FakeTabHub().tab(`n${i}`);
      const bridge = new SseTabBridge(tab.sseEnv(null, { random: rand }));
      bridge.connection(URL).subscribe(["new_message"], vi.fn());
      tab.es.open();
      return tab;
    });
    const t0 = Date.now();
    for (const tab of browsers) tab.es.fail(); // servidor reiniciou

    const backAt = new Map<number, number>();
    for (let ms = 0; ms <= SSE_RECONNECT_SPREAD_MS; ms += 100) {
      await vi.advanceTimersByTimeAsync(ms === 0 ? 0 : 100);
      browsers.forEach((tab, i) => {
        if (tab.eventSources.length === 2 && !backAt.has(i)) backAt.set(i, Date.now() - t0);
      });
    }
    expect(backAt.size).toBe(40);
    const times = [...backAt.values()];
    expect(Math.min(...times)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...times)).toBeLessThanOrEqual(SSE_RECONNECT_SPREAD_MS);
    // Espalhado: nenhum segundo concentra mais de 1/4 das voltas, e as voltas
    // cobrem a maior parte da janela.
    const perSecond = new Map<number, number>();
    for (const at of times) perSecond.set(Math.floor(at / 1_000), (perSecond.get(Math.floor(at / 1_000)) ?? 0) + 1);
    expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(10);
    expect(Math.max(...times) - Math.min(...times)).toBeGreaterThan(15_000);
    process.stdout.write(
      `[gate E] 40 navegadores: voltas entre ${Math.min(...times)} e ${Math.max(...times)} ms; pico ${Math.max(
        ...perSecond.values(),
      )}/s (antes: 40 em ~3 s)\n`,
    );
  });

  it("stream parado (sem batimento) também volta no sorteio", async () => {
    const tab = new FakeTabHub().tab("a");
    const bridge = new SseTabBridge(tab.sseEnv(null, { random: () => 0.75 }));
    bridge.connection(URL).subscribe(["new_message"], vi.fn());
    tab.es.open();
    tab.es.emit(SSE_HEARTBEAT_EVENT, {});
    await vi.advanceTimersByTimeAsync(SSE_STALE_AFTER_MS + 5_000);
    expect(tab.eventSources[0]!.closed).toBe(true);
    const closedAt = Date.now();
    while (tab.eventSources.length === 1 && Date.now() - closedAt < 30_000) {
      await vi.advanceTimersByTimeAsync(500);
    }
    // 0,75 × 20 s = 15 s depois de marcado parado (checagem a cada 5 s).
    expect(tab.eventSources).toHaveLength(2);
    expect(Date.now() - closedAt).toBeGreaterThanOrEqual(10_000);
    expect(Date.now() - closedAt).toBeLessThanOrEqual(15_500);
  });

  it("handshake recusado sem abrir (servidor ainda subindo): backoff normal depois do sorteio", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // backoff usa Math.random
    const tab = new FakeTabHub().tab("a");
    const bridge = new SseTabBridge(tab.sseEnv(null, { random: () => 0 }));
    bridge.connection(URL).subscribe(["new_message"], vi.fn());
    tab.es.open();
    tab.es.fail();
    await vi.advanceTimersByTimeAsync(0);
    expect(tab.eventSources).toHaveLength(2); // sorteio 0 → na hora
    tab.es.fail(); // ainda subindo
    await vi.advanceTimersByTimeAsync(10_000 * 0.7 - 1); // backoff 10 s −30%
    expect(tab.eventSources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(tab.eventSources).toHaveLength(3);
  });
});

describe("refetch em massa (onReconnect) com o mesmo espalhamento", () => {
  it("líder que esperou o sorteio refaz no open; 3 seguidoras refazem cada uma no seu sorteio em [0, 20 s]", async () => {
    const hub = new FakeTabHub();
    const draws = [0.1, 0.4, 0.7, 0.95];
    const abas = ["a", "b", "c", "d"].map((id, i) => {
      const tab = hub.tab(id, { locks: true });
      const tabs = tab.coordinator();
      const r = draws[i]!;
      const bridge = new SseTabBridge(tab.sseEnv(tabs, { random: () => r }));
      const onReconnect = vi.fn();
      bridge.connection(URL).subscribe(["new_message"], vi.fn(), onReconnect);
      return { tab, tabs, onReconnect };
    });
    await vi.advanceTimersByTimeAsync(50);
    const leader = abas.find((x) => x.tabs.role === "leader")!;
    leader.tab.es.open();
    await vi.advanceTimersByTimeAsync(50);

    leader.tab.es.fail();
    await vi.advanceTimersByTimeAsync(SSE_RECONNECT_SPREAD_MS);
    leader.tab.es.open();
    const openedAt = Date.now();
    await vi.advanceTimersByTimeAsync(0);
    expect(leader.onReconnect).toHaveBeenCalledTimes(1);

    const firedAt = new Map<string, number>();
    while (Date.now() - openedAt <= SSE_RECONNECT_SPREAD_MS) {
      await vi.advanceTimersByTimeAsync(100);
      for (const x of abas) {
        if (x !== leader && x.onReconnect.mock.calls.length > 0 && !firedAt.has(x.tab.id)) {
          firedAt.set(x.tab.id, Date.now() - openedAt);
        }
      }
    }
    const followers = abas.filter((x) => x !== leader);
    for (const x of followers) expect(x.onReconnect).toHaveBeenCalledTimes(1);
    const times = [...firedAt.values()].sort((p, q) => p - q);
    expect(times).toHaveLength(3);
    // Instantes diferentes (um por aba), todos dentro de [0, 20 s].
    expect(new Set(times.map((t) => Math.floor(t / 1_000))).size).toBe(3);
    for (const t of times) expect(t).toBeLessThanOrEqual(SSE_RECONNECT_SPREAD_MS + 100);
  });

  it("troca de líder: a nova conecta NA HORA (não é onda) e o refetch é sorteado", async () => {
    const hub = new FakeTabHub();
    const mk = (id: string) => {
      const tab = hub.tab(id, { locks: true });
      const tabs = tab.coordinator();
      const bridge = new SseTabBridge(tab.sseEnv(tabs, { random: () => 0.25 }));
      const onReconnect = vi.fn();
      bridge.connection(URL).subscribe(["new_message"], vi.fn(), onReconnect);
      return { tab, tabs, onReconnect };
    };
    const a = mk("a");
    const b = mk("b");
    await vi.advanceTimersByTimeAsync(50);
    a.tab.es.open();
    await vi.advanceTimersByTimeAsync(50);
    a.tab.close();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(b.tabs.role).toBe("leader");
    expect(b.tab.eventSources).toHaveLength(1); // conectou já, sem esperar 0–20 s
    b.tab.es.open();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(b.onReconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); // 0,25 × 20 s
    expect(b.onReconnect).toHaveBeenCalledTimes(1);
  });

  it("primeira abertura da página não dispara refetch", async () => {
    const tab = new FakeTabHub().tab("a");
    const onReconnect = vi.fn();
    const bridge = new SseTabBridge(tab.sseEnv(null, { random: () => 0 }));
    bridge.connection(URL).subscribe(["new_message"], vi.fn(), onReconnect);
    tab.es.open();
    await vi.advanceTimersByTimeAsync(SSE_RECONNECT_SPREAD_MS * 2);
    expect(onReconnect).not.toHaveBeenCalled();
  });
});
