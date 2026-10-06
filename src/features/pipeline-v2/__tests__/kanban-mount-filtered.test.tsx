/** @vitest-environment jsdom */
/**
 * Montar o Kanban com filtro na URL (`/pipeline?dir=in&sort=...`, vindo da
 * Lista ou de um link): exatamente UMA requisição de board, já filtrada.
 *
 * Antes: os filtros nasciam `{}` e só eram lidos da URL num efeito depois
 * do 1º render — a 1ª query saía sem filtro (GET /board?perStage=10, ~0,5 s
 * de desperdício e um piscar do quadro) e só depois o POST /board filtrado.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getBoard: vi.fn(),
  getBoardFiltered: vi.fn(),
  getBoardColumns: vi.fn(),
}));
vi.mock("@/features/pipeline-v2/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pipeline-v2/api")>()),
  getBoard: api.getBoard,
  getBoardFiltered: api.getBoardFiltered,
  getBoardColumns: api.getBoardColumns,
}));

import { useKanbanFilters } from "@/components/pipeline/kanban-filters/use-kanban-filters";
import type { BoardStageDto } from "@/features/pipeline-v2/api";
import { useKanbanBoard } from "@/features/pipeline-v2/hooks/use-kanban-board";

const PIPELINE = "p1";

function boardFor(label: string): BoardStageDto[] {
  return [
    {
      id: "s1",
      name: label,
      color: "#000",
      position: 0,
      winProbability: 0,
      rottingDays: 0,
      totalCount: 0,
      hasMore: false,
      nextCursor: null,
      deals: [],
    } as unknown as BoardStageDto,
  ];
}

/** O que o `_v2-client` do Kanban monta: filtros da URL → board. */
function mountKanban() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      const kanbanFilters = useKanbanFilters();
      const board = useKanbanBoard({
        pipelineId: PIPELINE,
        status: "OPEN",
        sort: undefined,
        filters: kanbanFilters.filters,
        enabled: kanbanFilters.hydrated,
      });
      return { kanbanFilters, board };
    },
    { wrapper },
  );
  return { qc, view };
}

async function settle(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  api.getBoard.mockReset();
  api.getBoardFiltered.mockReset();
  api.getBoardColumns.mockReset();
  api.getBoard.mockResolvedValue(boardFor("sem filtro"));
  api.getBoardFiltered.mockImplementation(
    (_pid: string, opts: { filters?: unknown }) =>
      Promise.resolve(boardFor(JSON.stringify(opts.filters ?? {}))),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("Kanban — montagem com filtro na URL", () => {
  it("filtro de direção na URL: 1 requisição de board, já filtrada (nenhum GET sem filtro)", async () => {
    window.history.replaceState(null, "", "/pipeline?pipeline=7&dir=in&sort=interaction_newest");
    const t = mountKanban();
    await settle(2_000);

    expect(api.getBoard).not.toHaveBeenCalled();
    expect(api.getBoardFiltered).toHaveBeenCalledTimes(1);
    expect(api.getBoardFiltered.mock.calls[0]![1]).toMatchObject({
      filters: { lastMessageDirection: "in" },
    });
    expect(t.view.result.current.board.hasServerBoard).toBe(true);
    expect(t.view.result.current.board.boardFiltered.data?.[0]?.name).toContain(
      "lastMessageDirection",
    );
    // A URL continua descrevendo a visão (nada foi apagado na hidratação).
    expect(new URLSearchParams(window.location.search).get("dir")).toBe("in");
  });

  it("sem filtro na URL: 1 GET do board paginado, nenhum POST", async () => {
    window.history.replaceState(null, "", "/pipeline?pipeline=7");
    const t = mountKanban();
    await settle(2_000);

    expect(api.getBoard).toHaveBeenCalledTimes(1);
    expect(api.getBoardFiltered).not.toHaveBeenCalled();
    expect(t.view.result.current.board.hasServerBoard).toBe(false);
  });

  it("filtro aplicado depois de montar continua passando pelo debounce (1 POST por rajada)", async () => {
    window.history.replaceState(null, "", "/pipeline?pipeline=7");
    const t = mountKanban();
    await settle(2_000);
    expect(api.getBoard).toHaveBeenCalledTimes(1);

    act(() => t.view.result.current.kanbanFilters.patch({ tagIds: ["t1"] }));
    await settle(100);
    act(() => t.view.result.current.kanbanFilters.patch({ tagIds: ["t1", "t2"] }));
    await settle(100);
    expect(api.getBoardFiltered).not.toHaveBeenCalled();
    await settle(2_000);

    expect(api.getBoardFiltered).toHaveBeenCalledTimes(1);
    expect(api.getBoardFiltered.mock.calls[0]![1]).toMatchObject({
      filters: { tagIds: ["t1", "t2"] },
    });
    expect(api.getBoard).toHaveBeenCalledTimes(1);
  });
});
