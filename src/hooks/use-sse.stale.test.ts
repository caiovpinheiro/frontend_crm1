/**
 * N-MA-1 — stream parado e líder congelada.
 *
 *  - A líder vigia a atividade do stream: com o batimento nomeado do
 *    servidor (`event: heartbeat`), 2× o intervalo sem nada → marca como
 *    desconectada e reconecta (e as seguidoras sabem pelo `status`).
 *  - Sem batimento visível (o comentário `: heartbeat` não chega ao JS),
 *    um stream calmo NÃO é derrubado.
 *  - Web Locks: a líder emite `lead` periódico; uma seguidora visível que
 *    para de ouvi-la rouba o lock e assume a conexão; a antiga vira
 *    seguidora. Seguidora oculta não rouba; líder viva não é roubada.
 *  - Modo isolado (chave da líder única desligada): o vigia vale igual.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import { LEADER_STALE_MS, type TabCoordinator } from "./tab-coordinator";
import {
  SSE_HEARTBEAT_EVENT,
  SSE_SERVER_HEARTBEAT_MS,
  SSE_STALE_AFTER_MS,
  SseTabBridge,
} from "./use-sse";

const URL = "/api/sse/messages";

type Aba = {
  tab: FakeTab;
  tabs: TabCoordinator | null;
  bridge: SseTabBridge;
  status: boolean[];
  subscribe: (
    events: string[],
    handler?: (event: string, data: unknown) => void,
    onReconnect?: () => void,
  ) => () => void;
};

function abrirAba(
  hub: FakeTabHub,
  id: string,
  opts: { locks?: boolean; isolated?: boolean } = {},
): Aba {
  const tab = hub.tab(id, opts);
  const tabs = opts.isolated ? null : tab.coordinator();
  const bridge = new SseTabBridge(tab.sseEnv(tabs));
  const status: boolean[] = [];
  bridge.connection(URL).onStatus((open) => status.push(open));
  return {
    tab,
    tabs,
    bridge,
    status,
    subscribe: (events, handler = vi.fn(), onReconnect) =>
      bridge.connection(URL).subscribe(events, handler, onReconnect),
  };
}

const tick = (ms = 10) => vi.advanceTimersByTimeAsync(ms);

describe("stream SSE parado (vigia de atividade)", () => {
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

  it("modo isolado: batimento visto e depois silêncio por 2× o intervalo → desconecta e reconecta", async () => {
    const a = abrirAba(hub, "a", { isolated: true });
    const onReconnect = vi.fn();
    a.subscribe(["new_message"], vi.fn(), onReconnect);
    await tick();
    const first = a.tab.es;
    first.open();
    first.emit(SSE_HEARTBEAT_EVENT, {});
    expect(a.bridge.connection(URL).connected).toBe(true);

    // Batimentos em dia: nada acontece.
    for (let i = 0; i < 4; i++) {
      await tick(SSE_SERVER_HEARTBEAT_MS);
      first.emit(SSE_HEARTBEAT_EVENT, {});
    }
    expect(first.closed).toBe(false);

    // Conexão meio-aberta: nada mais chega e não há `onerror`.
    await tick(SSE_STALE_AFTER_MS + 5_000);
    expect(first.closed).toBe(true);
    expect(a.bridge.connection(URL).connected).toBe(false);
    expect(a.status.at(-1)).toBe(false);

    // Reconecta (backoff) e avisa os assinantes do gap.
    await tick(10_000);
    expect(a.tab.eventSources).toHaveLength(2);
    a.tab.es.open();
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("sem batimento nomeado (backend atual), stream calmo não é derrubado", async () => {
    const a = abrirAba(hub, "a", { isolated: true });
    a.subscribe(["new_message"]);
    await tick();
    a.tab.es.open();
    await tick(10 * 60_000);
    expect(a.tab.eventSources).toHaveLength(1);
    expect(a.tab.es.closed).toBe(false);
  });

  it("eventos também contam como atividade", async () => {
    const a = abrirAba(hub, "a", { isolated: true });
    a.subscribe(["new_message"]);
    await tick();
    a.tab.es.open();
    a.tab.es.emit(SSE_HEARTBEAT_EVENT, {});
    for (let i = 0; i < 10; i++) {
      await tick(SSE_STALE_AFTER_MS - 10_000);
      a.tab.es.emit("new_message", { id: `m${i}` });
    }
    expect(a.tab.eventSources).toHaveLength(1);
  });

  it("líder com stream parado avisa a seguidora (status desconectado)", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    a.subscribe(["new_message"]);
    b.subscribe(["new_message"]);
    await tick();
    a.tab.es.open();
    a.tab.es.emit(SSE_HEARTBEAT_EVENT, {});
    await tick();
    expect(b.bridge.connection(URL).connected).toBe(true);

    await tick(SSE_STALE_AFTER_MS + 5_000);
    expect(b.bridge.connection(URL).connected).toBe(false);
  });
});

describe("líder congelada (Web Locks + batimento da líder)", () => {
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

  it("seguidora visível rouba o lock e abre a conexão; a antiga vira seguidora", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    const onB = vi.fn();
    a.subscribe(["new_message"]);
    b.subscribe(["new_message"], onB);
    await tick();
    expect(a.tabs!.role).toBe("leader");
    a.tab.es.open();
    await tick();

    a.tab.frozen = true;
    await tick(LEADER_STALE_MS + 5_000);

    expect(b.tabs!.role).toBe("leader");
    expect(a.tabs!.role).toBe("follower");
    expect(a.tab.liveEventSources).toHaveLength(0);
    expect(b.tab.liveEventSources).toHaveLength(1);
    b.tab.es.open();
    b.tab.es.emit("new_message", { id: "m1" });
    expect(onB).toHaveBeenCalledWith("new_message", { id: "m1" });

    // A antiga descongela e segue como seguidora, recebendo pelo canal.
    a.tab.frozen = false;
    const onA = vi.fn();
    a.subscribe(["whatsapp_call"], onA);
    await tick(6_000);
    expect(a.tabs!.role).toBe("follower");
    b.tab.es.emit("whatsapp_call", { callId: "c1" });
    await tick();
    expect(onA).toHaveBeenCalledWith("whatsapp_call", { callId: "c1" });
  });

  it("líder viva (sem eventos SSE) não é roubada: o batimento basta", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    a.subscribe(["new_message"]);
    b.subscribe(["new_message"]);
    await tick();
    a.tab.es.open();
    await tick(5 * 60_000);
    expect(a.tabs!.role).toBe("leader");
    expect(b.tabs!.role).toBe("follower");
    expect(a.tab.eventSources).toHaveLength(1);
    expect(b.tab.eventSources).toHaveLength(0);
  });

  it("seguidora oculta não rouba; rouba quando fica visível", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    a.subscribe(["new_message"]);
    b.subscribe(["new_message"]);
    await tick();
    b.tab.hidden = true;
    a.tab.frozen = true;
    await tick(LEADER_STALE_MS * 3);
    expect(b.tabs!.role).toBe("follower");

    b.tab.hidden = false;
    await tick(5_000);
    expect(b.tabs!.role).toBe("leader");
  });
});
