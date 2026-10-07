/** @vitest-environment jsdom */
/**
 * Quantos `GET /api/conversations/:id/messages` o chat aberto faz por
 * cenário (indício de produção 05/10: a mesma conversa pedida 10–32 vezes
 * em 30 min pelo mesmo cliente).
 *
 * Harness: `useMessages` + `useSendMessage` + `useInboxRealtime` reais,
 * QueryClient real, SSE e `fetch` simulados. Conta só a 1ª página
 * (`?limit=`), que é o pedido repetido do access log.
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
vi.mock("@/hooks/use-document-visible", () => ({
  useDocumentVisible: () => true,
}));
vi.mock("@/features/inbox-v2/context/message-toast-context", () => ({
  useMessageToast: () => ({ registerActiveConversation: () => () => {} }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u_me" } }, status: "authenticated" }),
}));

import {
  messagesKey,
  useMessages,
  useSendMessage,
} from "@/features/inbox-v2/hooks/use-messages";
import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";
import {
  useAssignConversation,
  useTransferConversation,
} from "@/features/inbox-v2/hooks/use-conversation-actions";
import type { MessagesResponse } from "@/features/inbox-v2/api";

const T0 = Date.parse("2026-10-05T12:00:00.000Z");

type Row = { id: string; direction: "in" | "out"; content: string; createdAt: string };

/** "Servidor": mensagens por conversa; o GET devolve o que está gravado. */
const server = new Map<string, Row[]>();
let seq = 0;

function persist(conversationId: string, row: Omit<Row, "id"> & { id?: string }) {
  const list = server.get(conversationId) ?? [];
  const saved = { ...row, id: row.id ?? `wamid.${++seq}` };
  list.push(saved);
  server.set(conversationId, list);
  return saved;
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const m = url.match(/\/api\/conversations\/([^/?]+)\/messages/);
  if (m && (init?.method ?? "GET") === "GET") {
    return new Response(
      JSON.stringify({ messages: server.get(m[1]) ?? [], hasMore: false }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  const action = url.match(/\/api\/conversations\/([^/?]+)\/actions/);
  if (action && init?.method === "POST") {
    return new Response(
      JSON.stringify({
        conversation: { id: action[1], assignedToId: "u_bia", assignedTo: { id: "u_bia", name: "Bia" } },
        distribution: null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  if (m && init?.method === "POST") {
    const body = JSON.parse(String(init.body ?? "{}")) as { content: string };
    const saved = persist(m[1], {
      direction: "out",
      content: body.content,
      createdAt: new Date().toISOString(),
    });
    return new Response(
      JSON.stringify({ message: { ...saved, conversationId: m[1], status: "SENT" } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});

function tailGets(conversationId: string): number {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = String(input);
    return (
      url.includes(`/api/conversations/${conversationId}/messages`) &&
      url.includes("limit=") &&
      !url.includes("before=") &&
      (init?.method ?? "GET") === "GET"
    );
  }).length;
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function mount(initialId: string) {
  const qc = new QueryClient({
    defaultOptions: {
      // Mesmos defaults do `providers.tsx` que importam aqui.
      queries: { retry: false, staleTime: 2 * 60_000, refetchOnWindowFocus: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ id }: { id: string }) => {
      const messages = useMessages(id);
      const send = useSendMessage(id);
      useInboxRealtime({ activeConversationId: id, currentUserId: "u_me" });
      return { messages, send };
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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(T0);
  server.clear();
  seq = 0;
  persist("c1", { direction: "in", content: "oi", createdAt: new Date(T0 - 60_000).toISOString() });
  persist("c2", { direction: "in", content: "olá", createdAt: new Date(T0 - 60_000).toISOString() });
  sse.state.connected = true;
  sse.state.handlers = null;
  sse.state.onReconnect = null;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GET /messages da conversa aberta — SSE conectada", () => {
  it("abrir: 1 GET; 10 min parado com a aba visível: nenhum outro (sem poll)", async () => {
    mount("c1");
    await flush();
    expect(tailGets("c1")).toBe(1);

    await flush(10 * 60_000);
    expect(tailGets("c1")).toBe(1);
  });

  it("foco e visibilidade da janela não refazem o GET", async () => {
    mount("c1");
    await flush();
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush(5_000);
    expect(tailGets("c1")).toBe(1);
  });

  it("eventos de OUTRAS conversas não buscam a aberta", async () => {
    mount("c1");
    await flush();
    for (let i = 0; i < 5; i += 1) {
      emit("new_message", {
        conversationId: "c2",
        direction: "in",
        content: `msg ${i}`,
        timestamp: new Date().toISOString(),
      });
      emit("message_status", { conversationId: "c2", messageId: "wamid.2", status: "read" });
      emit("conversation_updated", { conversationId: "c2", status: "OPEN" });
    }
    await flush(5_000);
    expect(tailGets("c1")).toBe(1);
    expect(tailGets("c2")).toBe(0);
  });

  it("message_status da aberta vira patch do tick (inclusive failed com erro)", async () => {
    const { qc } = mount("c1");
    await flush();
    const sent = persist("c1", {
      direction: "out",
      content: "enviada",
      createdAt: new Date().toISOString(),
    });
    // Recarrega a página do servidor com a mensagem enviada (fora do cenário).
    await act(async () => {
      await qc.refetchQueries({ queryKey: messagesKey("c1") });
    });
    const before = tailGets("c1");

    emit("message_status", { conversationId: "c1", messageId: sent.id, status: "delivered" });
    emit("message_status", { conversationId: "c1", messageId: sent.id, status: "read" });
    emit("message_status", {
      conversationId: "c1",
      messageId: sent.id,
      status: "failed",
      error: "Número sem WhatsApp",
    });
    await flush(5_000);

    expect(tailGets("c1")).toBe(before);
    const bubble = qc
      .getQueryData<MessagesResponse>(messagesKey("c1"))
      ?.messages.find((m) => m.id === sent.id);
    expect(bubble?.status).toBe("FAILED");
    expect(bubble?.sendError).toBe("Número sem WhatsApp");
  });

  it("voltar a uma conversa já aberta há pouco não refaz o GET (troca de conversa / remontagem)", async () => {
    const { view } = mount("c1");
    await flush();
    view.rerender({ id: "c2" });
    await flush();
    expect(tailGets("c2")).toBe(1);

    // Tick de uma mensagem da c2 enquanto o agente está na c1.
    view.rerender({ id: "c1" });
    await flush(30_000);
    emit("message_status", { conversationId: "c2", messageId: "wamid.2", status: "read" });
    await flush(30_000);

    view.rerender({ id: "c2" });
    await flush();
    view.rerender({ id: "c1" });
    await flush();
    expect(tailGets("c1")).toBe(1);
    expect(tailGets("c2")).toBe(1);
  });

  it("rajada de 3 mensagens do cliente: bolhas na hora e 1 GET para hidratar", async () => {
    const { qc } = mount("c1");
    await flush();
    for (let i = 0; i < 3; i += 1) {
      const row = persist("c1", {
        direction: "in",
        content: `pergunta ${i}`,
        createdAt: new Date().toISOString(),
      });
      emit("new_message", {
        conversationId: "c1",
        direction: "in",
        content: row.content,
        timestamp: row.createdAt,
      });
    }
    // Bolha imediata (stub do evento), antes de qualquer GET.
    const now = qc.getQueryData<MessagesResponse>(messagesKey("c1"))?.messages ?? [];
    expect(now.filter((m) => m.content.startsWith("pergunta"))).toHaveLength(3);

    await flush(5_000);
    expect(tailGets("c1")).toBe(2);
    const after = qc.getQueryData<MessagesResponse>(messagesKey("c1"))?.messages ?? [];
    // Hidratadas: ids reais, sem stub `sse:` sobrando.
    expect(after.filter((m) => m.id.startsWith("sse:"))).toHaveLength(0);
    expect(after.filter((m) => m.content.startsWith("pergunta"))).toHaveLength(3);
  });

  it("mensagem nova de outra conversa marca a dela como velha: ao abrir, 1 GET", async () => {
    const { view } = mount("c1");
    await flush();
    view.rerender({ id: "c2" });
    await flush();
    view.rerender({ id: "c1" });
    await flush();
    persist("c2", { direction: "in", content: "nova", createdAt: new Date().toISOString() });
    emit("new_message", {
      conversationId: "c2",
      direction: "in",
      content: "nova",
      timestamp: new Date().toISOString(),
    });
    await flush(1_000);
    expect(tailGets("c2")).toBe(1);
    view.rerender({ id: "c2" });
    await flush();
    expect(tailGets("c2")).toBe(2);
  });

  it("envio de texto pelo agente (POST + eco do SSE): nenhum GET", async () => {
    const { qc, view } = mount("c1");
    await flush();
    const echoAt = new Date().toISOString();
    // Eco do SSE chega ANTES da resposta do POST (o backend publica antes
    // de responder) — o caso que deixava stub + bolha real.
    emit("new_message", {
      conversationId: "c1",
      direction: "out",
      content: "resposta",
      timestamp: echoAt,
    });
    await act(async () => {
      await view.result.current.send.mutateAsync({ content: "resposta" });
    });
    // E o caso inverso: eco atrasado depois da resposta.
    emit("new_message", {
      conversationId: "c1",
      direction: "out",
      content: "resposta",
      timestamp: echoAt,
    });
    await flush(5_000);

    expect(tailGets("c1")).toBe(1);
    const thread = qc.getQueryData<MessagesResponse>(messagesKey("c1"))?.messages ?? [];
    expect(thread.filter((m) => m.content === "resposta")).toHaveLength(1);
    expect(thread.find((m) => m.content === "resposta")?.id.startsWith("wamid.")).toBe(true);
  });

  it("reconexão da SSE (gap sem replay): 1 GET da aberta e as outras ficam velhas", async () => {
    const { view } = mount("c1");
    await flush();
    view.rerender({ id: "c2" });
    await flush();
    view.rerender({ id: "c1" });
    await flush();
    act(() => sse.state.onReconnect?.());
    await flush(1_000);
    expect(tailGets("c1")).toBe(2);
    expect(tailGets("c2")).toBe(1);
    // A c2 pode ter perdido mensagens no gap: reabrir busca.
    view.rerender({ id: "c2" });
    await flush();
    expect(tailGets("c2")).toBe(2);
  });
});

describe("GET /messages após transferir/atribuir (QA 07/10: 2 GET por transferência)", () => {
  /** Linha de evento que o backend espelha no chat (`new_message` do tipo evento). */
  const chatterEvent = () => ({
    conversationId: "c1",
    messageType: "event_transferencia",
    content: "Transferida de Ana para Bia",
    timestamp: new Date().toISOString(),
  });

  it("evento do chat chega ANTES da resposta do POST: 1 GET", async () => {
    const { qc } = mount("c1");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTransferConversation(), { wrapper });
    await flush();
    const before = tailGets("c1");

    emit("new_message", chatterEvent());
    await act(async () => {
      await result.current.mutateAsync({ conversationId: "c1", assignedToId: "u_bia" });
    });
    await flush(5_000);

    expect(tailGets("c1") - before).toBe(1);
  });

  it("resposta do POST chega ANTES do evento do chat: 1 GET", async () => {
    const { qc } = mount("c1");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAssignConversation(), { wrapper });
    await flush();
    const before = tailGets("c1");

    await act(async () => {
      await result.current.mutateAsync({ conversationId: "c1", assignedToId: "u_bia" });
    });
    await flush(300);
    emit("new_message", chatterEvent());
    await flush(5_000);

    expect(tailGets("c1") - before).toBe(1);
  });

  it("uma nota/evento qualquer bem depois (fora da janela) continua buscando", async () => {
    const { qc } = mount("c1");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTransferConversation(), { wrapper });
    await flush();
    const before = tailGets("c1");

    await act(async () => {
      await result.current.mutateAsync({ conversationId: "c1", assignedToId: "u_bia" });
    });
    await flush(10_000);
    emit("new_message", { ...chatterEvent(), content: "Conversa encerrada", messageType: "event_encerramento" });
    await flush(5_000);

    expect(tailGets("c1") - before).toBe(2);
  });
});

describe("GET /messages — SSE fora (rede de segurança)", () => {
  it("com a SSE desconectada mantém o poll de 90 s da conversa aberta", async () => {
    sse.state.connected = false;
    mount("c1");
    await flush();
    expect(tailGets("c1")).toBe(1);
    await flush(3 * 90_000 + 1_000);
    expect(tailGets("c1")).toBe(4);
  });
});
