/** @vitest-environment jsdom */
/**
 * O autor do drag reconcilia o cache com o POST /move.
 * Falha de SSE não entra neste teste: nenhum evento é emitido.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  moveDeal: vi.fn(),
  getBoard: vi.fn(),
}));
vi.mock("@/features/pipeline-v2/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pipeline-v2/api")>()),
  moveDeal: api.moveDeal,
  getBoard: api.getBoard,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { BoardDealDto, BoardStageDto } from "@/features/pipeline-v2/api";
import { useMoveDeal } from "@/features/pipeline-v2/hooks/use-deal-mutations";
import { applyDealMoved } from "@/features/pipeline-v2/hooks/use-pipeline-realtime";

const PIPE = "pipe-1";
const KEY = ["pipeline-board", PIPE, "OPEN"] as const;
const UPDATED = "2026-10-05T18:00:00.000Z";

function deal(id: string, position: number): BoardDealDto {
  return {
    id,
    title: id,
    value: 10,
    status: "OPEN",
    position,
    expectedClose: null,
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:00:00.000Z",
    isRotting: false,
    contact: { id: `c-${id}`, name: id, email: null },
    owner: null,
    lastMessage: { id: `m-${id}`, content: "oi", createdAt: "2026-10-05T10:00:00.000Z", direction: "in" },
    unreadCount: 1,
  };
}

function stage(id: string, deals: BoardDealDto[]): BoardStageDto {
  return {
    id,
    name: id,
    color: "#000",
    position: 0,
    winProbability: 0,
    rottingDays: 0,
    totalCount: deals.length,
    deals,
  };
}

function httpDeal(position: number, stageId: string, pipelineId: string) {
  return {
    id: "a",
    title: "a",
    status: "OPEN",
    position,
    updatedAt: UPDATED,
    stage: {
      id: stageId,
      name: stageId,
      pipelineId,
      pipeline: { id: pipelineId, name: "Vendas" },
    },
  };
}

function setup(extra?: { dest?: BoardStageDto[] }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, structuralSharing: false } },
  });
  qc.setQueryData(KEY, [stage("s1", [deal("a", 4)]), stage("s2", [deal("x", 0), deal("y", 2)])]);
  if (extra?.dest) {
    qc.setQueryData(["pipeline-board", "pipe-2", "OPEN"], extra.dest);
  }
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const refetch = vi.spyOn(qc, "refetchQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useMoveDeal(PIPE, "OPEN"), { wrapper });
  return { qc, view, invalidate, refetch };
}

function ids(qc: QueryClient, key: readonly unknown[]) {
  return (qc.getQueryData<BoardStageDto[]>(key) ?? []).flatMap((s) =>
    s.deals.filter((d) => d.id === "a").map((d) => ({ stage: s.id, position: d.position, updatedAt: d.updatedAt })),
  );
}

beforeEach(() => {
  api.moveDeal.mockReset();
  api.getBoard.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("POST /move reconcilia o autor sem SSE", () => {
  it("HTTP ok e publish SSE ausente: posição canônica, um card, sem GET e sem invalidateQueries", async () => {
    const { qc, view, invalidate, refetch } = setup();
    api.moveDeal.mockResolvedValue(httpDeal(1.5, "s2", PIPE));

    await act(async () => {
      await view.result.current.mutateAsync({
        dealId: "a",
        fromStageId: "s1",
        toStageId: "s2",
        toIndex: 0,
        skipSuccessToast: true,
      });
    });

    expect(api.getBoard).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(JSON.stringify(refetch.mock.calls)).not.toContain("pipeline-board");

    const placed = ids(qc, KEY);
    expect(placed).toEqual([{ stage: "s2", position: 1.5, updatedAt: UPDATED }]);
    const board = qc.getQueryData<BoardStageDto[]>(KEY)!;
    expect(board[0].deals.map((d) => d.id)).toEqual([]);
    expect(board[1].deals.map((d) => d.id)).toEqual(["x", "a", "y"]);
    expect(board[1].deals[1].lastMessage?.content).toBe("oi");

    const before = qc.getQueryData(KEY);
    applyDealMoved(qc, {
      dealId: "a",
      fromPipelineId: PIPE,
      toPipelineId: PIPE,
      fromStageId: "s1",
      toStageId: "s2",
      position: 1.5,
      updatedAt: UPDATED,
    });
    expect(qc.getQueryData(KEY)).toBe(before);
    expect(ids(qc, KEY)).toHaveLength(1);
  });

  it("resposta envelopada em { deal } também grava a posição do backend", async () => {
    const { qc, view } = setup();
    api.moveDeal.mockResolvedValue({ deal: httpDeal(1.5, "s2", PIPE) });

    await act(async () => {
      await view.result.current.mutateAsync({
        dealId: "a",
        fromStageId: "s1",
        toStageId: "s2",
        toIndex: 0,
      });
    });

    await waitFor(() => {
      expect(ids(qc, KEY)).toEqual([{ stage: "s2", position: 1.5, updatedAt: UPDATED }]);
    });
  });

  it("cross-pipeline: o HTTP tira da origem e coloca no destino sem SSE", async () => {
    const { qc, view, invalidate } = setup({
      dest: [stage("s9", [deal("z", 1)])],
    });
    api.moveDeal.mockResolvedValue(httpDeal(0, "s9", "pipe-2"));

    await act(async () => {
      await view.result.current.mutateAsync({
        dealId: "a",
        fromStageId: "s1",
        toStageId: "s9",
        toPipelineId: "pipe-2",
        toIndex: 0,
        skipSuccessToast: true,
      });
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(api.getBoard).not.toHaveBeenCalled();
    expect(ids(qc, KEY)).toEqual([]);
    expect(ids(qc, ["pipeline-board", "pipe-2", "OPEN"])).toEqual([
      { stage: "s9", position: 0, updatedAt: UPDATED },
    ]);
  });
});
