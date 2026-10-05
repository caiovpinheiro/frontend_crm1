/** @vitest-environment jsdom */
/**
 * KF3 — eventos de mensagem × refetch do board.
 *
 * `new_message` de um contato cujo card está na página carregada só faz
 * patch no card. Quando o card NÃO está na página, o evento não traz dados
 * para montá-lo (etapa, posição, card do negócio) e o board paginado é
 * refeito. Antes esse refetch só juntava a janela de 800 ms: 20 mensagens,
 * uma por segundo, eram 20 GETs do board.
 *
 * O que fica travado aqui: no máximo 1 refetch a cada
 * `BOARD_REFRESH_MIN_INTERVAL_MS` por funil, e nenhum com a aba oculta (o
 * pendente sai quando a aba volta).
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

  it("cards fora da página (evento com escopo): 20 eventos = 3 GETs, não 20", async () => {
    const { fetchBoard } = await setup();

    await burst(20, (i) => ({
      contactId: `contact-fora-${i}`,
      pipelineIds: ["p1"],
      dealIds: [`deal-fora-${i}`],
    }));
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 2);

    // 1º refetch 800 ms depois do 1º evento; os seguintes a cada 10 s.
    expect(fetchBoard).toHaveBeenCalledTimes(1 + 3);
  });

  it("backend antigo (evento sem escopo): o mesmo teto vale", async () => {
    const { fetchBoard } = await setup();

    await burst(20, (i) => ({ contactId: `contact-fora-${i}` }));
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 2);

    expect(fetchBoard).toHaveBeenCalledTimes(1 + 3);
  });

  it("aba oculta: nenhum GET; ao voltar, um só", async () => {
    const { fetchBoard } = await setup();

    act(() => setVisibility("hidden"));
    await burst(20, (i) => ({
      contactId: `contact-fora-${i}`,
      pipelineIds: ["p1"],
      dealIds: [`deal-fora-${i}`],
    }));
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 3);
    expect(fetchBoard).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await advance(BOARD_REFRESH_DEBOUNCE_MS + 50);
    expect(fetchBoard).toHaveBeenCalledTimes(2);
    await advance(BOARD_REFRESH_MIN_INTERVAL_MS * 3);
    expect(fetchBoard).toHaveBeenCalledTimes(2);
  });

  it("evento isolado continua rápido: refetch 800 ms depois", async () => {
    const { fetchBoard } = await setup();

    await act(async () => {
      sse.handler?.(
        "new_message",
        message({ contactId: "contact-z", pipelineIds: ["p1"], dealIds: ["deal-z"] }),
      );
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_DEBOUNCE_MS + 50);
    });

    expect(fetchBoard).toHaveBeenCalledTimes(2);
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
