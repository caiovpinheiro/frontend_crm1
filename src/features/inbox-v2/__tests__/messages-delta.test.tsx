/** @vitest-environment jsdom */
/**
 * Delta das mensagens da conversa (gate de carga 15/10, metas 6 e 7).
 *
 * Com o backend devolvendo `cursor`, a conversa já em cache não refaz a
 * página inteira: reabrir, hidratar o `new_message` do SSE e as mutações
 * pedem `GET …/messages?after=<cursor>` (uma URL estável, com
 * `cache: "no-cache"` — o navegador revalida e recebe 304 enquanto nada
 * muda). `message_status` e `message_deleted` só mexem no cache.
 *
 * Harness igual ao de `messages-get-count.test.tsx`: hooks reais,
 * QueryClient real, SSE e `fetch` simulados. O "servidor" guarda um
 * diário de mudanças por conversa e responde o delta a partir do cursor.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => {
  const state = {
    connected: true,
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
  applyMessagesDelta,
  messagesKey,
  useMessages,
  useUpdateNote,
} from "@/features/inbox-v2/hooks/use-messages";
import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";
import type { InboxMessageDto, MessagesResponse } from "@/features/inbox-v2/api";

const T0 = Date.parse("2026-10-15T12:00:00.000Z");

type Row = {
  id: string;
  direction: "in" | "out";
  content: string;
  createdAt: string;
  messageType?: string;
  status?: InboxMessageDto["status"];
};
type Change = { v: number; kind: "new" | "upd" | "del"; id: string };

/** "Servidor": linhas, versão e diário por conversa. */
const server = new Map<string, { rows: Row[]; v: number; log: Change[] }>();
let seq = 0;

function conv(id: string) {
  let c = server.get(id);
  if (!c) {
    c = { rows: [], v: 100, log: [] };
    server.set(id, c);
  }
  return c;
}

function write(conversationId: string, kind: Change["kind"], row: Row) {
  const c = conv(conversationId);
  if (kind === "new") c.rows.push(row);
  if (kind === "del") c.rows = c.rows.filter((r) => r.id !== row.id);
  c.v += 1;
  c.log.push({ v: c.v, kind, id: row.id });
  return row;
}

function addRow(conversationId: string, row: Omit<Row, "id"> & { id?: string }) {
  return write(conversationId, "new", { ...row, id: row.id ?? `wamid.${++seq}` });
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://localhost");
  const m = url.pathname.match(/\/api\/conversations\/([^/]+)\/messages$/);
  if (m && (init?.method ?? "GET") === "GET") {
    const c = conv(m[1]!);
    const after = url.searchParams.get("after");
    if (after) {
      const from = Number(after.split(".").pop());
      const entries = c.log.filter((e) => e.v > from);
      const ids = (kind: Change["kind"]) => [
        ...new Set(entries.filter((e) => e.kind === kind).map((e) => e.id)),
      ];
      const pick = (list: string[]) => c.rows.filter((r) => list.includes(r.id));
      return json({
        delta: true,
        reset: false,
        items: pick(ids("new")),
        changed: pick(ids("upd").filter((id) => !ids("new").includes(id))),
        deleted: ids("del"),
        cursor: `m1.${m[1]}.${c.v}`,
      });
    }
    return json({ messages: c.rows, hasMore: false, cursor: `m1.${m[1]}.${c.v}` });
  }
  const note = url.pathname.match(/\/api\/messages\/([^/]+)$/);
  if (note && init?.method === "PATCH") {
    const body = JSON.parse(String(init.body ?? "{}")) as { content: string };
    for (const [cid, c] of server) {
      const row = c.rows.find((r) => r.id === note[1]);
      if (row) {
        row.content = body.content;
        write(cid, "upd", row);
        return json({ id: row.id, content: row.content, conversationId: cid });
      }
    }
  }
  return json({});
});

function calls(conversationId: string) {
  return fetchMock.mock.calls
    .filter(([input, init]) => {
      const url = String(input);
      return (
        url.includes(`/api/conversations/${conversationId}/messages`) &&
        (init?.method ?? "GET") === "GET"
      );
    })
    .map(([input, init]) => ({ url: String(input), cache: init?.cache }));
}
const fullGets = (id: string) => calls(id).filter((c) => !c.url.includes("after="));
const deltaGets = (id: string) => calls(id).filter((c) => c.url.includes("after="));

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function mount(initialId: string) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 2 * 60_000, refetchOnWindowFocus: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ id }: { id: string }) => {
      const messages = useMessages(id);
      const updateNote = useUpdateNote(id);
      useInboxRealtime({ activeConversationId: id, currentUserId: "u_me" });
      return { messages, updateNote };
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

const thread = (qc: QueryClient, id: string) =>
  qc.getQueryData<MessagesResponse>(messagesKey(id))?.messages ?? [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(T0);
  server.clear();
  seq = 0;
  addRow("c1", { direction: "in", content: "oi", createdAt: new Date(T0 - 60_000).toISOString() });
  addRow("c2", { direction: "in", content: "olá", createdAt: new Date(T0 - 60_000).toISOString() });
  sse.state.connected = true;
  sse.state.handlers = null;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("delta das mensagens — conversa em cache", () => {
  it("abrir a 1ª vez: página inteira com no-cache (o navegador revalida → 304)", async () => {
    mount("c1");
    await flush();
    expect(fullGets("c1")).toHaveLength(1);
    expect(fullGets("c1")[0]!.cache).toBe("no-cache");
    expect(deltaGets("c1")).toHaveLength(0);
  });

  it("reabrir com mudança: 1 GET de delta (não a lista) e a mensagem entra", async () => {
    const { qc, view } = mount("c1");
    await flush();
    view.rerender({ id: "c2" });
    await flush();
    // Chega mensagem na c1 enquanto o agente está na c2: o SSE só marca velha.
    const row = addRow("c1", { direction: "in", content: "nova", createdAt: new Date().toISOString() });
    emit("new_message", {
      conversationId: "c1",
      direction: "in",
      content: "nova",
      timestamp: row.createdAt,
    });
    await flush(2_000);
    expect(calls("c1")).toHaveLength(1);

    view.rerender({ id: "c1" });
    await flush();
    expect(fullGets("c1")).toHaveLength(1);
    expect(deltaGets("c1")).toHaveLength(1);
    expect(deltaGets("c1")[0]!.url).toContain("after=m1.c1.");
    expect(thread(qc, "c1").map((m) => m.content)).toEqual(["oi", "nova"]);
  });

  it("reabrir sem mudança: o delta usa sempre a MESMA URL com no-cache (2ª em diante = 304 do navegador)", async () => {
    const { qc, view } = mount("c1");
    await flush();
    for (let i = 0; i < 3; i += 1) {
      view.rerender({ id: "c2" });
      await flush();
      await act(async () => {
        await qc.invalidateQueries({ queryKey: messagesKey("c1"), refetchType: "none" });
      });
      view.rerender({ id: "c1" });
      await flush();
    }
    const deltas = deltaGets("c1");
    expect(fullGets("c1")).toHaveLength(1);
    expect(deltas).toHaveLength(3);
    expect(new Set(deltas.map((d) => d.url)).size).toBe(1);
    expect(deltas.every((d) => d.cache === "no-cache")).toBe(true);
    expect(thread(qc, "c1").map((m) => m.content)).toEqual(["oi"]);
  });
});

describe("delta das mensagens — SSE da conversa aberta", () => {
  it("new_message: bolha na hora e a hidratação pede delta, não a página", async () => {
    const { qc } = mount("c1");
    await flush();
    const row = addRow("c1", { direction: "in", content: "pergunta", createdAt: new Date().toISOString() });
    emit("new_message", {
      conversationId: "c1",
      direction: "in",
      content: "pergunta",
      timestamp: row.createdAt,
    });
    expect(thread(qc, "c1").some((m) => m.id.startsWith("sse:"))).toBe(true);
    await flush(2_000);
    expect(fullGets("c1")).toHaveLength(1);
    expect(deltaGets("c1")).toHaveLength(1);
    const after = thread(qc, "c1");
    expect(after.filter((m) => m.id.startsWith("sse:"))).toHaveLength(0);
    expect(after.map((m) => m.id)).toContain(row.id);
  });

  it("message_status atualiza o tick sem GET nenhum", async () => {
    const { qc } = mount("c1");
    await flush();
    const before = calls("c1").length;
    const id = thread(qc, "c1")[0]!.id;
    emit("message_status", { conversationId: "c1", messageId: id, status: "read" });
    await flush(5_000);
    expect(calls("c1")).toHaveLength(before);
    expect(thread(qc, "c1")[0]!.status).toBe("READ");
  });

  it("nota editada em outra aba aparece em ≤ 5 s (message_updated → delta)", async () => {
    const { qc } = mount("c1");
    await flush();
    const note = addRow("c1", {
      direction: "out",
      content: "nota antiga",
      messageType: "note",
      createdAt: new Date().toISOString(),
    });
    emit("new_message", { conversationId: "c1", direction: "out", content: "nota antiga", messageType: "note", timestamp: note.createdAt });
    await flush(2_000);

    // Outra aba edita: o servidor grava e publica message_updated (edited).
    note.content = "nota nova";
    write("c1", "upd", note);
    emit("message_updated", { conversationId: "c1", messageId: note.id, status: "edited" });
    await flush(5_000);
    expect(thread(qc, "c1").find((m) => m.id === note.id)?.content).toBe("nota nova");
    expect(fullGets("c1")).toHaveLength(1);
  });

  it("nota excluída em outra aba sai na hora, sem GET (message_deleted)", async () => {
    const { qc } = mount("c1");
    await flush();
    const id = thread(qc, "c1")[0]!.id;
    const before = calls("c1").length;
    emit("message_deleted", { conversationId: "c1", messageId: id });
    expect(thread(qc, "c1").some((m) => m.id === id)).toBe(false);
    await flush(5_000);
    expect(calls("c1")).toHaveLength(before);
  });

  it("editar a própria nota (mutação) busca o delta, não a página", async () => {
    const { qc, view } = mount("c1");
    await flush();
    const id = thread(qc, "c1")[0]!.id;
    await act(async () => {
      await view.result.current.updateNote.mutateAsync({ noteId: id, content: "editada" });
    });
    await flush();
    expect(fullGets("c1")).toHaveLength(1);
    expect(deltaGets("c1")).toHaveLength(1);
    expect(thread(qc, "c1")[0]!.content).toBe("editada");
  });
});

describe("applyMessagesDelta", () => {
  const base: MessagesResponse = {
    messages: [
      { id: "a", conversationId: "c1", content: "1", createdAt: "2026-10-15T10:00:00.000Z", direction: "out", messageType: "text", status: "READ" },
      { id: "b", conversationId: "c1", content: "2", createdAt: "2026-10-15T10:05:00.000Z", direction: "in", messageType: "text" },
    ],
    pinnedNoteId: null,
    channelProvider: null,
    cursor: "m1.base",
  };

  it("status do delta não regride o tick que o SSE já adiantou; FAILED vale", () => {
    const next = applyMessagesDelta(base, {
      items: [],
      changed: [{ ...base.messages[0]!, status: "DELIVERED" }],
      deleted: [],
      cursor: "m1.novo",
    });
    expect(next.messages[0]!.status).toBe("READ");
    const failed = applyMessagesDelta(base, {
      items: [],
      changed: [{ ...base.messages[0]!, status: "FAILED" }],
      deleted: [],
      cursor: "m1.novo",
    });
    expect(failed.messages[0]!.status).toBe("FAILED");
  });

  it("nova fora de ordem entra na posição do horário; reaplicar não duplica; cursor-base fica", () => {
    const late = { id: "c", conversationId: "c1", content: "atrasada", createdAt: "2026-10-15T10:02:00.000Z", direction: "in" as const, messageType: "text" };
    const once = applyMessagesDelta(base, { items: [late], changed: [], deleted: [], cursor: "m1.x" });
    expect(once.messages.map((m) => m.id)).toEqual(["a", "c", "b"]);
    const twice = applyMessagesDelta(once, { items: [late], changed: [], deleted: [], cursor: "m1.x" });
    expect(twice.messages.map((m) => m.id)).toEqual(["a", "c", "b"]);
    expect(twice.cursor).toBe("m1.base");
  });
});
