import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SSE_IDLE_CLOSE_MS, sseReconnectDelayMs, subscribeSSE } from "./use-sse";

const mid = () => 0.5; // jitter neutro
const low = () => 0; // -30%
const high = () => 1; // +30%

describe("sseReconnectDelayMs", () => {
  it("dobra a cada falha a partir de 5s", () => {
    expect([0, 1, 2, 3].map((n) => sseReconnectDelayMs(n, mid))).toEqual([
      5_000, 10_000, 20_000, 40_000,
    ]);
  });

  it("para em 60s", () => {
    expect(sseReconnectDelayMs(4, mid)).toBe(60_000);
    expect(sseReconnectDelayMs(20, mid)).toBe(60_000);
  });

  it("espalha ±30% para as abas não voltarem juntas", () => {
    expect(sseReconnectDelayMs(0, low)).toBe(3_500);
    expect(sseReconnectDelayMs(0, high)).toBe(6_500);
    expect(sseReconnectDelayMs(10, high)).toBe(78_000);
  });
});

// ── Conexão compartilhada: EventSource e document falsos, timers falsos ──

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, Set<(e: Event) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, fn: (e: Event) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
  }
  removeEventListener(name: string, fn: (e: Event) => void) {
    this.listeners.get(name)?.delete(fn);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  fail() {
    this.onerror?.();
  }
  emit(name: string, data: unknown) {
    for (const fn of this.listeners.get(name) ?? []) {
      fn({ type: name, data: JSON.stringify(data) } as unknown as Event);
    }
  }
}

function fakeDocument() {
  const handlers = new Set<() => void>();
  return {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener(type: string, fn: () => void) {
      if (type === "visibilitychange") handlers.add(fn);
    },
    setVisibility(state: DocumentVisibilityState) {
      this.visibilityState = state;
      for (const fn of handlers) fn();
    },
  };
}

let doc: ReturnType<typeof fakeDocument>;
let seq = 0;
/** URL nova por teste = conexão nova (o singleton é por URL). */
let url: string;

function connections(): FakeEventSource[] {
  return FakeEventSource.instances.filter((es) => es.url === url);
}
function live(): FakeEventSource[] {
  return connections().filter((es) => !es.closed);
}

describe("SharedSSEConnection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    doc = fakeDocument();
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("document", doc);
    seq += 1;
    url = `/api/sse/test-${seq}`;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("inbox → board → inbox reaproveita a mesma conexão aberta", async () => {
    const inboxReconnect = vi.fn();
    const boardHandler = vi.fn();

    const leaveInbox = subscribeSSE(url, ["new_message"], vi.fn(), inboxReconnect);
    connections()[0].open();

    leaveInbox();
    await vi.advanceTimersByTimeAsync(1_500);
    const leaveBoard = subscribeSSE(url, ["conversation_updated"], boardHandler);
    expect(connections()).toHaveLength(1);
    expect(live()).toHaveLength(1);
    connections()[0].emit("conversation_updated", { id: "c1" });
    expect(boardHandler).toHaveBeenCalledWith("conversation_updated", { id: "c1" });

    leaveBoard();
    await vi.advanceTimersByTimeAsync(SSE_IDLE_CLOSE_MS - 1);
    subscribeSSE(url, ["new_message"], vi.fn(), inboxReconnect);
    await vi.advanceTimersByTimeAsync(SSE_IDLE_CLOSE_MS * 2);
    expect(connections()).toHaveLength(1);
    expect(live()).toHaveLength(1);
    expect(inboxReconnect).not.toHaveBeenCalled();
  });

  it("sem assinante nenhum, fecha depois de 30 s", async () => {
    const leave = subscribeSSE(url, ["new_message"], vi.fn());
    connections()[0].open();
    leave();

    await vi.advanceTimersByTimeAsync(SSE_IDLE_CLOSE_MS - 1);
    expect(live()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(live()).toHaveLength(0);
  });

  it("aba oculta por 30 s ou 90 s não derruba a conexão nem recarrega", async () => {
    const onReconnect = vi.fn();
    const handler = vi.fn();
    subscribeSSE(url, ["new_message"], handler, onReconnect);
    connections()[0].open();

    doc.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(30_000);
    doc.setVisibility("visible");
    doc.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(90_000);
    // Mensagem chega com a aba em segundo plano (aviso sonoro/contador).
    connections()[0].emit("new_message", { id: "m1" });
    doc.setVisibility("visible");

    expect(connections()).toHaveLength(1);
    expect(live()).toHaveLength(1);
    expect(handler).toHaveBeenCalledWith("new_message", { id: "m1" });
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("onerror espera 5 → 10 → 20 → 40 → 60 s e volta a 5 s depois do onopen", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // sem variação
    const onReconnect = vi.fn();
    subscribeSSE(url, ["new_message"], vi.fn(), onReconnect);
    connections()[0].open();

    for (const wait of [5_000, 10_000, 20_000, 40_000, 60_000, 60_000]) {
      const before = connections().length;
      connections()[before - 1].fail();
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(connections()).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(connections()).toHaveLength(before + 1);
    }

    const current = connections()[connections().length - 1];
    current.open();
    expect(onReconnect).toHaveBeenCalledTimes(1);
    current.fail();
    const before = connections().length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(connections()).toHaveLength(before + 1);
  });
});
