/** @vitest-environment jsdom */
/**
 * N-FE-1 — invalidação da lista do Inbox não refaz TODAS as páginas
 * carregadas (× K filas). Conta os GET de lista por cenário:
 *
 *  - reconexão do SSE (uma fila e K filas em paralelo);
 *  - "Atualizar" (só a lista montada, só a 1ª página);
 *  - evento com card completo numa lista com filtro de servidor opaco
 *    (debounce + 1ª página);
 *  - invalidações por mutação (tags, templates, encaminhar…) via
 *    `refreshInboxLists`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => ({
  handlers: null as Record<string, (data: unknown) => void> | null,
  onReconnect: null as (() => void) | null,
}));
vi.mock("@/hooks/use-sse", () => ({
  subscribeSSEEvents: vi.fn(
    (
      _url: string,
      handlers: Record<string, (data: unknown) => void>,
      onReconnect?: () => void,
    ) => {
      sse.handlers = handlers;
      sse.onReconnect = onReconnect ?? null;
      return () => {
        sse.handlers = null;
        sse.onReconnect = null;
      };
    },
  ),
  useSSEConnected: () => true,
}));
vi.mock("@/features/inbox-v2/context/message-toast-context", () => ({
  useMessageToast: () => ({ registerActiveConversation: () => () => {} }),
}));
vi.mock("@/lib/api", () => ({ apiUrl: (path: string) => `http://api.test${path}` }));

import type { InboxFilters, InboxTab } from "@/features/inbox-v2/api";
import { useConversations } from "@/features/inbox-v2/hooks/use-conversations";
import { refreshInboxLists } from "@/features/inbox-v2/hooks/inbox-list-refresh";
import { useInboxQueueRefresh } from "@/features/inbox-v2/hooks/use-inbox-queue-refresh";
import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";

const T0 = Date.UTC(2026, 8, 30, 12, 0, 0);

function rows(tab: string, n: number) {
  return Array.from({ length: 3 }, (_, i) => {
    const ts = new Date(T0 - (n * 10 + i) * 1000).toISOString();
    return {
      id: `${tab}-${n}-${i}`,
      status: "OPEN",
      channel: "whatsapp",
      channelId: "ch_1",
      contactId: `ct-${tab}-${n}-${i}`,
      contact: { id: `ct-${tab}-${n}-${i}`, name: `${tab} ${n}.${i}` },
      assignedToId: "u_me",
      unreadCount: 0,
      hasHumanReply: false,
      lastMessageDirection: "in",
      lastMessageAt: ts,
      lastInboundAt: ts,
      updatedAt: ts,
      createdAt: new Date(T0 - 86_400_000).toISOString(),
      closedAt: null,
    };
  });
}

const listUrls: string[] = [];

function respond(url: string): unknown {
  const u = new URL(url);
  if (u.searchParams.get("counts") === "1") return { todos: 0 };
  if (u.searchParams.get("ids")) return { items: [] };
  listUrls.push(url);
  const tab = u.searchParams.get("tab") ?? "todos";
  const cursor = u.searchParams.get("cursor");
  const n = cursor ? Number(cursor.slice(1)) : 1;
  return {
    items: rows(tab, n),
    perPage: 50,
    page: 1,
    hasMore: n < 5,
    nextCursor: n < 5 ? `p${n + 1}` : null,
  };
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  return new Response(JSON.stringify(respond(url)), { status: 200 });
});

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/** Lista montada + realtime, com `pages` páginas carregadas. */
async function mountList(
  qc: QueryClient,
  tab: InboxTab | InboxTab[],
  pages: number,
  filters: InboxFilters = {},
) {
  const view = renderHook(
    () => {
      useInboxRealtime({ activeConversationId: null, currentUserId: "u_me" });
      return useConversations({ tab, filters, search: "" });
    },
    { wrapper: wrapperFor(qc) },
  );
  await waitFor(() => expect(view.result.current.data).toBeDefined());
  for (let i = 1; i < pages; i++) {
    await act(async () => {
      await view.result.current.fetchNextPage();
    });
  }
  return view;
}

async function settle(ms = 50) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  listUrls.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("lista do Inbox: requisições por invalidação (N-FE-1)", () => {
  it("reconexão do SSE, uma fila com 3 páginas: 1 GET (antes 3)", async () => {
    const qc = makeClient();
    await mountList(qc, "todos", 3);
    listUrls.length = 0;

    act(() => sse.onReconnect?.());
    await waitFor(() => expect(listUrls.length).toBeGreaterThan(0));
    await settle();
    expect(listUrls).toHaveLength(1);
    expect(new URL(listUrls[0]!).searchParams.get("cursor")).toBeNull();
  });

  it("reconexão do SSE, 3 filas em paralelo com 2 páginas: 3 GET (antes 6)", async () => {
    const qc = makeClient();
    await mountList(qc, ["entrada", "esperando", "respondidas"], 2);
    listUrls.length = 0;

    act(() => sse.onReconnect?.());
    await waitFor(() => expect(listUrls.length).toBeGreaterThan(0));
    await settle();
    expect(listUrls).toHaveLength(3);
    for (const url of listUrls) {
      expect(new URL(url).searchParams.get("cursor")).toBeNull();
    }
  });

  it("depois do refresh, 'carregar mais' segue da 2ª página pelo cursor novo", async () => {
    const qc = makeClient();
    const view = await mountList(qc, "todos", 3);
    act(() => sse.onReconnect?.());
    await waitFor(() => expect(view.result.current.data?.items.length).toBe(3));
    listUrls.length = 0;
    await act(async () => {
      await view.result.current.fetchNextPage();
    });
    expect(listUrls).toHaveLength(1);
    expect(new URL(listUrls[0]!).searchParams.get("cursor")).toBe("p2");
  });

  it("'Atualizar': só a lista montada e só a 1ª página (antes todas as listas em cache, todas as páginas)", async () => {
    const qc = makeClient();
    // Outra aba visitada antes: 3 páginas em cache, sem observer.
    const other = await mountList(qc, "entrada", 3);
    other.unmount();
    await mountList(qc, "todos", 3);
    listUrls.length = 0;

    const refresh = renderHook(
      () =>
        useInboxQueueRefresh({
          tab: ["todos"],
          canFetchInbox: true,
          tabHydrated: true,
          filtersHydrated: true,
        }),
      { wrapper: wrapperFor(qc) },
    );
    await act(async () => {
      await refresh.result.current.refreshInboxQueue();
    });
    await settle();
    expect(listUrls).toHaveLength(1);
    expect(new URL(listUrls[0]!).searchParams.get("tab")).toBe("todos");
  });

  it("card completo fora do cache numa lista com filtro opaco: rajada vira 1 GET da 1ª página (antes 3 por evento)", async () => {
    const qc = makeClient();
    await mountList(qc, "todos", 3, { stageIds: ["st_1"] });
    listUrls.length = 0;

    act(() => {
      for (const id of ["novo-1", "novo-2", "novo-3"]) {
        sse.handlers?.conversation_updated?.({
          conversationId: id,
          id,
          status: "OPEN",
          channel: "whatsapp",
          channelId: "ch_1",
          contactId: `ct-${id}`,
          contact: { id: `ct-${id}`, name: id },
          assignedToId: "u_me",
          lastMessageAt: new Date(T0 + 5_000).toISOString(),
          updatedAt: new Date(T0 + 5_000).toISOString(),
        });
      }
    });
    await waitFor(() => expect(listUrls.length).toBeGreaterThan(0), { timeout: 3_000 });
    await settle(100);
    expect(listUrls).toHaveLength(1);
    expect(new URL(listUrls[0]!).searchParams.get("cursor")).toBeNull();
  });

  it("refreshInboxLists (tags, templates, encaminhar…): 1ª página das listas montadas", async () => {
    const qc = makeClient();
    await mountList(qc, "todos", 4);
    listUrls.length = 0;
    await act(async () => {
      await refreshInboxLists(qc);
    });
    expect(listUrls).toHaveLength(1);
  });
});
