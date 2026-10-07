/** @vitest-environment jsdom */
/**
 * Lista do Inbox atualizada POR EVENTO (sem refetch) — F1 e F3.
 *
 * QA 07/10: com a conversa aberta, mensagem nova e transferência atualizavam o
 * chat, mas o item da lista seguia com a prévia, o contador e o responsável
 * antigos até o F5. Aqui: cada evento vira patch nas páginas em cache (todas as
 * abas), a conversa que deixou de caber na aba sai, a que passou a caber entra
 * no topo — e a lista não faz GET nenhum.
 *
 * Harness: `useInboxRealtime` real, QueryClient real, SSE simulado. Cada lista
 * tem um observer ativo cujo `queryFn` é contado: invalidar/refazer a lista
 * apareceria como chamada.
 */
import {
  InfiniteQueryObserver,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";
import { setInboxViewerScope } from "@/features/inbox-v2/inbox-viewer-scope";

const T0 = "2026-10-07T12:00:00.000Z";
const T1 = "2026-10-07T12:00:30.000Z";
const ME = "u_me";

type Page = { items: ConversationListRow[]; total?: number };
type ListCache = { pages: Page[]; pageParams: unknown[] };

function row(id: string, over: Partial<ConversationListRow> = {}): ConversationListRow {
  return {
    id,
    number: Number(id.replace(/\D/g, "")) || 1,
    status: "OPEN",
    channel: "whatsapp",
    channelId: "ch_1",
    contact: { id: `ct-${id}`, name: `Contato ${id}`, phone: null },
    assignedToId: ME,
    assignedTo: { id: ME, name: "Eu", type: "HUMAN" },
    unreadCount: 0,
    hasHumanReply: true,
    lastMessageDirection: "in",
    lastMessageAt: T0,
    lastInboundAt: T0,
    lastInboundPreview: { content: "oi", messageType: "text", createdAt: T0 },
    lastMessagePreview: {
      content: "oi",
      messageType: "text",
      mediaUrl: null,
      direction: "in",
    },
    departmentId: "d1",
    updatedAt: T0,
    createdAt: T0,
    closedAt: null,
    ...over,
  } as unknown as ConversationListRow;
}

/** Lista (observer ativo) + contagem de GETs do queryFn. */
function mountList(
  qc: QueryClient,
  tab: string,
  items: ConversationListRow[],
  fetchSpy: () => void,
  total = items.length,
) {
  const key = ["inbox-conversations", tab, {}, ""] as const;
  qc.setQueryData(key, { pages: [{ items, total }], pageParams: [1] });
  const observer = new InfiniteQueryObserver<Page>(qc, {
    queryKey: key,
    // "Servidor": devolve o que está em cache (o refetch não restaura o estado velho).
    queryFn: async () => {
      fetchSpy();
      return qc.getQueryData<ListCache>(key)?.pages[0] ?? { items, total };
    },
    initialPageParam: 1,
    getNextPageParam: () => undefined,
    staleTime: Infinity,
  });
  observer.subscribe(() => {});
  return key;
}

function itemsOf(qc: QueryClient, key: readonly unknown[]): ConversationListRow[] {
  return qc.getQueryData<ListCache>(key)?.pages.flatMap((p) => p.items) ?? [];
}

function emit(event: string, data: unknown) {
  act(() => {
    sse.handlers![event]!(data);
  });
}

function mountRealtime(qc: QueryClient, activeId: string | null) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useInboxRealtime({ activeConversationId: activeId, currentUserId: ME }),
    { wrapper },
  );
}

let qc: QueryClient;
const listFetch = vi.fn();
const emptyList = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });
const fetchMock = vi.fn(emptyList);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(Date.parse(T1));
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  listFetch.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(emptyList);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle(ms = 5_000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}


describe("L3 — transferência não apaga prévia, horário nem não lidas do item", () => {
  const ana = { id: "u_ana", name: "Ana", type: "HUMAN" };

  function mountScenario() {
    setInboxViewerScope(qc, { userId: ME, ownOnly: false });
    const todos = mountList(
      qc,
      "todos",
      [
        row("c1", {
          assignedToId: "u_ana",
          assignedTo: ana,
          unreadCount: 2,
          lastMessage: { preview: "oi", direction: "in" },
        }),
        row("c2"),
      ],
      listFetch,
    );
    mountRealtime(qc, "c2");
    return todos;
  }

  function expectIntact(todos: readonly unknown[]) {
    const c1 = itemsOf(qc, todos).find((r) => r.id === "c1")!;
    expect(c1.assignedToId).toBe("u_bia");
    expect(c1.assignedTo?.name).toBe("Bia");
    expect(c1.lastMessagePreview?.content).toBe("oi");
    expect(c1.lastMessage?.preview).toBe("oi");
    expect(c1.lastInboundPreview?.content).toBe("oi");
    expect(c1.lastMessageAt).toBe(T0);
    expect(c1.unreadCount).toBe(2);
  }

  it("evento só com os campos da transferência (sem prévia/horário/não lidas): mantém tudo", async () => {
    const todos = mountScenario();
    emit("conversation_updated", {
      conversationId: "c1",
      assignedToId: "u_bia",
      assignedTo: { id: "u_bia", name: "Bia", type: "HUMAN" },
      departmentId: "d2",
    });
    await settle();
    expectIntact(todos);
  });

  it("evento com prévia vazia (sem conteúdo, tipo nem mídia): ignora a prévia", async () => {
    const todos = mountScenario();
    emit("conversation_updated", {
      conversationId: "c1",
      assignedToId: "u_bia",
      assignedTo: { id: "u_bia", name: "Bia", type: "HUMAN" },
      lastMessageAt: null,
      lastMessagePreview: { content: null, messageType: null, mediaUrl: null, direction: null },
    });
    await settle();
    expectIntact(todos);
  });

  it("snapshot `card` do barramento sem prévia/horário/não lidas (null): mantém o que o item já tinha", async () => {
    const todos = mountScenario();
    emit("conversation_updated", {
      conversationId: "c1",
      assignedToId: "u_bia",
      assignedTo: { id: "u_bia", name: "Bia", type: "HUMAN" },
      card: {
        ...row("c1", {
          assignedToId: "u_bia",
          assignedTo: { id: "u_bia", name: "Bia", type: "HUMAN" },
        }),
        lastMessagePreview: null,
        lastInboundPreview: null,
        lastMessage: null,
        lastMessageAt: null,
        unreadCount: undefined,
      },
    });
    await settle();
    expectIntact(todos);
  });

  it("conversation_assigned (só assignedToId) mantém tudo", async () => {
    const todos = mountScenario();
    emit("conversation_assigned", { conversationId: "c1", assignedToId: "u_bia" });
    await settle();
    const c1 = itemsOf(qc, todos).find((r) => r.id === "c1")!;
    expect(c1.assignedToId).toBe("u_bia");
    expect(c1.lastMessagePreview?.content).toBe("oi");
    expect(c1.lastMessageAt).toBe(T0);
    expect(c1.unreadCount).toBe(2);
  });

  it("mensagem nova depois da transferência atualiza prévia e hora", async () => {
    const todos = mountScenario();
    emit("conversation_updated", {
      conversationId: "c1",
      assignedToId: "u_bia",
      assignedTo: { id: "u_bia", name: "Bia", type: "HUMAN" },
    });
    emit("conversation_updated", {
      conversationId: "c1",
      lastMessageAt: T1,
      unreadCount: 3,
      lastMessagePreview: { content: "olá de novo", messageType: "text", mediaUrl: null, direction: "in" },
    });
    await settle();
    const c1 = itemsOf(qc, todos).find((r) => r.id === "c1")!;
    expect(c1.assignedTo?.name).toBe("Bia");
    expect(c1.lastMessagePreview?.content).toBe("olá de novo");
    expect(c1.lastMessageAt).toBe(T1);
    expect(c1.unreadCount).toBe(3);
  });

  it("prévia de mídia (conteúdo vazio, com tipo) continua valendo", async () => {
    const todos = mountScenario();
    emit("conversation_updated", {
      conversationId: "c1",
      lastMessageAt: T1,
      lastMessagePreview: { content: "", messageType: "image", mediaUrl: "https://x/y.png", direction: "in" },
    });
    await settle();
    const c1 = itemsOf(qc, todos).find((r) => r.id === "c1")!;
    expect(c1.lastMessagePreview?.messageType).toBe("image");
    expect(c1.lastMessageAt).toBe(T1);
  });
});
