/**
 * `event: superseded` (teto de 3 conexões por usuário, contrato novo):
 * o servidor fecha a conexão mais antiga. A aba NÃO reconecta sozinha
 * (nem por timer, nem com o usuário voltando à aba): entra em "modo sem
 * tempo real" (`paused`) até o usuário pedir (`resume`). As seguidoras
 * sabem pela líder e pedem a reconexão a ela.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import type { TabCoordinator } from "./tab-coordinator";
import { SSE_SUPERSEDED_EVENT, SseTabBridge, type SseEnv } from "./use-sse";

const URL = "/api/sse/messages";

type Aba = {
  tab: FakeTab;
  tabs: TabCoordinator | null;
  bridge: SseTabBridge;
  subscribe: (events: string[], onReconnect?: () => void) => () => void;
};

function abrirAba(
  hub: FakeTabHub,
  id: string,
  opts: { isolada?: boolean; extras?: Partial<SseEnv> } = {},
): Aba {
  const tab = hub.tab(id);
  const tabs = opts.isolada ? null : tab.coordinator();
  const bridge = new SseTabBridge(tab.sseEnv(tabs, opts.extras));
  return {
    tab,
    tabs,
    bridge,
    subscribe: (events, onReconnect) =>
      bridge.connection(URL).subscribe(events, vi.fn(), onReconnect),
  };
}

const tick = (ms = 10) => vi.advanceTimersByTimeAsync(ms);

describe("superseded → modo sem tempo real", () => {
  let hub: FakeTabHub;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    hub = new FakeTabHub();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fecha, pausa e não reconecta sozinha (nem por timer, nem no foco)", async () => {
    const a = abrirAba(hub, "a", { isolada: true });
    a.subscribe(["new_message"]);
    a.tab.es.open();
    const conn = a.bridge.connection(URL);
    const onPaused = vi.fn();
    conn.onPausedChange(onPaused);
    expect(conn.paused).toBe(false);

    const antiga = a.tab.es;
    antiga.emit(SSE_SUPERSEDED_EVENT, { code: "SSE_SUPERSEDED" });
    await tick();

    expect(antiga.closed).toBe(true);
    expect(conn.connected).toBe(false);
    expect(conn.paused).toBe(true);
    expect(conn.holdReason).toBe("superseded");
    expect(onPaused).toHaveBeenLastCalledWith(true);

    // O `onerror` que o fechamento do servidor dispara não agenda nada.
    antiga.fail();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    a.tab.userActive();
    await tick();
    expect(a.tab.eventSources).toHaveLength(1);
    expect(conn.paused).toBe(true);
  });

  it("`resume` reconecta na hora e sai da pausa", async () => {
    const a = abrirAba(hub, "a", { isolada: true });
    const reconnect = vi.fn();
    a.subscribe(["new_message"], reconnect);
    a.tab.es.open();
    a.tab.es.emit(SSE_SUPERSEDED_EVENT, { code: "SSE_SUPERSEDED" });
    await tick();

    const conn = a.bridge.connection(URL);
    conn.resume();
    expect(conn.paused).toBe(false);
    expect(a.tab.eventSources).toHaveLength(2);
    a.tab.es.open();
    await tick();
    expect(conn.connected).toBe(true);
    // Houve gap sem replay: os assinantes reidratam.
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it("seguidora fica pausada junto com a líder e o botão dela pede a reconexão à líder", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    a.subscribe(["new_message"]);
    b.subscribe(["new_message"]);
    await tick();
    a.tab.es.open();
    await tick();
    expect(b.bridge.connection(URL).connected).toBe(true);

    a.tab.es.emit(SSE_SUPERSEDED_EVENT, { code: "SSE_SUPERSEDED" });
    await tick();
    const connB = b.bridge.connection(URL);
    expect(connB.connected).toBe(false);
    expect(connB.paused).toBe(true);
    expect(b.tab.eventSources).toHaveLength(0);

    connB.resume();
    await tick();
    expect(a.tab.eventSources).toHaveLength(2);
    expect(b.tab.eventSources).toHaveLength(0);
    expect(connB.paused).toBe(false);
    a.tab.es.open();
    await tick();
    expect(connB.connected).toBe(true);
  });

  it("evento antigo (`sse_connection_evicted`) continua com o prazo de sempre, sem pausa", async () => {
    const a = abrirAba(hub, "a", { isolada: true });
    a.subscribe(["new_message"]);
    a.tab.es.open();
    a.tab.es.emit("sse_connection_evicted", { retryAfterMs: 1_000 });
    await tick();
    expect(a.bridge.connection(URL).paused).toBe(false);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(a.tab.eventSources).toHaveLength(2);
  });
});
