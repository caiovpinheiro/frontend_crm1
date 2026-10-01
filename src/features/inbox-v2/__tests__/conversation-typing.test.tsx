/** @vitest-environment jsdom */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Barramento SSE falso: guarda os handlers por evento e deixa emitir. */
const sse = vi.hoisted(() => {
  const subs = new Set<Record<string, (data: unknown) => void>>();
  return {
    subs,
    subscribeSSEEvents: vi.fn(
      (_url: string, handlers: Record<string, (data: unknown) => void>) => {
        subs.add(handlers);
        return () => {
          subs.delete(handlers);
        };
      },
    ),
    emit(event: string, data: unknown) {
      for (const handlers of [...subs]) handlers[event]?.(data);
    },
  };
});
vi.mock("@/hooks/use-sse", () => ({ subscribeSSEEvents: sse.subscribeSSEEvents }));

import {
  TYPING_HINT_MAX_MS,
  typingHintLabel,
  typingHintTtlMs,
  useConversationTyping,
} from "@/features/inbox-v2/hooks/use-conversation-typing";

const T0 = Date.parse("2026-09-30T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function typing(over: Record<string, unknown> = {}) {
  return {
    organizationId: "org_1",
    conversationId: "c1",
    contactId: "contact_1",
    userId: "u_ana",
    userName: "Ana Souza",
    source: "agent",
    until: iso(T0 + 5_000),
    ...over,
  };
}

describe("typingHintTtlMs / typingHintLabel", () => {
  it("usa `until`, limitado a 5s; inválido cai em 5s; passado = 0", () => {
    expect(TYPING_HINT_MAX_MS).toBe(5_000);
    expect(typingHintTtlMs(iso(T0 + 3_000), T0)).toBe(3_000);
    expect(typingHintTtlMs(iso(T0 + 60_000), T0)).toBe(5_000);
    expect(typingHintTtlMs(undefined, T0)).toBe(5_000);
    expect(typingHintTtlMs("não é data", T0)).toBe(5_000);
    expect(typingHintTtlMs(iso(T0 - 1), T0)).toBe(0);
  });

  it("primeiro nome + 'está digitando…'; sem nome, só 'digitando…'", () => {
    expect(typingHintLabel("Ana Souza")).toBe("Ana está digitando…");
    expect(typingHintLabel("  ")).toBe("digitando…");
    expect(typingHintLabel(null)).toBe("digitando…");
  });
});

describe("useConversationTyping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    sse.subs.clear();
    sse.subscribeSSEEvents.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("aparece com o evento de outro agente e some quando `until` passa", () => {
    const { result } = renderHook(() => useConversationTyping("c1", "u_me"));
    expect(result.current).toBeNull();
    expect(sse.subscribeSSEEvents).toHaveBeenCalledWith(
      "/api/sse/messages",
      expect.objectContaining({ typing: expect.any(Function) }),
    );

    act(() => sse.emit("typing", typing()));
    expect(result.current).toBe("Ana está digitando…");

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(result.current).toBe("Ana está digitando…");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBeNull();
  });

  it("evento novo antes de expirar renova o prazo (não pisca)", () => {
    const { result } = renderHook(() => useConversationTyping("c1", "u_me"));
    act(() => sse.emit("typing", typing()));
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    act(() => sse.emit("typing", typing({ until: iso(T0 + 8_000) })));
    act(() => {
      vi.advanceTimersByTime(4_000); // t = 7s: o primeiro prazo (5s) já passou
    });
    expect(result.current).toBe("Ana está digitando…");
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBeNull();
  });

  it("ignora o próprio usuário, outra conversa e `until` já vencido", () => {
    const { result } = renderHook(() => useConversationTyping("c1", "u_me"));
    act(() => sse.emit("typing", typing({ userId: "u_me" })));
    expect(result.current).toBeNull();
    act(() => sse.emit("typing", typing({ conversationId: "c2" })));
    expect(result.current).toBeNull();
    act(() => sse.emit("typing", typing({ until: iso(T0 - 1_000) })));
    expect(result.current).toBeNull();
  });

  it("sem `until` válido some em 5s; sem nome mostra 'digitando…'", () => {
    const { result } = renderHook(() => useConversationTyping("c1", "u_me"));
    act(() => sse.emit("typing", typing({ until: undefined, userName: null })));
    expect(result.current).toBe("digitando…");
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBeNull();
  });

  it("trocar de conversa limpa o indicador e reassina", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useConversationTyping(id, "u_me"),
      { initialProps: { id: "c1" as string | null } },
    );
    act(() => sse.emit("typing", typing()));
    expect(result.current).toBe("Ana está digitando…");

    rerender({ id: "c2" });
    expect(result.current).toBeNull();
    act(() => sse.emit("typing", typing({ conversationId: "c2", userName: "Bia" })));
    expect(result.current).toBe("Bia está digitando…");

    rerender({ id: null });
    expect(result.current).toBeNull();
    expect(sse.subs.size).toBe(0);
  });

  it("no cabeçalho: o texto aparece e some do DOM", () => {
    function Header({ conversationId }: { conversationId: string }) {
      const hint = useConversationTyping(conversationId, "u_me");
      return (
        <header>
          {hint ? (
            <span aria-live="polite" data-testid="chat-typing-hint">
              {hint}
            </span>
          ) : null}
        </header>
      );
    }
    render(<Header conversationId="c1" />);
    expect(screen.queryByTestId("chat-typing-hint")).toBeNull();

    act(() => sse.emit("typing", typing()));
    expect(screen.getByTestId("chat-typing-hint").textContent).toBe("Ana está digitando…");

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByTestId("chat-typing-hint")).toBeNull();
  });
});
