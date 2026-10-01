/** @vitest-environment jsdom */
/**
 * P-14 — lista do inbox paginada por cursor (keyset).
 *
 *  - "carregar mais" busca SÓ a página seguinte, com o `nextCursor` da
 *    última, e anexa (as páginas anteriores não são refeitas);
 *  - card repetido entre páginas não duplica;
 *  - backend sem `nextCursor` → continua por `page` (comportamento antigo);
 *  - filas em paralelo: cada fila segue o próprio cursor e fila esgotada
 *    deixa de ser consultada;
 *  - eventos SSE com a lista paginada: o card é atualizado na página em que
 *    está, os cursores ficam intactos e a paginação continua de onde parou
 *    — inclusive quando um evento tira um card da última página.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => {
  const state = {
    handlers: null as Record<string, (data: unknown) => void> | null,
  };
  return {
    state,
    subscribeSSEEvents: vi.fn(
      (_url: string, handlers: Record<string, (data: unknown) => void>) => {
        state.handlers = handlers;
        return () => {
          state.handlers = null;
        };
      },
    ),
  };
});
vi.mock("@/hooks/use-sse", () => ({
  subscribeSSEEvents: sse.subscribeSSEEvents,
  useSSEConnected: () => true,
}));
vi.mock("@/features/inbox-v2/context/message-toast-context", () => ({
  useMessageToast: () => ({ registerActiveConversation: () => () => {} }),
}));

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
}));
vi.mock("@/features/inbox-v2/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/inbox-v2/api")>()),
  listConversations: api.listConversations,
  fetchTabCounts: vi.fn(async () => ({})),
}));

import type {
  ConversationListResponse,
  ConversationListRow,
} from "@/features/inbox-v2/api";
import {
  nextInboxPageParam,
  useConversations,
} from "@/features/inbox-v2/hooks/use-conversations";
import {
  purgePhantomInboxConversation,
  useInboxRealtime,
} from "@/features/inbox-v2/hooks/use-realtime";

const T0 = Date.parse("2026-09-30T12:00:00.000Z");
const iso = (sec: number) => new Date(T0 + sec * 1000).toISOString();

function row(id: string, sec: number, extra: Partial<ConversationListRow> = {}) {
  return {
    id,
    number: null,
    status: "OPEN",
    channel: "whatsapp",
    channelId: "ch_1",
    contactId: `contact-${id}`,
    contact: { id: `contact-${id}`, name: id },
    assignedToId: "u_me",
    unreadCount: 0,
    hasHumanReply: true,
    hasAgentReply: false,
    lastMessageDirection: "out",
    lastMessageAt: iso(sec),
    updatedAt: iso(sec),
    createdAt: iso(0),
    closedAt: null,
    ...extra,
  } as unknown as ConversationListRow;
}

function page(
  items: ConversationListRow[],
  extra: Partial<ConversationListResponse> = {},
): ConversationListResponse {
  return { items, total: 100, page: 1, perPage: 50, hasMore: true, ...extra };
}

function setup(tab: Parameters<typeof useConversations>[0]["tab"] = "todos") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      useInboxRealtime({ activeConversationId: null, currentUserId: "u_me" });
      return useConversations({ tab, filters: {}, search: "" });
    },
    { wrapper },
  );
  const queryKey = ["inbox-conversations", typeof tab === "string" ? tab : tab.join(","), {}, ""];
  type Cache = { pages: (ConversationListResponse & Record<string, unknown>)[]; pageParams: unknown[] };
  const cached = () => qc.getQueryData<Cache>(queryKey)!;
  return { qc, view, cached };
}

const ids = (items: ConversationListRow[] | undefined) => (items ?? []).map((r) => r.id);

beforeEach(() => {
  sse.state.handlers = null;
  api.listConversations.mockReset();
});
afterEach(() => cleanup());

describe("nextInboxPageParam", () => {
  it("cursor do servidor tem prioridade", () => {
    expect(nextInboxPageParam(page([row("a", 1)], { nextCursor: "CUR" }), false)).toBe("CUR");
  });

  it("hasMore=false encerra, mesmo com cursor", () => {
    expect(
      nextInboxPageParam(page([row("a", 1)], { hasMore: false, nextCursor: "CUR" }), false),
    ).toBeUndefined();
  });

  it("última página encolhida por evento SSE (menos itens que perPage) NÃO encerra quando há cursor", () => {
    const shrunk = page([row("a", 1)], { perPage: 50, hasMore: true, nextCursor: "CUR" });
    expect(nextInboxPageParam(shrunk, false)).toBe("CUR");
  });

  it("backend antigo (sem nextCursor): continua por página", () => {
    expect(nextInboxPageParam(page([row("a", 1)], { page: 2 }), false)).toBe(3);
    // sem hasMore: heurística de sempre (página cheia → há mais)
    const full = Array.from({ length: 50 }, (_, i) => row(`r${i}`, i));
    expect(
      nextInboxPageParam({ items: full, total: 200, page: 1, perPage: 50 }, false),
    ).toBe(2);
    expect(
      nextInboxPageParam({ items: full.slice(0, 10), total: 10, page: 1, perPage: 50 }, false),
    ).toBeUndefined();
  });

  it("filas em paralelo: segue enquanto alguma fila tiver próximo", () => {
    const pending = {
      entrada: { next: { cursor: "E2" }, total: 5 },
      esperando: { next: null, total: 2 },
    };
    expect(
      nextInboxPageParam({ ...page([], { page: 1 }), tabsCursor: pending }, true),
    ).toEqual({ tabs: pending, page: 2 });
    const done = {
      entrada: { next: null, total: 5 },
      esperando: { next: null, total: 2 },
    };
    expect(nextInboxPageParam({ ...page([]), tabsCursor: done }, true)).toBeUndefined();
  });
});

describe("useConversations — paginação por cursor", () => {
  it("carregar mais pede só a página seguinte pelo cursor e anexa sem duplicar", async () => {
    api.listConversations
      .mockResolvedValueOnce(page([row("a", 30), row("b", 20)], { nextCursor: "CUR-1" }))
      .mockResolvedValueOnce(
        // `b` repetido (subiu/desceu entre as páginas) + 2 novos
        page([row("b", 20), row("c", 10), row("d", 5)], { hasMore: false, nextCursor: null }),
      );
    const { view, cached } = setup();
    await waitFor(() => expect(ids(view.result.current.data?.items)).toEqual(["a", "b"]));
    expect(view.result.current.hasNextPage).toBe(true);
    const firstPageRef = cached().pages[0];

    await act(async () => {
      await view.result.current.fetchNextPage();
    });

    expect(api.listConversations).toHaveBeenCalledTimes(2);
    const second = api.listConversations.mock.calls[1]![0] as Record<string, unknown>;
    expect(second.cursor).toBe("CUR-1");
    expect(second.page).toBeUndefined();
    // a 1ª página não foi refeita: é o mesmo objeto no cache
    expect(cached().pages[0]).toBe(firstPageRef);
    expect(cached().pageParams).toEqual([1, "CUR-1"]);
    await waitFor(() =>
      expect(ids(view.result.current.data?.items)).toEqual(["a", "b", "c", "d"]),
    );
    expect(view.result.current.hasNextPage).toBe(false);
  });

  it("fallback: backend sem nextCursor continua por page", async () => {
    api.listConversations
      .mockResolvedValueOnce(page([row("a", 30)], { page: 1 }))
      .mockResolvedValueOnce(page([row("b", 20)], { page: 2, hasMore: false }));
    const { view } = setup();
    await waitFor(() => expect(ids(view.result.current.data?.items)).toEqual(["a"]));
    await act(async () => {
      await view.result.current.fetchNextPage();
    });
    const second = api.listConversations.mock.calls[1]![0] as Record<string, unknown>;
    expect(second.page).toBe(2);
    expect(second.cursor).toBeUndefined();
    await waitFor(() => expect(ids(view.result.current.data?.items)).toEqual(["a", "b"]));
    expect(view.result.current.hasNextPage).toBe(false);
  });

  it("filas em paralelo: cursor por fila; fila esgotada não é mais consultada; fila sem cursor cai em page", async () => {
    const byTab: Record<string, ConversationListResponse[]> = {
      entrada: [
        page([row("e1", 90, { hasHumanReply: false, lastMessageDirection: "in" })], {
          nextCursor: "E-2",
          total: 3,
        }),
        page([row("e2", 60, { hasHumanReply: false, lastMessageDirection: "in" })], {
          hasMore: false,
          total: 3,
        }),
      ],
      esperando: [
        page([row("w1", 80, { lastMessageDirection: "in" })], { hasMore: false, total: 1 }),
      ],
      // backend antigo para esta fila: hasMore sem nextCursor
      respondidas: [
        page([row("r1", 70)], { total: 2 }),
        page([row("r2", 50)], { hasMore: false, total: 2, page: 2 }),
      ],
    };
    api.listConversations.mockImplementation(async (p: { tab: string }) => {
      const next = byTab[p.tab]?.shift();
      if (!next) throw new Error(`pedido inesperado para ${p.tab}`);
      return next;
    });

    const { view, cached } = setup(["entrada", "esperando", "respondidas"]);
    await waitFor(() =>
      expect(ids(view.result.current.data?.items).sort()).toEqual(["e1", "r1", "w1"]),
    );
    expect(api.listConversations).toHaveBeenCalledTimes(3);
    expect(view.result.current.data?.total).toBe(6);
    expect(view.result.current.hasNextPage).toBe(true);

    await act(async () => {
      await view.result.current.fetchNextPage();
    });
    const second = api.listConversations.mock.calls.slice(3).map((c) => c[0] as Record<string, unknown>);
    // `esperando` esgotou na 1ª página: 2 pedidos, não 3
    expect(second.map((c) => c.tab).sort()).toEqual(["entrada", "respondidas"]);
    const entrada = second.find((c) => c.tab === "entrada")!;
    expect(entrada.cursor).toBe("E-2");
    expect(entrada.page).toBeUndefined();
    const respondidas = second.find((c) => c.tab === "respondidas")!;
    expect(respondidas.page).toBe(2);
    expect(respondidas.cursor).toBeUndefined();

    await waitFor(() =>
      expect(ids(view.result.current.data?.items).sort()).toEqual(["e1", "e2", "r1", "r2", "w1"]),
    );
    // total não cai quando a fila esgotada deixa de ser pedida
    expect(view.result.current.data?.total).toBe(6);
    expect(view.result.current.hasNextPage).toBe(false);
    expect(view.result.current.data?.hasMore).toBe(false);
    expect(cached().pages).toHaveLength(2);
  });
});

describe("eventos SSE com a lista paginada", () => {
  async function twoPages() {
    api.listConversations
      .mockResolvedValueOnce(page([row("a", 40), row("b", 30)], { nextCursor: "CUR-1" }))
      .mockResolvedValueOnce(page([row("c", 20), row("d", 10)], { nextCursor: "CUR-2" }))
      .mockResolvedValueOnce(page([row("e", 5)], { hasMore: false, nextCursor: null }));
    const ctx = setup();
    await waitFor(() => expect(ids(ctx.view.result.current.data?.items)).toEqual(["a", "b"]));
    await act(async () => {
      await ctx.view.result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(ids(ctx.view.result.current.data?.items)).toEqual(["a", "b", "c", "d"]),
    );
    expect(api.listConversations).toHaveBeenCalledTimes(2);
    return ctx;
  }

  it("new_message num card da 2ª página: atualiza no lugar, sem refazer páginas, cursores intactos", async () => {
    const { view, cached } = await twoPages();
    expect(sse.state.handlers).toHaveProperty("new_message");
    const firstPageRef = cached().pages[0];

    act(() => {
      sse.state.handlers!.new_message({
        conversationId: "d",
        direction: "in",
        content: "oi de novo",
        timestamp: iso(500),
        messageType: "text",
      });
    });

    await waitFor(() => {
      const d = view.result.current.data?.items.find((r) => r.id === "d");
      expect(d?.unreadCount).toBe(1);
    });
    const d = view.result.current.data!.items.find((r) => r.id === "d")!;
    expect(d.lastInboundPreview?.content).toBe("oi de novo");
    expect(d.lastMessageAt).toBe(iso(500));
    // nada foi buscado de novo; a 1ª página nem foi tocada
    expect(api.listConversations).toHaveBeenCalledTimes(2);
    expect(cached().pages[0]).toBe(firstPageRef);
    // sem duplicata e sem perder ninguém
    expect(ids(view.result.current.data?.items).sort()).toEqual(["a", "b", "c", "d"]);
    // cursores preservados: a paginação continua de onde parou
    expect(cached().pageParams).toEqual([1, "CUR-1"]);
    expect(cached().pages[1]!.nextCursor).toBe("CUR-2");

    await act(async () => {
      await view.result.current.fetchNextPage();
    });
    expect((api.listConversations.mock.calls[2]![0] as { cursor?: string }).cursor).toBe("CUR-2");
    await waitFor(() =>
      expect(ids(view.result.current.data?.items).sort()).toEqual(["a", "b", "c", "d", "e"]),
    );
  });

  it("evento que tira um card da última página não encerra a paginação", async () => {
    const { qc, view, cached } = await twoPages();
    act(() => {
      purgePhantomInboxConversation(qc, "d");
    });
    await waitFor(() => expect(ids(view.result.current.data?.items)).toEqual(["a", "b", "c"]));
    // a última página ficou com 1 item (< perPage) mas o servidor disse que há mais
    expect(cached().pages[1]!.items).toHaveLength(1);
    expect(view.result.current.hasNextPage).toBe(true);

    await act(async () => {
      await view.result.current.fetchNextPage();
    });
    expect((api.listConversations.mock.calls[2]![0] as { cursor?: string }).cursor).toBe("CUR-2");
    await waitFor(() =>
      expect(ids(view.result.current.data?.items)).toEqual(["a", "b", "c", "e"]),
    );
  });

  it("conversation_updated num card paginado: patch no lugar, sem GET da lista", async () => {
    const { view, cached } = await twoPages();
    expect(sse.state.handlers).toHaveProperty("conversation_updated");
    const firstPageRef = cached().pages[0];

    act(() => {
      sse.state.handlers!.conversation_updated({
        organizationId: "org_1",
        conversationId: "c",
        assignedToId: "u_me",
        whatsappCallConsentStatus: "GRANTED",
      });
    });
    await waitFor(() =>
      expect(
        view.result.current.data?.items.find((r) => r.id === "c")?.whatsappCallConsentStatus,
      ).toBe("GRANTED"),
    );
    expect(api.listConversations).toHaveBeenCalledTimes(2);
    expect(cached().pages[0]).toBe(firstPageRef);
    expect(ids(view.result.current.data?.items)).toEqual(["a", "b", "c", "d"]);
    expect(cached().pageParams).toEqual([1, "CUR-1"]);
    expect(cached().pages[1]!.nextCursor).toBe("CUR-2");
    expect(view.result.current.hasNextPage).toBe(true);
  });

  it("recarga da lista (reconexão do SSE) refaz as páginas em sequência com os cursores NOVOS", async () => {
    const { qc, view, cached } = await twoPages();
    api.listConversations.mockReset();
    api.listConversations
      // a ordem mudou no servidor: `d` subiu para o topo
      .mockResolvedValueOnce(page([row("d", 900), row("a", 40)], { nextCursor: "NEW-1" }))
      .mockResolvedValueOnce(page([row("b", 30), row("c", 20)], { nextCursor: "NEW-2" }));

    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["inbox-conversations"], refetchType: "active" });
    });

    await waitFor(() =>
      expect(ids(view.result.current.data?.items)).toEqual(["d", "a", "b", "c"]),
    );
    const calls = api.listConversations.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.cursor).toBeUndefined();
    // a 2ª página é pedida com o cursor da 1ª página NOVA, não o antigo
    expect(calls[1]!.cursor).toBe("NEW-1");
    expect(cached().pageParams).toEqual([1, "NEW-1"]);
    expect(cached().pages[1]!.nextCursor).toBe("NEW-2");
  });
});
