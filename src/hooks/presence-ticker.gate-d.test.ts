/**
 * Gate de carga, item 3 (heartbeat + ping ≤ 30/min na org):
 *  - aba líder bate a cada 60 s exatos — nenhuma outra fonte de ping,
 *    heartbeat ou beat com o backend novo;
 *  - todas as abas do navegador ocultas há 5 min ou mais → 120 s (lista
 *    vazia); uma aba que volta a ficar visível traz os 60 s de volta na hora;
 *  - 204 do backend (mesma lista há < 45 s) segue a cadência e não mexe no
 *    limite de ociosidade;
 *  - um 404 solto (deploy) não joga o navegador no modo antigo;
 *  - fechar/recarregar sem entidade aberta não manda a batida final.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import { PRESENCE_BEAT_UNSUPPORTED_KEY, PresenceBeatHub } from "./presence-beat-hub";
import { PresenceSync } from "./presence-sync";
import {
  PRESENCE_ALL_HIDDEN_AFTER_MS,
  PRESENCE_BEAT_DEFAULT_MS,
  PRESENCE_HIDDEN_TICK_MS,
  PresenceTicker,
  type PresenceBeatBody,
  type PresenceCallResult,
  type PresenceIdleEnv,
} from "./presence-ticker";
import type { TabCoordinator } from "./tab-coordinator";

const T0 = Date.parse("2026-10-15T12:00:00.000Z");

type Call = { at: number; nav: string; tab: string; body?: PresenceBeatBody };
type Io = {
  beats: Call[];
  pings: Call[];
  heartbeats: Call[];
  leaves: Call[];
  finals: Call[];
  beatReply: () => PresenceCallResult;
};
type Aba = { id: string; tab: FakeTab; tabs: TabCoordinator; sync: PresenceSync; ticker: PresenceTicker };

function newIo(): Io {
  return {
    beats: [],
    pings: [],
    heartbeats: [],
    leaves: [],
    finals: [],
    beatReply: () => ({ status: 200, nextBeatMs: PRESENCE_BEAT_DEFAULT_MS }),
  };
}

/** Um navegador (localStorage, canal e locks próprios) com um elo de beat por aba. */
function abrir(nav: string, hub: FakeTabHub, id: string, io: Io, idle?: PresenceIdleEnv): Aba {
  const tab = hub.tab(`${nav}-${id}`, { locks: true });
  const tabs = tab.coordinator();
  const beatHub = new PresenceBeatHub({
    readUnsupportedAt: () => {
      const raw = hub.storage.get(PRESENCE_BEAT_UNSUPPORTED_KEY);
      return raw ? Number(raw) : null;
    },
    writeUnsupportedAt: (at) => void hub.storage.set(PRESENCE_BEAT_UNSUPPORTED_KEY, String(at)),
  });
  const sync = new PresenceSync(
    tab.presenceEnv(tabs, {
      heartbeat: async () => {
        io.heartbeats.push({ at: Date.now(), nav, tab: id });
        return [];
      },
      leave: () => {
        io.leaves.push({ at: Date.now(), nav, tab: id });
      },
      beat: beatHub,
    }),
  );
  const ticker = new PresenceTicker(
    tab.presenceTickerEnv(tabs, {
      ping: async () => {
        io.pings.push({ at: Date.now(), nav, tab: id });
        return { status: 200 };
      },
      activity: async () => ({ status: 200 }),
      beat: async (body) => {
        io.beats.push({ at: Date.now(), nav, tab: id, body: structuredClone(body) });
        return io.beatReply();
      },
      hub: beatHub,
      finalBeacon: (body) => {
        io.finals.push({ at: Date.now(), nav, tab: id, body: structuredClone(body) });
      },
      idle,
    }),
  );
  return { id, tab, tabs, sync, ticker };
}

const gaps = (calls: Call[]) => calls.slice(1).map((c, i) => c.at - calls[i]!.at);

let io: Io;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  io = newIo();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("cadência da líder: 60 s estritos, nenhuma outra fonte", () => {
  it("1 navegador, 3 abas visíveis com negócios abertos, 30 min → 1 batida a cada 60 s; 0 ping, 0 heartbeat, 0 leave", async () => {
    const hub = new FakeTabHub();
    const abas = ["a", "b", "c"].map((id) => abrir("nav", hub, id, io));
    abas[0]!.sync.register("deal", "1", () => undefined);
    abas[1]!.sync.register("deal", "2", () => undefined);
    abas[2]!.sync.register("conversation", "c3", () => undefined);
    // Foco/visibilidade alternando não antecipa a batida.
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(37_000);
      abas[i % 3]!.tab.setHidden(true);
      await vi.advanceTimersByTimeAsync(4_000);
      abas[i % 3]!.tab.setHidden(false);
    }
    await vi.advanceTimersByTimeAsync(30 * 60_000 - 410_000);
    expect(io.beats.length).toBe(31); // t = 0 … 30 min
    for (const g of gaps(io.beats)) expect(g).toBe(PRESENCE_BEAT_DEFAULT_MS);
    expect(io.pings).toHaveLength(0);
    expect(io.heartbeats).toHaveLength(0);
    expect(io.leaves).toHaveLength(0);
  });
});

describe("todas as abas ocultas há mais de 5 min → 120 s", () => {
  it("3 abas ocultas: 60 s até 5 min, depois 120 s com lista vazia; nunca > 300 s sem batida", async () => {
    const hub = new FakeTabHub();
    const abas = ["a", "b", "c"].map((id) => abrir("nav", hub, id, io));
    abas[1]!.sync.register("deal", "9", () => undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    for (const a of abas) a.tab.setHidden(true);
    await vi.advanceTimersByTimeAsync(25 * 60_000);

    const g = gaps(io.beats);
    for (const x of g) expect([PRESENCE_BEAT_DEFAULT_MS, PRESENCE_HIDDEN_TICK_MS]).toContain(x);
    const hiddenFrom = T0 + 1_000 + PRESENCE_ALL_HIDDEN_AFTER_MS;
    const after = io.beats.filter((b) => b.at >= hiddenFrom + PRESENCE_BEAT_DEFAULT_MS);
    expect(after.length).toBeGreaterThan(5);
    for (const x of gaps(after)) expect(x).toBe(PRESENCE_HIDDEN_TICK_MS);
    // Aba oculta há > 30 s não reporta entidade.
    for (const b of after) expect(b.body?.entities).toEqual([]);
    expect(Math.max(...g)).toBeLessThan(300_000);
    // 25 min: 6 batidas nos primeiros ~6 min + ~10 espaçadas (antes: 25).
    expect(io.beats.length).toBeLessThanOrEqual(17);
    process.stdout.write(`[gate D] 3 abas ocultas, 25 min → ${io.beats.length} batidas (antes 25)\n`);
  });

  it("uma aba volta a ficar visível: os 60 s voltam na hora (≤ 60 s desde a última)", async () => {
    const hub = new FakeTabHub();
    const abas = ["a", "b"].map((id) => abrir("nav", hub, id, io));
    await vi.advanceTimersByTimeAsync(1_000);
    for (const a of abas) a.tab.setHidden(true);
    await vi.advanceTimersByTimeAsync(12 * 60_000);
    const before = io.beats.length;
    const last = io.beats[before - 1]!.at;
    // Volta a seguidora (não a líder).
    const follower = abas.find((a) => a.tabs.role === "follower")!;
    follower.tab.setHidden(false);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    const next = io.beats[before]!;
    expect(next.at - last).toBeLessThanOrEqual(PRESENCE_BEAT_DEFAULT_MS + 1_000);
    for (const x of gaps(io.beats.slice(before))) expect(x).toBe(PRESENCE_BEAT_DEFAULT_MS);
  });

  it("uma aba visível entre ocultas: 60 s sempre", async () => {
    const hub = new FakeTabHub();
    const abas = ["a", "b", "c"].map((id) => abrir("nav", hub, id, io));
    await vi.advanceTimersByTimeAsync(1_000);
    abas[0]!.tab.setHidden(true);
    abas[2]!.tab.setHidden(true);
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    for (const x of gaps(io.beats)) expect(x).toBe(PRESENCE_BEAT_DEFAULT_MS);
  });
});

describe("respostas do backend", () => {
  it("204 (no-op): segue 60 s e não mexe no limite de ociosidade", async () => {
    io.beatReply = () => ({ status: 204 });
    const idle: PresenceIdleEnv = {
      lastInteractionAt: () => T0,
      isExpired: () => false,
      setLimitMs: vi.fn(),
      onExpired: vi.fn(() => true),
    };
    abrir("nav", new FakeTabHub(), "a", io, idle);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(io.beats.length).toBe(6); // t = 0 … 5 min
    for (const x of gaps(io.beats)) expect(x).toBe(PRESENCE_BEAT_DEFAULT_MS);
    expect(idle.setLimitMs).not.toHaveBeenCalled();
    expect(io.pings).toHaveLength(0);
  });

  it("404 solto no meio (deploy) não troca de modo: nenhum heartbeat por entidade", async () => {
    let n = 0;
    io.beatReply = () => (n++ === 2 ? { status: 404 } : { status: 200 });
    const hub = new FakeTabHub();
    const a = abrir("nav", hub, "a", io);
    a.sync.register("deal", "1", () => undefined);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(io.heartbeats).toHaveLength(0);
    expect(io.pings).toHaveLength(1); // só o tique do 404
    expect(hub.storage.get(PRESENCE_BEAT_UNSUPPORTED_KEY)).toBeUndefined();
    expect(io.beats.length).toBe(11); // t = 0 … 10 min
  });
});

describe("batida final (pagehide da última aba)", () => {
  it("sem entidade aberta nem enviada: fechar/recarregar não chama nada", async () => {
    const hub = new FakeTabHub();
    const a = abrir("nav", hub, "a", io);
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    a.tab.close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(io.finals).toHaveLength(0);
  });

  it("com entidade enviada: sai a final com entities []", async () => {
    const hub = new FakeTabHub();
    const a = abrir("nav", hub, "a", io);
    const off = a.sync.register("deal", "1", () => undefined);
    await vi.advanceTimersByTimeAsync(61_000);
    off(); // fechou o negócio depois de mandá-lo
    a.tab.close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(io.finals).toHaveLength(1);
    expect(io.finals[0]!.body?.entities).toEqual([]);
  });
});

describe("simulação da org (chamadas de presença por minuto)", () => {
  it("20 usuários: 12 com 1 navegador visível, 8 com tudo oculto (2 abas) → ≤ 16 chamadas/min em regime (antes 20)", async () => {
    const navs: Aba[][] = [];
    for (let u = 0; u < 20; u++) {
      const hub = new FakeTabHub();
      const nav = `u${u}`;
      const abas = [abrir(nav, hub, "a", io)];
      if (u >= 12) abas.push(abrir(nav, hub, "b", io));
      navs.push(abas);
      await vi.advanceTimersByTimeAsync(2_900); // chegadas espalhadas
    }
    for (const abas of navs.slice(12)) for (const a of abas) a.tab.setHidden(true);
    await vi.advanceTimersByTimeAsync(10 * 60_000); // regime: ocultas há > 5 min
    const from = Date.now();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const perMin = io.beats.filter((b) => b.at >= from).length / 10;
    expect(io.pings).toHaveLength(0);
    expect(io.heartbeats).toHaveLength(0);
    expect(perMin).toBeLessThanOrEqual(16);
    expect(perMin).toBeGreaterThanOrEqual(15);
    // Cada navegador segue com batida a ≤ 120 s ("CRM aberto" vence em 300 s).
    for (const abas of navs) {
      const mine = io.beats.filter((b) => b.nav === abas[0]!.tab.id.split("-")[0] && b.at >= from);
      expect(mine.length).toBeGreaterThanOrEqual(5);
    }
    process.stdout.write(`[gate D] 20 usuários (8 com tudo oculto) → ${perMin} batidas/min (antes 20)\n`);
  });
});
