/**
 * Conexão SSE compartilhada: aba oculta, troca de tela e reconexão.
 * EventSource e document falsos (ambiente node), timers falsos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SSE_HIDDEN_TEARDOWN_MS,
  SSE_IDLE_CLOSE_MS,
  sseReconnectDelay,
  subscribeSSE,
} from "@/hooks/use-sse";

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

describe("SSE — aba oculta", () => {
  it("oculta por 30 s: nenhuma conexão nova e nenhuma recarga", async () => {
    const onReconnect = vi.fn();
    subscribeSSE(url, ["new_message"], vi.fn(), onReconnect);
    connections()[0].open();

    doc.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(live()).toHaveLength(1);
    doc.setVisibility("visible");

    // O teardown agendado foi cancelado: nada acontece depois.
    await vi.advanceTimersByTimeAsync(SSE_HIDDEN_TEARDOWN_MS * 2);
    expect(connections()).toHaveLength(1);
    expect(live()).toHaveLength(1);
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("oculta por 90 s: fecha aos 60 s e reconecta uma vez, com recarga", async () => {
    const onReconnect = vi.fn();
    subscribeSSE(url, ["new_message"], vi.fn(), onReconnect);
    connections()[0].open();

    doc.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(SSE_HIDDEN_TEARDOWN_MS - 1);
    expect(live()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(live()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(30_000);
    doc.setVisibility("visible");
    expect(connections()).toHaveLength(2);
    connections()[1].open();
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});

describe("SSE — troca de tela", () => {
  it("inbox → board reaproveita a mesma conexão aberta", async () => {
    const inboxReconnect = vi.fn();
    const boardReconnect = vi.fn();
    const boardHandler = vi.fn();

    const leaveInbox = subscribeSSE(url, ["new_message"], vi.fn(), inboxReconnect);
    connections()[0].open();

    leaveInbox();
    await vi.advanceTimersByTimeAsync(1_500);
    const leaveBoard = subscribeSSE(
      url,
      ["new_message", "conversation_updated"],
      boardHandler,
      boardReconnect,
    );

    expect(connections()).toHaveLength(1);
    expect(live()).toHaveLength(1);
    connections()[0].emit("conversation_updated", { id: "c1" });
    expect(boardHandler).toHaveBeenCalledWith("conversation_updated", { id: "c1" });

    // Volta pro inbox: continua a mesma conexão.
    leaveBoard();
    await vi.advanceTimersByTimeAsync(SSE_IDLE_CLOSE_MS - 1);
    subscribeSSE(url, ["new_message"], vi.fn(), inboxReconnect);
    await vi.advanceTimersByTimeAsync(SSE_IDLE_CLOSE_MS * 2);
    expect(connections()).toHaveLength(1);
    expect(live()).toHaveLength(1);
    expect(inboxReconnect).not.toHaveBeenCalled();
    expect(boardReconnect).not.toHaveBeenCalled();
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
});

describe("SSE — reconexão", () => {
  it("espera 2 → 4 → 8 → 16 → 30 → 30 s e volta a 2 s depois do onopen", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // sem variação
    subscribeSSE(url, ["new_message"], vi.fn());
    connections()[0].open();

    const expected = [2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
    for (const wait of expected) {
      const before = connections().length;
      connections()[before - 1].fail();
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(connections()).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(connections()).toHaveLength(before + 1);
    }

    const current = connections()[connections().length - 1];
    current.open();
    current.fail();
    const before = connections().length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(connections()).toHaveLength(before + 1);
  });

  it("variação aleatória de ±20% em cada espera", () => {
    for (const [attempt, base] of [
      [0, 2_000],
      [1, 4_000],
      [2, 8_000],
      [3, 16_000],
      [4, 30_000],
      [9, 30_000],
    ] as const) {
      expect(sseReconnectDelay(attempt, () => 0)).toBe(base * 0.8);
      expect(sseReconnectDelay(attempt, () => 0.5)).toBe(base);
      expect(sseReconnectDelay(attempt, () => 0.999_999)).toBeLessThanOrEqual(base * 1.2);
      expect(sseReconnectDelay(attempt, () => 0.999_999)).toBeGreaterThan(base * 1.19);
    }
  });
});
