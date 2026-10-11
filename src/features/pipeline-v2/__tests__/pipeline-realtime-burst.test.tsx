/** @vitest-environment jsdom */
/**
 * KF3 — eventos de mensagem × refetch do board.
 *
 * `new_message` de um contato cujo card está na página carregada só faz
 * patch no card. Evento COM escopo (`pipelineIds`) nunca refaz o board:
 * card fora do cache está além da página, fora do filtro ou é negócio novo
 * (que entra pelo `deal_moved` de criação). Com o refetch por escopo e piso
 * de 10 s, uma organização movimentada recarregava o board de toda aba
 * visível a cada 10 s (produção, 10/10: 4–6 cargas por minuto por aba).
 *
 * Evento SEM escopo (backend antigo) e card fora da página: o board
 * paginado é refeito, no máximo 1 vez a cada `BOARD_REFRESH_MIN_INTERVAL_MS`
 * (30 s) por funil, e nenhuma com a aba oculta (o pendente sai quando a aba
 * volta).
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
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

import type { BoardDealDto, BoardStageDto } from "@/features/pipeline-v2/api";
import {
  BOARD_CREATED_FILTERED_REFRESH_MS,
  BOARD_REFRESH_DEBOUNCE_MS,
  BOARD_REFRESH_MIN_INTERVAL_MS,
  createBoardRefreshScheduler,
  usePipelineRealtime,
} from "@/features/pipeline-v2/hooks/use-pipeline-realtime";

const T_OLD = "2026-10-01T10:00:00.000Z";
const T_NEW = "2026-10-01T12:00:00.000Z";

function deal(id: string, contactId: string): BoardDealDto {
  return {
    id,
    title: id,
    value: 0,
    status: "OPEN",
    position: 0,
    expectedClose: null,
    createdAt: T_OLD,
    updatedAt: T_OLD,
    isRotting: false,
    contact: { id: contactId, name: contactId, email: null },
    owner: null,
    lastMessage: null,
    unreadCount: 0,
    awaitingMessages: [],
  };
}

function boardOf(deals: BoardDealDto[]): BoardStageDto[] {
  return [
    {
      id: "stage-1",
      name: "Entrada",
      color: "#000",
      position: 0,
      winProbability: 0,
      rottingDays: 0,
      deals,
    },
  ];
}

const P1_KEY = ["pipeline-board", "p1", "OPEN"] as const;
const P2_KEY = ["pipeline-board", "p2", "OPEN"] as const;

let visibility: "visible" | "hidden" = "visible";
function setVisibility(next: "visible" | "hidden") {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Board do funil p1 aberto (query ativa, `queryFn` contado = GETs). */
async function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 600_000, gcTime: 600_000 } },
  });
  const fetchBoard = vi.fn(async () =>
    boardOf([deal("deal-a1", "contact-a"), deal("deal-b1", "contact-b")]),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      usePipelineRealtime(true);
      return useQuery({ queryKey: P1_KEY, queryFn: fetchBoard });
    },
    { wrapper },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(fetchBoard).toHaveBeenCalledTimes(1);
  return { qc, fetchBoard, view };
}

function message(extra: Record<string, unknown>) {
  return {
    organizationId: "org-1",
    conversationId: "conv-1",
    direction: "in",
    content: "oi",
    timestamp: T_NEW,
    ...extra,
  };
}

/** `count` mensagens, uma por segundo, cada uma montada por `build(i)`. */
async function burst(count: number, build: (i: number) => Record<string, unknown>) {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      sse.handler?.("new_message", message(build(i)));
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sse.handler = null;
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("board sob rajada de mensagens (20 eventos, 1 por segundo)", () => {
  it("cards na página carregada: só patch, nenhum GET do board", async () => {
    const { qc, fetchBoard } = await setup();

    await burst(20, (i) => ({
      contactId: i % 2 === 0 ? "contact-a" : "contact-b",
      pipelineIds: ["p1"],
      dealIds: [i % 2 === 0 ? "deal-a1" : "deal-b1"],
      content: `msg ${i}`,
    }));
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 2);

    expect(fetchBoard).toHaveBeenCalledTimes(1);
    const board = qc.getQueryData<BoardStageDto[]>(P1_KEY)!;
    expect(board[0]!.deals[0]!.lastMessage).toMatchObject({ content: "msg 18" });
    expect(board[0]!.deals[1]!.lastMessage).toMatchObject({ content: "msg 19" });
  });

  it("cards fora da página (evento com escopo): 20 eventos = 0 GETs", async () => {
    const { fetchBoard } = await setup();

    await burst(20, (i) => ({
      contactId: `contact-fora-${i}`,
      pipelineIds: ["p1"],
      dealIds: [`deal-fora-${i}`],
    }));
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 2);

    // Card além da página, fora do filtro ou negócio fechado: só o patch do
    // que está em cache, nunca recarga.
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it("backend antigo (evento sem escopo): no máximo 1 GET a cada 30 s", async () => {
    const { fetchBoard } = await setup();

    await burst(20, (i) => ({ contactId: `contact-fora-${i}` }));
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 2);

    // 1º refetch 800 ms depois do 1º evento; o seguinte quando os 30 s fecham.
    expect(BOARD_REFRESH_MIN_INTERVAL_MS).toBe(30_000);
    expect(fetchBoard).toHaveBeenCalledTimes(1 + 2);
  });

  it("aba oculta: nenhum GET; ao voltar, um só", async () => {
    const { fetchBoard } = await setup();

    act(() => setVisibility("hidden"));
    await burst(20, (i) => ({ contactId: `contact-fora-${i}` }));
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 3);
    expect(fetchBoard).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await advance(BOARD_REFRESH_DEBOUNCE_MS + 50);
    expect(fetchBoard).toHaveBeenCalledTimes(2);
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 3);
    expect(fetchBoard).toHaveBeenCalledTimes(2);
  });

  it("evento isolado sem escopo continua rápido: refetch 800 ms depois", async () => {
    const { fetchBoard } = await setup();

    await act(async () => {
      sse.handler?.("new_message", message({ contactId: "contact-z" }));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_DEBOUNCE_MS + 50);
    });

    expect(fetchBoard).toHaveBeenCalledTimes(2);
  });
});

/**
 * Teste sintético do volume medido em produção (10/10): organização
 * movimentada, uma mensagem a cada 3 s durante 1 min, de contatos cujo card
 * não está no board em cache (negócio fechado no escopo, card além da
 * página). Conta as cargas do board por minuto com a aba visível.
 */
describe("cargas do board por minuto (20 mensagens em 1 min)", () => {
  async function perMinute(build: (i: number) => Record<string, unknown>) {
    const { fetchBoard } = await setup();
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        sse.handler?.("new_message", message(build(i)));
        await vi.advanceTimersByTimeAsync(3_000);
      });
    }
    return fetchBoard.mock.calls.length - 1;
  }

  it("evento com escopo: 0 cargas", async () => {
    const loads = await perMinute((i) => ({
      contactId: `contact-fechado-${i}`,
      pipelineIds: ["p1"],
      dealIds: [`deal-fechado-${i}`],
    }));
    expect(loads).toBe(0);
  });

  it("evento sem escopo (backend antigo): 2 cargas", async () => {
    const loads = await perMinute((i) => ({ contactId: `contact-fora-${i}` }));
    expect(loads).toBe(2);
  });

  it("aba oculta: 0 cargas, com ou sem escopo", async () => {
    act(() => setVisibility("hidden"));
    const loads = await perMinute((i) =>
      i % 2 === 0
        ? { contactId: `contact-fora-${i}` }
        : { contactId: `contact-fora-${i}`, pipelineIds: ["p1"], dealIds: [`d-${i}`] },
    );
    expect(loads).toBe(0);
  });
});

describe("negócio criado (deal_moved sem origem) no board aberto", () => {
  const created = (extra: Record<string, unknown> = {}) => ({
    organizationId: "org-1",
    dealId: "deal-novo",
    toPipelineId: "p1",
    toStageId: "stage-1",
    position: 0.5,
    updatedAt: T_NEW,
    ownerId: null,
    card: {
      id: "deal-novo",
      title: "Lead novo",
      status: "OPEN",
      contact: { id: "contact-novo", name: "Ana" },
    },
    ...extra,
  });

  it("fromStageId null: o card aparece na etapa, sem GET; a mensagem seguinte só faz patch", async () => {
    const { qc, fetchBoard } = await setup();

    await act(async () => {
      sse.handler?.("deal_moved", created({ fromStageId: null, fromPipelineId: null }));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MIN_INTERVAL_MS * 2);
    });

    const board = qc.getQueryData<BoardStageDto[]>(P1_KEY)!;
    expect(board[0]!.deals.map((d) => d.id)).toContain("deal-novo");

    await act(async () => {
      sse.handler?.(
        "new_message",
        message({ contactId: "contact-novo", pipelineIds: ["p1"], dealIds: ["deal-novo"] }),
      );
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MIN_INTERVAL_MS * 2);
    });
    const after = qc.getQueryData<BoardStageDto[]>(P1_KEY)!;
    expect(after[0]!.deals.find((d) => d.id === "deal-novo")!.lastMessage).toMatchObject({
      content: "oi",
    });
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it("board filtrado: o card entra na hora e 1 recarga confere o filtro 30 s depois", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 600_000, gcTime: 600_000 } },
    });
    const filteredKey = ["pipeline-board-filtered", "p1", "OPEN", '{"tagIds":["t1"]}', "default", 50];
    const fetchFiltered = vi.fn(async () => boardOf([deal("deal-a1", "contact-a")]));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(
      () => {
        usePipelineRealtime(true);
        return useQuery({ queryKey: filteredKey, queryFn: fetchFiltered });
      },
      { wrapper },
    );
    await advance(0);
    expect(fetchFiltered).toHaveBeenCalledTimes(1);

    // Três leads novos em 3 s: entram já; uma recarga só, 30 s depois do 1º.
    for (const id of ["n1", "n2", "n3"]) {
      await act(async () => {
        sse.handler?.(
          "deal_moved",
          created({ dealId: id, fromStageId: null, card: { id, title: id, status: "OPEN" } }),
        );
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }
    const board = qc.getQueryData<BoardStageDto[]>(filteredKey)!;
    expect(board[0]!.deals.map((d) => d.id)).toEqual(expect.arrayContaining(["n1", "n2", "n3"]));
    expect(fetchFiltered).toHaveBeenCalledTimes(1);

    await advance(BOARD_CREATED_FILTERED_REFRESH_MS - 3_000);
    expect(fetchFiltered).toHaveBeenCalledTimes(2);
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 3);
    expect(fetchFiltered).toHaveBeenCalledTimes(2);
  });

  it("forma alternativa (fromStageId ausente + created: true): mesmo resultado", async () => {
    const { qc, fetchBoard } = await setup();

    await act(async () => {
      sse.handler?.("deal_moved", created({ created: true }));
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_MIN_INTERVAL_MS * 2);
    });

    const board = qc.getQueryData<BoardStageDto[]>(P1_KEY)!;
    expect(board[0]!.deals.filter((d) => d.id === "deal-novo")).toHaveLength(1);
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });
});

describe("createBoardRefreshScheduler — intervalo mínimo por funil", () => {
  function invalidatedKeys(qc: QueryClient) {
    return [P1_KEY, P2_KEY].filter((key) => qc.getQueryState(key)?.isInvalidated);
  }

  function boards() {
    const qc = new QueryClient();
    qc.setQueryData(P1_KEY, []);
    qc.setQueryData(P2_KEY, []);
    return qc;
  }

  it("o intervalo de um funil não segura o primeiro refetch de outro", () => {
    const qc = boards();
    const scheduler = createBoardRefreshScheduler(qc);

    scheduler.schedule(["p1"]);
    vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS);
    expect(invalidatedKeys(qc)).toEqual([P1_KEY]);
    qc.setQueryData(P1_KEY, []);

    // 2 s depois: p1 de novo (dentro do intervalo) e p2 pela 1ª vez.
    vi.advanceTimersByTime(2_000);
    scheduler.schedule(["p1", "p2"]);
    vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS);
    expect(invalidatedKeys(qc)).toEqual([P2_KEY]);

    // p1 sai quando o intervalo dele fecha.
    vi.advanceTimersByTime(BOARD_REFRESH_MIN_INTERVAL_MS);
    expect(invalidatedKeys(qc)).toEqual([P1_KEY, P2_KEY]);
    scheduler.cancel();
  });

  it("cancel descarta o pendente que esperava o intervalo ou a aba", () => {
    const qc = boards();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const scheduler = createBoardRefreshScheduler(qc);

    scheduler.schedule(["p1"]);
    vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS);
    expect(invalidate).toHaveBeenCalledTimes(1);

    scheduler.schedule(["p1"]);
    scheduler.cancel();
    vi.advanceTimersByTime(BOARD_REFRESH_MIN_INTERVAL_MS * 2);
    setVisibility("hidden");
    setVisibility("visible");
    vi.advanceTimersByTime(BOARD_REFRESH_MIN_INTERVAL_MS * 2);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
