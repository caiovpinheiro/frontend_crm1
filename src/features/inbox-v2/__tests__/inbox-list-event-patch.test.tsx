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

describe("F1 — new_message na conversa aberta atualiza o item da lista", () => {
  it("prévia, não lidas e horário mudam em todas as abas em cache; lista não refaz GET", async () => {
    const todos = mountList(qc, "todos", [row("c1"), row("c2")], listFetch);
    const esperando = mountList(qc, "esperando", [row("c1")], listFetch);
    mountRealtime(qc, "c1");

    emit("new_message", {
      conversationId: "c1",
      contactId: "ct-c1",
      direction: "in",
      content: "ols",
      messageType: "text",
      timestamp: T1,
    });
    await settle();

    for (const key of [todos, esperando]) {
      const c1 = itemsOf(qc, key).find((r) => r.id === "c1")!;
      expect(c1.lastInboundPreview?.content).toBe("ols");
      expect(c1.lastMessagePreview?.content).toBe("ols");
      expect(c1.unreadCount).toBe(1);
      expect(c1.lastMessageAt).toBe(T1);
    }
    expect(itemsOf(qc, todos).find((r) => r.id === "c2")!.unreadCount).toBe(0);
    expect(listFetch).not.toHaveBeenCalled();
  });
});

describe("F1 — conversation_updated (transferência) atualiza o item da lista", () => {
  it("responsável (com nome), departamento, não lidas e horário; 0 refetch da lista", async () => {
    // Quem enxerga as conversas de todos: o card continua visível, nada a perguntar ao servidor.
    setInboxViewerScope(qc, { userId: ME, ownOnly: false });
    const todos = mountList(
      qc,
      "todos",
      [row("c1", { unreadCount: 1, departmentId: "d1" }), row("c2")],
      listFetch,
    );
    mountRealtime(qc, "c1");

    emit("conversation_updated", {
      conversationId: "c1",
      assignedToId: "u_bia",
      assignedTo: { id: "u_bia", name: "Bia", type: "HUMAN" },
      departmentId: "d2",
      unreadCount: 0,
      lastMessageAt: T1,
    });
    await settle();

    const c1 = itemsOf(qc, todos).find((r) => r.id === "c1")!;
    expect(c1.assignedToId).toBe("u_bia");
    expect(c1.assignedTo?.name).toBe("Bia");
    expect(c1.departmentId).toBe("d2");
    expect(c1.unreadCount).toBe(0);
    expect(c1.lastMessageAt).toBe(T1);
    expect(listFetch).not.toHaveBeenCalled();
  });

  it("não lidas do evento valem para as outras conversas; na aberta (já lida na tela) não ressuscitam o contador", async () => {
    const todos = mountList(qc, "todos", [row("c1"), row("c2")], listFetch);
    mountRealtime(qc, "c1");

    emit("conversation_updated", { conversationId: "c1", unreadCount: 3, lastMessageAt: T1 });
    emit("conversation_updated", { conversationId: "c2", unreadCount: 3, lastMessageAt: T1 });
    await settle();

    expect(itemsOf(qc, todos).find((r) => r.id === "c1")!.unreadCount).toBe(0);
    expect(itemsOf(qc, todos).find((r) => r.id === "c2")!.unreadCount).toBe(3);
  });

  it("prévia que vem no evento entra no item", async () => {
    const todos = mountList(qc, "todos", [row("c1")], listFetch);
    mountRealtime(qc, "c1");

    emit("conversation_updated", {
      conversationId: "c1",
      lastMessageAt: T1,
      lastMessagePreview: {
        content: "ols",
        messageType: "text",
        mediaUrl: null,
        direction: "in",
      },
    });
    await settle();

    const c1 = itemsOf(qc, todos)[0]!;
    expect(c1.lastMessagePreview?.content).toBe("ols");
    expect(c1.lastMessageAt).toBe(T1);
    expect(listFetch).not.toHaveBeenCalled();
  });

  it("usuário que só vê as próprias: conversa transferida a outro sai de todas as abas, sem refetch", async () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: true });
    const todos = mountList(qc, "todos", [row("c1"), row("c2")], listFetch, 2);
    const esperando = mountList(qc, "esperando", [row("c1")], listFetch, 1);
    mountRealtime(qc, null);

    emit("conversation_updated", {
      conversationId: "c1",
      assignedToId: "u_bia",
      assignedTo: { id: "u_bia", name: "Bia", type: "HUMAN" },
    });
    await settle();

    expect(itemsOf(qc, todos).map((r) => r.id)).toEqual(["c2"]);
    expect(itemsOf(qc, esperando)).toEqual([]);
    expect(qc.getQueryData<ListCache>(todos)?.pages[0]?.total).toBe(1);
    expect(listFetch).not.toHaveBeenCalled();
  });

  it("escopo desconhecido (backend/permissões ainda sem resposta): mantém o refetch controlado", async () => {
    const todos = mountList(qc, "todos", [row("c1"), row("c2")], listFetch);
    mountRealtime(qc, null);

    emit("conversation_updated", {
      conversationId: "c1",
      assignedToId: "u_bia",
    });
    await settle();

    // Sem saber se o usuário ainda enxerga a conversa, 1 refetch da lista que a contém.
    expect(listFetch).toHaveBeenCalledTimes(1);
    expect(itemsOf(qc, todos).find((r) => r.id === "c1")!.assignedToId).toBe("u_bia");
  });

  it("evento 'hidden' (servidor diz que o usuário não lista mais): sai da lista sem refetch", async () => {
    const todos = mountList(qc, "todos", [row("c1"), row("c2")], listFetch, 2);
    mountRealtime(qc, null);

    emit("conversation_updated", {
      conversationId: "c1",
      assignedToId: "u_bia",
      cardOmitted: "hidden",
    });
    await settle();

    expect(itemsOf(qc, todos).map((r) => r.id)).toEqual(["c2"]);
    expect(listFetch).not.toHaveBeenCalled();
  });

  it("a aberta continua no cache da conversa mesmo quando some da lista", async () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: true });
    mountList(qc, "todos", [row("c1")], listFetch);
    mountRealtime(qc, "c1");

    emit("conversation_updated", {
      conversationId: "c1",
      assignedToId: "u_bia",
      assignedTo: { id: "u_bia", name: "Bia", type: "HUMAN" },
    });
    await settle();

    // O chat aberto lê o responsável novo daqui (diálogo "Transferir conversa").
    const single = qc.getQueryData<ConversationListRow>(["inbox-conversation", "c1"]);
    expect(single?.assignedTo?.id).toBe("u_bia");
    expect(single?.assignedTo?.name).toBe("Bia");
  });

  it("deixou de caber na aba pelas regras da fila: sai; encerrada some da Entrada", async () => {
    const entrada = mountList(
      qc,
      "entrada",
      [row("c1", { assignedToId: null, assignedTo: null, hasHumanReply: false }), row("c2")],
      listFetch,
      2,
    );
    mountRealtime(qc, null);

    emit("conversation_updated", {
      conversationId: "c1",
      status: "RESOLVED",
      closedAt: T1,
    });
    await settle();

    expect(itemsOf(qc, entrada).map((r) => r.id)).toEqual(["c2"]);
    expect(listFetch).not.toHaveBeenCalled();
  });
});

describe("F1/F3 — conversa que passou a caber na aba entra no topo", () => {
  const card = (id: string) =>
    row(id, {
      assignedToId: ME,
      assignedTo: { id: ME, name: "Eu", type: "HUMAN" },
      unreadCount: 0,
      lastMessageAt: T1,
    });

  it("card no evento: insere no topo de Todos e de Aguardando, sem GET", async () => {
    const todos = mountList(qc, "todos", [row("c2")], listFetch);
    const esperando = mountList(qc, "esperando", [row("c3")], listFetch);
    mountRealtime(qc, null);

    emit("conversation_updated", {
      conversationId: "c9",
      assignedToId: ME,
      assignedTo: { id: ME, name: "Eu", type: "HUMAN" },
      previousAssignedToId: "u_bia",
      card: card("c9"),
    });
    await settle();

    expect(itemsOf(qc, todos).map((r) => r.id)).toEqual(["c9", "c2"]);
    expect(itemsOf(qc, esperando).map((r) => r.id)).toEqual(["c9", "c3"]);
    expect(listFetch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F3: conversation_updated sem card, atribuída a mim e fora do cache: 1 GET ?ids= e entra no topo", async () => {
    const todos = mountList(qc, "todos", [row("c2")], listFetch);
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ items: [card("c9")] }), { status: 200 }),
    );
    mountRealtime(qc, null);

    emit("conversation_updated", {
      conversationId: "c9",
      assignedToId: ME,
      assignedTo: { id: ME, name: "Eu", type: "HUMAN" },
    });
    emit("conversation_updated", { conversationId: "c9", assignedToId: ME });
    await settle();

    expect(itemsOf(qc, todos).map((r) => r.id)).toEqual(["c9", "c2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listFetch).not.toHaveBeenCalled();
  });

  it("F3: conversa atribuída a OUTRO agente que o usuário não vê não é buscada (sem 404 em massa)", async () => {
    setInboxViewerScope(qc, { userId: ME, ownOnly: true });
    const todos = mountList(qc, "todos", [row("c2")], listFetch);
    mountRealtime(qc, null);

    emit("conversation_updated", {
      conversationId: "c9",
      assignedToId: "u_bia",
      assignedTo: { id: "u_bia", name: "Bia", type: "HUMAN" },
    });
    await settle();

    expect(itemsOf(qc, todos).map((r) => r.id)).toEqual(["c2"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listFetch).not.toHaveBeenCalled();
  });

  it("F3: conversation_assigned (IA) para o usuário atual insere por GET ?ids= único, não relista", async () => {
    const todos = mountList(qc, "todos", [row("c2")], listFetch);
    const entregue = card("c9");
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ items: [entregue] }), { status: 200 }),
    );
    mountRealtime(qc, null);

    emit("conversation_assigned", {
      conversationId: "c9",
      assignedToId: ME,
      reason: "ai_handoff",
    });
    await settle();

    expect(itemsOf(qc, todos).map((r) => r.id)).toEqual(["c9", "c2"]);
    expect(listFetch).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
