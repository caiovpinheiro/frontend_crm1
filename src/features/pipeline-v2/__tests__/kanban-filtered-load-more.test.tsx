/** @vitest-environment jsdom */
/**
 * KF1 — board FILTRADO do Kanban (POST /api/pipelines/:id/board).
 *
 * Antes: com qualquer filtro ou busca o Kanban pedia 200 cards por etapa
 * (~4 MB por resposta) e escondia o "carregar mais" — o que passava de 200
 * não aparecia. Agora pede 50 por etapa e carrega o resto ao rolar a
 * coluna, pelo cursor da etapa (POST /board/columns com os mesmos filtros).
 *
 * O que fica travado aqui:
 *  - tamanho pedido (50) e contador da coluna vindo do total do servidor;
 *  - carga incremental pelo cursor, com os filtros do board;
 *  - sem rajada: sentinela sempre visível não encadeia páginas e uma
 *    rolagem longa faz uma requisição só (regressão já vista no Inbox);
 *  - refetch do board filtrado recarrega as colunas expandidas;
 *  - trocar de filtro volta à 1ª página;
 *  - etapa sem cursor (backend antigo / ordenação sem cursor): offset.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
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

import { KanbanColumn } from "@/components/crm/kanban-column";
import type { Deal } from "@/components/crm/deal-card";
import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { boardColumnLoadMore } from "@/features/pipeline-v2/board-column-paging";
import {
  BOARD_FILTERED_PAGE_SIZE,
  BOARD_LOAD_MORE_PAGE_SIZE,
  boardsOfPipeline,
} from "@/features/pipeline-v2/hooks/use-board";
import { BOARD_FILTERS_DEBOUNCE_MS } from "@/features/pipeline-v2/hooks/use-debounced-filters";
import { useKanbanBoard } from "@/features/pipeline-v2/hooks/use-kanban-board";
import { createFakeBoardServer } from "@/test-support/fake-board-server";
import {
  bindScroller,
  createFrames,
  installFakeIntersectionObserver,
  sentinelInView,
  sleep,
  type ListLayout,
} from "@/test-support/scroll-harness";

const PIPELINE = "8";
const CARD = 100;
const FILTERS: AdvancedDealFilters = { tagIds: ["t1"] };

type BoardRequest = {
  filters?: AdvancedDealFilters;
  perStage?: number;
  offsetByStage?: Record<string, number>;
};
type ColumnsRequest = {
  filters?: AdvancedDealFilters;
  columns: { stageId: string; cursor: string; limit: number }[];
};

/** Mesma ligação do host do Kanban (`app/(app)/pipeline/_v2-client.tsx`). */
function Board({ filters }: { filters: AdvancedDealFilters }) {
  const { hasServerBoard, boardLoadMore, boardNormal, boardFiltered } = useKanbanBoard({
    pipelineId: PIPELINE,
    status: "OPEN",
    sort: undefined,
    filters,
    enabled: true,
  });
  const board = hasServerBoard ? (boardFiltered.data ?? []) : (boardNormal.data ?? []);
  return (
    <>
      {board.map((stage) => {
        const more = boardColumnLoadMore(stage);
        return (
          <div key={stage.id} data-stage={stage.id}>
            <KanbanColumn
              title={stage.name}
              color="novo"
              count={stage.totalCount ?? stage.deals.length}
              total=""
              deals={stage.deals as unknown as Deal[]}
              renderDeal={(deal) => (
                <div key={deal.id} data-card={deal.id}>
                  {deal.id}
                </div>
              )}
              loadMore={
                more
                  ? {
                      remaining: more.remaining,
                      loading: boardLoadMore.loadingStageIds.has(stage.id),
                      onClick: () => void boardLoadMore.loadMore([stage.id]),
                    }
                  : undefined
              }
            />
          </div>
        );
      })}
    </>
  );
}

function mount(
  totals: Record<string, number>,
  layoutInit: Partial<ListLayout> = {},
  configure?: () => void,
) {
  const server = createFakeBoardServer(totals, 10);
  api.getBoard.mockImplementation(server.getBoard);
  api.getBoardFiltered.mockImplementation(server.getBoardFiltered);
  api.getBoardColumns.mockImplementation(server.getBoardColumns);
  configure?.();

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let container: HTMLElement | null = null;
  const column = (stageId: string) =>
    container!.querySelector<HTMLElement>(`[data-stage="${stageId}"] .kanban-scroll`)!;
  const layouts = new Map<string, ListLayout>();
  const layoutOf = (stageId: string) => {
    let layout = layouts.get(stageId);
    if (!layout) {
      layout = {
        viewport: 700,
        rowHeight: CARD,
        scrollTop: 0,
        rows: () => column(stageId)?.querySelectorAll("[data-card]").length ?? 0,
        ...layoutInit,
      };
      layouts.set(stageId, layout);
    }
    return layout;
  };
  const io = installFakeIntersectionObserver((target, _root, margin) => {
    const stageId = target.closest("[data-stage]")?.getAttribute("data-stage");
    return stageId ? sentinelInView(layoutOf(stageId), margin) : false;
  });
  const ui = (filters: AdvancedDealFilters) => (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <Board filters={filters} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  const view = render(ui(FILTERS));
  container = view.container;
  const frames = createFrames(io, act);
  /** O usuário rola a coluna `px` para baixo, 100px por frame. */
  const scrollBy = async (stageId: string, px: number) => {
    const el = column(stageId);
    const layout = layoutOf(stageId);
    bindScroller(el, layout);
    for (let moved = 0; moved < px; moved += 100) {
      const max = Math.max(0, layout.rows() * layout.rowHeight - layout.viewport);
      layout.scrollTop = Math.min(max, layout.scrollTop + 100);
      await act(async () => {
        el.dispatchEvent(new Event("scroll"));
      });
      await frames.frame();
    }
  };
  const cards = (stageId: string) =>
    [...column(stageId).querySelectorAll<HTMLElement>("[data-card]")];
  const stageText = (stageId: string) =>
    container!.querySelector<HTMLElement>(`[data-stage="${stageId}"]`)!.textContent ?? "";
  const setFilters = async (filters: AdvancedDealFilters) => {
    await act(async () => {
      view.rerender(ui(filters));
    });
    await act(async () => {
      await sleep(BOARD_FILTERS_DEBOUNCE_MS + 60);
    });
    layouts.clear();
  };
  return { qc, view, column, stageText, layoutOf, cards, scrollBy, setFilters, ...frames };
}

const boardRequests = () =>
  api.getBoardFiltered.mock.calls.map((c) => c[1] as BoardRequest);
const columnRequests = () =>
  api.getBoardColumns.mock.calls.map((c) => c[1] as ColumnsRequest);

beforeEach(() => {
  api.getBoard.mockReset();
  api.getBoardFiltered.mockReset();
  api.getBoardColumns.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Kanban filtrado — 50 por etapa e carregar mais ao rolar", { timeout: 30_000 }, () => {
  it("pede 50 cards por etapa e o contador vem do total do servidor", async () => {
    const t = mount({ s1: 400, s2: 12 });
    await t.settle();

    expect(BOARD_FILTERED_PAGE_SIZE).toBe(50);
    expect(boardRequests().length).toBe(1);
    expect(boardRequests()[0]).toMatchObject({ perStage: 50, filters: FILTERS });
    expect(boardRequests()[0]!.offsetByStage).toBeUndefined();
    expect(api.getBoard).not.toHaveBeenCalled();
    expect(t.cards("s1").length).toBe(50);
    expect(t.cards("s2").length).toBe(12);
    // Contador = total do servidor (400), não o tamanho da lista (50).
    expect(t.stageText("s1")).toContain("400");
    expect(t.stageText("s1")).toContain("Carregar mais (350)");
    // Coluna inteira carregada não oferece "carregar mais".
    expect(t.stageText("s2")).not.toContain("Carregar mais");
  });

  it("rolar a coluna carrega a próxima página pelo cursor, com os filtros do board, numa requisição", async () => {
    const t = mount({ s1: 400 });
    await t.settle();
    expect(columnRequests().length).toBe(0);

    await t.scrollBy("s1", 4_500);
    await t.settle(3);

    expect(columnRequests().length).toBe(1);
    expect(columnRequests()[0]!.columns).toEqual([
      { stageId: "s1", cursor: "s1@50", limit: BOARD_LOAD_MORE_PAGE_SIZE },
    ]);
    expect(columnRequests()[0]!.filters).toEqual(FILTERS);
    expect(t.cards("s1").length).toBe(50 + BOARD_LOAD_MORE_PAGE_SIZE);
    expect(t.stageText("s1")).toContain("400");
    // O board não é refeito.
    expect(boardRequests().length).toBe(1);
  });

  it("sentinela visível o tempo todo não encadeia páginas", async () => {
    // Cards sem altura: a sentinela nunca sai da área de disparo.
    const t = mount({ s1: 400 }, { rowHeight: 0 });
    await t.settle();
    expect(columnRequests().length).toBeLessThanOrEqual(1);
    const afterMount = columnRequests().length;
    await t.settle();
    await t.settle();
    expect(columnRequests().length).toBe(afterMount);
    expect(boardRequests().length).toBe(1);
  });

  it("refetch do board filtrado recarrega as colunas expandidas (1 POST do board + 1 das colunas)", async () => {
    const t = mount({ s1: 400 });
    await t.settle();
    await t.scrollBy("s1", 4_500);
    await t.settle(3);
    expect(t.cards("s1").length).toBe(80);

    await act(async () => {
      await t.qc.invalidateQueries({ predicate: boardsOfPipeline(PIPELINE) });
    });
    await t.settle(3);

    expect(boardRequests().length).toBe(2);
    expect(boardRequests()[1]).toMatchObject({ perStage: 50 });
    expect(columnRequests().length).toBe(2);
    expect(columnRequests()[1]!.columns).toEqual([{ stageId: "s1", cursor: "s1@50", limit: 30 }]);
    expect(columnRequests()[1]!.filters).toEqual(FILTERS);
    expect(t.cards("s1").length).toBe(80);
  });

  it("trocar de filtro volta à 1ª página (50) e não reaproveita a expansão do filtro anterior", async () => {
    const t = mount({ s1: 400 });
    await t.settle();
    await t.scrollBy("s1", 4_500);
    await t.settle(3);
    expect(t.cards("s1").length).toBe(80);
    const before = columnRequests().length;

    await t.setFilters({ tagIds: ["t2"] });
    await t.settle(3);

    expect(boardRequests().length).toBe(2);
    expect(boardRequests()[1]).toMatchObject({ perStage: 50, filters: { tagIds: ["t2"] } });
    expect(t.cards("s1").length).toBe(50);
    expect(columnRequests().length).toBe(before);
  });

  it("etapa sem cursor: soma uma página ao offset do POST do board (1ª página segue com 50)", async () => {
    const board = async (opts: BoardRequest) => {
      const stages = await createFakeBoardServer({ s1: 400 }, 10).getBoardFiltered(PIPELINE, opts);
      return stages.map((s) => ({ ...s, nextCursor: undefined }));
    };
    const t = mount({ s1: 400 }, {}, () => {
      api.getBoardFiltered.mockImplementation((_id: string, opts: BoardRequest) => board(opts));
    });
    await t.settle();
    expect(t.cards("s1").length).toBe(50);

    await t.scrollBy("s1", 4_500);
    await t.settle(3);

    expect(api.getBoardColumns).not.toHaveBeenCalled();
    expect(boardRequests().length).toBe(2);
    expect(boardRequests()[1]).toMatchObject({
      perStage: 50,
      filters: FILTERS,
      offsetByStage: { s1: BOARD_LOAD_MORE_PAGE_SIZE },
    });
    expect(t.cards("s1").length).toBe(80);
  });
});
