/** @vitest-environment jsdom */
/**
 * N-FE-2 — a lista do Inbox (e contadores/board) consome o `AbortSignal`
 * do TanStack Query: um refetch cancelado (abrir conversa, trocar de aba)
 * aborta o `fetch` em voo e NÃO continua a cadeia de páginas.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiUrl: (path: string) => `http://api.test${path}` }));

import { getBoard } from "@/features/pipeline-v2/api";
import {
  useConversations,
  useTabCounts,
} from "@/features/inbox-v2/hooks/use-conversations";

type Call = { url: string; signal: AbortSignal | undefined; resolve: () => void };

const calls: Call[] = [];
/** Quando true, o fetch fica pendurado até `resolve()` ou abort. */
let hold = false;

function pageFor(url: string) {
  const u = new URL(url);
  const cursor = u.searchParams.get("cursor");
  const n = cursor ? Number(cursor.slice(1)) : 1;
  const items = Array.from({ length: 3 }, (_, i) => ({
    id: `c${n}-${i}`,
    status: "OPEN",
    channel: "whatsapp",
    channelId: "ch_1",
    contactId: `ct-${n}-${i}`,
    contact: { id: `ct-${n}-${i}`, name: `${n}-${i}` },
    lastMessageAt: new Date(Date.UTC(2026, 8, 30, 12, 0, 60 - n * 10 - i)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 30, 12, 0, 60 - n * 10 - i)).toISOString(),
  }));
  return { items, perPage: 50, page: 1, hasMore: n < 3, nextCursor: n < 3 ? `p${n + 1}` : null };
}

function body(url: string): unknown {
  if (url.includes("counts=1")) return { todos: 1 };
  if (url.includes("/board")) return [];
  return pageFor(url);
}

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const signal = init?.signal ?? undefined;
  return new Promise<Response>((resolve, reject) => {
    const respond = () => resolve(new Response(JSON.stringify(body(url)), { status: 200 }));
    const call: Call = { url, signal, resolve: respond };
    calls.push(call);
    if (signal) {
      if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }
    if (!hold) respond();
  });
});

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  calls.length = 0;
  hold = false;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("lista do Inbox: AbortSignal (N-FE-2)", () => {
  it("refetch cancelado aborta o fetch em voo e não segue para as páginas seguintes", async () => {
    const qc = makeClient();
    const { result } = renderHook(
      () => useConversations({ tab: "todos", filters: {}, search: "" }),
      { wrapper: wrapperFor(qc) },
    );
    await waitFor(() => expect(result.current.data?.items.length).toBe(3));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.items.length).toBe(9));

    // Refetch das 3 páginas; a 1ª fica em voo e o refetch é cancelado.
    hold = true;
    calls.length = 0;
    void qc.refetchQueries({ queryKey: ["inbox-conversations"] }).catch(() => {});
    await waitFor(() => expect(calls.length).toBe(1));
    const inFlight = calls[0]!;
    expect(inFlight.signal).toBeInstanceOf(AbortSignal);

    await act(async () => {
      await qc.cancelQueries({ queryKey: ["inbox-conversations"] });
    });
    expect(inFlight.signal?.aborted).toBe(true);

    // Mesmo que a resposta chegue, a cadeia não continua.
    hold = false;
    inFlight.resolve();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toHaveLength(1);
    // A lista anterior fica no lugar.
    expect(result.current.data?.items.length).toBe(9);
  });

  it("filas em paralelo: cada GET da página recebe o signal", async () => {
    const qc = makeClient();
    renderHook(
      () => useConversations({ tab: ["entrada", "esperando"], filters: {}, search: "" }),
      { wrapper: wrapperFor(qc) },
    );
    await waitFor(() => expect(calls.length).toBe(2));
    for (const call of calls) expect(call.signal).toBeInstanceOf(AbortSignal);
  });

  it("contadores das abas recebem o signal", async () => {
    const qc = makeClient();
    renderHook(() => useTabCounts(true, {}, null), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]!.url).toContain("counts=1");
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("getBoard repassa o signal ao fetch", async () => {
    const qc = makeClient();
    renderHook(
      () =>
        useQuery({
          queryKey: ["board-signal"],
          queryFn: ({ signal }) => getBoard("cm_1", "OPEN", undefined, 10, signal),
        }),
      { wrapper: wrapperFor(qc) },
    );
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
  });
});
