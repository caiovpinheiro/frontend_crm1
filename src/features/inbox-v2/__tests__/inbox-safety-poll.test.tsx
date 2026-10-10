/** @vitest-environment jsdom */
/**
 * N-MA-1 — poll de segurança da lista e dos contadores do Inbox: só com
 * a aba visível e o SSE desconectado (ou parado), a cada 90s; a lista vai
 * pela 1ª página (`refreshInboxLists`).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => ({ connected: false }));
vi.mock("@/hooks/use-sse", () => ({
  useSSEConnected: () => sse.connected,
}));

import {
  INBOX_SAFETY_POLL_MS,
  useInboxSafetyPoll,
} from "@/features/inbox-v2/hooks/use-inbox-safety-poll";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

function setup(enabled = true) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
  const view = renderHook(() => useInboxSafetyPoll(enabled), { wrapper });
  const keys = () => spy.mock.calls.map(([filters]) => (filters?.queryKey ?? [])[0]);
  return { qc, spy, view, keys };
}

beforeEach(() => {
  vi.useFakeTimers();
  sse.connected = false;
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("poll de segurança do Inbox (N-MA-1)", () => {
  it("SSE desconectado + aba visível: lista e contadores a cada 90s", async () => {
    const { keys, spy } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_SAFETY_POLL_MS - 1_000);
    });
    expect(spy).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(keys()).toEqual(["inbox-conversations", "conversations"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_SAFETY_POLL_MS);
    });
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("SSE conectado: nada", async () => {
    sse.connected = true;
    const { spy } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_SAFETY_POLL_MS * 3);
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("aba oculta: nada; volta a pollar quando fica visível", async () => {
    setVisibility("hidden");
    const { spy } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_SAFETY_POLL_MS * 3);
    });
    expect(spy).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_SAFETY_POLL_MS);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("desligado (prefs ainda não hidratadas): nada", async () => {
    const { spy } = setup(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_SAFETY_POLL_MS * 3);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
