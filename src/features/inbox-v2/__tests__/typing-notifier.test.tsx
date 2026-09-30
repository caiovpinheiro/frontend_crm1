/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const conversationsApi = vi.hoisted(() => ({ postTyping: vi.fn() }));
vi.mock("@/features/inbox-v2/api/conversations", () => conversationsApi);

import {
  TYPING_THROTTLE_MS,
  createTypingNotifier,
  sendTypingIndicator,
} from "@/features/inbox-v2/api/typing";
import { useTypingNotifier } from "@/features/inbox-v2/hooks/use-typing-notifier";

describe("createTypingNotifier (throttle)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("nunca dispara com o campo vazio", () => {
    const send = vi.fn();
    const n = createTypingNotifier({ send });
    n.notify("");
    n.notify("   ");
    n.notify("\n\t");
    expect(send).not.toHaveBeenCalled();
  });

  it("dispara no primeiro caractere e no máximo 1 vez a cada 3 s", () => {
    const send = vi.fn();
    const n = createTypingNotifier({ send });
    expect(TYPING_THROTTLE_MS).toBe(3_000);

    n.notify("o");
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    n.notify("ol");
    vi.advanceTimersByTime(1_999);
    n.notify("olá");
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1); // t = 3 000 ms exatos
    n.notify("olá!");
    expect(send).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10_000);
    n.notify("");
    expect(send).toHaveBeenCalledTimes(2); // vazio segue mudo
    n.notify("de novo");
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("reset() libera o próximo disparo na hora", () => {
    const send = vi.fn();
    const n = createTypingNotifier({ send });
    n.notify("a");
    n.reset();
    n.notify("ab");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("aceita intervalo e relógio customizados", () => {
    let t = 0;
    const send = vi.fn();
    const n = createTypingNotifier({ send, intervalMs: 500, now: () => t });
    n.notify("a");
    t = 499;
    n.notify("ab");
    t = 500;
    n.notify("abc");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("sendTypingIndicator delega ao POST /typing", () => {
    sendTypingIndicator("conv-9");
    expect(conversationsApi.postTyping).toHaveBeenCalledWith("conv-9");
  });
});

describe("useTypingNotifier", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    conversationsApi.postTyping.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("dispara para a conversa atual, com throttle, e zera ao trocar de conversa", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useTypingNotifier(id),
      { initialProps: { id: "c1" as string | null } },
    );

    act(() => result.current("o"));
    act(() => result.current("oi"));
    expect(conversationsApi.postTyping).toHaveBeenCalledTimes(1);
    expect(conversationsApi.postTyping).toHaveBeenCalledWith("c1");

    rerender({ id: "c2" });
    act(() => result.current("x"));
    expect(conversationsApi.postTyping).toHaveBeenCalledTimes(2);
    expect(conversationsApi.postTyping).toHaveBeenLastCalledWith("c2");

    rerender({ id: null });
    vi.advanceTimersByTime(10_000);
    act(() => result.current("sem conversa"));
    expect(conversationsApi.postTyping).toHaveBeenCalledTimes(2);
  });

  it("enabled=false (ex.: nota interna) não dispara", () => {
    const { result } = renderHook(() => useTypingNotifier("c1", false));
    act(() => result.current("nota"));
    expect(conversationsApi.postTyping).not.toHaveBeenCalled();
  });
});
