/** @vitest-environment jsdom */
/**
 * `useEntityViewers` nos dois modos da chave `NEXT_PUBLIC_SSE_SINGLE_LEADER`:
 *  - ligada: registra a entidade no `presence-sync` (heartbeat só da líder);
 *  - desligada: caminho anterior — cada instância manda o próprio heartbeat
 *    de 25s, pausa com a aba oculta e sai por beacon no unmount.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/hooks/sse-single-leader", () => ({
  isSingleLeaderEnabled: () => flag.enabled,
}));

const presence = vi.hoisted(() => ({
  unregister: vi.fn(),
  registerEntityView: vi.fn(),
}));
vi.mock("@/hooks/presence-sync", () => ({
  ENTITY_VIEWERS_HEARTBEAT_MS: 25_000,
  registerEntityView: presence.registerEntityView,
}));

const sse = vi.hoisted(() => ({
  unsubscribe: vi.fn(),
  subscribeSSEEvents: vi.fn(),
}));
vi.mock("@/hooks/use-sse", () => ({ subscribeSSEEvents: sse.subscribeSSEEvents }));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u_me" } }, status: "authenticated" }),
}));

import { useEntityViewers } from "@/features/pipeline-v2/hooks/use-entity-viewers";

const ANA = { userId: "u_ana", name: "Ana", avatarUrl: null };
const EU = { userId: "u_me", name: "Eu", avatarUrl: null };

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useEntityViewers — chave da líder entre abas", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let sendBeacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    presence.registerEntityView.mockReset();
    presence.registerEntityView.mockReturnValue(presence.unregister);
    presence.unregister.mockReset();
    sse.subscribeSSEEvents.mockReset();
    sse.subscribeSSEEvents.mockReturnValue(sse.unsubscribe);
    sse.unsubscribe.mockReset();
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ viewers: [ANA, EU] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: sendBeacon });
    setHidden(false);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("LIGADA: registra no presence-sync e não faz fetch próprio", async () => {
    flag.enabled = true;
    const { result, unmount } = renderHook(() => useEntityViewers("deal", "d1"));
    expect(presence.registerEntityView).toHaveBeenCalledWith(
      "deal",
      "d1",
      expect.any(Function),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Lista vinda da líder (heartbeat agregado) — sem você mesmo.
    const deliver = presence.registerEntityView.mock.calls[0][2] as (v: unknown[]) => void;
    act(() => deliver([ANA, EU]));
    expect(result.current).toEqual([ANA]);

    unmount();
    expect(presence.unregister).toHaveBeenCalledTimes(1);
    expect(sse.unsubscribe).toHaveBeenCalledTimes(1);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("DESLIGADA: heartbeat por instância (join + 25s), pausa oculta, beacon no unmount", async () => {
    flag.enabled = false;
    const a = renderHook(() => useEntityViewers("deal", "d1"));
    const b = renderHook(() => useEntityViewers("deal", "d1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(presence.registerEntityView).not.toHaveBeenCalled();
    // Duas "abas" no mesmo deal = dois POSTs (o comportamento anterior).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/presence/heartbeat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ entityType: "deal", entityId: "d1" }),
      }),
    );
    expect(a.result.current).toEqual([ANA]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Oculta: pausa. Volta: bate na hora e retoma.
    act(() => setHidden(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    act(() => setHidden(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);

    a.unmount();
    b.unmount();
    expect(sendBeacon).toHaveBeenCalledTimes(2);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/presence/heartbeat");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
