/**
 * Presença numa batida só (`POST /api/presence/beat`):
 *  - só a aba líder manda, a cada `nextBeatMs` (padrão 60 s), com a UNIÃO
 *    das entidades abertas em todas as abas — sem ping e sem heartbeat;
 *  - as seguidoras recebem os `viewers` pela líder;
 *  - cadência ESTRITA de `nextBeatMs`: abrir/fechar entidade, resposta
 *    deduplicada e activity não antecipam a batida;
 *  - com o beat: 0 heartbeat e 0 `leave` HTTP; só a ÚLTIMA aba que fecha
 *    manda a batida final (`sendBeacon`, `entities: []`);
 *  - 404 → ping (no mesmo tique) + heartbeat por entidade, e memória;
 *  - ociosidade (lastInteractionAt, logout local), 401, 429 e x-tab-id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import {
  PRESENCE_BEAT_UNSUPPORTED_KEY,
  PresenceBeatHub,
} from "./presence-beat-hub";
import { PresenceSync, type EntityViewer } from "./presence-sync";
import {
  PRESENCE_BEAT_DEFAULT_MS,
  PRESENCE_TAB_ID_HEADER,
  PresenceTicker,
  postPresenceBeat,
  sendFinalBeatBeacon,
  type PresenceBeatBody,
  type PresenceCallResult,
  type PresenceIdleEnv,
} from "./presence-ticker";
import type { TabCoordinator } from "./tab-coordinator";

const T0 = Date.parse("2026-10-14T12:00:00.000Z");

type Beat = { at: number; tab: string; body: PresenceBeatBody };
type Aba = {
  id: string;
  tab: FakeTab;
  tabs: TabCoordinator;
  hub: PresenceBeatHub;
  sync: PresenceSync;
  ticker: PresenceTicker;
};

type Io = {
  finals: { at: number; tab: string; body: PresenceBeatBody }[];
  activities: { at: number; count: number }[];
  leaves: { at: number; tab: string; key: string }[];
  beats: Beat[];
  pings: { at: number; tab: string }[];
  heartbeats: { at: number; tab: string; key: string }[];
  beatReply: (body: PresenceBeatBody) => PresenceCallResult;
};

const VIEWER: EntityViewer = { userId: "u9", name: "Outra Pessoa", avatarUrl: null };

function abrir(hub: FakeTabHub, id: string, io: Io, idle?: PresenceIdleEnv, onUnauthorized?: () => boolean): Aba {
  const tab = hub.tab(id, { locks: true });
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
      heartbeat: async (type, entityId) => {
        io.heartbeats.push({ at: Date.now(), tab: id, key: `${type}|${entityId}` });
        return [];
      },
      leave: (type, entityId) => {
        io.leaves.push({ at: Date.now(), tab: id, key: `${type}|${entityId}` });
      },
      beat: beatHub,
    }),
  );
  const ticker = new PresenceTicker(
    tab.presenceTickerEnv(tabs, {
      ping: async () => {
        io.pings.push({ at: Date.now(), tab: id });
        return { status: 200 };
      },
      activity: async (count) => {
        io.activities.push({ at: Date.now(), count });
        return { status: 200 };
      },
      finalBeacon: (body) => {
        io.finals.push({ at: Date.now(), tab: id, body: structuredClone(body) });
      },
      beat: async (body) => {
        io.beats.push({ at: Date.now(), tab: id, body: structuredClone(body) });
        return io.beatReply(body);
      },
      hub: beatHub,
      idle,
      onUnauthorized,
    }),
  );
  return { id, tab, tabs, hub: beatHub, sync, ticker };
}

const keysOf = (b: Beat) => b.body.entities.map((e) => `${e.type}:${e.id}`).sort();

let hub: FakeTabHub;
let io: Io;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  hub = new FakeTabHub();
  io = {
    finals: [],
    activities: [],
    leaves: [],
    beats: [],
    pings: [],
    heartbeats: [],
    beatReply: () => ({ status: 200, nextBeatMs: PRESENCE_BEAT_DEFAULT_MS }),
  };
});
afterEach(() => {
  vi.useRealTimers();
});

describe("uma batida por navegador", () => {
  it("3 abas, 10 min: só a líder bate, ≤ 1 por ciclo, com a união das entidades; sem ping nem heartbeat", async () => {
    const abas = ["a", "b", "c"].map((id) => abrir(hub, id, io));
    abas[0].sync.register("deal", "1", () => undefined);
    abas[1].sync.register("deal", "2", () => undefined);
    abas[2].sync.register("deal", "2", () => undefined);
    abas[2].sync.register("conversation", "c7", () => undefined);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    const leaders = abas.filter((x) => x.tabs.role === "leader");
    expect(leaders).toHaveLength(1);
    expect(new Set(io.beats.map((b) => b.tab))).toEqual(new Set([leaders[0].id]));
    expect(io.pings).toHaveLength(0);
    expect(io.heartbeats).toHaveLength(0);
    // ≤ 1 por ciclo de 60 s (+ a primeira).
    expect(io.beats.length).toBeLessThanOrEqual(10 + 1);
    const gaps = io.beats.slice(1).map((b, i) => b.at - io.beats[i].at);
    for (const g of gaps) expect(g).toBe(PRESENCE_BEAT_DEFAULT_MS);
    expect(keysOf(io.beats[io.beats.length - 1])).toEqual(["conversation:c7", "deal:1", "deal:2"]);
    process.stdout.write(`[beat] 3 abas, 10 min → ${io.beats.length} batidas, 0 ping, 0 heartbeat\n`);
  });

  it("seguidoras recebem os viewers da líder", async () => {
    io.beatReply = () => ({ status: 200, viewers: { "deal:2": [VIEWER] } });
    const a = abrir(hub, "a", io);
    await vi.advanceTimersByTimeAsync(1_000);
    const b = abrir(hub, "b", io);
    const seen: EntityViewer[][] = [];
    b.sync.register("deal", "2", (v) => seen.push(v));
    await vi.advanceTimersByTimeAsync(PRESENCE_BEAT_DEFAULT_MS + 1_000);
    expect(a.tabs.role).toBe("leader");
    expect(io.beats.every((x) => x.tab === "a")).toBe(true);
    expect(seen.at(-1)).toEqual([VIEWER]);
  });

  it("nextBeatMs do backend define a cadência", async () => {
    io.beatReply = () => ({ status: 200, nextBeatMs: 120_000 });
    abrir(hub, "a", io);
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
    expect(io.beats.length).toBeLessThanOrEqual(6);
    const gaps = io.beats.slice(1).map((b, i) => b.at - io.beats[i].at);
    for (const g of gaps) expect(g).toBe(120_000);
  });
});

describe("cadência estrita (nextBeatMs)", () => {
  const gapsOf = (beats: Beat[]) => beats.slice(1).map((b, i) => b.at - beats[i].at);

  it("60 s exatos com 10 aberturas/fechamentos de negócio no meio; 0 heartbeat e 0 leave HTTP", async () => {
    const a = abrir(hub, "a", io);
    await vi.advanceTimersByTimeAsync(1_000);
    const b = abrir(hub, "b", io);
    await vi.advanceTimersByTimeAsync(1_000);
    // 10 aberturas/fechamentos espalhados (líder e seguidora), em instantes
    // que antes antecipavam a batida (≥ 30 s desde a última).
    const ops: Array<[number, Aba, string]> = [
      [33_000, a, "1"], [7_000, b, "2"], [25_000, a, "3"], [31_000, b, "4"], [2_000, a, "5"],
      [45_000, b, "6"], [12_000, a, "7"], [36_000, b, "8"], [9_000, a, "9"], [40_000, b, "10"],
    ];
    for (const [wait, aba, id] of ops) {
      await vi.advanceTimersByTimeAsync(wait);
      const off = aba.sync.register("deal", id, () => undefined);
      await vi.advanceTimersByTimeAsync(3_000);
      off();
    }
    await vi.advanceTimersByTimeAsync(60_000);
    expect(io.beats.length).toBeGreaterThanOrEqual(5);
    for (const g of gapsOf(io.beats)) expect(g).toBe(PRESENCE_BEAT_DEFAULT_MS);
    expect(io.heartbeats).toHaveLength(0);
    expect(io.leaves).toHaveLength(0);
    expect(io.pings).toHaveLength(0);
    process.stdout.write(`[beat] 10 aberturas/fechamentos → intervalos ${gapsOf(io.beats).join(", ")} ms\n`);
  });

  it("a batida seguinte já leva a lista nova (e sem a entidade que saiu)", async () => {
    const a = abrir(hub, "a", io);
    await vi.advanceTimersByTimeAsync(1_000);
    const off = a.sync.register("deal", "1", () => undefined);
    await vi.advanceTimersByTimeAsync(PRESENCE_BEAT_DEFAULT_MS);
    expect(keysOf(io.beats[1])).toEqual(["deal:1"]);
    off();
    await vi.advanceTimersByTimeAsync(PRESENCE_BEAT_DEFAULT_MS);
    expect(keysOf(io.beats[2])).toEqual([]);
    expect(io.leaves).toHaveLength(0);
  });

  it("deduplicada (200) não antecipa: segue nextBeatMs", async () => {
    io.beatReply = () => ({ status: 200, deduped: true, retryAfterMs: 5_000, nextBeatMs: 60_000 });
    const a = abrir(hub, "a", io);
    await vi.advanceTimersByTimeAsync(1_000);
    a.sync.register("deal", "1", () => undefined);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    for (const g of gapsOf(io.beats)) expect(g).toBe(60_000);
  });

  it("activity que abre a sessão de uso sai sozinho; a batida não se move", async () => {
    const a = abrir(hub, "a", io);
    await vi.advanceTimersByTimeAsync(6 * 60_000 + 20_000); // > 5 min sem activity
    const before = io.beats.length;
    a.ticker.record(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(io.activities).toHaveLength(1);
    expect(io.beats).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    for (const g of gapsOf(io.beats)) expect(g).toBe(PRESENCE_BEAT_DEFAULT_MS);
  });
});

describe("saída na última aba (sendBeacon)", () => {
  it("só a última aba do navegador manda a batida final, com entities []", async () => {
    const a = abrir(hub, "a", io);
    await vi.advanceTimersByTimeAsync(1_000);
    const b = abrir(hub, "b", io);
    const c = abrir(hub, "c", io);
    b.sync.register("deal", "2", () => undefined);
    await vi.advanceTimersByTimeAsync(25_000);

    c.tab.close(); // seguidora
    await vi.advanceTimersByTimeAsync(1_000);
    expect(io.finals).toHaveLength(0);

    a.tab.close(); // líder, com a "b" ainda aberta
    await vi.advanceTimersByTimeAsync(5_000);
    expect(io.finals).toHaveLength(0);
    expect(b.tabs.role).toBe("leader");

    await vi.advanceTimersByTimeAsync(PRESENCE_BEAT_DEFAULT_MS);
    b.tab.close(); // a última
    await vi.advanceTimersByTimeAsync(1_000);
    expect(io.finals).toHaveLength(1);
    expect(io.finals[0]).toMatchObject({ tab: "b", body: { entities: [] } });
    expect(io.leaves).toHaveLength(0);
    expect(io.heartbeats).toHaveLength(0);
  });

  it("sendFinalBeatBeacon: sendBeacon same-origin para /api/presence/beat com tabId e clientId", () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("Blob", class {
      constructor(readonly parts: string[], readonly opts: { type: string }) {}
    });
    sendFinalBeatBeacon("tab-9", { lastInteractionAt: 5, entities: [] });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, { parts: string[]; opts: { type: string } }];
    expect(url).toBe("/api/presence/beat");
    expect(blob.opts.type).toBe("application/json");
    const body = JSON.parse(blob.parts[0]);
    expect(body).toMatchObject({ tabId: "tab-9", lastInteractionAt: 5, entities: [] });
    expect(typeof body.clientId).toBe("string");
    vi.unstubAllGlobals();
  });
});

describe("contrato do beat (be #194)", () => {
  it("só tipos/ids do contrato e no máximo 20 por batida", () => {
    const beatHub = new PresenceBeatHub();
    const keys = [
      "deal|ok_1",
      "conversation|c-2",
      "contact|x", // tipo fora do contrato
      "deal|id com espaço",
      `deal|${"x".repeat(65)}`,
      ...Array.from({ length: 30 }, (_, i) => `deal|d${String(i).padStart(2, "0")}`),
    ];
    beatHub.setSource({ keys: () => keys, deliver: () => undefined });
    const out = beatHub.entities();
    expect(out).toHaveLength(20);
    for (const e of out) {
      expect(["deal", "conversation"]).toContain(e.type);
      expect(e.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  it("clientId estável do navegador vai no corpo de toda batida", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    await postPresenceBeat("tab-1", { lastInteractionAt: 1, entities: [] }, fetchImpl);
    await postPresenceBeat("tab-2", { lastInteractionAt: 1, entities: [] }, fetchImpl);
    const [a, b] = bodies as { clientId: string; tabId: string }[];
    expect(a.clientId).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(b.clientId).toBe(a.clientId);
    expect([a.tabId, b.tabId]).toEqual(["tab-1", "tab-2"]);
  });
});

describe("backend sem o beat (404)", () => {
  it("cai no ping no mesmo tique; 3 seguidos → heartbeat por entidade, e memoriza", async () => {
    io.beatReply = () => ({ status: 404 });
    const a = abrir(hub, "a", io);
    a.sync.register("deal", "1", () => undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(io.beats).toHaveLength(1);
    expect(io.pings).toHaveLength(1);
    // Um 404 solto (deploy) não troca de modo.
    expect(io.heartbeats).toHaveLength(0);
    expect(hub.storage.get(PRESENCE_BEAT_UNSUPPORTED_KEY)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(2 * PRESENCE_BEAT_DEFAULT_MS);
    expect(io.beats).toHaveLength(3);
    expect(io.pings).toHaveLength(3);
    expect(io.heartbeats.map((h) => h.key)).toEqual(["deal|1"]);
    expect(hub.storage.get(PRESENCE_BEAT_UNSUPPORTED_KEY)).toBeDefined();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(io.beats).toHaveLength(3);
    expect(io.pings.length).toBeGreaterThanOrEqual(5);

    // Aba nova no mesmo navegador: nem tenta o beat.
    a.tab.close();
    const b = abrir(hub, "b", io);
    b.sync.register("deal", "1", () => undefined);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(io.beats).toHaveLength(3);
  });
});

describe("ociosidade, 401, 429 e x-tab-id", () => {
  function idleEnv(over: Partial<PresenceIdleEnv> = {}): PresenceIdleEnv {
    return {
      lastInteractionAt: () => T0 - 5_000,
      isExpired: () => false,
      setLimitMs: vi.fn(),
      onExpired: vi.fn(() => true),
      ...over,
    };
  }

  it("lastInteractionAt compartilhado vai na batida; sessionIdleMs do 200 é aplicado", async () => {
    io.beatReply = () => ({ status: 200, sessionIdleMs: 86_400_000 });
    const idle = idleEnv();
    abrir(hub, "a", io, idle);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(io.beats[0].body.lastInteractionAt).toBe(T0 - 5_000);
    expect(idle.setLimitMs).toHaveBeenCalledWith(86_400_000);
  });

  it("parado além do limite: logout sem batida", async () => {
    const idle = idleEnv({ isExpired: () => true });
    abrir(hub, "a", io, idle);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(io.beats).toHaveLength(0);
    expect(idle.onExpired).toHaveBeenCalledTimes(1);
  });

  it("401: para de vez e o logout sai uma vez", async () => {
    io.beatReply = () => ({ status: 401 });
    const onUnauthorized = vi.fn(() => true);
    abrir(hub, "a", io, undefined, onUnauthorized);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(io.beats).toHaveLength(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("429 com retryAfterMs: nenhuma batida antes do prazo", async () => {
    let n = 0;
    io.beatReply = () => (n++ === 0 ? { status: 429, retryAfterMs: 180_000 } : { status: 200 });
    abrir(hub, "a", io);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(170_000);
    expect(io.beats).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(io.beats).toHaveLength(2);
    expect(io.beats[1].at - io.beats[0].at).toBeGreaterThanOrEqual(180_000);
  });

  it("postPresenceBeat: POST com x-tab-id, corpo { tabId, lastInteractionAt, entities } e leitura da resposta", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true, sessionIdleMs: 1000, nextBeatMs: 45_000, viewers: { "deal:1": [VIEWER] }, deduped: false }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const r = await postPresenceBeat(
      "tab-1",
      { lastInteractionAt: 123, entities: [{ type: "deal", id: "1" }] },
      fetchImpl as unknown as typeof fetch,
      "client-abc",
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/presence\/beat$/);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get(PRESENCE_TAB_ID_HEADER)).toBe("tab-1");
    expect(JSON.parse(String(init.body))).toEqual({
      tabId: "tab-1",
      clientId: "client-abc",
      lastInteractionAt: 123,
      entities: [{ type: "deal", id: "1" }],
    });
    expect(r).toEqual({ status: 200, sessionIdleMs: 1000, nextBeatMs: 45_000, viewers: { "deal:1": [VIEWER] } });

    const r429 = await postPresenceBeat(
      "tab-1",
      { lastInteractionAt: null, entities: [] },
      (async () =>
        new Response(JSON.stringify({ retryAfterMs: 30_000 }), { status: 429 })) as unknown as typeof fetch,
    );
    expect(r429).toEqual({ status: 429, retryAfterMs: 30_000 });
  });
});
