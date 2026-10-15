/** @vitest-environment jsdom */
/**
 * Gate C (15/10) — board com ETag/304 no cliente.
 *
 * Servidor falso no `fetch`: responde o board com `ETag` e, no POST com
 * `If-None-Match` igual ao ETag atual, 304 sem corpo (como o backend).
 *
 * Trava:
 *  - POST de board/colunas manda `If-None-Match` do último 200 do MESMO
 *    pedido e, no 304, devolve o corpo guardado;
 *  - GET do board vai com `cache: "no-cache"` (o navegador revalida);
 *  - reabrir o board / voltar à aba com o board velho revalida — e custa 304;
 *  - `new_message` e `message_status` = 0 requisições de board;
 *  - edição do negócio (`deal_moved` na mesma etapa, com `card`) atualiza só
 *    aquele card, sem GET.
 */
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => ({
  handler: null as ((event: string, data: unknown) => void) | null,
}));
vi.mock("@/hooks/use-sse", () => ({
  useSSE: (_url: string, handler: (event: string, data: unknown) => void) => {
    sse.handler = handler;
  },
}));

import {
  getBoard,
  getBoardColumns,
  getBoardFiltered,
  type BoardDealDto,
  type BoardStageDto,
} from "@/features/pipeline-v2/api";
import { resetBoardConditionalCache } from "@/features/pipeline-v2/api/board-conditional";
import { useBoard, useBoardFiltered } from "@/features/pipeline-v2/hooks/use-board";
import { usePipelineRealtime } from "@/features/pipeline-v2/hooks/use-pipeline-realtime";

const T_OLD = "2026-10-01T10:00:00.000Z";
const T_NEW = "2026-10-01T12:00:00.000Z";

function deal(id: string, extra: Partial<BoardDealDto> = {}): BoardDealDto {
  return {
    id,
    title: `Negócio ${id}`,
    value: 10,
    status: "OPEN",
    position: 1,
    expectedClose: null,
    createdAt: T_OLD,
    updatedAt: T_OLD,
    isRotting: false,
    contact: { id: `ct-${id}`, name: `Contato ${id}`, email: null },
    owner: null,
    tags: [],
    lastMessage: {
      id: "m1",
      content: "oi",
      createdAt: T_OLD,
      direction: "in",
    },
    unreadCount: 2,
    ...extra,
  } as unknown as BoardDealDto;
}

const BOARD: BoardStageDto[] = [
  {
    id: "st1",
    name: "Entrada",
    color: "#000",
    position: 0,
    winProbability: 0,
    rottingDays: 30,
    totalCount: 2,
    loadedCount: 2,
    hasMore: false,
    nextCursor: null,
    deals: [deal("d1"), deal("d2", { position: 2 })],
  } as unknown as BoardStageDto,
];

type Seen = { method: string; url: string; ifNoneMatch: string | null; cache?: string; status: number };

/** Servidor falso: ETag por pedido (URL + corpo) e versão do quadro. */
function fakeServer() {
  const seen: Seen[] = [];
  let version = 1;
  const etagFor = (url: string, body: string) => `W/"${version}-${url.length}-${body.length}"`;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : "";
    const etag = etagFor(url, body);
    const ifNoneMatch = headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      seen.push({ method, url, ifNoneMatch, cache: init?.cache, status: 304 });
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    seen.push({ method, url, ifNoneMatch, cache: init?.cache, status: 200 });
    const payload = url.includes("/board/columns")
      ? { columns: [{ stageId: "st1", deals: [deal("d9")], totalCount: 3, nextCursor: null, hasMore: false }] }
      : BOARD;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json", ETag: etag },
    });
  });
  return {
    fetchMock,
    seen,
    boardRequests: () => seen.filter((s) => s.url.includes("/board")),
    bump: () => {
      version += 1;
    },
  };
}

let server: ReturnType<typeof fakeServer>;

beforeEach(() => {
  server = fakeServer();
  vi.stubGlobal("fetch", server.fetchMock);
  resetBoardConditionalCache();
  sse.handler = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});

describe("API do board: pedidos condicionais", () => {
  it("POST /board: o 2º pedido igual leva If-None-Match e o 304 devolve o corpo guardado", async () => {
    const opts = { status: "OPEN" as const, filters: { tagIds: ["t1"] }, perStage: 50 };
    const first = await getBoardFiltered("p1", opts);
    const second = await getBoardFiltered("p1", opts);

    expect(server.seen.map((s) => s.status)).toEqual([200, 304]);
    expect(server.seen[0]!.ifNoneMatch).toBeNull();
    expect(server.seen[1]!.ifNoneMatch).toMatch(/^W\//);
    expect(second).toEqual(first);
    expect(second[0]!.deals.map((d) => d.id)).toEqual(["d1", "d2"]);
  });

  it("outro corpo (outro filtro) não reaproveita o ETag; quadro mudou = 200 e ETag novo", async () => {
    await getBoardFiltered("p1", { filters: { tagIds: ["t1"] } });
    await getBoardFiltered("p1", { filters: { tagIds: ["t2"] } });
    expect(server.seen[1]!.ifNoneMatch).toBeNull();

    server.bump();
    await getBoardFiltered("p1", { filters: { tagIds: ["t1"] } });
    expect(server.seen[2]!.status).toBe(200);
    await getBoardFiltered("p1", { filters: { tagIds: ["t1"] } });
    expect(server.seen[3]!.status).toBe(304);
  });

  it("POST /board/columns: 304 reaproveita as colunas guardadas", async () => {
    const opts = { columns: [{ stageId: "st1", cursor: "c1", limit: 30 }] };
    const first = await getBoardColumns("p1", opts);
    const second = await getBoardColumns("p1", opts);
    expect(server.seen.map((s) => s.status)).toEqual([200, 304]);
    expect(second).toEqual(first);
  });

  it("GET /board vai com cache: no-cache (o navegador revalida com If-None-Match)", async () => {
    await getBoard("p1", "OPEN", undefined, 10);
    expect(server.seen[0]).toMatchObject({ method: "GET", cache: "no-cache" });
  });
});

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("revalidação do board", () => {
  it("reabrir o board filtrado depois do staleTime = 1 POST com If-None-Match → 304, mesmo quadro", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = { pipelineId: "p1", status: "OPEN" as const, filters: { tagIds: ["t1"] }, perStage: 50 };

    const first = renderHook(() => useBoardFiltered(props), { wrapper: wrapperFor(qc) });
    await vi.waitFor(() => expect(first.result.current.data).toBeDefined());
    const before = first.result.current.data;
    first.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    const again = renderHook(() => useBoardFiltered(props), { wrapper: wrapperFor(qc) });
    await vi.waitFor(() => expect(server.boardRequests()).toHaveLength(2));
    await vi.waitFor(() => expect(again.result.current.isFetching).toBe(false));

    expect(server.boardRequests().map((s) => s.status)).toEqual([200, 304]);
    expect(again.result.current.data).toEqual(before);
  });

  it("voltar à aba com o board velho revalida: GET no-cache (paginado) e POST 304 (filtrado)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(
      () => ({
        paged: useBoard({ pipelineId: "p1", status: "OPEN", perStage: 10 }),
        filtered: useBoardFiltered({
          pipelineId: "p1",
          status: "OPEN",
          filters: { tagIds: ["t1"] },
          perStage: 50,
        }),
      }),
      { wrapper: wrapperFor(qc) },
    );
    await vi.waitFor(() => expect(server.boardRequests()).toHaveLength(2));
    await vi.waitFor(() => expect(view.result.current.filtered.isFetching).toBe(false));

    // Foco dentro do staleTime: nada.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(server.boardRequests()).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000);
    });
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await vi.waitFor(() => expect(server.boardRequests()).toHaveLength(4));
    const [, , a, b] = server.boardRequests();
    const get = [a, b].find((s) => s!.method === "GET")!;
    const post = [a, b].find((s) => s!.method === "POST")!;
    expect(get.cache).toBe("no-cache");
    expect(post.status).toBe(304);
  });
});

describe("eventos no board aberto", () => {
  async function mountBoard() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(
      () => {
        usePipelineRealtime(true);
        return useBoard({ pipelineId: "p1", status: "OPEN", perStage: 10 });
      },
      { wrapper: wrapperFor(qc) },
    );
    await vi.waitFor(() => expect(view.result.current.data).toBeDefined());
    return { qc, view };
  }

  it("20 new_message + 20 message_status (com e sem escopo, cards dentro e fora): 0 requisições de board", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { view } = await mountBoard();
    expect(server.boardRequests()).toHaveLength(1);

    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        sse.handler?.("new_message", {
          organizationId: "org-1",
          conversationId: `conv-${i}`,
          contactId: i % 3 === 0 ? "ct-d1" : `ct-fora-${i}`,
          direction: "in",
          content: `msg ${i}`,
          timestamp: T_NEW,
          ...(i % 2 === 0 ? { pipelineIds: ["p1"], dealIds: [i % 3 === 0 ? "d1" : `fora-${i}`] } : {}),
        });
        sse.handler?.("message_status", {
          organizationId: "org-1",
          conversationId: `conv-${i}`,
          messageId: "m1",
          status: "read",
        });
        await vi.advanceTimersByTimeAsync(3_000);
      });
    }

    expect(server.boardRequests()).toHaveLength(1);
    const card = view.result.current.data![0]!.deals.find((d) => d.id === "d1")!;
    expect(card.lastMessage).toMatchObject({ content: "msg 18" });
  });

  it("edição (deal_moved na mesma etapa, com card): só aquele card muda, sem GET", async () => {
    const { qc } = await mountBoard();

    await act(async () => {
      sse.handler?.("deal_moved", {
        organizationId: "org-1",
        dealId: "d1",
        fromPipelineId: "p1",
        toPipelineId: "p1",
        fromStageId: "st1",
        toStageId: "st1",
        position: 1,
        updatedAt: T_NEW,
        ownerId: "u2",
        card: {
          id: "d1",
          title: "Título editado",
          value: 990,
          status: "OPEN",
          position: 1,
          updatedAt: T_NEW,
          contact: { id: "ct-d1", name: "Contato renomeado", email: null, phone: null, avatarUrl: null },
          owner: { id: "u2", name: "Bia", avatarUrl: null, type: null },
          tags: [{ id: "t9", name: "VIP", color: "#f00" }],
        },
      });
    });

    const data = qc.getQueryData<BoardStageDto[]>(["pipeline-board", "p1", "OPEN"])!;
    const d1 = data[0]!.deals.find((d) => d.id === "d1")!;
    expect(d1).toMatchObject({
      title: "Título editado",
      value: 990,
      owner: { id: "u2", name: "Bia" },
      contact: { name: "Contato renomeado" },
      tags: [{ id: "t9", name: "VIP" }],
      updatedAt: T_NEW,
    });
    // Prévia e não lidas não viajam no evento: ficam as do cache.
    expect(d1.lastMessage).toMatchObject({ content: "oi" });
    expect(d1.unreadCount).toBe(2);
    // O outro card não muda.
    expect(data[0]!.deals.find((d) => d.id === "d2")).toMatchObject({ title: "Negócio d2" });
    expect(server.boardRequests()).toHaveLength(1);
  });
});
