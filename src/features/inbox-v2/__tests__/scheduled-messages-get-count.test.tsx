/** @vitest-environment jsdom */
/**
 * F3 (05/10) — `GET /api/scheduled-messages?conversationId=` por cenário.
 * Busca ao abrir a conversa, ao criar/cancelar (invalidate de quem fez) e
 * no `scheduled_message_updated` daquela conversa; nunca por intervalo com
 * a SSE conectada. Com a SSE fora, o poll de 60 s continua.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => {
  const state = {
    connected: true,
    handlers: null as Record<string, (data: unknown) => void> | null,
    onReconnect: null as (() => void) | null,
  };
  return {
    state,
    subscribeSSEEvents: vi.fn(
      (
        _url: string,
        handlers: Record<string, (data: unknown) => void>,
        onReconnect?: () => void,
      ) => {
        state.handlers = handlers;
        state.onReconnect = onReconnect ?? null;
        return () => {
          state.handlers = null;
          state.onReconnect = null;
        };
      },
    ),
  };
});
vi.mock("@/hooks/use-sse", () => ({
  subscribeSSEEvents: sse.subscribeSSEEvents,
  subscribeSSE: () => () => {},
  useSSEConnected: () => sse.state.connected,
  isSSEConnected: () => sse.state.connected,
}));
vi.mock("@/hooks/use-document-visible", () => ({ useDocumentVisible: () => true }));
vi.mock("@/features/inbox-v2/context/message-toast-context", () => ({
  useMessageToast: () => ({ registerActiveConversation: () => () => {} }),
}));

import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";
import {
  SCHEDULED_MESSAGES_POLL_MS,
  scheduledMessagesKey,
  useScheduledMessages,
} from "@/features/inbox-v2/hooks/use-scheduled-messages";

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/scheduled-messages")) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});

function gets(conversationId: string): number {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).includes(`/api/scheduled-messages?conversationId=${conversationId}`),
  ).length;
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function mount(initialId: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 2 * 60_000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ id }: { id: string }) => {
      useInboxRealtime({ activeConversationId: id, currentUserId: "u_me" });
      return useScheduledMessages(id);
    },
    { wrapper, initialProps: { id: initialId } },
  );
  return { qc, view };
}

function emit(event: string, data: unknown) {
  act(() => {
    sse.state.handlers?.[event]?.(data);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(Date.parse("2026-10-05T12:00:00.000Z"));
  sse.state.connected = true;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("agendadas — SSE conectada", () => {
  it("abrir: 1 GET; 10 min parado: nenhum outro", async () => {
    mount("c1");
    await flush();
    expect(gets("c1")).toBe(1);
    await flush(10 * 60_000);
    expect(gets("c1")).toBe(1);
  });

  it("voltar para a conversa (troca/remontagem do composer) não refaz o GET", async () => {
    const { view } = mount("c1");
    await flush();
    view.rerender({ id: "c2" });
    await flush(30_000);
    view.rerender({ id: "c1" });
    await flush(30_000);
    view.rerender({ id: "c2" });
    await flush();
    expect(gets("c1")).toBe(1);
    expect(gets("c2")).toBe(1);
  });

  it("scheduled_message_updated da conversa aberta: 1 GET; de outra: nenhum agora, 1 ao abrir", async () => {
    const { view } = mount("c1");
    await flush();
    view.rerender({ id: "c2" });
    await flush();
    view.rerender({ id: "c1" });
    await flush();

    emit("scheduled_message_updated", { conversationId: "c1", status: "PENDING" });
    await flush();
    expect(gets("c1")).toBe(2);

    emit("scheduled_message_updated", { conversationId: "c2", status: "SENT" });
    await flush();
    expect(gets("c2")).toBe(1);
    view.rerender({ id: "c2" });
    await flush();
    expect(gets("c2")).toBe(2);
  });

  it("criar/cancelar (invalidate de quem fez): 1 GET", async () => {
    const { qc } = mount("c1");
    await flush();
    await act(async () => {
      await qc.invalidateQueries({ queryKey: scheduledMessagesKey("c1") });
    });
    expect(gets("c1")).toBe(2);
  });

  it("reconexão com gap: 1 GET da aberta; as outras buscam ao reabrir", async () => {
    const { view } = mount("c1");
    await flush();
    view.rerender({ id: "c2" });
    await flush();
    view.rerender({ id: "c1" });
    await flush();
    act(() => sse.state.onReconnect?.());
    await flush();
    expect(gets("c1")).toBe(2);
    expect(gets("c2")).toBe(1);
    view.rerender({ id: "c2" });
    await flush();
    expect(gets("c2")).toBe(2);
  });
});

describe("agendadas — SSE fora", () => {
  it("mantém o poll de 60 s da conversa aberta", async () => {
    sse.state.connected = false;
    mount("c1");
    await flush();
    await flush(3 * SCHEDULED_MESSAGES_POLL_MS + 1_000);
    expect(gets("c1")).toBe(4);
  });
});
