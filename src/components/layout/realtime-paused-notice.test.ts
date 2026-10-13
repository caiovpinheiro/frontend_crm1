/**
 * Modo sem tempo real: refetch das queries ativas no foco e a cada 60 s,
 * só com a aba visível; desliga ao sair da pausa.
 */
import { describe, expect, it, vi } from "vitest";

import { REALTIME_PAUSED_REFETCH_MS, startPausedRefetch } from "./realtime-paused-notice";

function fakeEnv(visible = true) {
  let focus: (() => void) | null = null;
  let tick: (() => void) | null = null;
  let intervalMs = 0;
  const state = { visible };
  return {
    state,
    env: {
      isVisible: () => state.visible,
      onFocus: (fn: () => void) => {
        focus = fn;
        return () => {
          focus = null;
        };
      },
      setInterval: (fn: () => void, ms: number) => {
        tick = fn;
        intervalMs = ms;
        return () => {
          tick = null;
        };
      },
    },
    focus: () => focus?.(),
    tick: () => tick?.(),
    intervalMs: () => intervalMs,
    armed: () => focus !== null || tick !== null,
  };
}

describe("startPausedRefetch", () => {
  it("refaz as queries ativas no foco e a cada 60 s", () => {
    const client = { refetchQueries: vi.fn().mockResolvedValue(undefined) };
    const f = fakeEnv();
    startPausedRefetch(client, f.env);
    expect(f.intervalMs()).toBe(REALTIME_PAUSED_REFETCH_MS);
    expect(client.refetchQueries).not.toHaveBeenCalled();

    f.focus();
    f.tick();
    expect(client.refetchQueries).toHaveBeenCalledTimes(2);
    expect(client.refetchQueries).toHaveBeenCalledWith({ type: "active" });
  });

  it("aba oculta não refaz nada", () => {
    const client = { refetchQueries: vi.fn().mockResolvedValue(undefined) };
    const f = fakeEnv(false);
    startPausedRefetch(client, f.env);
    f.tick();
    expect(client.refetchQueries).not.toHaveBeenCalled();
  });

  it("o desligamento solta foco e intervalo", () => {
    const client = { refetchQueries: vi.fn().mockResolvedValue(undefined) };
    const f = fakeEnv();
    const off = startPausedRefetch(client, f.env);
    off();
    expect(f.armed()).toBe(false);
  });
});
