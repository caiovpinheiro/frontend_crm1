/**
 * Teto de conexões do backend e sessão revogada, vistos pelo barramento:
 *  - `sse_connection_evicted` (teto por usuário): fecha, NÃO reconecta na
 *    hora (senão vira rodízio), a liderança não muda;
 *  - 429 + `Retry-After` (teto da org) e 401 (`SESSION_REVOKED`) no
 *    handshake, lidos por sondagem — o `EventSource` não expõe status.
 * E a chave de desligar da líder entre abas (os dois modos).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub, type FakeTab } from "./__tests__/fake-tabs";
import type { TabCoordinator } from "./tab-coordinator";
import {
  defaultSseTabs,
  probeSseHandshake,
  SSE_EVICTED_EVENT,
  SSE_EVICTED_MIN_RETRY_MS,
  SseTabBridge,
  type SseEnv,
  type SseProbeResult,
} from "./use-sse";

const URL = "/api/sse/messages";

type Aba = {
  tab: FakeTab;
  tabs: TabCoordinator | null;
  bridge: SseTabBridge;
  subscribe: (
    events: string[],
    handler?: (event: string, data: unknown) => void,
    onReconnect?: () => void,
  ) => () => void;
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
    subscribe: (events, handler = vi.fn(), onReconnect) =>
      bridge.connection(URL).subscribe(events, handler, onReconnect),
  };
}

const tick = (ms = 10) => vi.advanceTimersByTimeAsync(ms);

describe("sse_connection_evicted (teto por usuário)", () => {
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

  it("líder despejada fecha, espera ≥ 60s e NÃO passa a liderança; as seguidoras ficam sem SSE até a volta", async () => {
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
    expect(b.bridge.connection(URL).connected).toBe(true);

    const despejada = a.tab.es;
    despejada.emit(SSE_EVICTED_EVENT, { reason: "user_limit", retryAfterMs: 50_000 });
    await tick();
    expect(despejada.closed).toBe(true);
    expect(a.bridge.connection(URL).holdReason).toBe("evicted");
    expect(b.bridge.connection(URL).connected).toBe(false);

    // Nada de reconectar na hora nem no backoff normal (5s), e a seguidora
    // não assume: a líder continua líder.
    await vi.advanceTimersByTimeAsync(SSE_EVICTED_MIN_RETRY_MS - 100);
    expect(a.tab.eventSources).toHaveLength(1);
    expect(b.tab.eventSources).toHaveLength(0);
    expect(a.tabs!.role).toBe("leader");
    expect(b.tabs!.role).toBe("follower");

    // Foco antes do prazo não adianta a reconexão.
    a.tab.userActive();
    await tick();
    expect(a.tab.eventSources).toHaveLength(1);

    // 60s × (1 + 0,5 × 30%) = 69s.
    await vi.advanceTimersByTimeAsync(9_200);
    expect(a.tab.eventSources).toHaveLength(2);
    expect(a.bridge.connection(URL).holdReason).toBeNull();

    a.tab.es.open();
    await tick();
    expect(reconnectA).toHaveBeenCalledTimes(1);
    expect(reconnectB).toHaveBeenCalledTimes(1);
    a.tab.es.emit("new_message", { id: "m1" });
    await tick();
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it("`retryAfterMs` maior que 60s vale; menor não reduz o mínimo", async () => {
    const a = abrirAba(hub, "a", { isolada: true });
    a.subscribe(["new_message"]);
    a.tab.es.open();
    a.tab.es.emit(SSE_EVICTED_EVENT, { reason: "user_limit", retryAfterMs: 120_000 });

    await vi.advanceTimersByTimeAsync(120_000 * 1.15 - 100);
    expect(a.tab.eventSources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(a.tab.eventSources).toHaveLength(2);

    a.tab.es.open();
    a.tab.es.emit(SSE_EVICTED_EVENT, { retryAfterMs: 1_000 });
    await vi.advanceTimersByTimeAsync(SSE_EVICTED_MIN_RETRY_MS);
    expect(a.tab.eventSources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(a.tab.eventSources).toHaveLength(3);
  });

  it("despejo seguido de novo assinante não fura o prazo", async () => {
    const a = abrirAba(hub, "a", { isolada: true });
    const sair = a.subscribe(["new_message"]);
    a.tab.es.open();
    a.tab.es.emit(SSE_EVICTED_EVENT, { reason: "user_limit", retryAfterMs: 50_000 });

    sair();
    a.subscribe(["conversation_updated"]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(a.tab.eventSources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(a.tab.eventSources).toHaveLength(2);
  });
});

describe("handshake recusado: 429 (teto da org) e 401 (sessão)", () => {
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

  it("429 com Retry-After: 35 — nenhuma tentativa antes de 35s", async () => {
    const probe = vi.fn(async (): Promise<SseProbeResult | null> => ({
      status: 429,
      retryAfterMs: 35_000,
    }));
    const a = abrirAba(hub, "a", { isolada: true, extras: { probe } });
    a.subscribe(["new_message"]);
    a.tab.es.fail(); // recusado sem abrir
    await tick();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(URL);

    await vi.advanceTimersByTimeAsync(35_000 - 100);
    expect(a.tab.eventSources).toHaveLength(1);
    // 35s × 1,15 = 40,25s
    await vi.advanceTimersByTimeAsync(5_400);
    expect(a.tab.eventSources).toHaveLength(2);
  });

  it("429 sem cabeçalho legível assume 35s", async () => {
    const probe = vi.fn(async (): Promise<SseProbeResult | null> => ({ status: 429 }));
    const a = abrirAba(hub, "a", { isolada: true, extras: { probe } });
    a.subscribe(["new_message"]);
    a.tab.es.fail();
    await vi.advanceTimersByTimeAsync(35_000);
    expect(a.tab.eventSources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(a.tab.eventSources).toHaveLength(2);
  });

  it("401 SESSION_REVOKED: avisa uma vez e não reconecta em loop; só confere de novo quando o usuário volta (≥ 60s)", async () => {
    const probe = vi.fn(async (): Promise<SseProbeResult | null> => ({
      status: 401,
      code: "SESSION_REVOKED",
    }));
    const onSessionRevoked = vi.fn();
    const a = abrirAba(hub, "a", { extras: { probe, onSessionRevoked } });
    const b = abrirAba(hub, "b");
    a.subscribe(["new_message"]);
    b.subscribe(["new_message"]);
    await tick();
    a.tab.es.fail();
    await tick();

    expect(onSessionRevoked).toHaveBeenCalledTimes(1);
    expect(a.bridge.connection(URL).holdReason).toBe("unauthorized");

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(a.tab.eventSources).toHaveLength(1);
    expect(b.tab.eventSources).toHaveLength(0); // a liderança não roda
    expect(probe).toHaveBeenCalledTimes(1);

    a.tab.userActive();
    await tick();
    expect(a.tab.eventSources).toHaveLength(2); // uma conferida, por ação do usuário
    a.tab.es.fail();
    await tick();
    expect(onSessionRevoked).toHaveBeenCalledTimes(2);

    // Foco repetido dentro de 60s não gera tentativa nova.
    a.tab.userActive();
    a.tab.userActive();
    await tick();
    expect(a.tab.eventSources).toHaveLength(2);
  });

  it("401 sem código (sessão expirada) também para, sem disparar o signOut", async () => {
    const probe = vi.fn(async (): Promise<SseProbeResult | null> => ({ status: 401 }));
    const onSessionRevoked = vi.fn();
    const a = abrirAba(hub, "a", { isolada: true, extras: { probe, onSessionRevoked } });
    a.subscribe(["new_message"]);
    a.tab.es.fail();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(a.tab.eventSources).toHaveLength(1);
    expect(onSessionRevoked).not.toHaveBeenCalled();
  });

  it("queda de conexão ABERTA (deploy) não sonda: backoff normal de 5s", async () => {
    const probe = vi.fn(async (): Promise<SseProbeResult | null> => ({ status: 429 }));
    const a = abrirAba(hub, "a", { isolada: true, extras: { probe } });
    a.subscribe(["new_message"]);
    a.tab.es.open();
    a.tab.es.fail();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(probe).not.toHaveBeenCalled();
    expect(a.tab.eventSources).toHaveLength(2);
  });

  it("sondagem sem veredito (rede/5xx/2xx) segue o backoff normal", async () => {
    const respostas: Array<SseProbeResult | null> = [null, { status: 502 }, { status: 200 }];
    const probe = vi.fn(async () => respostas.shift() ?? null);
    const a = abrirAba(hub, "a", { isolada: true, extras: { probe } });
    a.subscribe(["new_message"]);
    for (const [i, espera] of [5_000, 10_000, 20_000].entries()) {
      a.tab.es.fail();
      await tick(1);
      await vi.advanceTimersByTimeAsync(espera - 2);
      expect(a.tab.eventSources).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(2);
      expect(a.tab.eventSources).toHaveLength(i + 2);
    }
    expect(probe).toHaveBeenCalledTimes(3);
  });
});

describe("probeSseHandshake", () => {
  it("lê status, Retry-After (s → ms) e o code do 401; aborta o stream num 200", async () => {
    const sinais: AbortSignal[] = [];
    const fetchCom = (res: Response) =>
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        sinais.push(init!.signal as AbortSignal);
        return res;
      }) as unknown as typeof fetch;

    expect(
      await probeSseHandshake(
        URL,
        fetchCom(new Response("{}", { status: 429, headers: { "Retry-After": "35" } })),
      ),
    ).toEqual({ status: 429, retryAfterMs: 35_000 });

    expect(
      await probeSseHandshake(
        URL,
        fetchCom(
          new Response(JSON.stringify({ message: "x", code: "SESSION_REVOKED" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    ).toEqual({ status: 401, code: "SESSION_REVOKED" });

    expect(
      await probeSseHandshake(URL, fetchCom(new Response(": connected\n\n", { status: 200 }))),
    ).toEqual({ status: 200 });
    expect(sinais.every((s) => s.aborted)).toBe(true);

    const falha = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await probeSseHandshake(URL, falha)).toBeNull();
  });
});

describe("chave de desligar (NEXT_PUBLIC_SSE_SINGLE_LEADER / localStorage)", () => {
  let hub: FakeTabHub;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new FakeTabHub();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaultSseTabs: ligada usa o coordenador; desligada devolve null (aba isolada)", () => {
    const coord = hub.tab("x").coordinator();
    const create = vi.fn(() => coord);
    expect(defaultSseTabs(true, create)).toBe(coord);
    expect(defaultSseTabs(false, create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("LIGADA: duas abas, uma conexão", async () => {
    const a = abrirAba(hub, "a");
    const b = abrirAba(hub, "b");
    a.subscribe(["new_message"]);
    b.subscribe(["new_message"]);
    await tick();
    expect(a.tab.eventSources.length + b.tab.eventSources.length).toBe(1);
  });

  it("DESLIGADA: cada aba abre a própria conexão na hora e só recebe dela (comportamento anterior)", async () => {
    const a = abrirAba(hub, "a", { isolada: true });
    const b = abrirAba(hub, "b", { isolada: true });
    const onA = vi.fn();
    const onB = vi.fn();
    a.subscribe(["new_message"], onA);
    b.subscribe(["new_message"], onB);
    // Sem eleição: o EventSource existe antes de qualquer tick.
    expect(a.tab.eventSources).toHaveLength(1);
    expect(b.tab.eventSources).toHaveLength(1);
    expect(hub.channels.size).toBe(0); // nenhum BroadcastChannel aberto

    a.tab.es.open();
    b.tab.es.open();
    a.tab.es.emit("new_message", { id: "só-a" });
    await tick();
    expect(onA.mock.calls).toEqual([["new_message", { id: "só-a" }]]);
    expect(onB).not.toHaveBeenCalled();

    // Fechar uma aba não muda nada na outra.
    a.tab.close();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(b.tab.eventSources).toHaveLength(1);
    expect(b.tab.liveEventSources).toHaveLength(1);
  });
});
