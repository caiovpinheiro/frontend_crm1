/**
 * F2 (05/10) — ping de presença e activity entre abas: só a líder chama a
 * API, num tique de 90 s (nunca < 45 s), com o uso de todas as abas
 * agregado. Abas simuladas com `__tests__/fake-tabs.ts`; timers falsos.
 *
 * "Antes" (para comparação, do código anterior): cada aba pingava ao
 * abrir + a cada 90 s → 3 abas × 7 = 21 pings em 10 min, mais ~18
 * activity da aba em uso (2 por janela + 1 por troca de rota).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import {
  ACTIVITY_SESSION_IDLE_MS,
  PRESENCE_MIN_GAP_MS,
  PRESENCE_TICK_MS,
  PresenceTicker,
} from "./presence-ticker";
import type { TabCoordinator } from "./tab-coordinator";

type Chamada = { at: number; tab: string; kind: "ping" | "activity"; count?: number };

type Aba = { tab: FakeTab; tabs: TabCoordinator; ticker: PresenceTicker };

function abrirAba(hub: FakeTabHub, api: Chamada[], id: string): Aba {
  const tab = hub.tab(id);
  const tabs = tab.coordinator();
  const ticker = new PresenceTicker(
    tab.presenceTickerEnv(tabs, {
      ping: async () => {
        api.push({ at: Date.now(), tab: id, kind: "ping" });
      },
      activity: async (count) => {
        api.push({ at: Date.now(), tab: id, kind: "activity", count });
      },
    }),
  );
  return { tab, tabs, ticker };
}

const T0 = Date.parse("2026-10-05T12:00:00.000Z");

describe("tique de presença entre abas", () => {
  let hub: FakeTabHub;
  let api: Chamada[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    hub = new FakeTabHub();
    api = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("3 abas, 10 min de uso na seguidora: 1 ping por janela, só da líder, com o uso agregado", async () => {
    const a = abrirAba(hub, api, "a");
    const b = abrirAba(hub, api, "b");
    const c = abrirAba(hub, api, "c");
    await vi.advanceTimersByTimeAsync(50);
    expect(a.tabs.role).toBe("leader");
    a.tab.setHidden(true);
    c.tab.setHidden(true);

    const tenMin = 10 * 60_000;
    let clicks = 0;
    for (let t = 1_000; t <= tenMin; t += 1_000) {
      await vi.advanceTimersByTimeAsync(1_000);
      if (t % 10_000 === 0) {
        b.ticker.record();
        clicks += 1;
      }
      // Aba oculta não conta uso.
      if (t % 30_000 === 0) c.ticker.record();
    }
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);

    const pings = api.filter((x) => x.kind === "ping");
    const activity = api.filter((x) => x.kind === "activity");
    process.stdout.write(
      `[presence-ticker] 10 min, 3 abas: ping=${pings.length} activity=${activity.length}\n`,
    );
    expect(new Set(api.map((x) => x.tab))).toEqual(new Set(["a"]));
    // 0 s, abertura da sessão (45 s) e a cada 90 s a partir dela.
    expect(pings.length).toBeLessThanOrEqual(9);
    expect(activity.length).toBeLessThanOrEqual(8);
    const sent = activity.reduce((sum, x) => sum + (x.count ?? 0), 0);
    expect(sent).toBe(clicks);
    for (let i = 1; i < pings.length; i += 1) {
      expect(pings[i].at - pings[i - 1].at).toBeGreaterThanOrEqual(PRESENCE_MIN_GAP_MS);
    }
    // Ping e activity saem no mesmo tique.
    for (const x of activity) {
      expect(pings.some((p) => p.at === x.at)).toBe(true);
    }
  });

  it("líder fecha: a nova líder segue a cadência sem ping a menos de 45 s do último", async () => {
    const a = abrirAba(hub, api, "a");
    const b = abrirAba(hub, api, "b");
    await vi.advanceTimersByTimeAsync(50);
    expect(api.filter((x) => x.kind === "ping").map((x) => x.tab)).toEqual(["a"]);

    await vi.advanceTimersByTimeAsync(10_000);
    a.tab.close();
    await vi.advanceTimersByTimeAsync(100);
    expect(b.tabs.role).toBe("leader");
    // Último tique (da antiga líder) foi há ~10 s: nada agora.
    expect(api.filter((x) => x.kind === "ping")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);
    const pings = api.filter((x) => x.kind === "ping");
    expect(pings.map((x) => x.tab)).toEqual(["a", "b"]);
    expect(pings[1].at - pings[0].at).toBeGreaterThanOrEqual(PRESENCE_MIN_GAP_MS);
  });

  it("uso depois de 5 min parado abre a sessão já (respeitando os 45 s)", async () => {
    const a = abrirAba(hub, api, "a");
    await vi.advanceTimersByTimeAsync(50);
    expect(api).toHaveLength(1); // ping inicial, sem uso

    await vi.advanceTimersByTimeAsync(10_000);
    a.ticker.record(3);
    // Menos de 45 s do ping inicial: espera completar os 45 s.
    await vi.advanceTimersByTimeAsync(PRESENCE_MIN_GAP_MS - 10_000 - 100);
    expect(api.filter((x) => x.kind === "activity")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(api.filter((x) => x.kind === "activity")).toEqual([
      expect.objectContaining({ tab: "a", count: 3 }),
    ]);

    // Uso contínuo depois disso: só no tique regular (90 s).
    a.ticker.record();
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS - 1_000);
    expect(api.filter((x) => x.kind === "activity")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(api.filter((x) => x.kind === "activity")).toHaveLength(2);

    // 5 min sem uso e volta: abre a sessão em até 45 s (o ping regular
    // segue no meio; o tique antecipado reinicia a cadência).
    await vi.advanceTimersByTimeAsync(ACTIVITY_SESSION_IDLE_MS + 10_000);
    const before = api.length;
    const at = Date.now();
    a.ticker.record();
    await vi.advanceTimersByTimeAsync(PRESENCE_MIN_GAP_MS);
    const opened = api.slice(before).find((x) => x.kind === "activity");
    expect(opened?.at).toBeDefined();
    expect((opened?.at ?? Infinity) - at).toBeLessThanOrEqual(PRESENCE_MIN_GAP_MS);
    expect(api.slice(before).some((x) => x.kind === "ping" && x.at === opened?.at)).toBe(true);
  });

  it("aba volta a ficar visível: só antecipa o tique se ele estiver atrasado", async () => {
    const a = abrirAba(hub, api, "a");
    await vi.advanceTimersByTimeAsync(50);
    a.tab.setHidden(true);
    a.tab.setHidden(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(api).toHaveLength(1);
  });

  it("seguidora fechando repassa o uso que ainda não tinha ido", async () => {
    abrirAba(hub, api, "a");
    const b = abrirAba(hub, api, "b");
    await vi.advanceTimersByTimeAsync(50);
    // Sessão já aberta: o uso espera o tique regular.
    await vi.advanceTimersByTimeAsync(PRESENCE_MIN_GAP_MS);
    b.ticker.record(2);
    await vi.advanceTimersByTimeAsync(1_000);
    b.tab.close();
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);
    const sent = api
      .filter((x) => x.kind === "activity")
      .reduce((sum, x) => sum + (x.count ?? 0), 0);
    expect(sent).toBe(2);
    expect(new Set(api.map((x) => x.tab))).toEqual(new Set(["a"]));
  });
});
