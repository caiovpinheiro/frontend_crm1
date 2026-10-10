/** @vitest-environment jsdom */
/**
 * N-FE-7 — o board do Kanban precisa ter a mesma identidade de funil
 * (CUID) que o resto do código: o escopo do SSE (`pipelineIds`), as
 * mutações (criar/excluir/ganhar/perder) e o "Mover" (cálculo da posição)
 * localizam o board pelo CUID. Com o número público (`?pipeline=8`) na
 * chave, nada disso casava.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getBoard: vi.fn(),
  getBoardFiltered: vi.fn(),
  getBoardColumns: vi.fn(),
  createDeal: vi.fn(),
  deleteDeal: vi.fn(),
  setDealStatus: vi.fn(),
  moveDeal: vi.fn(),
}));
vi.mock("@/features/pipeline-v2/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pipeline-v2/api")>()),
  ...api,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type {
  BoardDealDto,
  BoardSortParam,
  BoardStageDto,
} from "@/features/pipeline-v2/api";
import { boardKey } from "@/features/pipeline-v2/hooks/use-board";
import { useKanbanBoard } from "@/features/pipeline-v2/hooks/use-kanban-board";
import {
  useCreateDeal,
  useDeleteDeal,
  useMoveDeal,
  useSetDealStatus,
} from "@/features/pipeline-v2/hooks/use-deal-mutations";
import {
  applyBoardNewMessage,
  createBoardRefreshScheduler,
} from "@/features/pipeline-v2/hooks/use-pipeline-realtime";
import type { RealtimePayload } from "@/lib/realtime-contract";

const CUID = "cm_pipeline_vendas";

function deal(id: string): BoardDealDto {
  return {
    id,
    title: `Negócio ${id}`,
    value: 0,
    status: "OPEN",
    position: 1,
    contact: { id: `ct-${id}`, name: `Contato ${id}` },
    owner: null,
    tags: [],
    unreadCount: 0,
    lastMessage: null,
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
  } as unknown as BoardDealDto;
}

function stage(id: string, position: number, deals: BoardDealDto[]): BoardStageDto {
  return {
    id,
    name: `Etapa ${id}`,
    color: "#5b6ff5",
    position,
    winProbability: 0,
    rottingDays: 30,
    totalCount: deals.length,
    loadedCount: deals.length,
    hasMore: false,
    deals,
  };
}

function board(): BoardStageDto[] {
  return [stage("s1", 1, [deal("a")]), stage("s2", 2, [deal("x"), deal("y")])];
}

function setup(sort?: BoardSortParam) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => ({
      kanban: useKanbanBoard({
        pipelineId: CUID,
        status: "OPEN",
        sort,
        filters: {},
        enabled: true,
      }),
      // O Kanban e o painel do negócio passam o CUID às mutações.
      move: useMoveDeal(CUID, "OPEN"),
      create: useCreateDeal(CUID, "OPEN"),
      remove: useDeleteDeal(CUID, "OPEN"),
      setStatus: useSetDealStatus(CUID, "OPEN"),
    }),
    { wrapper },
  );
  return { qc, view };
}

async function boardLoaded(view: ReturnType<typeof setup>["view"]) {
  await waitFor(() => expect(view.result.current.kanban.boardNormal.data).toBeDefined());
}

beforeEach(() => {
  window.history.replaceState(null, "", "/pipeline?pipeline=8");
  for (const fn of Object.values(api)) fn.mockReset();
  api.getBoard.mockImplementation(async () => board());
  api.createDeal.mockResolvedValue({ deal: deal("novo") });
  api.deleteDeal.mockResolvedValue(undefined);
  api.setDealStatus.mockResolvedValue({ deal: deal("a") });
  api.moveDeal.mockResolvedValue({ deal: deal("a") });
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("Kanban: identidade do funil no board (N-FE-7)", () => {
  it("o board é buscado e guardado pelo CUID, não pelo número da URL", async () => {
    const { qc, view } = setup();
    await boardLoaded(view);
    expect(qc.getQueryData(boardKey(CUID, "OPEN"))).toBeDefined();
    expect(api.getBoard.mock.calls[0]![0]).toBe(CUID);
  });

  it("SSE com escopo (`pipelineIds` = CUID) refaz o board do Kanban", async () => {
    const { qc, view } = setup();
    await boardLoaded(view);
    expect(api.getBoard).toHaveBeenCalledTimes(1);

    const scheduler = createBoardRefreshScheduler(qc, 0);
    // Contato fora da página carregada, no funil do Kanban.
    const request = applyBoardNewMessage(qc, {
      contactId: "ct-fora",
      direction: "in",
      content: "oi",
      pipelineIds: [CUID],
    } as unknown as RealtimePayload<"new_message">);
    expect(request).toEqual([CUID]);
    act(() => scheduler.schedule(request));

    await waitFor(() => expect(api.getBoard).toHaveBeenCalledTimes(2));
  });

  it("SSE de outro funil não refaz o board do Kanban", async () => {
    const { qc, view } = setup();
    await boardLoaded(view);
    const scheduler = createBoardRefreshScheduler(qc, 0);
    act(() =>
      scheduler.schedule(
        applyBoardNewMessage(qc, {
          contactId: "ct-fora",
          direction: "in",
          content: "oi",
          pipelineIds: ["cm_outro"],
        } as unknown as RealtimePayload<"new_message">),
      ),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(api.getBoard).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["criar", (r: ReturnType<typeof setup>["view"]["result"]) => r.current.create.mutateAsync({ title: "Novo" } as never)],
    ["excluir", (r: ReturnType<typeof setup>["view"]["result"]) => r.current.remove.mutateAsync({ dealId: "a" })],
    ["ganhar", (r: ReturnType<typeof setup>["view"]["result"]) => r.current.setStatus.mutateAsync({ dealId: "a", status: "WON" })],
    ["perder", (r: ReturnType<typeof setup>["view"]["result"]) => r.current.setStatus.mutateAsync({ dealId: "a", status: "LOST", lostReason: "preço" })],
  ])("%s um negócio refaz o board do Kanban", async (_label, run) => {
    const { view } = setup();
    await boardLoaded(view);
    expect(api.getBoard).toHaveBeenCalledTimes(1);
    await act(async () => {
      await run(view.result);
    });
    await waitFor(() => expect(api.getBoard).toHaveBeenCalledTimes(2));
  });

  it.each([
    ["sem ordenação", undefined],
    ["ordenado por interação", { field: "lastInteraction", direction: "desc" } as BoardSortParam],
  ])("'Mover' sem índice calcula o fim da coluna destino (%s)", async (_label, sort) => {
    const { view } = setup(sort);
    await boardLoaded(view);
    await act(async () => {
      await view.result.current.move.mutateAsync({
        dealId: "a",
        fromStageId: "s1",
        toStageId: "s2",
      });
    });
    // s2 tinha 2 cards carregados → vai para a posição 2, não 0.
    expect(api.moveDeal).toHaveBeenCalledWith("a", {
      stageId: "s2",
      position: 2,
      lostReason: undefined,
    });
  });

  it("mover um negócio não refaz o GET do board", async () => {
    const { qc, view } = setup();
    await boardLoaded(view);
    expect(api.getBoard).toHaveBeenCalledTimes(1);
    await act(async () => {
      await view.result.current.move.mutateAsync({
        dealId: "a",
        fromStageId: "s1",
        toStageId: "s2",
        toIndex: 0,
      });
    });
    expect(api.getBoard).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const board = view.result.current.kanban.boardNormal.data!;
      expect(board.map((s) => s.deals.map((d) => d.id))).toEqual([[], ["a", "x", "y"]]);
    });
    expect(qc.getQueryData<BoardStageDto[]>(["pipeline-board", CUID, "OPEN"])![1].deals[0].id).toBe(
      "a",
    );
  });
});
