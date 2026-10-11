/**
 * Sessão revogada em produção (11/10): todo request vira 401, mas as abas
 * abertas seguiam pingando `POST /api/agents/me/ping` para sempre — o
 * tique ignorava o status. Agora QUALQUER 401 (com ou sem `code`) em ping
 * ou activity para o tique de vez e chama o logout uma vez; 429 respeita o
 * prazo do backend. Abas simuladas com `__tests__/fake-tabs.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import {
  PRESENCE_MIN_GAP_MS,
  PRESENCE_TICK_MS,
  PresenceTicker,
  type PresenceCallResult,
  type PresenceTickerEnv,
} from "./presence-ticker";
import type { TabCoordinator } from "./tab-coordinator";

type Chamada = { at: number; tab: string; kind: "ping" | "activity"; count?: number };

type Aba = { tab: FakeTab; tabs: TabCoordinator; ticker: PresenceTicker };

type Respostas = {
  ping?: () => PresenceCallResult | void;
  activity?: () => PresenceCallResult | void;
};

function abrirAba(
  hub: FakeTabHub,
  api: Chamada[],
  id: string,
  respostas: Respostas = {},
  extras: Partial<Pick<PresenceTickerEnv, "onUnauthorized" | "isSessionEnded">> = {},
): Aba {
  const tab = hub.tab(id);
  const tabs = tab.coordinator();
  const ticker = new PresenceTicker(
    tab.presenceTickerEnv(tabs, {
      ping: async () => {
        api.push({ at: Date.now(), tab: id, kind: "ping" });
        return respostas.ping?.();
      },
      activity: async (count) => {
        api.push({ at: Date.now(), tab: id, kind: "activity", count });
        return respostas.activity?.();
      },
      ...extras,
    }),
  );
  return { tab, tabs, ticker };
}

const T0 = Date.parse("2026-10-11T12:00:00.000Z");
const DEZ_MIN = 10 * 60_000;

describe("tique de presença: 401 encerra, 429 espera", () => {
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

  it("401 no ping (sem code, backend antigo): o tique para de vez e o logout é chamado 1 vez", async () => {
    let status = 200;
    const onUnauthorized = vi.fn(() => true);
    const a = abrirAba(hub, api, "a", { ping: () => ({ status }) }, { onUnauthorized });
    const b = abrirAba(hub, api, "b", { ping: () => ({ status }) }, { onUnauthorized });
    await vi.advanceTimersByTimeAsync(50);
    expect(a.tabs.role).toBe("leader");
    expect(api.filter((x) => x.kind === "ping")).toHaveLength(1);

    status = 401; // revogaram as sessões
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);
    expect(api.filter((x) => x.kind === "ping")).toHaveLength(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(a.ticker.stopped).toBe(true);

    // Nada mais sai: nem a cadência, nem uso, nem foco, nem a seguidora.
    for (let t = 0; t < DEZ_MIN; t += 10_000) {
      a.ticker.record();
      b.ticker.record();
      a.tab.setHidden(true);
      a.tab.setHidden(false);
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(api.filter((x) => x.kind === "ping")).toHaveLength(2);
    expect(api.filter((x) => x.kind === "activity")).toHaveLength(0);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("401 só no activity também para", async () => {
    const onUnauthorized = vi.fn(() => true);
    const a = abrirAba(
      hub,
      api,
      "a",
      { ping: () => ({ status: 200 }), activity: () => ({ status: 401 }) },
      { onUnauthorized },
    );
    await vi.advanceTimersByTimeAsync(50);
    a.ticker.record(2);
    await vi.advanceTimersByTimeAsync(PRESENCE_MIN_GAP_MS);
    expect(api.filter((x) => x.kind === "activity")).toHaveLength(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DEZ_MIN);
    expect(api).toHaveLength(3); // ping inicial + ping/activity do tique do 401
  });

  it("401 durante a renovação da própria sessão (onUnauthorized → false): segue a cadência", async () => {
    let status = 401;
    const onUnauthorized = vi.fn(() => false);
    const a = abrirAba(hub, api, "a", { ping: () => ({ status }) }, { onUnauthorized });
    await vi.advanceTimersByTimeAsync(50);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    status = 200; // cookie renovado
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS);
    expect(api.filter((x) => x.kind === "ping")).toHaveLength(2);
    expect(a.ticker.stopped).toBe(false);
  });

  it("sessão já encerrada (logout em outra aba): não chama a API", async () => {
    const a = abrirAba(hub, api, "a", {}, { isSessionEnded: () => true });
    await vi.advanceTimersByTimeAsync(DEZ_MIN);
    expect(api).toHaveLength(0);
    expect(a.ticker.stopped).toBe(true);
  });

  it("429 com retryAfterMs: nada sai antes do prazo (nem o uso), e o uso não se perde", async () => {
    let resposta: PresenceCallResult = { status: 200 };
    const a = abrirAba(hub, api, "a", {
      ping: () => resposta,
      activity: () => resposta,
    });
    await vi.advanceTimersByTimeAsync(50);
    a.ticker.record(2);
    resposta = { status: 429, retryAfterMs: 200_000 };
    await vi.advanceTimersByTimeAsync(PRESENCE_MIN_GAP_MS);
    // Tique do 429: ping + activity(2), recusados.
    expect(api.map((x) => x.kind)).toEqual(["ping", "ping", "activity"]);
    const at429 = api[api.length - 1].at;
    resposta = { status: 200 };

    a.ticker.record();
    a.tab.setHidden(true);
    a.tab.setHidden(false);
    await vi.advanceTimersByTimeAsync(200_000 - 100);
    expect(api).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(200);
    const depois = api.slice(3);
    expect(depois.map((x) => x.kind)).toEqual(["ping", "activity"]);
    expect(depois[0].at - at429).toBeGreaterThanOrEqual(200_000);
    expect(depois[1].count).toBe(3); // 2 recusadas + 1 nova
  });

  it("429 com prazo menor que a janela: a cadência de 90 s segue valendo", async () => {
    let resposta: PresenceCallResult = { status: 429, retryAfterMs: 5_000 };
    abrirAba(hub, api, "a", { ping: () => resposta });
    await vi.advanceTimersByTimeAsync(50);
    resposta = { status: 200 };
    await vi.advanceTimersByTimeAsync(PRESENCE_TICK_MS - 100);
    expect(api).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(api).toHaveLength(2);
  });
});
