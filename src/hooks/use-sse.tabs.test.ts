/**
 * MA-1 — SSE única por navegador. Duas (ou três) "abas" simuladas no
 * mesmo processo: cada uma com o seu coordenador, a sua ponte SSE e os
 * seus `EventSource`s falsos, ligadas por um `BroadcastChannel` falso e
 * por um Web Locks falso (`__tests__/fake-tabs.ts`). Timers falsos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import { FALLBACK_TIMEOUT_MS, type TabCoordinator } from "./tab-coordinator";
import { SSE_IDLE_CLOSE_MS, SseTabBridge } from "./use-sse";

const URL = "/api/sse/messages";

type Aba = {
  tab: FakeTab;
  tabs: TabCoordinator;
  bridge: SseTabBridge;
  subscribe: (
    events: string[],
    handler?: (event: string, data: unknown) => void,
    onReconnect?: () => void,
  ) => () => void;
};

function abrirAba(hub: FakeTabHub, id: string, opts: { locks?: boolean } = {}): Aba {
  const tab = hub.tab(id, opts);
  const tabs = tab.coordinator();
  const bridge = new SseTabBridge(tab.sseEnv(tabs));
  return {
    tab,
    tabs,
    bridge,
    subscribe: (events, handler = vi.fn(), onReconnect) =>
      bridge.connection(URL).subscribe(events, handler, onReconnect),
  };
}

const tick = (ms = 10) => vi.advanceTimersByTimeAsync(ms);

describe("SSE única por navegador (Web Locks)", () => {
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

  it("duas abas, UM EventSource: a líder conecta e a seguidora recebe pelo canal, sem duplicar", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    const onA = vi.fn();
    const onB = vi.fn();
    a.subscribe(["new_message"], onA);
    b.subscribe(["new_message"], onB);
    await tick();

    expect(a.tabs.role).toBe("leader");
    expect(b.tabs.role).toBe("follower");
    expect(a.tab.eventSources).toHaveLength(1);
    expect(b.tab.eventSources).toHaveLength(0);

    a.tab.es.open();
    for (const id of ["m1", "m2", "m3"]) a.tab.es.emit("new_message", { id });
    await tick();

    const ids = (fn: ReturnType<typeof vi.fn>) =>
      fn.mock.calls.map(([, data]) => (data as { id: string }).id);
    expect(ids(onA)).toEqual(["m1", "m2", "m3"]);
    expect(ids(onB)).toEqual(["m1", "m2", "m3"]);
    expect(onB).toHaveBeenCalledWith("new_message", { id: "m1" });
  });

  it("a líder anexa os eventos que só a seguidora assina — e não entrega aos próprios assinantes", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    const onA = vi.fn();
    const onB = vi.fn();
    a.subscribe(["new_message"], onA);
    await tick();
    expect(a.tab.es.listens("whatsapp_call")).toBe(false);

    b.subscribe(["whatsapp_call"], onB);
    await tick();
    expect(a.tab.es.listens("whatsapp_call")).toBe(true);
    expect(b.tab.eventSources).toHaveLength(0);

    a.tab.es.open();
    a.tab.es.emit("whatsapp_call", { callId: "c1" });
    a.tab.es.emit("new_message", { id: "m1" });
    await tick();
    expect(onB.mock.calls).toEqual([["whatsapp_call", { callId: "c1" }]]);
    expect(onA.mock.calls).toEqual([["new_message", { id: "m1" }]]);
  });

  it("líder sem assinante próprio mantém a conexão para a seguidora e fecha 30s depois que ela sai", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    await tick();
    expect(a.tabs.role).toBe("leader");
    expect(a.tab.eventSources).toHaveLength(0);

    const onB = vi.fn();
    const sair = b.subscribe(["new_message"], onB);
    await tick();
    expect(a.tab.liveEventSources).toHaveLength(1);
    a.tab.es.open();
    a.tab.es.emit("new_message", { id: "m1" });
    await tick();
    expect(onB).toHaveBeenCalledTimes(1);

    sair();
    await tick();
    await vi.advanceTimersByTimeAsync(SSE_IDLE_CLOSE_MS - 100);
    expect(a.tab.liveEventSources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(a.tab.liveEventSources).toHaveLength(0);

    b.subscribe(["new_message"], onB);
    await tick();
    expect(a.tab.liveEventSources).toHaveLength(1);
    expect(a.tab.eventSources).toHaveLength(2);
  });

  it("a líder fecha: a seguidora assume em < 2s, abre a própria conexão e avisa reconexão", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    const onA = vi.fn();
    const onB = vi.fn();
    const reconnectB = vi.fn();
    a.subscribe(["new_message"], onA);
    b.subscribe(["new_message"], onB, reconnectB);
    await tick();
    a.tab.es.open();
    a.tab.es.emit("new_message", { id: "antes" });
    await tick();
    expect(onB).toHaveBeenCalledTimes(1);
    expect(b.bridge.connection(URL).connected).toBe(true);

    const antigo = a.tab.es;
    a.tab.close();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(antigo.closed).toBe(true);
    expect(b.tabs.role).toBe("leader");
    expect(b.tab.liveEventSources).toHaveLength(1);
    expect(b.bridge.connection(URL).connected).toBe(false);
    expect(reconnectB).not.toHaveBeenCalled();

    b.tab.es.open();
    expect(reconnectB).toHaveBeenCalledTimes(1); // houve gap sem replay
    expect(b.bridge.connection(URL).connected).toBe(true);
    b.tab.es.emit("new_message", { id: "depois" });
    await tick();
    expect(onB.mock.calls.map(([, d]) => (d as { id: string }).id)).toEqual([
      "antes",
      "depois",
    ]);
    expect(onA).toHaveBeenCalledTimes(1); // a aba fechada não recebe mais nada
  });

  it("a líder trava sem pagehide: o lock é recolhido e a próxima da fila assume", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    const c = abrirAba(hub, "c");
    const onB = vi.fn();
    const onC = vi.fn();
    a.subscribe(["new_message"]);
    b.subscribe(["new_message"], onB);
    c.subscribe(["new_message"], onC);
    await tick();
    a.tab.es.open();
    await tick();

    a.tab.crash();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(b.tabs.role).toBe("leader");
    expect(c.tabs.role).toBe("follower");
    expect(b.tab.liveEventSources).toHaveLength(1);
    expect(c.tab.eventSources).toHaveLength(0);

    b.tab.es.open();
    b.tab.es.emit("new_message", { id: "m9" });
    await tick();
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onC).toHaveBeenCalledTimes(1);
  });

  it("queda da conexão da líder: backoff de 5s e UM onReconnect em cada aba", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    const reconnectA = vi.fn();
    const reconnectB = vi.fn();
    const onB = vi.fn();
    a.subscribe(["new_message"], vi.fn(), reconnectA);
    b.subscribe(["new_message"], onB, reconnectB);
    await tick();
    a.tab.es.open();
    await tick();
    const statusB: boolean[] = [];
    b.bridge.connection(URL).onStatus((open) => statusB.push(open));

    a.tab.es.fail();
    await tick();
    expect(statusB).toEqual([false]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(a.tab.eventSources).toHaveLength(2);
    expect(b.tab.eventSources).toHaveLength(0);
    a.tab.es.open();
    await tick();

    expect(statusB).toEqual([false, true]);
    expect(reconnectA).toHaveBeenCalledTimes(1);
    expect(reconnectB).toHaveBeenCalledTimes(1);

    a.tab.es.emit("new_message", { id: "m1" });
    await tick();
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it("aba oculta (líder ou seguidora) continua recebendo — visibilidade não entra na eleição", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    const onA = vi.fn();
    const onB = vi.fn();
    a.subscribe(["new_message"], onA);
    b.subscribe(["new_message"], onB);
    await tick();
    a.tab.es.open();

    a.tab.setHidden(true);
    b.tab.setHidden(true);
    await vi.advanceTimersByTimeAsync(90_000);
    a.tab.es.emit("new_message", { id: "m1" });
    await tick();

    expect(a.tabs.role).toBe("leader");
    expect(a.tab.eventSources).toHaveLength(1);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it("seguidora que morre sem avisar deixa de segurar a conexão depois do TTL do estado", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    await tick();
    b.subscribe(["new_message"]);
    await tick();
    expect(a.tab.liveEventSources).toHaveLength(1);

    b.tab.crash();
    // 60s de TTL do estado + varredura de 30s + 30s de ociosidade.
    await vi.advanceTimersByTimeAsync(60_000 + 30_000 + SSE_IDLE_CLOSE_MS + 1_000);
    expect(a.tab.liveEventSources).toHaveLength(0);
  });
});

describe("SSE única por navegador (fallback sem Web Locks)", () => {
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

  it("primeira aba vira líder em ~300ms; a segunda cede ao ouvir o batimento", async () => {
    const a = abrirAba(hub, "a", { locks: false });
    const onA = vi.fn();
    a.subscribe(["new_message"], onA);
    await vi.advanceTimersByTimeAsync(400);
    expect(a.tabs.role).toBe("leader");
    expect(a.tab.eventSources).toHaveLength(1);

    const b = abrirAba(hub, "b", { locks: false });
    const onB = vi.fn();
    b.subscribe(["new_message"], onB);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(b.tabs.role).toBe("follower");
    expect(b.tab.eventSources).toHaveLength(0);

    a.tab.es.open();
    a.tab.es.emit("new_message", { id: "m1" });
    await tick();
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it("líder some sem avisar: a seguidora assume em < 2s e não há duas conexões", async () => {
    const a = abrirAba(hub, "a", { locks: false });
    a.subscribe(["new_message"]);
    await vi.advanceTimersByTimeAsync(400);
    const b = abrirAba(hub, "b", { locks: false });
    const onB = vi.fn();
    b.subscribe(["new_message"], onB);
    await vi.advanceTimersByTimeAsync(1_000);
    a.tab.es.open();
    await tick();

    a.tab.crash();
    await vi.advanceTimersByTimeAsync(FALLBACK_TIMEOUT_MS + 400);
    expect(FALLBACK_TIMEOUT_MS + 400).toBeLessThan(2_000);
    expect(b.tabs.role).toBe("leader");
    expect(b.tab.liveEventSources).toHaveLength(1);

    b.tab.es.open();
    b.tab.es.emit("new_message", { id: "m2" });
    await tick();
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it("líder fecha com pagehide (bye): troca em menos de 500ms", async () => {
    const a = abrirAba(hub, "a", { locks: false });
    a.subscribe(["new_message"]);
    await vi.advanceTimersByTimeAsync(400);
    const b = abrirAba(hub, "b", { locks: false });
    b.subscribe(["new_message"]);
    await vi.advanceTimersByTimeAsync(1_000);

    a.tab.close();
    await vi.advanceTimersByTimeAsync(450);
    expect(b.tabs.role).toBe("leader");
    expect(b.tab.liveEventSources).toHaveLength(1);
    expect(a.tab.liveEventSources).toHaveLength(0);
  });

  it("líder antiga que ouve um termo maior cede: fecha a conexão e passa a consumir do canal", async () => {
    const a = abrirAba(hub, "a", { locks: false });
    const onA = vi.fn();
    a.subscribe(["new_message"], onA);
    await vi.advanceTimersByTimeAsync(400);
    a.tab.es.open();
    expect(a.tabs.role).toBe("leader");

    const termo = a.tabs.term + 3;
    hub.inject("crm:tabs:crm", { v: 1, t: "lead", from: "z", term: termo });
    await tick();
    expect(a.tabs.role).toBe("follower");
    expect(a.tab.liveEventSources).toHaveLength(0);

    // Evento da líder nova chega pelo canal; o de um termo velho é ignorado.
    hub.inject("crm:tabs:crm", {
      v: 1, t: "event", from: "z", term: termo, url: URL, name: "new_message", data: { id: "novo" },
    });
    hub.inject("crm:tabs:crm", {
      v: 1, t: "event", from: "y", term: termo - 2, url: URL, name: "new_message", data: { id: "velho" },
    });
    await tick();
    expect(onA.mock.calls).toEqual([["new_message", { id: "novo" }]]);
  });

  it("duas abas abertas ao mesmo tempo: só uma vira líder (menor tabId no mesmo termo)", async () => {
    const a = abrirAba(hub, "a", { locks: false });
    const b = abrirAba(hub, "b", { locks: false });
    a.subscribe(["new_message"]);
    b.subscribe(["new_message"]);
    await vi.advanceTimersByTimeAsync(2_000);

    const roles = [a.tabs.role, b.tabs.role].sort();
    expect(roles).toEqual(["follower", "leader"]);
    expect(a.tab.liveEventSources.length + b.tab.liveEventSources.length).toBe(1);
  });
});
