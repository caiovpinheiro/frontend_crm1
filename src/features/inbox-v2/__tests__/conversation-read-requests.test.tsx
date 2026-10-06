/** @vitest-environment jsdom */
/**
 * `POST /api/conversations/:id/read` — quando sai.
 *
 * Alternar entre duas conversas no Inbox não refazia o GET de mensagens
 * (cache), mas mandava o POST /read a cada volta, mesmo sem nada a marcar.
 * O "read" também avisa a Meta (visto azul), então ele sai só quando há o
 * que marcar:
 *
 *  - abrir conversa com `unreadCount > 0` no cache da lista: 1 POST;
 *  - voltar a uma conversa já lida (`unreadCount` 0): nenhum POST;
 *  - conversa fora do cache da lista (chat do board, sem a lista do Inbox):
 *    POST, como antes — não dá para saber;
 *  - `new_message` recebida (`direction: "in"`) NA conversa aberta: o host
 *    é avisado para marcar como lida (`onOpenConversationInbound`); envio do
 *    próprio agente ou mensagem de outra conversa não avisam.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ markConversationRead: vi.fn() }));
vi.mock("@/features/inbox-v2/api/conversations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/inbox-v2/api/conversations")>()),
  markConversationRead: api.markConversationRead,
}));

const sse = vi.hoisted(() => ({
  handlers: null as Record<string, (data: unknown) => void> | null,
}));
vi.mock("@/hooks/use-sse", () => ({
  subscribeSSEEvents: vi.fn((_url: string, handlers: Record<string, (data: unknown) => void>) => {
    sse.handlers = handlers;
    return () => {
      sse.handlers = null;
    };
  }),
  useSSEConnected: () => true,
}));
vi.mock("@/features/inbox-v2/context/message-toast-context", () => ({
  useMessageToast: () => ({ registerActiveConversation: () => () => {} }),
}));
vi.mock("@/lib/api", () => ({ apiUrl: (path: string) => `http://api.test${path}` }));

import type { ConversationListRow } from "@/features/inbox-v2/api";
import { useMarkConversationReadIfUnread } from "@/features/inbox-v2/hooks/use-conversation-actions";
import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";

const T0 = "2026-10-06T12:00:00.000Z";
const LIST_KEY = ["inbox-conversations", "todos", {}, ""] as const;

function row(id: string, unreadCount: number): ConversationListRow {
  return {
    id,
    status: "OPEN",
    channel: "whatsapp",
    channelId: "ch_1",
    contactId: `ct-${id}`,
    contact: { id: `ct-${id}`, name: `Contato ${id}` },
    assignedToId: "u_me",
    unreadCount,
    hasHumanReply: false,
    lastMessageDirection: "in",
    lastMessageAt: T0,
    lastInboundAt: T0,
    updatedAt: T0,
    createdAt: T0,
    closedAt: null,
  } as unknown as ConversationListRow;
}

function makeClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(LIST_KEY, {
    pages: [{ items: [row("A", 2), row("B", 0)] }],
    pageParams: [null],
  });
  return qc;
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function unreadOf(qc: QueryClient, id: string): number | undefined {
  const cache = qc.getQueryData<{ pages: { items: ConversationListRow[] }[] }>(LIST_KEY);
  return cache?.pages[0]?.items.find((r) => r.id === id)?.unreadCount;
}

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));

beforeEach(() => {
  api.markConversationRead.mockReset();
  api.markConversationRead.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("marcar como lida ao abrir", () => {
  it("só com não lidas no cache; conversa já lida não manda POST; fora do cache manda", async () => {
    const qc = makeClient();
    const view = renderHook(() => useMarkConversationReadIfUnread(), { wrapper: wrapperFor(qc) });

    // A tem 2 não lidas: POST + contador zerado na hora.
    act(() => {
      view.result.current("A");
    });
    await waitFor(() => expect(api.markConversationRead).toHaveBeenCalledTimes(1));
    expect(api.markConversationRead).toHaveBeenCalledWith("A");
    expect(unreadOf(qc, "A")).toBe(0);

    // B já está lida: nada sai.
    act(() => {
      view.result.current("B");
    });
    // Voltar para A (agora lida): nada sai.
    act(() => {
      view.result.current("A");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.markConversationRead).toHaveBeenCalledTimes(1);

    // Conversa que a lista não conhece (chat do board): manda, como antes.
    act(() => {
      view.result.current("C");
    });
    await waitFor(() => expect(api.markConversationRead).toHaveBeenCalledTimes(2));
    expect(api.markConversationRead).toHaveBeenLastCalledWith("C");
  });
});

describe("new_message na conversa aberta", () => {
  function mountRealtime(qc: QueryClient, activeConversationId: string) {
    const onOpenConversationInbound = vi.fn();
    renderHook(
      () =>
        useInboxRealtime({
          activeConversationId,
          currentUserId: "u_me",
          onOpenConversationInbound,
        }),
      { wrapper: wrapperFor(qc) },
    );
    expect(sse.handlers).not.toBeNull();
    return { onOpenConversationInbound };
  }

  function newMessage(conversationId: string, direction: "in" | "out") {
    act(() => {
      sse.handlers!.new_message!({
        conversationId,
        contactId: `ct-${conversationId}`,
        direction,
        content: "oi",
        messageType: "text",
        timestamp: "2026-10-06T12:00:05.000Z",
      });
    });
  }

  it("mensagem recebida na conversa aberta avisa o host (que marca como lida)", () => {
    const qc = makeClient();
    const { onOpenConversationInbound } = mountRealtime(qc, "B");
    newMessage("B", "in");
    expect(onOpenConversationInbound).toHaveBeenCalledTimes(1);
    expect(onOpenConversationInbound).toHaveBeenCalledWith("B");
  });

  it("envio do próprio agente ou mensagem de OUTRA conversa não avisam", () => {
    const qc = makeClient();
    const { onOpenConversationInbound } = mountRealtime(qc, "B");
    newMessage("B", "out");
    newMessage("A", "in");
    expect(onOpenConversationInbound).not.toHaveBeenCalled();
  });
});
